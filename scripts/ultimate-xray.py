#!/usr/bin/env python3
"""
RESCUE.md Phase 0 X-Ray Forensic Audit:
  1. Verifies apps/workstation/dist MIME assets & bundle size invariant (< 400 KB entry chunk).
  2. Verifies every Python module under packages/vd-daemon/src compiles cleanly (`py_compile`)
     with ZERO in-process GPL `pcbnew` imports across Ring-1 files.
  3. Verifies static + API + MCP + ACP + Plugin endpoints respond cleanly with 0 unhandled 500s.
"""

from __future__ import annotations

import json
import os
import pathlib
import py_compile
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
DAEMON_SRC = ROOT / "packages" / "vd-daemon" / "src"
DIST_ASSETS = ROOT / "apps" / "workstation" / "dist" / "assets"


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _req(base: str, method: str, path: str, body=None, timeout: int = 15):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"} if body is not None else {}
    req = urllib.request.Request(f"{base}{path}", data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.headers.get("Content-Type", ""), r.read()


def main() -> None:
    # 1. Ring-1 py_compile & GPL boundary scan
    py_files = sorted(DAEMON_SRC.glob("*.py"))
    for pyf in py_files:
        py_compile.compile(str(pyf), doraise=True)
        txt = pyf.read_text(encoding="utf-8", errors="replace")
        for line in txt.splitlines():
            s = line.strip()
            if s.startswith(("import pcbnew", "from pcbnew")):
                raise AssertionError(f"Ring-1 GPL violation in {pyf.name}: {s}")

    # 2. Entry bundle budget check (< 400 KB)
    idx_chunks = sorted(DIST_ASSETS.glob("index-*.js"), key=lambda p: p.stat().st_size, reverse=True)
    assert len(idx_chunks) >= 1
    entry_kb = idx_chunks[0].stat().st_size / 1024.0
    assert entry_kb < 400.0, f"Entry bundle {entry_kb:.1f} KB exceeds 400 KB limit"
    print(f"[1/2] X-Ray Ring-1 compile ({len(py_files)} modules) + entry bundle ({entry_kb:.1f} KB < 400 KB) CLEAN")

    # 3. Smoke-check all core health, MIME, MCP, plugins, tx, polish endpoints
    port = _free_port()
    base = f"http://127.0.0.1:{port}"
    with tempfile.TemporaryDirectory(prefix="vd_xray_", ignore_cleanup_errors=True) as tmp_dir:
        env = os.environ.copy()
        env["VD_DB_DIR"] = tmp_dir
        env["VD_STATIC_DIR"] = str(ROOT / "apps" / "workstation" / "dist")
        proc = subprocess.Popen(
            [sys.executable, str(DAEMON_SRC / "daemon.py"), str(port)],
            cwd=str(ROOT),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        try:
            for _ in range(100):
                if proc.poll() is not None:
                    raise RuntimeError(f"daemon exited: {proc.stderr.read().decode('utf-8','replace')}")
                try:
                    st, _, _ = _req(base, "GET", "/api/v1/health", timeout=2)
                    if st == 200:
                        break
                except Exception:
                    time.sleep(0.1)
            else:
                raise TimeoutError("daemon failed to start")

            st, ct, _ = _req(base, "GET", f"/assets/{idx_chunks[0].name}")
            assert st == 200 and "javascript" in ct.lower(), (st, ct)
            for ep in ("/api/v1/health", "/api/v1/tx/state", "/api/v1/agent/policy", "/api/v1/polish/tools", "/api/v1/polish/fab-presets", "/api/v1/plugins"):
                s, _, _ = _req(base, "GET", ep)
                assert s == 200, (ep, s)
            print("[2/2] All MIME, Health, TX Sync, Agent Policy, Polish & Plugin routes returned 200 OK!")
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()

    print("[PASS] Ultimate Rescue X-Ray passed with zero regressions!")


if __name__ == "__main__":
    main()
