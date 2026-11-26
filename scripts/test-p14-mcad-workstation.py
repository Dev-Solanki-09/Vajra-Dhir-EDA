#!/usr/bin/env python3
"""Prompt 14 Playwright E2E Verification: CadQuery Enclosure, Exact 3D Clash DRC, Cross-Section Slice, & ElmerFEM 3D Thermal."""

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


def _req(base: str, method: str, path: str, body: dict | None = None, timeout: int = 60) -> tuple[int, dict]:
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
    with tempfile.TemporaryDirectory(prefix="vd_p14_e2e_", ignore_cleanup_errors=True) as tmp_dir:
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
                    if msg.type == "error"
                    else None,
                )

                page.goto(base, wait_until="domcontentloaded")
                page.get_by_role("button", name="3D STEP & Gerbers").click()
                page.wait_for_selector('[data-testid="viewport-3d-panel"] canvas', timeout=20000)
                print("[1/5] Opened P3 Three.js 3D Viewport...", flush=True)

                # 1. Generate parametric CadQuery enclosure -> 0.0 mm^3 clash
                page.locator('[data-testid="v3d-enclosure-btn"]').click()
                page.wait_for_selector('[data-testid="v3d-mcad-status"]', timeout=15000)
                stat_ok = page.locator('[data-testid="v3d-mcad-status"]').inner_text()
                assert "0.0 mm³ (PASS" in stat_ok, f"Expected 0 clash PASS, got: {stat_ok}"
                page.locator('[data-testid="v3d-slice-toggle"]').click()
                page.wait_for_selector('[data-testid="v3d-slice-slider"]', timeout=5000)
                print(f"[2/5] Parametric CadQuery enclosure & 3D slice plane active ({stat_ok})", flush=True)

                # 2. Lower lid height in mcad/enclosure.py -> auto-regenerates & highlights J1 clash in P3
                _, rd = _req(base, "GET", "/api/v1/fs/read?path=mcad/enclosure.py")
                orig_py = rd["content"]
                _req(base, "POST", "/api/v1/fs/write", {
                    "path": "mcad/enclosure.py",
                    "content": orig_py.replace("LID_HEIGHT_MM = 9.0", "LID_HEIGHT_MM = 2.5"),
                })
                page.wait_for_function(
                    "() => document.querySelector('[data-testid=\"v3d-mcad-status\"]')?.innerText?.includes('J1')",
                    timeout=15000,
                )
                stat_clash = page.locator('[data-testid="v3d-mcad-status"]').inner_text()
                print(f"[3/5] Lowered lid height -> exact 3D clash caught on J1 ({stat_clash})", flush=True)

                # 3. Restore lid height -> clash returns to 0.0 mm^3
                _req(base, "POST", "/api/v1/fs/write", {
                    "path": "mcad/enclosure.py",
                    "content": orig_py,
                })
                page.wait_for_function(
                    "() => document.querySelector('[data-testid=\"v3d-mcad-status\"]')?.innerText?.includes('0.0 mm³ (PASS')",
                    timeout=15000,
                )
                print("[4/5] Restored lid height -> clash cleared to 0.0 mm³", flush=True)

                # 4. Run 3D Thermal FEM (Gmsh + ElmerFEM) and render Inferno temperature field in P3
                page.locator('[data-testid="v3d-thermal-btn"]').click()
                page.wait_for_selector('[data-testid="v3d-thermal-status"]', timeout=15000)
                therm_txt = page.locator('[data-testid="v3d-thermal-status"]').inner_text()
                assert "ElmerFEM" in therm_txt and "°C" in therm_txt, f"Unexpected thermal status: {therm_txt}"
                print(f"[5/5] ElmerFEM 3D thermal field rendered ({therm_txt})", flush=True)

                browser.close()

            assert not errors, f"Console/page errors detected: {errors}"
            print("[PASS] Prompt 14 Playwright E2E CadQuery + Clash + ElmerFEM passed with 0 errors!")
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()


if __name__ == "__main__":
    main()
