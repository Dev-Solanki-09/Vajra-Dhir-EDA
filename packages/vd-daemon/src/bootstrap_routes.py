"""
Honest Doctor, Pinned Pack Verification, & Streaming Bootstrap Routes (packages/vd-daemon/src/bootstrap_routes.py).
Implements:
  - GET  /api/doctor          (/api/v1/doctor)
  - GET  /api/bootstrap/status (/api/v1/bootstrap/status)
  - POST /api/bootstrap/sync   (/api/v1/bootstrap/sync)
  - GET  /api/bootstrap/stream (/api/v1/bootstrap/stream)  [SSE with 15s keepalive]
  - POST /api/bootstrap/cancel (/api/v1/bootstrap/cancel)
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import pathlib
import platform
import queue
import shutil
import sys
import tarfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from typing import Any, Dict, List, Optional

try:
    from .polish_engine import probe_tool_manager_status
except ImportError:
    from polish_engine import probe_tool_manager_status

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
_MANIFEST_PATH = _REPO_ROOT / "vendor" / "MANIFEST.json"

_SYNC_LOCK = threading.RLock()
_SYNC_CANCEL = threading.Event()
_SYNC_THREAD: Optional[threading.Thread] = None
_SSE_SUBSCRIBERS: List[queue.Queue[Dict[str, Any]]] = []

_SYNC_STATE: Dict[str, Any] = {
    "running": False,
    "phase": "idle",
    "progress_pct": 0,
    "active_pack": None,
    "completed_packs": [],
    "failed_packs": [],
    "error": None,
    "started_at": None,
    "finished_at": None,
}


def resolve_data_dir() -> pathlib.Path:
    env_dir = os.environ.get("VD_DATA_DIR", "").strip()
    if env_dir:
        return pathlib.Path(env_dir).resolve()
    portable = (_REPO_ROOT / "portable.flag").is_file() or os.environ.get("VD_PORTABLE", "").strip() == "1"
    return (_REPO_ROOT / (".vd-portable" if portable else ".vd-runtime")).resolve()


def is_portable_mode() -> bool:
    return (_REPO_ROOT / "portable.flag").is_file() or os.environ.get("VD_PORTABLE", "").strip() == "1"


def is_offline_mode() -> bool:
    return (
        os.environ.get("VD_OFFLINE", "").strip() in ("1", "true", "yes")
        or (_REPO_ROOT / ".vd-airgap").exists()
        or (resolve_data_dir() / ".vd-airgap").exists()
    )


def _target_triple() -> str:
    sys_name = "win32" if sys.platform == "win32" else ("darwin" if sys.platform == "darwin" else "linux")
    mach = platform.machine().lower()
    arch = "arm64" if mach in ("arm64", "aarch64") else "x64"
    return f"{sys_name}-{arch}"


def _send_json(handler: Any, status: int, body: Any) -> None:
    payload = json.dumps(body).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(payload)))
    handler.send_header("Connection", "close")
    handler._send_cors()
    handler.end_headers()
    handler.wfile.write(payload)


def _broadcast_event(ev: Dict[str, Any]) -> None:
    with _SYNC_LOCK:
        subs = list(_SSE_SUBSCRIBERS)
    for q in subs:
        try:
            q.put_nowait(ev)
        except Exception:
            pass


def load_manifest() -> Dict[str, Any]:
    if not _MANIFEST_PATH.is_file():
        return {"schema_version": "2.0.0", "entries": []}
    return json.loads(_MANIFEST_PATH.read_text(encoding="utf-8"))


_FIVE_REPO_LABELS = {
    "dependencies": "Dependencies",
    "tools": "Tools",
    "libraries": "Libraries",
    "packs": "Packs",
    "resources": "Resources",
}


def load_5repo_registry(allow_network: bool = False) -> Dict[str, Any]:
    data_dir = resolve_data_dir()
    cached_reg = data_dir / "packs" / "registry" / "registry.v1.json"
    if cached_reg.is_file():
        try:
            return json.loads(cached_reg.read_text(encoding="utf-8"))
        except Exception:
            pass
    staging_reg = _REPO_ROOT / ".vd-companion-staging" / "Vajra-Dhir-Packs" / "registry" / "registry.v1.json"
    if staging_reg.is_file():
        try:
            return json.loads(staging_reg.read_text(encoding="utf-8"))
        except Exception:
            pass
    if allow_network and not is_offline_mode():
        manifest = load_manifest()
        creg = manifest.get("companion_registry") if isinstance(manifest.get("companion_registry"), dict) else {}
        expected_sha = str(creg.get("sha256") or "")
        for url in [creg.get("url"), creg.get("raw_fallback_url")]:
            if not url or not str(url).startswith("https://"):
                continue
            try:
                req = urllib.request.Request(str(url), headers={"User-Agent": "Vajra-Dhir-Bootstrapper/1.0"})
                with urllib.request.urlopen(req, timeout=10) as resp:
                    raw_bytes = resp.read()
                digest = hashlib.sha256(raw_bytes).hexdigest()
                if expected_sha and digest.lower() != expected_sha.lower():
                    continue
                parsed = json.loads(raw_bytes.decode("utf-8"))
                cached_reg.parent.mkdir(parents=True, exist_ok=True)
                tmp = cached_reg.with_suffix(".json.tmp")
                tmp.write_bytes(raw_bytes)
                os.replace(str(tmp), str(cached_reg))
                return parsed
            except Exception:
                continue
    return {"schema_version": "1.0.0", "release_tag": "v1.0.0", "packages": []}


def _check_5repo_package_status(pkg: Dict[str, Any], data_dir: pathlib.Path) -> Dict[str, Any]:
    pid = str(pkg.get("id") or "")
    target_dir = str(pkg.get("target_dir") or f"packs/{pid}")
    dest = (data_dir / target_dir).resolve()
    marker = dest / ".verified.json"
    expected_sha = str(pkg.get("sha256") or "")
    expected_ver = str(pkg.get("version") or "v1.0.0")
    status = "MISSING"
    if marker.is_file():
        try:
            meta = json.loads(marker.read_text(encoding="utf-8"))
            if expected_sha and meta.get("archive_sha256") != expected_sha:
                status = "UPDATE_AVAILABLE" if meta.get("version") != expected_ver else "CORRUPT"
            else:
                status = "READY"
        except Exception:
            status = "CORRUPT"
    return {
        **pkg,
        "status": status,
        "verified": status == "READY",
        "local_dir": str(dest),
    }


def _summarize_5repos(packages_status: List[Dict[str, Any]], offline: bool) -> List[Dict[str, Any]]:
    repos_out: List[Dict[str, Any]] = []
    for bucket, label in _FIVE_REPO_LABELS.items():
        bucket_pkgs = [p for p in packages_status if p.get("repo_bucket") == bucket]
        t1_pkgs = [p for p in bucket_pkgs if p.get("tier") == "tier1_essential"]
        check_list = t1_pkgs or bucket_pkgs
        if not check_list:
            st = "AIRGAP_OFFLINE" if offline else "MISSING"
        elif any(p.get("status") == "CORRUPT" for p in check_list):
            st = "CORRUPT"
        elif all(p.get("status") == "READY" for p in check_list):
            st = "READY"
        elif any(p.get("status") == "UPDATE_AVAILABLE" for p in check_list):
            st = "UPDATE_AVAILABLE"
        else:
            st = "AIRGAP_OFFLINE" if offline else "MISSING"
        repos_out.append({
            "bucket": bucket,
            "label": label,
            "status": st,
            "tier1_ready": sum(1 for p in t1_pkgs if p.get("verified")),
            "tier1_total": len(t1_pkgs),
            "total_packages": len(bucket_pkgs),
            "packages": bucket_pkgs,
        })
    return repos_out


def _check_pack_status(entry: Dict[str, Any], packs_root: pathlib.Path) -> Dict[str, Any]:
    pack_id = str(entry.get("pack_id") or entry.get("name") or "").lower()
    audience = str(entry.get("audience") or "developer_reference")
    tier = int(entry.get("tier") if entry.get("tier") is not None else 2)
    commit_sha = entry.get("commit_sha")
    sha12 = str(commit_sha)[:12] if commit_sha else "pinned"
    source_kind = str(entry.get("source_kind") or "lockfile")
    artifacts = entry.get("artifacts") if isinstance(entry.get("artifacts"), dict) else {}
    expected_sha256 = str(artifacts.get("archive_sha256") or "")

    verified = False
    verified_via = "missing"
    local_path: Optional[str] = None

    pack_dir = packs_root / pack_id / sha12
    marker = pack_dir / ".verified.json"
    if marker.is_file():
        try:
            meta = json.loads(marker.read_text(encoding="utf-8"))
            if (not commit_sha or meta.get("commit_sha") == commit_sha) and (
                not expected_sha256 or meta.get("archive_sha256") == expected_sha256
            ):
                verified = True
                verified_via = "pack_cache"
                local_path = str(pack_dir)
        except Exception:
            pass

    if not verified and tier == 0:
        if source_kind == "lockfile":
            nm_check = entry.get("node_package")
            py_mod = entry.get("python_module")
            repo_rel = entry.get("repo_path")
            if repo_rel and (_REPO_ROOT / repo_rel).exists():
                verified = True
                verified_via = "repo_bundled"
                local_path = str((_REPO_ROOT / repo_rel).resolve())
            elif nm_check and (_REPO_ROOT / "apps" / "workstation" / "node_modules" / nm_check).exists():
                verified = True
                verified_via = "node_modules"
            elif py_mod and importlib.util.find_spec(py_mod) is not None:
                verified = True
                verified_via = "python_env"
            elif (_REPO_ROOT / "Cargo.lock").is_file() and entry.get("crate_name"):
                verified = True
                verified_via = "cargo_lock"

    if not verified and entry.get("binary_probe"):
        found = shutil.which(str(entry["binary_probe"]))
        if found:
            verified = True
            verified_via = "system_binary"
            local_path = found

    return {
        "pack_id": pack_id,
        "name": entry.get("name"),
        "audience": audience,
        "tier": tier,
        "source_kind": source_kind,
        "license_spdx": entry.get("license_spdx") or entry.get("license"),
        "commit_sha": commit_sha,
        "archive_sha256": expected_sha256,
        "status": "verified" if verified else "missing",
        "verified": verified,
        "verified_via": verified_via,
        "local_path": local_path,
        "artifacts": artifacts,
    }


def build_doctor_report() -> Dict[str, Any]:
    data_dir = resolve_data_dir()
    packs_root = data_dir / "packs"
    dist_dir = _REPO_ROOT / "apps" / "workstation" / "dist"
    py312_dir = data_dir / "py312"
    manifest = load_manifest()
    entries = manifest.get("entries", [])
    packs = [_check_pack_status(e, packs_root) for e in entries if isinstance(e, dict)]

    runtime_tier1 = [p for p in packs if p["audience"] == "runtime" and p["tier"] == 1]
    tier1_ready = all(p["verified"] for p in runtime_tier1) if runtime_tier1 else True
    runtime_tier2 = [p for p in packs if p["audience"] == "runtime" and p["tier"] == 2]

    tool_status = probe_tool_manager_status()
    return {
        "status": "ok",
        "portable_mode": is_portable_mode(),
        "offline_mode": is_offline_mode(),
        "data_dir": str(data_dir),
        "packs_dir": str(packs_root),
        "py312_venv": str(py312_dir),
        "py312_present": (py312_dir / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")).is_file(),
        "workstation_dist_built": (dist_dir / "index.html").is_file(),
        "host_python": sys.version.split()[0],
        "target": _target_triple(),
        "tier1_verified": tier1_ready,
        "tier1_summary": {
            "total": len(runtime_tier1),
            "verified": sum(1 for p in runtime_tier1 if p["verified"]),
            "missing": [p["pack_id"] for p in runtime_tier1 if not p["verified"]],
        },
        "tier2_summary": {
            "total": len(runtime_tier2),
            "verified": sum(1 for p in runtime_tier2 if p["verified"]),
            "available": [p["pack_id"] for p in runtime_tier2],
        },
        "tools": tool_status.get("tools", []),
    }


def get_bootstrap_status() -> Dict[str, Any]:
    data_dir = resolve_data_dir()
    packs_root = data_dir / "packs"
    manifest = load_manifest()
    packs = [_check_pack_status(e, packs_root) for e in manifest.get("entries", []) if isinstance(e, dict)]
    runtime_t1 = [p for p in packs if p["audience"] == "runtime" and p["tier"] == 1]
    tier1_verified = all(p["verified"] for p in runtime_t1) if runtime_t1 else True

    registry = load_5repo_registry(allow_network=False)
    reg_pkgs = [_check_5repo_package_status(p, data_dir) for p in registry.get("packages", []) if isinstance(p, dict)]
    offline = is_offline_mode()
    repos_5 = _summarize_5repos(reg_pkgs, offline=offline)
    five_repo_t1 = [p for p in reg_pkgs if p.get("tier") == "tier1_essential"]
    five_repo_ready = all(p.get("verified") for p in five_repo_t1) if five_repo_t1 else tier1_verified

    disk_free_bytes = 0
    try:
        disk_free_bytes = int(shutil.disk_usage(data_dir).free)
    except Exception:
        pass
    with _SYNC_LOCK:
        sync_copy = dict(_SYNC_STATE)
    return {
        "schema_version": manifest.get("schema_version", "2.0.0"),
        "portable_mode": is_portable_mode(),
        "offline_mode": offline,
        "tier1_verified": bool(tier1_verified and five_repo_ready),
        "five_repo_ready": five_repo_ready,
        "auto_skip": bool((tier1_verified and five_repo_ready) or offline),
        "data_dir": str(data_dir),
        "disk_free_bytes": disk_free_bytes,
        "target": _target_triple(),
        "repos": repos_5,
        "registry_packages": reg_pkgs,
        "packs": packs,
        "sync_state": sync_copy,
    }


def _safe_extract_archive(archive_path: pathlib.Path, dest_dir: pathlib.Path) -> None:
    dest_dir.mkdir(parents=True, exist_ok=True)
    name_l = archive_path.name.lower()
    dest_resolved = dest_dir.resolve()
    if name_l.endswith(".zip"):
        with zipfile.ZipFile(archive_path, "r") as zf:
            for member in zf.infolist():
                target = (dest_dir / member.filename).resolve()
                if not str(target).startswith(str(dest_resolved)):
                    raise ValueError(f"Unsafe zip path traversal: {member.filename}")
            zf.extractall(dest_dir)
    elif name_l.endswith((".tar.gz", ".tgz")):
        with tarfile.open(archive_path, "r:gz") as tf:
            for member in tf.getmembers():
                target = (dest_dir / member.name).resolve()
                if not str(target).startswith(str(dest_resolved)):
                    raise ValueError(f"Unsafe tar path traversal: {member.name}")
            tf.extractall(dest_dir, filter="data")
    elif name_l.endswith(".tar.zst"):
        extracted = False
        # 1. Python 3.14+ stdlib compression.zstd
        try:
            from compression import zstd as std_zstd  # type: ignore
            import io

            raw_bytes = archive_path.read_bytes()
            tar_bytes = std_zstd.decompress(raw_bytes)
            with tarfile.open(fileobj=io.BytesIO(tar_bytes), mode="r:*") as tf:
                for member in tf.getmembers():
                    target = (dest_dir / member.name).resolve()
                    if not str(target).startswith(str(dest_resolved)):
                        raise ValueError(f"Unsafe tar.zst path traversal: {member.name}")
                tf.extractall(dest_dir, filter="data")
            extracted = True
        except ImportError:
            pass
        # 2. Optional zstandard wheel
        if not extracted:
            try:
                import zstandard as zstd  # type: ignore

                with open(archive_path, "rb") as raw_f:
                    dctx = zstd.ZstdDecompressor()
                    with dctx.stream_reader(raw_f) as reader:
                        with tarfile.open(fileobj=reader, mode="r|*") as tf:
                            for member in tf:
                                target = (dest_dir / member.name).resolve()
                                if not str(target).startswith(str(dest_resolved)):
                                    raise ValueError(f"Unsafe tar.zst path traversal: {member.name}")
                                tf.extract(member, dest_dir, filter="data")
                extracted = True
            except ImportError:
                pass
        # 3. System tar --zstd fallback
        if not extracted:
            tar_bin = shutil.which("tar")
            if not tar_bin:
                raise RuntimeError("No .tar.zst extractor available (Python 3.14 compression.zstd, zstandard, or tar)")
            proc = subprocess.run([tar_bin, "--zstd", "-xf", str(archive_path), "-C", str(dest_dir)], capture_output=True, text=True)
            if proc.returncode != 0:
                raise RuntimeError(f"tar --zstd extract failed: {proc.stderr[:240]}")
    else:
        raise ValueError(f"Unsupported pack archive format: {archive_path.name}")


def _sha256_file(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(65536)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def _download_with_failover(
    urls: List[str],
    part_file: pathlib.Path,
    final_file: pathlib.Path,
    expected_sha256: str,
    pack_id: str = "",
) -> str:
    last_err: Optional[Exception] = None
    for url in urls:
        if not url or not url.startswith("https://"):
            continue
        parsed = urllib.parse.urlparse(url)
        if any(seg in parsed.path for seg in ("/refs/heads/", "/archive/main.", "/archive/master.")) or ":latest" in url:
            raise ValueError(f"Refusing unpinned floating archive URL: {url}")
        try:
            existing_bytes = part_file.stat().st_size if part_file.is_file() else 0
            headers = {"User-Agent": "Vajra-Dhir-Bootstrapper/1.0"}
            if existing_bytes > 0:
                headers["Range"] = f"bytes={existing_bytes}-"
            req = urllib.request.Request(url, headers=headers)
            t0 = time.monotonic()
            downloaded_this_run = 0
            last_emit = t0
            with urllib.request.urlopen(req, timeout=30) as resp:
                status_code = getattr(resp, "status", 200)
                append_mode = status_code == 206 and existing_bytes > 0
                total_len_hdr = resp.headers.get("Content-Length")
                total_bytes = (existing_bytes + int(total_len_hdr)) if (append_mode and total_len_hdr) else (int(total_len_hdr) if total_len_hdr else 0)
                mode = "ab" if append_mode else "wb"
                written = existing_bytes if append_mode else 0
                with open(part_file, mode) as out:
                    while not _SYNC_CANCEL.is_set():
                        chunk = resp.read(65536)
                        if not chunk:
                            break
                        out.write(chunk)
                        written += len(chunk)
                        downloaded_this_run += len(chunk)
                        now = time.monotonic()
                        if (now - last_emit) >= 0.4:
                            elapsed = max(now - t0, 0.05)
                            bps = int(downloaded_this_run / elapsed)
                            eta_s = int((total_bytes - written) / bps) if (total_bytes > written and bps > 0) else None
                            _broadcast_event({
                                "type": "pack_progress",
                                "pack_id": pack_id,
                                "bytes_downloaded": written,
                                "bytes_total": total_bytes,
                                "speed_bps": bps,
                                "eta_s": eta_s,
                            })
                            last_emit = now
            if _SYNC_CANCEL.is_set():
                raise InterruptedError("Bootstrap sync cancelled")
            digest = _sha256_file(part_file)
            if expected_sha256 and digest.lower() != expected_sha256.lower():
                part_file.unlink(missing_ok=True)
                raise ValueError(f"SHA256 mismatch for {url}: got {digest}, expected {expected_sha256}")
            os.replace(str(part_file), str(final_file))
            return digest
        except InterruptedError:
            raise
        except Exception as exc:
            last_err = exc
    raise RuntimeError(f"All pack sources failed: {last_err or 'no pinned URLs available'}")


def _sync_5repo_packages(target_tiers: List[int], pack_ids: Optional[List[str]]) -> None:
    from concurrent.futures import ThreadPoolExecutor, as_completed

    data_dir = resolve_data_dir()
    registry = load_5repo_registry(allow_network=True)
    reg_pkgs = [p for p in registry.get("packages", []) if isinstance(p, dict)]
    if not reg_pkgs:
        return
    wanted_tiers = {"tier1_essential" if t == 1 else "tier2_dlc" for t in target_tiers}
    wanted_ids = {p.lower() for p in pack_ids} if pack_ids else None
    selected = []
    for p in reg_pkgs:
        pid = str(p.get("id") or "").lower()
        if wanted_ids is not None:
            if pid in wanted_ids:
                selected.append(p)
        elif str(p.get("tier") or "") in wanted_tiers:
            selected.append(p)
    if not selected:
        return

    staging_root = _REPO_ROOT / ".vd-companion-staging" / "release-assets"
    total = len(selected)
    done_count = 0
    done_lock = threading.Lock()

    def _sync_one(pkg: Dict[str, Any]) -> None:
        nonlocal done_count
        if _SYNC_CANCEL.is_set():
            return
        pid = str(pkg.get("id") or "")
        bucket = str(pkg.get("repo_bucket") or "packs")
        target_dir = str(pkg.get("target_dir") or f"packs/{pid}")
        dest_dir = (data_dir / target_dir).resolve()
        marker = dest_dir / ".verified.json"
        expected_sha = str(pkg.get("sha256") or "")
        if marker.is_file():
            try:
                if json.loads(marker.read_text(encoding="utf-8")).get("archive_sha256") == expected_sha:
                    with done_lock:
                        done_count += 1
                    _broadcast_event({"type": "pack_verified", "repo_bucket": bucket, "pack_id": pid, "cached": True, "phase": "ready", "progress_pct": int((done_count / total) * 100)})
                    return
            except Exception:
                pass

        _broadcast_event({"type": "pack_start", "repo_bucket": bucket, "pack_id": pid, "phase": "fetching"})
        arch_name = str(pkg.get("archive_name") or f"{pid}.tar.zst")
        local_stage = staging_root / bucket / arch_name
        tmp_archive = data_dir / "packs" / f".tmp-5r-{pid}.tar.zst"
        part_archive = data_dir / "packs" / f".part-5r-{pid}.tar.zst"
        tmp_extract = data_dir / "packs" / f".extract-5r-{pid}"
        (data_dir / "packs").mkdir(parents=True, exist_ok=True)
        try:
            if os.environ.get("VD_LOCAL_COMPANION_STAGING") == "1" and local_stage.is_file():
                shutil.copy2(local_stage, tmp_archive)
                digest = _sha256_file(tmp_archive)
            else:
                urls = [str(pkg.get("download_url") or ""), str(pkg.get("fallback_url") or "")]
                try:
                    digest = _download_with_failover(urls, part_archive, tmp_archive, expected_sha, pack_id=pid)
                except Exception:
                    if local_stage.is_file():
                        shutil.copy2(local_stage, tmp_archive)
                        digest = _sha256_file(tmp_archive)
                    else:
                        raise
            if expected_sha and digest.lower() != expected_sha.lower():
                raise ValueError(f"SHA256 mismatch for {pid}")
            _broadcast_event({"type": "pack_progress", "repo_bucket": bucket, "pack_id": pid, "phase": "verifying_sha256"})
            _broadcast_event({"type": "pack_progress", "repo_bucket": bucket, "pack_id": pid, "phase": "extracting"})
            if tmp_extract.exists():
                shutil.rmtree(tmp_extract, ignore_errors=True)
            _safe_extract_archive(tmp_archive, tmp_extract)
            if dest_dir.exists():
                shutil.rmtree(dest_dir, ignore_errors=True)
            dest_dir.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(tmp_extract), str(dest_dir))
            marker.write_text(
                json.dumps({
                    "pack_id": pid,
                    "repo_bucket": bucket,
                    "version": pkg.get("version", "v1.0.0"),
                    "archive_sha256": digest,
                    "license_spdx": pkg.get("license_spdx", "Apache-2.0"),
                    "verified_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                }, indent=2),
                encoding="utf-8",
            )
            with done_lock:
                done_count += 1
                pct = int((done_count / total) * 100)
            with _SYNC_LOCK:
                _SYNC_STATE["completed_packs"].append(pid)
                _SYNC_STATE["progress_pct"] = pct
            _broadcast_event({"type": "pack_done", "repo_bucket": bucket, "pack_id": pid, "sha256": digest, "phase": "ready", "progress_pct": pct})
        except Exception as exc:
            with _SYNC_LOCK:
                _SYNC_STATE["failed_packs"].append({"pack_id": pid, "repo_bucket": bucket, "error": str(exc)})
                _SYNC_STATE["error"] = str(exc)
            _broadcast_event({"type": "pack_error", "repo_bucket": bucket, "pack_id": pid, "error": str(exc)})
        finally:
            tmp_archive.unlink(missing_ok=True)
            if tmp_extract.exists():
                shutil.rmtree(tmp_extract, ignore_errors=True)

    with ThreadPoolExecutor(max_workers=4) as pool:
        futs = [pool.submit(_sync_one, pkg) for pkg in selected]
        for f in as_completed(futs):
            f.result()


def _run_sync_worker(target_tiers: List[int], pack_ids: Optional[List[str]]) -> None:
    global _SYNC_THREAD
    _sync_5repo_packages(target_tiers, pack_ids)
    packs_root = resolve_data_dir() / "packs"
    manifest = load_manifest()
    entries = manifest.get("entries", [])
    candidates: List[Dict[str, Any]] = []
    wanted_ids = {p.lower() for p in pack_ids} if pack_ids else None
    for e in entries:
        if not isinstance(e, dict):
            continue
        if e.get("audience") != "runtime":
            continue
        if e.get("source_kind") != "pinned_archive":
            continue
        pid = str(e.get("pack_id") or e.get("name") or "").lower()
        t = int(e.get("tier") if e.get("tier") is not None else 2)
        if wanted_ids is not None:
            if pid not in wanted_ids:
                continue
        elif t not in target_tiers:
            continue
        candidates.append(e)

    total = max(len(candidates), 1)
    for idx, entry in enumerate(candidates):
        if _SYNC_CANCEL.is_set():
            break
        pid = str(entry.get("pack_id") or entry.get("name") or "").lower()
        commit_sha = str(entry.get("commit_sha") or "")
        sha12 = commit_sha[:12] if commit_sha else "pinned"
        dest_dir = packs_root / pid / sha12
        marker = dest_dir / ".verified.json"
        if marker.is_file():
            with _SYNC_LOCK:
                _SYNC_STATE["completed_packs"].append(pid)
                _SYNC_STATE["progress_pct"] = int(((idx + 1) / total) * 100)
            _broadcast_event({"type": "pack_verified", "pack_id": pid, "cached": True, "progress_pct": _SYNC_STATE["progress_pct"]})
            continue

        artifacts = entry.get("artifacts") if isinstance(entry.get("artifacts"), dict) else {}
        triple = _target_triple()
        target_urls = artifacts.get("targets") if isinstance(artifacts.get("targets"), dict) else {}
        urls = [
            str(target_urls.get(triple) or ""),
            str(artifacts.get("mirror_url") or ""),
            str(artifacts.get("upstream_archive") or ""),
        ]
        urls = [u for u in urls if u]
        expected_sha = str(artifacts.get("archive_sha256") or "")

        with _SYNC_LOCK:
            _SYNC_STATE["active_pack"] = pid
            _SYNC_STATE["phase"] = f"downloading:{pid}"
        _broadcast_event({"type": "pack_start", "pack_id": pid, "urls": urls})

        part_archive = packs_root / f".part-{pid}-{sha12}.tar.gz"
        tmp_archive = packs_root / f".tmp-{pid}-{int(time.time())}.tar.gz"
        tmp_extract = packs_root / f".extract-{pid}-{int(time.time())}"
        packs_root.mkdir(parents=True, exist_ok=True)
        try:
            digest = _download_with_failover(urls, part_archive, tmp_archive, expected_sha, pack_id=pid)
            _safe_extract_archive(tmp_archive, tmp_extract)
            if dest_dir.exists():
                shutil.rmtree(dest_dir, ignore_errors=True)
            dest_dir.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(tmp_extract), str(dest_dir))
            marker.write_text(
                json.dumps(
                    {
                        "pack_id": pid,
                        "commit_sha": commit_sha,
                        "archive_sha256": digest,
                        "license_spdx": entry.get("license_spdx") or entry.get("license"),
                        "verified_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
            with _SYNC_LOCK:
                _SYNC_STATE["completed_packs"].append(pid)
                _SYNC_STATE["progress_pct"] = int(((idx + 1) / total) * 100)
            _broadcast_event({"type": "pack_done", "pack_id": pid, "sha256": digest, "progress_pct": _SYNC_STATE["progress_pct"]})
        except Exception as exc:
            with _SYNC_LOCK:
                _SYNC_STATE["failed_packs"].append({"pack_id": pid, "error": str(exc)})
                _SYNC_STATE["error"] = str(exc)
            _broadcast_event({"type": "pack_error", "pack_id": pid, "error": str(exc)})
        finally:
            tmp_archive.unlink(missing_ok=True)
            if tmp_extract.exists():
                shutil.rmtree(tmp_extract, ignore_errors=True)

    with _SYNC_LOCK:
        _SYNC_STATE["running"] = False
        _SYNC_STATE["active_pack"] = None
        _SYNC_STATE["phase"] = "cancelled" if _SYNC_CANCEL.is_set() else "complete"
        _SYNC_STATE["finished_at"] = time.time()
        _SYNC_THREAD = None
    _broadcast_event({"type": "sync_complete", "state": dict(_SYNC_STATE)})


def cancel_active_sync() -> bool:
    _SYNC_CANCEL.set()
    with _SYNC_LOCK:
        was_running = bool(_SYNC_STATE.get("running"))
        if was_running:
            _SYNC_STATE["phase"] = "cancelling"
    return was_running


def handle_bootstrap_get(handler: Any, path: str, full_path: str = "") -> bool:
    if path in ("/api/doctor", "/api/v1/doctor"):
        _send_json(handler, 200, build_doctor_report())
        return True

    if path in ("/api/bootstrap/status", "/api/v1/bootstrap/status"):
        _send_json(handler, 200, get_bootstrap_status())
        return True

    if path in ("/api/bootstrap/stream", "/api/v1/bootstrap/stream"):
        q: queue.Queue[Dict[str, Any]] = queue.Queue(maxsize=64)
        with _SYNC_LOCK:
            _SSE_SUBSCRIBERS.append(q)
            snap = dict(_SYNC_STATE)
        handler.send_response(200)
        handler.send_header("Content-Type", "text/event-stream; charset=utf-8")
        handler.send_header("Cache-Control", "no-cache")
        handler.send_header("Connection", "keep-alive")
        handler._send_cors()
        handler.end_headers()
        try:
            handler.wfile.write(f"event: status\ndata: {json.dumps(snap)}\n\n".encode("utf-8"))
            handler.wfile.flush()
            while True:
                try:
                    ev = q.get(timeout=15.0)
                    handler.wfile.write(f"event: {ev.get('type', 'progress')}\ndata: {json.dumps(ev)}\n\n".encode("utf-8"))
                    handler.wfile.flush()
                    if ev.get("type") == "sync_complete":
                        break
                except queue.Empty:
                    handler.wfile.write(b": keepalive\n\n")
                    handler.wfile.flush()
        except Exception:
            pass
        finally:
            with _SYNC_LOCK:
                if q in _SSE_SUBSCRIBERS:
                    _SSE_SUBSCRIBERS.remove(q)
        return True

    return False


def handle_bootstrap_post(handler: Any, path: str, req: Dict[str, Any]) -> bool:
    global _SYNC_THREAD
    if path in ("/api/bootstrap/sync", "/api/v1/bootstrap/sync"):
        if is_offline_mode():
            _send_json(handler, 409, {"started": False, "error": "OFFLINE_MODE_ACTIVE", "detail": "Offline/airgap mode blocks network pack sync."})
            return True
        tiers = [int(t) for t in (req.get("tiers") or [1])]
        pack_ids = req.get("pack_ids") if isinstance(req.get("pack_ids"), list) else None
        with _SYNC_LOCK:
            if _SYNC_STATE["running"]:
                _send_json(handler, 200, {"started": False, "already_running": True, "state": dict(_SYNC_STATE)})
                return True
            _SYNC_CANCEL.clear()
            _SYNC_STATE.update(
                {
                    "running": True,
                    "phase": "starting",
                    "progress_pct": 0,
                    "active_pack": None,
                    "completed_packs": [],
                    "failed_packs": [],
                    "error": None,
                    "started_at": time.time(),
                    "finished_at": None,
                }
            )
            t = threading.Thread(target=_run_sync_worker, args=(tiers, pack_ids), daemon=True)
            _SYNC_THREAD = t
            t.start()
        _send_json(handler, 202, {"started": True, "tiers": tiers, "state": dict(_SYNC_STATE)})
        return True

    if path in ("/api/bootstrap/cancel", "/api/v1/bootstrap/cancel"):
        cancelled = cancel_active_sync()
        _send_json(handler, 200, {"cancelled": cancelled})
        return True

    if path in ("/api/bootstrap/import-offline", "/api/v1/bootstrap/import-offline"):
        pack_id = str(req.get("pack_id") or "").strip().lower()
        archive_str = str(req.get("archive_path") or "").strip()
        if not archive_str:
            _send_json(handler, 400, {"ok": False, "error": "MISSING_PARAMS", "detail": "archive_path required"})
            return True
        archive_path = pathlib.Path(archive_str).resolve()
        if not archive_path.is_file():
            _send_json(handler, 404, {"ok": False, "error": "ARCHIVE_NOT_FOUND", "detail": str(archive_path)})
            return True
        if not pack_id:
            stem = archive_path.name
            for ext in (".tar.zst", ".tar.gz", ".tgz", ".zip"):
                if stem.endswith(ext):
                    stem = stem[:-len(ext)]
            pack_id = stem.lower()

        registry = load_5repo_registry(allow_network=False)
        reg_entry = next((p for p in registry.get("packages", []) if isinstance(p, dict) and str(p.get("id") or "").lower() == pack_id), None)
        if reg_entry:
            expected_sha = str(reg_entry.get("sha256") or "")
            actual_sha = _sha256_file(archive_path)
            if expected_sha and actual_sha.lower() != expected_sha.lower():
                _send_json(handler, 422, {"ok": False, "error": "SHA256_MISMATCH", "expected": expected_sha, "actual": actual_sha})
                return True
            data_dir = resolve_data_dir()
            dest_dir = (data_dir / str(reg_entry.get("target_dir") or f"packs/{pack_id}")).resolve()
            tmp_extract = data_dir / "packs" / f".offline-extract-5r-{pack_id}-{int(time.time())}"
            try:
                _safe_extract_archive(archive_path, tmp_extract)
                if dest_dir.exists():
                    shutil.rmtree(dest_dir, ignore_errors=True)
                dest_dir.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(tmp_extract), str(dest_dir))
                (dest_dir / ".verified.json").write_text(
                    json.dumps({
                        "pack_id": pack_id,
                        "repo_bucket": reg_entry.get("repo_bucket", "packs"),
                        "version": reg_entry.get("version", "v1.0.0"),
                        "archive_sha256": actual_sha,
                        "license_spdx": reg_entry.get("license_spdx", "Apache-2.0"),
                        "verified_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                        "source": "offline_usb_import",
                    }, indent=2),
                    encoding="utf-8",
                )
                _send_json(handler, 200, {"ok": True, "pack_id": pack_id, "sha256": actual_sha, "dest_dir": str(dest_dir)})
            finally:
                if tmp_extract.exists():
                    shutil.rmtree(tmp_extract, ignore_errors=True)
            return True

        manifest = load_manifest()
        entry = next((e for e in manifest.get("entries", []) if isinstance(e, dict) and str(e.get("pack_id") or e.get("name") or "").lower() == pack_id), None)
        if not entry:
            _send_json(handler, 404, {"ok": False, "error": "UNKNOWN_PACK", "pack_id": pack_id})
            return True
        artifacts = entry.get("artifacts") if isinstance(entry.get("artifacts"), dict) else {}
        expected_sha = str(artifacts.get("archive_sha256") or "")
        actual_sha = _sha256_file(archive_path)
        if expected_sha and actual_sha.lower() != expected_sha.lower():
            _send_json(handler, 422, {"ok": False, "error": "SHA256_MISMATCH", "expected": expected_sha, "actual": actual_sha})
            return True
        commit_sha = str(entry.get("commit_sha") or "")
        sha12 = commit_sha[:12] if commit_sha else "pinned"
        packs_root = resolve_data_dir() / "packs"
        dest_dir = packs_root / pack_id / sha12
        tmp_extract = packs_root / f".offline-extract-{pack_id}-{int(time.time())}"
        try:
            _safe_extract_archive(archive_path, tmp_extract)
            if dest_dir.exists():
                shutil.rmtree(dest_dir, ignore_errors=True)
            dest_dir.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(tmp_extract), str(dest_dir))
            (dest_dir / ".verified.json").write_text(
                json.dumps({
                    "pack_id": pack_id,
                    "commit_sha": commit_sha,
                    "archive_sha256": actual_sha,
                    "license_spdx": entry.get("license_spdx") or entry.get("license"),
                    "verified_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "source": "offline_usb_import",
                }, indent=2),
                encoding="utf-8",
            )
            _send_json(handler, 200, {"ok": True, "pack_id": pack_id, "sha256": actual_sha, "dest_dir": str(dest_dir)})
        finally:
            if tmp_extract.exists():
                shutil.rmtree(tmp_extract, ignore_errors=True)
        return True

    if path in ("/api/bootstrap/gc", "/api/v1/bootstrap/gc"):
        packs_root = resolve_data_dir() / "packs"
        manifest = load_manifest()
        valid_pairs = {
            (str(e.get("pack_id") or e.get("name") or "").lower(), (str(e.get("commit_sha") or "")[:12] or "pinned"))
            for e in manifest.get("entries", []) if isinstance(e, dict)
        }
        freed_bytes = 0
        removed: List[str] = []
        if packs_root.is_dir():
            for item in packs_root.iterdir():
                if item.name.startswith((".tmp-", ".part-", ".extract-", ".offline-extract-")):
                    sz = sum(f.stat().st_size for f in item.rglob("*") if f.is_file()) if item.is_dir() else item.stat().st_size
                    if item.is_dir():
                        shutil.rmtree(item, ignore_errors=True)
                    else:
                        item.unlink(missing_ok=True)
                    freed_bytes += sz
                    removed.append(item.name)
                elif item.is_dir():
                    pid = item.name.lower()
                    for ver_dir in item.iterdir():
                        if ver_dir.is_dir() and (pid, ver_dir.name) not in valid_pairs:
                            sz = sum(f.stat().st_size for f in ver_dir.rglob("*") if f.is_file())
                            shutil.rmtree(ver_dir, ignore_errors=True)
                            freed_bytes += sz
                            removed.append(f"{pid}/{ver_dir.name}")
        _send_json(handler, 200, {"ok": True, "freed_bytes": freed_bytes, "removed": removed})
        return True

    return False
