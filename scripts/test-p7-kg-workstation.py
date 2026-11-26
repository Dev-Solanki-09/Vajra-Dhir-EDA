#!/usr/bin/env python3
"""Prompt 7 Playwright E2E Verification: DuckDB KG + MLCC Derating (uPlot) + LCSC->KiCad/3D/.ato Import."""

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


def _req(base: str, method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    r = urllib.request.Request(
        f"{base}{path}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if data is not None else {},
    )
    with urllib.request.urlopen(r, timeout=60) as resp:
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
    with tempfile.TemporaryDirectory(prefix="vd_p7_e2e_", ignore_cleanup_errors=True) as tmp_dir:
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
                    st, _ = _req(base, "GET", "/api/v1/health")
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
                page.get_by_role("button", name="Library & BOM").click()
                print("[1/4] Opened Library & BOM DuckDB Knowledge Graph...", flush=True)

                page.wait_for_selector('[data-testid="component-library-panel"]', timeout=20000)
                page.wait_for_selector('[data-testid="kg-row-CL31B226KAHNNNE"]', timeout=15000)
                page.locator('[data-testid="kg-row-CL31B226KAHNNNE"]').click()
                page.wait_for_function(
                    "() => document.querySelector('[data-testid=\"kg-details-card\"]')?.innerText?.includes('CL31B226KAHNNNE')",
                    timeout=15000,
                )
                page.wait_for_selector('[data-testid="kg-effective-derating"]', timeout=10000)
                assert "Effective at 12V" in page.locator('[data-testid="kg-effective-derating"]').inner_text()
                page.wait_for_selector('[data-testid="kg-details-card"] .uplot canvas', timeout=10000)
                print("[2/4] DuckDB search + MLCC DC-bias uPlot derating curve verified", flush=True)

                # Import Symbol + Footprint + STEP & Place into project
                page.locator('[data-testid="kg-import-place-btn"]').click()
                try:
                    page.wait_for_function(
                        "() => document.querySelector('[data-testid=\"kg-status-banner\"]')?.textContent?.includes('Imported C12891')",
                        timeout=25000,
                    )
                except Exception as exc:
                    banner_txt = page.locator('[data-testid="kg-status-banner"]').inner_text()
                    raise RuntimeError(f"P7 import wait failed: {exc}\nBANNER={banner_txt}\nERRORS={errors}") from exc

                assert (proj_dir / "sym-lib-table").is_file()
                assert (proj_dir / "fp-lib-table").is_file()
                ato_txt = (proj_dir / "elec" / "src" / "main.ato").read_text(encoding="utf-8")
                assert "C12891" in ato_txt and "CL31B226KAHNNNE" in ato_txt
                print("[3/4] Imported KiCad libs + bound LCSC/MPN in elec/src/main.ato", flush=True)

                # Verify placed capacitor renders in P2 (KiCanvas 2D) and P3 (Three.js 3D)
                page.get_by_role("button", name="PCB layout").click()
                page.wait_for_selector('[data-testid="pcb-hit-C5"]', timeout=15000)
                page.get_by_role("button", name="3D STEP & Gerbers").click()
                page.wait_for_selector('[data-testid="v3d-chip-C5"]', timeout=15000)
                print("[4/4] Newly imported capacitor C5 verified in P2 2D & P3 3D viewports", flush=True)

                browser.close()

            assert not errors, f"Console/page errors detected: {errors}"
            print("[PASS] Prompt 7 Playwright E2E DuckDB KG & LCSC Import flow passed with 0 errors!")
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()


if __name__ == "__main__":
    main()
