#!/usr/bin/env python3
"""Prompt 6 Playwright E2E Verification: 6-way P1..P6 integration (atopile <-> Monaco <-> KiCad <-> P2 <-> P3 <-> xyflow)."""

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
    with tempfile.TemporaryDirectory(prefix="vd_p6_e2e_", ignore_cleanup_errors=True) as tmp_dir:
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
                # 1. Start in xyflow Architecture (P5) -> Generate & compile .ato into workspace
                page.get_by_role("button", name="Schematic capture").click()
                page.get_by_role("button", name="System Architecture (xyflow)").click()
                page.wait_for_selector('[data-testid="arch-gen-ato-btn"]', timeout=15000)
                page.locator('[data-testid="arch-gen-ato-btn"]').click()

                ato_arch = proj_dir / "elec" / "src" / "arch_blocks.ato"
                deadline = time.time() + 10
                while time.time() < deadline:
                    if ato_arch.exists() and "assert " in ato_arch.read_text(encoding="utf-8"):
                        break
                    page.wait_for_timeout(200)
                else:
                    raise AssertionError("P5 -> P6 .ato generation did not produce assert statements")
                print("[1/4] P5 -> P6 generated compilable .ato with Pint assertions", flush=True)

                # 2. Switch to Monaco IDE (P4) -> verify failing constraint diagnostic renders inline badge
                page.get_by_role("button", name="Firmware & pinmux").click()
                page.wait_for_selector('[data-testid="monaco-ato-build-btn"]', timeout=20000)
                page.wait_for_selector('[data-testid="file-tree-item-elec/src/main.ato"]', timeout=15000)

                bad_ato = (
                    'module Buck3V3:\n'
                    '    component U2 "TPS54302"\n'
                    '    v_in = 12V +/- 5%\n'
                    '    r_top = 100kohm +/- 1%\n'
                    '    r_bottom = 22.1kohm +/- 1%\n'
                    '    assert v_out within 4.9V to 5.1V\n'
                )
                _req(base, "POST", "/api/v1/fs/write", {"path": "elec/src/main.ato", "content": bad_ato})
                page.locator('[data-testid="monaco-ato-build-btn"]').click()
                page.wait_for_function(
                    "() => document.querySelector('[data-testid=\"ato-compile-badge\"]')?.textContent?.includes('FAIL')",
                    timeout=10000,
                )
                print("[2/4] atopile constraint violation rendered in Monaco P4 IDE", flush=True)

                # 3. Fix constraint + add R_ATO + request conflicting move on locked U2 -> PASS while protecting U2!
                good_ato = (
                    'module Buck3V3:\n'
                    '    component U1 "CH224K"\n'
                    '    component U2 "TPS54302"\n'
                    '    component C1 "33uF 25V"\n'
                    '    component R_ATO "10k 1%"\n'
                    '    U2.x_mm = 99.0\n'
                    '    v_in = 12V +/- 5%\n'
                    '    r_top = 100kohm +/- 1%\n'
                    '    r_bottom = 38.0kohm +/- 1%\n'
                    '    assert v_out within 2.9V to 3.7V\n'
                )
                _req(base, "POST", "/api/v1/fs/write", {"path": "elec/src/main.ato", "content": good_ato})
                page.locator('[data-testid="monaco-ato-build-btn"]').click()
                page.wait_for_function(
                    "() => document.querySelector('[data-testid=\"ato-compile-badge\"]')?.textContent?.includes('PASS')",
                    timeout=10000,
                )
                page.wait_for_selector('[data-testid="ato-lock-conflict-badge"]', timeout=10000)
                assert "U2" in page.locator('[data-testid="ato-lock-conflict-badge"]').inner_text()
                print("[3/4] Valid .ato compiled cleanly while preserving locked U2", flush=True)

                # 4. Verify KiCad .kicad_pcb (P1) updated unlocked C1 & added R_ATO -> live in P2 & P3!
                pcb_txt = pcb_file.read_text(encoding="utf-8")
                assert '"33uF 25V"' in pcb_txt and '"R_ATO"' in pcb_txt and "99.0" not in pcb_txt

                page.get_by_role("button", name="PCB layout").click()
                page.wait_for_selector('[data-testid="pcb-hit-R_ATO"]', timeout=15000)
                page.get_by_role("button", name="3D STEP & Gerbers").click()
                page.wait_for_selector('[data-testid="v3d-chip-R_ATO"]', timeout=15000)
                print("[4/4] Live .ato build propagated to P1 (.kicad_pcb), P2 (KiCanvas), and P3 (Three.js 3D)", flush=True)

                browser.close()

            assert not errors, f"Console/page errors detected: {errors}"
            print("[PASS] Prompt 6 6-way Playwright E2E atopile flow passed with 0 errors!")
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()


if __name__ == "__main__":
    main()
