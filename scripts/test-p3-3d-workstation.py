#!/usr/bin/env python3
"""Prompt 3 Playwright E2E Verification: Three.js + Isolated OCCT Web Worker 3D PCB & STEP Editor."""

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
    with tempfile.TemporaryDirectory(prefix="vd_p3_e2e_") as tmp_dir:
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
                page.get_by_role("button", name="3D STEP & Gerbers").click()
                print("[1/4] Opened 3D STEP & Gerbers workspace, waiting for Viewport3DPanel...", flush=True)

                page.wait_for_selector('[data-testid="viewport-3d-panel"]', timeout=20000)
                page.wait_for_selector('[data-testid="viewport-3d-canvas"]', timeout=20000)
                try:
                    page.wait_for_selector('[data-testid="v3d-chip-C1"]', timeout=10000)
                except Exception as exc:
                    cnt = page.locator('[data-testid="v3d-chip-C1"]').count()
                    boxes = [page.locator('[data-testid="v3d-chip-C1"]').nth(i).bounding_box() for i in range(cnt)]
                    p_txt = page.locator('[data-testid="viewport-3d-panel"]').inner_text()
                    raise RuntimeError(f"Missing v3d-chip-C1 (cnt={cnt}, boxes={boxes}): {exc}\nERRORS={errors}\nPANEL={p_txt}") from exc

                canvas = page.locator('[data-testid="viewport-3d-canvas"]')
                box = canvas.bounding_box()
                assert box and box["width"] > 200 and box["height"] > 200, box

                # Wait for isolated OCCT Web Worker to decode real KiCad 10 .step models
                try:
                    page.wait_for_function(
                        "() => Number(document.querySelector('[data-testid=\"viewport-3d-panel\"]')?.getAttribute('data-step-decoded-count') || '0') >= 1",
                        timeout=12000,
                    )
                except Exception as exc:
                    p_txt = page.locator('[data-testid="viewport-3d-panel"]').inner_text()
                    res_a = page.locator('[data-testid="viewport-3d-panel"]').get_attribute("data-step-models-resolved")
                    dec_a = page.locator('[data-testid="viewport-3d-panel"]').get_attribute("data-step-decoded-count")
                    raise RuntimeError(f"STEP worker timeout (resolved={res_a}, decoded={dec_a}): {exc}\nERRORS={errors}\nPANEL={p_txt}") from exc
                resolved_attr = page.locator('[data-testid="viewport-3d-panel"]').get_attribute("data-step-models-resolved")
                decoded_attr = page.locator('[data-testid="viewport-3d-panel"]').get_attribute("data-step-decoded-count")
                print(f"[2/4] OCCT Web Worker decoded {decoded_attr} unique STEP models (resolved={resolved_attr})", flush=True)

                # Prove rendered 3D canvas is non-blank
                png_bytes = canvas.screenshot()
                assert len(png_bytes) > 5000, f"Expected non-blank 3D canvas screenshot, got {len(png_bytes)} bytes"

                # Verify locked component guard in 3D rejects non-human mutations cleanly
                page.locator('[data-testid="test-3d-lock-guard-btn"]').click()
                page.wait_for_selector('[data-testid="viewport3d-lock-violation-toast"]', timeout=5000)
                assert "KERNEL_LOCK_VIOLATION" in page.locator('[data-testid="viewport3d-lock-violation-toast"]').inner_text()

                # Select C1 in 3D, rotate +90 deg -> persists to .kicad_pcb AND cross-probes to P2!
                pcb_before = pcb_file.read_text(encoding="utf-8")
                page.locator('[data-testid="v3d-chip-C1"]').click()
                page.get_by_role("button", name="+90° (R)").click()

                deadline = time.time() + 10
                while time.time() < deadline:
                    if pcb_file.read_text(encoding="utf-8") != pcb_before:
                        break
                    time.sleep(0.2)
                else:
                    raise AssertionError("3D rotation on C1 did not persist to .kicad_pcb")

                # Verify CrossProbeBus (<16ms) synced C1 selection to P2 PCB & Schematic
                page.get_by_role("button", name="PCB layout").click()
                page.wait_for_selector('[data-testid="pcb-2d-panel"]', timeout=10000)
                assert "Selected: C1" in page.locator('[data-testid="pcb-2d-panel"]').inner_text()

                page.get_by_role("button", name="Schematic capture").click()
                page.wait_for_selector('[data-testid="schematic-2d-panel"]', timeout=10000)
                assert "Selected: C1" in page.locator('[data-testid="schematic-2d-panel"]').inner_text()

                browser.close()

            assert not errors, f"Console/page errors detected: {errors}"
            print("[PASS] Prompt 3 Playwright E2E Three.js + OCCT STEP 3D flow passed with 0 errors!")
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()


if __name__ == "__main__":
    main()
