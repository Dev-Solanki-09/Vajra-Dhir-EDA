#!/usr/bin/env python3
"""Prompt 12 Playwright E2E Verification: KiCadRoutingTools Lock-Preserving Autoroute, Violet Ghost Preview, 2D+3D Copper, & KiCad DRC."""

import json
import os
import pathlib
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

from playwright.sync_api import sync_playwright


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _req(base: str, method: str, path: str, body: dict | None = None, timeout: int = 300) -> tuple[int, dict]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    r = urllib.request.Request(
        f"{base}{path}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if data is not None else {},
    )
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))


def _launch_browser(pw):
    channels = (None, "chrome", "msedge") if sys.platform != "win32" else ("chrome", None, "msedge")
    last_err = None
    for ch in channels:
        try:
            kwargs = {"headless": True}
            if ch is not None:
                kwargs["channel"] = ch
            return pw.chromium.launch(**kwargs)
        except Exception as err:
            last_err = err
    raise RuntimeError(f"Unable to launch headless Chromium/Chrome/Edge: {last_err}")


def main() -> None:
    port = _free_port()
    with tempfile.TemporaryDirectory(prefix="vd_p12_e2e_", ignore_cleanup_errors=True) as tmp_dir:
        tmp = pathlib.Path(tmp_dir)
        proj_dir = tmp / "golden"
        shutil.copytree("fixtures/golden-buck-mcu", proj_dir)
        pcb_file = proj_dir / "golden-buck-mcu.kicad_pcb"
        sch_file = proj_dir / "golden-buck-mcu.kicad_sch"

        env = dict(os.environ)
        env["VD_DB_DIR"] = str(tmp / "db")

        proc = subprocess.Popen(
            [sys.executable, "packages/vd-daemon/src/daemon.py", str(port)],
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        base = f"http://127.0.0.1:{port}"
        errors: list[str] = []

        try:
            for _ in range(100):
                try:
                    st, _ = _req(base, "GET", "/api/v1/health", timeout=10)
                    if st == 200:
                        break
                except Exception:
                    time.sleep(0.1)
            else:
                raise TimeoutError("vd-daemon failed to start")

            st, _ = _req(base, "POST", "/api/v1/kicad/active-project", {
                "project_dir": str(proj_dir),
                "pcb_path": str(pcb_file),
                "sch_path": str(sch_file),
                "sync_hwir": True,
            })
            assert st == 200

            with sync_playwright() as p:
                browser = _launch_browser(p)
                page = browser.new_page(viewport={"width": 1440, "height": 900})
                page.on("pageerror", lambda err: errors.append(f"pageerror: {err}"))
                page.on(
                    "console",
                    lambda msg: errors.append(f"console.{msg.type}: {msg.text}")
                    if msg.type == "error" and "409" not in msg.text
                    else None,
                )

                page.goto(base, wait_until="domcontentloaded")
                page.wait_for_selector('[data-testid="pcb-2d-panel"]', timeout=20000)
                page.wait_for_selector('[data-testid="pcb-lock-trace-btn"]', timeout=15000)
                print("[1/5] Opened P2 PCB layout with KiCadRoutingTools toolbar...", flush=True)

                # 1. Lock critical trace -> Amber Lock Indicator renders
                page.locator('[data-testid="pcb-lock-trace-btn"]').click()
                page.wait_for_selector('[data-testid="pcb-locked-trace-line"]', state="attached", timeout=15000)
                status_txt = page.locator('[data-testid="pcb-autoroute-status"]').inner_text()
                assert "SHA " in status_txt, f"Expected locked trace SHA badge, got: {status_txt}"
                sha_token = status_txt.split("SHA ")[1].strip()
                print(f"[2/5] Locked trace amber indicator rendered (SHA prefix={sha_token})", flush=True)

                # 2. Preview Ghost Route -> Violet Ghost overlay renders without modifying live board
                pcb_before = pcb_file.read_text(encoding="utf-8")
                page.locator('[data-testid="pcb-autoroute-preview-btn"]').click()
                page.wait_for_selector('[data-testid="pcb-route-ghost-overlay"]', state="attached", timeout=25000)
                assert pcb_file.read_text(encoding="utf-8") == pcb_before
                print("[3/5] Violet Ghost Route preview rendered around locked trace cleanly", flush=True)

                # 3. Execute real Auto-Route (KRT) -> writes routed copper preserving locked SHA
                page.locator('[data-testid="pcb-autoroute-btn"]').click()
                page.wait_for_function(
                    "() => document.querySelector('[data-testid=\"pcb-autoroute-status\"]')?.innerText?.includes('Routed ') && document.querySelector('[data-testid=\"pcb-autoroute-status\"]')?.innerText?.includes('Locks Verified: 1')",
                    timeout=35000,
                )
                print("[4/5] Real KiCadRoutingTools autoroute committed with locked SHA verified", flush=True)

                # 4. Verify 3D Viewport & real KiCad 10 DRC 0 errors
                page.get_by_role("button", name="3D STEP & Gerbers").click()
                page.wait_for_selector('[data-testid="viewport-3d-panel"] canvas', timeout=20000)
                st_drc, drc = _req(base, "POST", "/api/v1/kicad/drc", {"pcb_path": str(pcb_file)}, timeout=300)
                assert st_drc == 200 and drc["passed"] is True and drc["error_count"] == 0, f"DRC failed: {drc}"
                print("[5/5] 3D copper rendered + real KiCad 10 DRC reported 0 errors", flush=True)

                browser.close()

            assert not errors, f"Console/page errors detected: {errors}"
            print("[PASS] Prompt 12 Playwright E2E KiCadRoutingTools Autorouter passed with 0 errors!")
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()


if __name__ == "__main__":
    main()
