"""
One-command cross-platform launcher for Vajra-Dhir Studio (`pnpm studio`).
Ensures dependencies & compiled frontend dist exist on fresh repo downloads/clones,
boots `packages/vd-daemon/src/daemon.py` on 127.0.0.1:41900, and opens the browser.
"""

from __future__ import annotations

import os
import pathlib
import shutil
import socket
import subprocess
import sys
import time
import urllib.request
import webbrowser

ROOT = pathlib.Path(__file__).resolve().parent.parent
PORT = int(os.environ.get("VD_PORT", "41900"))
BASE_URL = f"http://127.0.0.1:{PORT}"


def _newest_mtime(directory: pathlib.Path) -> float:
    newest = 0.0
    if not directory.exists():
        return newest
    for p in directory.rglob("*"):
        if p.is_file():
            m = p.stat().st_mtime
            if m > newest:
                newest = m
    return newest


def _is_daemon_up() -> bool:
    try:
        with socket.create_connection(("127.0.0.1", PORT), timeout=0.35):
            return True
    except OSError:
        return False


def _ensure_frontend_built() -> None:
    pnpm = shutil.which("pnpm") or shutil.which("pnpm.cmd")
    node_modules = ROOT / "node_modules"
    if not node_modules.exists():
        if not pnpm:
            raise RuntimeError("pnpm is required on PATH to install JS workspace dependencies (run: npm i -g pnpm@10.6.0)")
        print("[studio] Fresh clone/download detected (node_modules missing). Running `pnpm install`...")
        subprocess.run([pnpm, "install"], cwd=str(ROOT), check=True)

    dist_index = ROOT / "apps" / "workstation" / "dist" / "index.html"
    src_dir = ROOT / "apps" / "workstation" / "src"
    needs_build = (not dist_index.is_file()) or (_newest_mtime(src_dir) > dist_index.stat().st_mtime)
    if needs_build:
        if not pnpm:
            raise RuntimeError("pnpm is required to build apps/workstation/dist")
        print("[studio] Building @vajradhir/workstation production bundle...")
        subprocess.run([pnpm, "--filter", "@vajradhir/workstation", "build"], cwd=str(ROOT), check=True)


def main() -> None:
    _ensure_frontend_built()

    proc = None
    if not _is_daemon_up():
        env = dict(os.environ)
        env.setdefault("PYTHONUTF8", "1")
        print(f"[studio] Starting vd-daemon at {BASE_URL} ...")
        proc = subprocess.Popen(
            [sys.executable, str(ROOT / "packages" / "vd-daemon" / "src" / "daemon.py"), str(PORT)],
            cwd=str(ROOT),
            env=env,
        )
        for _ in range(100):
            if proc.poll() is not None:
                raise RuntimeError(f"vd-daemon exited unexpectedly with code {proc.returncode}")
            try:
                with urllib.request.urlopen(f"{BASE_URL}/api/v1/health", timeout=2) as resp:
                    if resp.status == 200:
                        break
            except Exception:
                time.sleep(0.15)
        else:
            raise TimeoutError("Timed out waiting for vd-daemon /api/v1/health")
    else:
        print(f"[studio] Attached to running vd-daemon at {BASE_URL}")

    print(f"[studio] Ready! Open {BASE_URL} (Press Ctrl+C to stop daemon)")
    if "--no-browser" not in sys.argv:
        try:
            webbrowser.open(BASE_URL)
        except Exception:
            pass

    if proc is not None:
        try:
            proc.wait()
        except KeyboardInterrupt:
            print("\n[studio] Shutting down vd-daemon cleanly...")
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()


if __name__ == "__main__":
    main()
