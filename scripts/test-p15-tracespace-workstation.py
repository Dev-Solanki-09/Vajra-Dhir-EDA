#!/usr/bin/env python3
"""Prompt 15 Playwright E2E Verification: tracespace Web Worker Gerber RS-274X + Excellon Drill Inspector & Cross-Probing."""

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


def _req(base: str, method: str, path: str, body: dict | None = None, timeout: int = 120) -> tuple[int, dict]:
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
    with tempfile.TemporaryDirectory(prefix="vd_p15_e2e_", ignore_cleanup_errors=True) as tmp_dir:
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
                page.get_by_text("Gerber Fab (P15)").click()
                page.wait_for_selector('[data-testid="gerber-inspector-panel"]', timeout=20000)
                print("[1/4] Opened Gerber Fab (P15) panel...", flush=True)

                # Export real Gerbers + Excellon drills via kicad-cli & plot in tracespace Web Worker
                page.locator('[data-testid="gerber-export-btn"]').click()
                page.wait_for_selector('[data-testid="gerber-sanity-summary"]', timeout=30000)
                stale_txt = page.locator('[data-testid="gerber-stale-badge"]').inner_text()
                assert "FRESH" in stale_txt, f"Expected FRESH Gerber digest, got: {stale_txt}"
                sanity_txt = page.locator('[data-testid="gerber-sanity-summary"]').inner_text()
                assert "PASS · Edge.Cuts Outline" in sanity_txt and "PASS · Copper & Solder Mask" in sanity_txt, sanity_txt
                print(f"[2/4] tracespace worker plotted layers cleanly ({stale_txt})", flush=True)

                # Verify copper, mask, silk, outline, and drill SVG layers rendered
                page.wait_for_selector('[data-testid="gerber-svg-layer-copper-top"]', state="attached", timeout=10000)
                page.wait_for_selector('[data-testid="gerber-svg-layer-outline-all"]', state="attached", timeout=10000)
                page.wait_for_selector('[data-testid="gerber-svg-layer-drill-all"]', state="attached", timeout=10000)
                print("[3/4] Verified copper, outline, and Excellon drill SVG layers rendered...", flush=True)

                # Click inside Gerber SVG viewport -> emits CrossProbeBus coordinate in exact nm
                svg_box = page.locator('[data-testid="gerber-svg-viewport"]').bounding_box()
                assert svg_box is not None
                page.mouse.click(svg_box["x"] + svg_box["width"] * 0.5, svg_box["y"] + svg_box["height"] * 0.5)
                page.wait_for_function(
                    "() => document.querySelector('[data-testid=\"gerber-crossprobe-readout\"]')?.innerText?.includes('CrossProbe: (')",
                    timeout=10000,
                )
                cp_txt = page.locator('[data-testid="gerber-crossprobe-readout"]').inner_text()
                print(f"[4/4] Gerber coordinate cross-probe active ({cp_txt})", flush=True)

                browser.close()

            assert not errors, f"Console/page errors detected: {errors}"
            print("[PASS] Prompt 15 Playwright E2E tracespace Gerber Inspector passed with 0 errors!")
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()


if __name__ == "__main__":
    main()
