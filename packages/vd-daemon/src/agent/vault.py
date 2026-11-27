"""
Encrypted Local BYOK Credential Vault, Airgap Enforcement & Cost Accounting.
Priority order:
  1. OS Keychain via optional MIT `keyring` package
  2. Encrypted local file (`<data_dir>/.vault.enc`) using PBKDF2-HMAC-SHA256 + CTR stream cipher
Zero secrets are ever written to settings.json, SQLite HW-IR, or SSE logs.
"""

from __future__ import annotations

import base64
import getpass
import hashlib
import hmac
import json
import os
import pathlib
import platform
import secrets
import threading
from typing import Any, Dict, List, Optional

KEYRING_SERVICE = "vajra-dhir-eda-byok"
LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})
_VAULT_LOCK = threading.RLock()
_KNOWN_SECRETS: set[str] = set()
_SPEND_LOCK = threading.Lock()
_SESSION_SPENT_USD = 0.0
_REPO_ROOT = pathlib.Path(__file__).resolve().parents[4]


def resolve_vault_dir() -> pathlib.Path:
    override = os.environ.get("VD_DATA_DIR") or os.environ.get("VD_DB_DIR")
    if override:
        base = pathlib.Path(override)
    else:
        base = _REPO_ROOT / ".vd-portable" / "data"
    base.mkdir(parents=True, exist_ok=True)
    return base


def _host_key_material() -> bytes:
    # Stable host+user seed + random per-vault salt stored beside ciphertext
    seed = f"{platform.node()}|{getpass.getuser()}|vajra-dhir-vault-v1".encode("utf-8")
    return hashlib.sha256(seed).digest()


def _keystream(key: bytes, nonce: bytes, length: int) -> bytes:
    blocks: List[bytes] = []
    counter = 0
    while sum(len(b) for b in blocks) < length:
        blocks.append(hmac.new(key, nonce + counter.to_bytes(4, "big"), hashlib.sha256).digest())
        counter += 1
    return b"".join(blocks)[:length]


def _encrypt_blob(plaintext: bytes) -> str:
    salt = secrets.token_bytes(16)
    nonce = secrets.token_bytes(16)
    enc_key = hashlib.pbkdf2_hmac("sha256", _host_key_material(), salt, 60_000, dklen=32)
    mac_key = hashlib.sha256(enc_key + b":mac").digest()
    stream = _keystream(enc_key, nonce, len(plaintext))
    cipher = bytes(a ^ b for a, b in zip(plaintext, stream))
    tag = hmac.new(mac_key, salt + nonce + cipher, hashlib.sha256).digest()
    return base64.b64encode(salt + nonce + tag + cipher).decode("ascii")


def _decrypt_blob(token: str) -> bytes:
    raw = base64.b64decode(token.encode("ascii"))
    if len(raw) < 64:
        raise ValueError("Corrupt encrypted vault payload")
    salt, nonce, tag, cipher = raw[:16], raw[16:32], raw[32:64], raw[64:]
    enc_key = hashlib.pbkdf2_hmac("sha256", _host_key_material(), salt, 60_000, dklen=32)
    mac_key = hashlib.sha256(enc_key + b":mac").digest()
    expected = hmac.new(mac_key, salt + nonce + cipher, hashlib.sha256).digest()
    if not hmac.compare_digest(tag, expected):
        raise ValueError("Vault integrity check failed")
    stream = _keystream(enc_key, nonce, len(cipher))
    return bytes(a ^ b for a, b in zip(cipher, stream))


def _vault_file() -> pathlib.Path:
    return resolve_vault_dir() / ".vault.enc"


def _load_file_vault() -> Dict[str, str]:
    vf = _vault_file()
    if not vf.is_file():
        return {}
    try:
        dec = _decrypt_blob(vf.read_text(encoding="utf-8").strip())
        data = json.loads(dec.decode("utf-8"))
        return {str(k): str(v) for k, v in data.items()} if isinstance(data, dict) else {}
    except Exception:
        return {}


def _save_file_vault(data: Dict[str, str]) -> None:
    vf = _vault_file()
    vf.parent.mkdir(parents=True, exist_ok=True)
    enc = _encrypt_blob(json.dumps(data).encode("utf-8"))
    tmp = vf.with_suffix(".enc.tmp")
    tmp.write_text(enc, encoding="utf-8")
    os.replace(tmp, vf)
    try:
        os.chmod(vf, 0o600)
    except OSError:
        pass


