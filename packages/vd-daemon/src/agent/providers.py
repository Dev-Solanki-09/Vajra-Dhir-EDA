"""
BYOK Multi-Provider LLM Adapter with Fail-Closed DLP Airgap Enforcement & Prompt Delimiting.
Zero third-party vendor SDKs required in Ring 1 (uses stdlib urllib + _NoRedirectHandler).
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional

from .vault import LOOPBACK_HOSTS, get_provider_secret, get_session_budget_status, record_usage_cost, redact_secrets

PROVIDER_CATALOG: List[Dict[str, Any]] = [
    {"id": "deterministic_offline", "name": "Offline Planner (Airgapped $0)", "requires_key": False, "local": True, "default_model": "vd-offline-ee-v1", "base_url": ""},
    {"id": "ollama", "name": "Ollama (Local Loopback)", "requires_key": False, "local": True, "default_model": "qwen2.5-coder:7b", "base_url": "http://127.0.0.1:11434"},
    {"id": "openai", "name": "OpenAI (BYOK)", "requires_key": True, "local": False, "default_model": "gpt-4.1-mini", "base_url": "https://api.openai.com/v1"},
    {"id": "anthropic", "name": "Anthropic Claude (BYOK)", "requires_key": True, "local": False, "default_model": "claude-sonnet-4-5", "base_url": "https://api.anthropic.com/v1"},
    {"id": "gemini", "name": "Google Gemini (BYOK)", "requires_key": True, "local": False, "default_model": "gemini-2.5-flash", "base_url": "https://generativelanguage.googleapis.com/v1beta"},
    {"id": "openrouter", "name": "OpenRouter (BYOK)", "requires_key": True, "local": False, "default_model": "anthropic/claude-sonnet-4", "base_url": "https://openrouter.ai/api/v1"},
    {"id": "nous", "name": "Nous Research Portal (BYOK)", "requires_key": True, "local": False, "default_model": "Hermes-3-Llama-3.1-70B", "base_url": "https://inference-api.nousresearch.com/v1"},
    {"id": "nvidia_nim", "name": "NVIDIA NIM (BYOK)", "requires_key": True, "local": False, "default_model": "meta/llama-3.1-70b-instruct", "base_url": "https://integrate.api.nvidia.com/v1"},
    {"id": "custom", "name": "Custom OpenAI-Compatible Endpoint", "requires_key": False, "local": False, "default_model": "custom-model", "base_url": "http://127.0.0.1:8080/v1"},
]


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError(f"NDA_AIRGAP_VIOLATION: Refused HTTP {code} redirect to {newurl}")


_NO_REDIRECT_OPENER = urllib.request.build_opener(_NoRedirectHandler())


def frame_untrusted_text(label: str, text: str) -> str:
    clean = "".join(ch for ch in (text or "") if ch >= " " or ch in "\n\t")
    return f"<untrusted_{label}>\n{clean[:6000]}\n</untrusted_{label}>"


def validate_provider_airgap(provider: str, base_url: str, dlp_tier: str) -> None:
    prov = (provider or "deterministic_offline").strip().lower()
    if prov == "deterministic_offline":
        return
    parsed = urllib.parse.urlparse((base_url or "").strip())
    host = (parsed.hostname or "").lower()
    is_loopback = parsed.scheme in ("http", "https") and host in LOOPBACK_HOSTS
    if dlp_tier == "NDA_AIRGAPPED" and not is_loopback:
        raise PermissionError(
            f"NDA_AIRGAP_VIOLATION: Provider '{prov}' ({base_url or 'cloud'}) blocked in NDA_AIRGAPPED mode. Switch DLP tier in Settings -> AI Agent or use local Ollama."
        )


def _post_json(url: str, headers: Dict[str, str], payload: Dict[str, Any], timeout: float = 20.0) -> Dict[str, Any]:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json", **headers},
    )
    with _NO_REDIRECT_OPENER.open(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def test_provider_connection(
    provider: str,
    model: str = "",
    base_url: str = "",
    api_key: Optional[str] = None,
    dlp_tier: str = "NDA_AIRGAPPED",
) -> Dict[str, Any]:
    prov = (provider or "deterministic_offline").strip().lower()
    meta = next((p for p in PROVIDER_CATALOG if p["id"] == prov), PROVIDER_CATALOG[0])
    eff_url = (base_url or meta["base_url"]).strip().rstrip("/")
    eff_model = (model or meta["default_model"]).strip()

    try:
        validate_provider_airgap(prov, eff_url, dlp_tier)
    except PermissionError as err:
        return {"ok": False, "error_code": "NDA_AIRGAP_VIOLATION", "message": str(err)}

    if prov == "deterministic_offline":
        return {"ok": True, "provider": prov, "model": eff_model, "message": "Offline deterministic planner active ($0.00, 100% airgapped)."}

    if prov == "ollama":
        try:
            req = urllib.request.Request(f"{eff_url}/api/tags", method="GET")
            with _NO_REDIRECT_OPENER.open(req, timeout=3.0) as resp:
                tags = json.loads(resp.read().decode("utf-8"))
                models = [m.get("name") for m in tags.get("models", []) if isinstance(m, dict)]
                return {"ok": True, "provider": prov, "model": eff_model, "available_models": models, "message": f"Connected to loopback Ollama ({len(models)} models)."}
        except Exception as exc:
            return {"ok": False, "error_code": "OLLAMA_UNREACHABLE", "message": redact_secrets(f"Loopback Ollama not reachable at {eff_url}: {exc}")}

    key = (api_key or get_provider_secret(prov) or "").strip()
    if meta.get("requires_key") and not key:
        return {"ok": False, "error_code": "API_KEY_MISSING", "message": f"No BYOK API key stored in secure vault for '{prov}'."}

    try:
        if prov == "anthropic":
            _post_json(
                f"{eff_url}/messages",
                {"x-api-key": key, "anthropic-version": "2023-06-01"},
                {"model": eff_model, "max_tokens": 12, "messages": [{"role": "user", "content": "ping"}]},
                timeout=10.0,
            )
        elif prov == "gemini":
            _post_json(
                f"{eff_url}/models/{urllib.parse.quote(eff_model)}:generateContent?key={urllib.parse.quote(key)}",
                {},
                {"contents": [{"parts": [{"text": "ping"}]}]},
                timeout=10.0,
            )
        else:
            headers = {"Authorization": f"Bearer {key}"} if key else {}
            _post_json(
                f"{eff_url}/chat/completions",
                headers,
                {"model": eff_model, "max_tokens": 12, "messages": [{"role": "user", "content": "ping"}]},
                timeout=10.0,
            )
        return {"ok": True, "provider": prov, "model": eff_model, "message": f"Verified {prov} ({eff_model})."}
    except urllib.error.HTTPError as exc:
        return {"ok": False, "error_code": f"HTTP_{exc.code}", "message": redact_secrets(f"Provider returned HTTP {exc.code}")}
    except Exception as exc:
        return {"ok": False, "error_code": "CONNECTION_FAILED", "message": redact_secrets(str(exc))}


def call_byok_chat(
    provider: str,
    model: str,
    base_url: str,
    messages: List[Dict[str, str]],
    dlp_tier: str,
) -> Dict[str, Any]:
    """Execute one non-streaming BYOK chat completion with budget & airgap guards."""
    prov = (provider or "deterministic_offline").strip().lower()
    meta = next((p for p in PROVIDER_CATALOG if p["id"] == prov), PROVIDER_CATALOG[0])
    eff_url = (base_url or meta["base_url"]).strip().rstrip("/")
    eff_model = (model or meta["default_model"]).strip()

    validate_provider_airgap(prov, eff_url, dlp_tier)
    if prov == "deterministic_offline":
        return {"ok": True, "provider": prov, "content": "", "cost_usd": 0.0}

    budget = get_session_budget_status()
    if not meta.get("local") and budget.get("exceeded"):
        raise RuntimeError(f"BUDGET_CAP_EXCEEDED: Session spend ${budget['spent_usd']:.2f} reached cap ${budget['max_session_usd']:.2f}.")

    if prov == "ollama":
        prompt_text = "\n".join(f"{m['role']}: {m['content']}" for m in messages)
        resp = _post_json(f"{eff_url}/api/generate", {}, {"model": eff_model, "prompt": prompt_text, "stream": False}, timeout=12.0)
        return {"ok": True, "provider": prov, "content": str(resp.get("response") or "").strip(), "cost_usd": 0.0}

    key = (get_provider_secret(prov) or "").strip()
    if meta.get("requires_key") and not key:
        raise ValueError(f"Missing BYOK API key for {prov} in secure vault.")

    cost_est = 0.0025
    if prov == "anthropic":
        sys_txt = "\n".join(m["content"] for m in messages if m["role"] == "system")
        user_msgs = [{"role": m["role"], "content": m["content"]} for m in messages if m["role"] != "system"]
        resp = _post_json(
            f"{eff_url}/messages",
            {"x-api-key": key, "anthropic-version": "2023-06-01"},
            {"model": eff_model, "max_tokens": 900, "system": sys_txt, "messages": user_msgs},
            timeout=25.0,
        )
        blocks = resp.get("content") or []
        txt = "\n".join(str(b.get("text") or "") for b in blocks if isinstance(b, dict))
    elif prov == "gemini":
        merged = "\n\n".join(f"[{m['role']}] {m['content']}" for m in messages)
        resp = _post_json(
            f"{eff_url}/models/{urllib.parse.quote(eff_model)}:generateContent?key={urllib.parse.quote(key)}",
            {},
            {"contents": [{"parts": [{"text": merged}]}]},
            timeout=25.0,
        )
        cands = resp.get("candidates") or []
        parts = ((cands[0].get("content") or {}).get("parts") or []) if cands else []
        txt = "\n".join(str(p.get("text") or "") for p in parts if isinstance(p, dict))
    else:
        headers = {"Authorization": f"Bearer {key}"} if key else {}
        resp = _post_json(
            f"{eff_url}/chat/completions",
            headers,
            {"model": eff_model, "messages": messages, "max_tokens": 900},
            timeout=25.0,
        )
        choices = resp.get("choices") or []
        txt = str(((choices[0].get("message") or {}).get("content")) or "") if choices else ""

    record_usage_cost(cost_est)
    return {"ok": True, "provider": prov, "content": txt.strip(), "cost_usd": cost_est}
