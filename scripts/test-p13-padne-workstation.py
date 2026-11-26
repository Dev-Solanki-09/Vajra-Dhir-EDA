#!/usr/bin/env python3
"""Prompt 13 Playwright E2E Verification: atx/padne 2.5D FEM Power Integrity Heatmap on P2 (2D) & P3 (3D) + Bottleneck Repair."""

import json
import os
import pathlib
import re
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


def _skinny_net3_traces(pcb_file: pathlib.Path, width_mm: float = 0.15) -> None:
    text = pcb_file.read_text(encoding="utf-8")
    out_parts = []
    pos = 0
    for m in re.finditer(r"\(segment\b(?:[^()]|\([^()]*\)|\(\s*start[^)]*\)|\(\s*end[^)]*\)|\(\s*width[^)]*\)|\(\s*layer[^)]*\)|\(\s*net[^)]*\)|\(\s*uuid[^)]*\))*\)", text):
        blk = m.group(0)
        if "(net 3)" in blk:
            blk = re.sub(r"\(width\s+[0-9.]+\)", f"(width {width_mm:.3f})", blk)
        out_parts.append(text[pos:m.start()])
        out_parts.append(blk)
        pos = m.end()
    out_parts.append(text[pos:])
    pcb_file.write_text("".join(out_parts), encoding="utf-8")


def main() -> None:
    port = _free_port()
    with tempfile.TemporaryDirectory(prefix="vd_p13_e2e_", ignore_cleanup_errors=True) as tmp_dir:
        tmp = pathlib.Path(tmp_dir)
        proj_dir = tmp / "golden"
        shutil.copytree("fixtures/golden-buck-mcu", proj_dir)
        pcb_file = proj_dir / "golden-buck-mcu.kicad_pcb"
        sch_file = proj_dir / "golden-buck-mcu.kicad_sch"
        _skinny_net3_traces(pcb_file, width_mm=0.15)

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
                page.wait_for_selector('[data-testid="pcb-2d-panel"]', timeout=20000)
                page.wait_for_selector('[data-testid="pcb-pi-heatmap-toggle"]', timeout=15000)
                print("[1/5] Opened P2 PCB layout with PI Heatmap toggle...", flush=True)

                # 1. Toggle PI Heatmap on skinny 0.15mm 2A trace -> catches bottleneck + renders 2D Viridis overlay
                page.locator('[data-testid="pcb-pi-heatmap-toggle"]').click()
                page.wait_for_selector('[data-testid="pcb-pi-heatmap-overlay"]', state="attached", timeout=20000)
                page.wait_for_selector('[data-testid="pcb-pi-bottleneck-marker"]', state="attached", timeout=10000)
                page.wait_for_selector('[data-testid="pcb-pi-scale-bar"]', timeout=10000)
                status_2d = page.locator('[data-testid="pcb-pi-status"]').inner_text()
                assert "BOTTLENECK" in status_2d, f"Expected PI BOTTLENECK on 0.15mm 2A trace, got: {status_2d}"
                readout_2d = page.locator('[data-testid="pcb-pi-hover-readout"]').inner_text()
                assert "V @" in readout_2d and "A/mm²" in readout_2d, f"Unexpected 2D hover readout: {readout_2d}"
                print(f"[2/5] 2D PI Heatmap rendered bottleneck ({status_2d})", flush=True)

                # 2. Switch to 3D Viewport -> verify shared PI Heatmap state renders on 3D copper + scale bar
                page.get_by_role("button", name="3D STEP & Gerbers").click()
                page.wait_for_selector('[data-testid="viewport-3d-panel"] canvas', timeout=20000)
                page.wait_for_selector('[data-testid="v3d-pi-scale-bar"]', timeout=10000)
                status_3d = page.locator('[data-testid="v3d-pi-status"]').inner_text()
                assert "3D PI BOTTLENECK" in status_3d, f"Expected 3D PI BOTTLENECK, got: {status_3d}"
                print(f"[3/5] 3D PI Heatmap rendered on Three.js copper ({status_3d})", flush=True)

                # 3. Return to PCB Layout & click Widen Bottleneck -> proves IR drop & current density pass
                page.get_by_role("button", name="PCB Layout").click()
                page.wait_for_selector('[data-testid="pcb-pi-widen-btn"]', timeout=10000)
                page.locator('[data-testid="pcb-pi-widen-btn"]').click()
                page.wait_for_function(
                    "() => document.querySelector('[data-testid=\"pcb-pi-status\"]')?.innerText?.includes('PI PASS')",
                    timeout=20000,
                )
                status_2d_pass = page.locator('[data-testid="pcb-pi-status"]').inner_text()
                print(f"[4/5] Bottleneck widened -> 2D PI passed ({status_2d_pass})", flush=True)

                # 4. Verify 3D Viewport also reflects PI PASS
                page.get_by_role("button", name="3D STEP & Gerbers").click()
                page.wait_for_function(
                    "() => document.querySelector('[data-testid=\"v3d-pi-status\"]')?.innerText?.includes('3D PI PASS')",
                    timeout=15000,
                )
                status_3d_pass = page.locator('[data-testid="v3d-pi-status"]').inner_text()
                print(f"[5/5] 3D Viewport updated cleanly ({status_3d_pass})", flush=True)

                browser.close()

            assert not errors, f"Console/page errors detected: {errors}"
            print("[PASS] Prompt 13 Playwright E2E Power Integrity 2D+3D Heatmap passed with 0 errors!")
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()


if __name__ == "__main__":
    main()