def mask_secret(secret: str) -> str:
    s = (secret or "").strip()
    if not s:
        return ""
    if len(s) <= 8:
        return "*" * len(s)
    return f"{s[:4]}...{s[-4:]}"


def set_provider_secret(provider: str, api_key: str) -> Dict[str, Any]:
    prov = (provider or "").strip().lower()
    key = (api_key or "").strip()
    if not prov:
        raise ValueError("Provider name required")
    if not key:
        return clear_provider_secret(prov)
    with _VAULT_LOCK:
        _KNOWN_SECRETS.add(key)
        backend = "encrypted_local_file"
        try:
            import keyring  # type: ignore

            keyring.set_password(KEYRING_SERVICE, prov, key)
            backend = "os_keychain"
        except Exception:
            data = _load_file_vault()
            data[prov] = key
            _save_file_vault(data)
        return {"ok": True, "provider": prov, "configured": True, "masked": mask_secret(key), "backend": backend}


def get_provider_secret(provider: str) -> Optional[str]:
    prov = (provider or "").strip().lower()
    if not prov:
        return None
    env_map = {
        "openai": "OPENAI_API_KEY",
        "anthropic": "ANTHROPIC_API_KEY",
        "gemini": "GEMINI_API_KEY",
        "openrouter": "OPENROUTER_API_KEY",
        "nous": "NOUS_API_KEY",
        "nvidia_nim": "NVIDIA_API_KEY",
    }
    env_var = env_map.get(prov)
    if env_var and os.environ.get(env_var, "").strip():
        sec = os.environ[env_var].strip()
        _KNOWN_SECRETS.add(sec)
        return sec
    with _VAULT_LOCK:
        try:
            import keyring  # type: ignore

            val = keyring.get_password(KEYRING_SERVICE, prov)
            if val:
                _KNOWN_SECRETS.add(val)
                return val
        except Exception:
            pass
        data = _load_file_vault()
        val = data.get(prov)
        if val:
            _KNOWN_SECRETS.add(val)
        return val


def clear_provider_secret(provider: str) -> Dict[str, Any]:
    prov = (provider or "").strip().lower()
    with _VAULT_LOCK:
        try:
            import keyring  # type: ignore

            keyring.delete_password(KEYRING_SERVICE, prov)
        except Exception:
            pass
        data = _load_file_vault()
        if prov in data:
            data.pop(prov, None)
            _save_file_vault(data)
    return {"ok": True, "provider": prov, "configured": False, "masked": ""}


def get_provider_secret_status(providers: List[str]) -> Dict[str, Dict[str, Any]]:
    out: Dict[str, Dict[str, Any]] = {}
    for p in providers:
        sec = get_provider_secret(p)
        out[p] = {
            "configured": bool(sec),
            "masked": mask_secret(sec or ""),
        }
    return out


def redact_secrets(text: str) -> str:
    if not text:
        return ""
    res = text
    for sec in list(_KNOWN_SECRETS):
        if len(sec) >= 6:
            res = res.replace(sec, mask_secret(sec))
    return res


def get_session_budget_status() -> Dict[str, Any]:
    budget_file = _REPO_ROOT / "budget.json"
    max_usd = 0.0
    inr_rate = 84.5
    if budget_file.is_file():
        try:
            data = json.loads(budget_file.read_text(encoding="utf-8"))
            max_usd = float(data.get("max_session_usd", 0.0))
            inr_rate = float(data.get("usd_to_inr_rate", 84.5))
        except Exception:
            pass
    with _SPEND_LOCK:
        spent = round(_SESSION_SPENT_USD, 6)
    return {
        "max_session_usd": max_usd,
        "spent_usd": spent,
        "spent_inr": round(spent * inr_rate, 2),
        "remaining_usd": max(0.0, round(max_usd - spent, 6)),
        "exceeded": max_usd > 0.0 and spent >= max_usd,
    }


def record_usage_cost(usd_delta: float) -> Dict[str, Any]:
    global _SESSION_SPENT_USD
    with _SPEND_LOCK:
        _SESSION_SPENT_USD += max(0.0, float(usd_delta))
    return get_session_budget_status()
