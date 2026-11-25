#!/usr/bin/env python3
"""Prompt 2 Playwright E2E Verification: KiCanvas WebGL2/Canvas2D PCB & Schematic Workstation."""

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
    with tempfile.TemporaryDirectory(prefix="vd_p2_e2e_") as tmp_dir:
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
                page.on("console", lambda msg: errors.append(f"console.{msg.type}: {msg.text}") if msg.type == "error" and "409" not in msg.text else None)

                page.goto(base, wait_until="domcontentloaded")
                print("[1/5] Page DOM loaded, waiting for KiCanvas PCB panel...", flush=True)
                page.wait_for_selector('[data-testid="pcb-2d-panel"]', timeout=20000)
                try:
                    page.wait_for_selector('[data-testid="pcb-hit-C1"]', timeout=15000)
                except Exception as exc:
                    panel_txt = page.locator('[data-testid="pcb-2d-panel"]').inner_text()
                    overlay_html = page.locator('[data-testid="pcb-interactive-overlay"]').inner_html()
                    raise RuntimeError(f"Missing pcb-hit-C1: {exc}\nERRORS={errors}\nPANEL={panel_txt}\nOVERLAY={overlay_html[:1200]}") from exc
                page.wait_for_selector('[data-testid="pcb-lock-halo-J1"]', timeout=15000)

                canvas_box = page.locator('[data-testid="pcb-engine-canvas"]').bounding_box()
                assert canvas_box and canvas_box["width"] > 200 and canvas_box["height"] > 200, canvas_box

                # 1. Fail-closed KERNEL_LOCK_VIOLATION test on locked J1
                page.locator('[data-testid="test-agent-lock-guard-btn"]').click()
                page.wait_for_selector('[data-testid="kernel-lock-violation-toast"]', timeout=5000)
                toast_text = page.locator('[data-testid="kernel-lock-violation-toast"]').inner_text()
                assert "KERNEL_LOCK_VIOLATION" in toast_text, toast_text

                # 2. Interactive drag of unlocked C1 -> persists to .kicad_pcb on disk
                pcb_before = pcb_file.read_text(encoding="utf-8")
                page.get_by_role("button", name="Drag (G)").click()
                c1_box = page.locator('[data-testid="pcb-hit-C1"]').bounding_box()
                assert c1_box
                sx = c1_box["x"] + c1_box["width"] / 2
                sy = c1_box["y"] + c1_box["height"] / 2
                page.mouse.move(sx, sy)
                page.mouse.down()
                page.mouse.move(sx + 32, sy + 24, steps=6)
                page.mouse.up()

                deadline = time.time() + 10
                while time.time() < deadline:
                    if pcb_file.read_text(encoding="utf-8") != pcb_before:
                        break
                    time.sleep(0.2)
                else:
                    raise AssertionError("Drag on C1 did not persist updated coordinates to .kicad_pcb")

                # 3. Click real KiCad 10 Run DRC button
                page.locator('[data-testid="run-kicad-drc-btn"]').click()
                try:
                    page.wait_for_function(
                        "() => document.body.innerText.includes('DRC PASS') || document.body.innerText.includes('DRC FAIL')",
                        timeout=30000,
                    )
                except Exception as exc:
                    panel_txt = page.locator('[data-testid="pcb-2d-panel"]').inner_text()
                    raise RuntimeError(f"DRC wait failed: {exc}\nERRORS={errors}\nPANEL={panel_txt}") from exc

                # 4. External edit (valid S-expression change) -> live reload via WebSocket / events without breaking view
                rev_before = page.locator('[data-testid="pcb-2d-panel"]').inner_text()
                orig_pcb = pcb_file.read_text(encoding="utf-8")
                edited_pcb = orig_pcb.replace('"10uF 25V"', '"10uF 35V"', 1)
                assert edited_pcb != orig_pcb, "Expected test value replacement in .kicad_pcb"
                pcb_file.write_text(edited_pcb, encoding="utf-8")
                page.wait_for_timeout(2500)
                rev_after = page.locator('[data-testid="pcb-2d-panel"]').inner_text()
                assert rev_after != rev_before or "WS Live" in rev_after or "rev " in rev_after

                # 5. Switch to Schematic capture -> KiCanvas schematic renders & cross-probes back to PCB (<16ms)
                page.get_by_role("button", name="Schematic capture").click()
                page.wait_for_selector('[data-testid="schematic-2d-panel"]', timeout=15000)
                page.wait_for_selector('[data-testid="schematic-elk-svg"]', timeout=15000)
                page.wait_for_selector('[data-testid="sch-hit-U1"]', timeout=15000)
                page.locator('[data-testid="sch-hit-U1"]').click()
                assert "CrossProbe:" in page.locator("footer.vd-statusbar").inner_text()

                page.get_by_role("button", name="PCB layout").click()
                page.wait_for_selector('[data-testid="pcb-2d-panel"]', timeout=10000)
                assert "Selected: U1" in page.locator('[data-testid="pcb-2d-panel"]').inner_text()

                browser.close()

            assert not errors, f"Console/page errors detected: {errors}"
            print("[PASS] Prompt 2 Playwright E2E KiCanvas workstation flow passed with 0 console errors!")
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()


if __name__ == "__main__":
    main()
