#!/usr/bin/env python3
"""
Phase 6 Suite 1: 5-Repo Companion Registry, .tar.zst Bundle Integrity & Bootstrap Launch Verification.
"""

from __future__ import annotations

import hashlib
import json
import os
import pathlib
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
STAGING = ROOT / ".vd-companion-staging"
REGISTRY_PATH = STAGING / "Vajra-Dhir-Packs" / "registry" / "registry.v1.json"
ASSETS_DIR = STAGING / "release-assets"
DAEMON_SCRIPT = ROOT / "packages" / "vd-daemon" / "src" / "daemon.py"


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _req(base: str, method: str, path: str, body=None, timeout: int = 30):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"} if body is not None else {}
    req = urllib.request.Request(f"{base}{path}", data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, json.loads(r.read().decode("utf-8"))


def test_5repo_staging_registry() -> dict:
    assert REGISTRY_PATH.is_file(), f"Missing 5-repo registry at {REGISTRY_PATH}"
    reg = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    pkgs = reg.get("packages") or []
    assert len(pkgs) == 14, f"Expected 14 companion packages in registry.v1.json, got {len(pkgs)}"
    buckets = {p.get("repo_bucket") for p in pkgs}
    assert buckets == {"dependencies", "tools", "libraries", "packs", "resources"}, f"Bad buckets: {buckets}"

    for p in pkgs:
        bucket = p["repo_bucket"]
        arch = p["archive_name"]
        zst_file = ASSETS_DIR / bucket / arch
        sha_file = ASSETS_DIR / bucket / f"{arch}.sha256"
        assert zst_file.is_file(), f"Missing archive {zst_file}"
        assert sha_file.is_file(), f"Missing sha256 sidecar {sha_file}"
        actual_sha = hashlib.sha256(zst_file.read_bytes()).hexdigest()
        assert actual_sha == p["sha256"], f"SHA256 mismatch for {arch}: {actual_sha} != {p['sha256']}"
        sidecar_sha = sha_file.read_text(encoding="utf-8").split()[0]
        assert sidecar_sha == actual_sha, f"Sidecar mismatch for {arch}"
    return reg


def main() -> None:
    reg = test_5repo_staging_registry()
    print(f"[1/3] Verified 5-repo registry.v1.json + all {len(reg['packages'])} .tar.zst/.sha256 bundles!")

    port = _free_port()
    base = f"http://127.0.0.1:{port}"
    with tempfile.TemporaryDirectory(prefix="vd_5repo_boot_", ignore_cleanup_errors=True) as tmp_dir:
        tmp = pathlib.Path(tmp_dir)
        data_dir = tmp / "runtime"
        proj_dir = tmp / "proj"
        proj_dir.mkdir(parents=True)
        for f in (ROOT / "fixtures" / "golden-buck-mcu").glob("golden-buck-mcu.*"):
            (proj_dir / f.name).write_bytes(f.read_bytes())

        env = os.environ.copy()
        env["VD_DATA_DIR"] = str(data_dir)
        env["VD_DB_DIR"] = str(tmp / "db")
        env["VD_OFFLINE"] = "1"
        env["VD_LOCAL_COMPANION_STAGING"] = "1"

        proc = subprocess.Popen(
            [sys.executable, str(DAEMON_SCRIPT), "--port", str(port), "--project-dir", str(proj_dir)],
            cwd=str(ROOT),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        try:
            for _ in range(40):
                try:
                    code, _ = _req(base, "GET", "/api/health", timeout=2)
                    if code == 200:
                        break
                except Exception:
                    time.sleep(0.25)

            code, st = _req(base, "GET", "/api/bootstrap/status")
            assert code == 200, f"/api/bootstrap/status HTTP {code}"
            repos = st.get("repos") or []
            buckets_found = {r.get("bucket") for r in repos if isinstance(r, dict)}
            for bucket in ("dependencies", "tools", "libraries", "packs", "resources"):
                assert bucket in buckets_found, f"Missing repo bucket '{bucket}' in /api/bootstrap/status: {buckets_found}"
            print(f"[2/3] Live /api/bootstrap/status reported all 5 companion buckets cleanly!")

            sample_pkg = next(p for p in reg["packages"] if p["id"] == "lib-open-cubo")
            sample_zst = ASSETS_DIR / "libraries" / sample_pkg["archive_name"]
            code, imp = _req(base, "POST", "/api/bootstrap/import-offline", {
                "pack_id": "lib-open-cubo",
                "archive_path": str(sample_zst),
            })
            assert code == 200 and imp.get("ok"), f"Offline import failed: {imp}"
            assert imp["sha256"] == sample_pkg["sha256"]
            dest = pathlib.Path(imp["dest_dir"])
            assert (dest / ".verified.json").is_file()
            print(f"[3/3] Offline .tar.zst zstd extraction + SHA-256 verification passed ({dest.name})!")
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()

    print("PASSED: test-5repo-bootstrap-and-launch.py")


if __name__ == "__main__":
    main()
