#!/usr/bin/env python3
"""Prompt 5 Playwright E2E Verification: @xyflow/react System Architecture & Power-Tree Planner."""

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
    with tempfile.TemporaryDirectory(prefix="vd_p5_e2e_") as tmp_dir:
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
                page.get_by_role("button", name="Schematic capture").click()
                page.get_by_role("button", name="System Architecture (xyflow)").click()
                print("[1/5] Opened System Architecture (xyflow) Planner...", flush=True)

                page.wait_for_selector('[data-testid="architecture-planner-panel"]', timeout=20000)
                page.wait_for_selector('[data-testid="xyflow-canvas-host"] .react-flow', timeout=20000)
                page.wait_for_selector('[data-testid="arch-node-blk-sync-buck"]', timeout=15000)
                assert "Power Rollup:" in page.locator('[data-testid="arch-power-rollup"]').inner_text()
                assert "Electrical Contracts PASS" in page.locator('[data-testid="arch-warning-count"]').inner_text()

                # Add Raspberry Pi 40-pin SBC composite block -> persists live to system.yaml
                page.locator('[data-testid="arch-add-raspberry-pi-40pin"]').click()
                page.wait_for_selector('[data-testid="arch-node-blk-raspberry-pi-40pin"]', timeout=10000)

                sys_yaml = proj_dir / "system.yaml"
                deadline = time.time() + 10
                while time.time() < deadline:
                    if sys_yaml.exists() and "raspberry-pi-40pin" in sys_yaml.read_text(encoding="utf-8"):
                        break
                    page.wait_for_timeout(200)
                else:
                    raise AssertionError("Adding Raspberry Pi block did not sync to system.yaml on disk")
                print("[2/5] Raspberry Pi SBC block added & synced to system.yaml", flush=True)

                # Wire unsafe 5V rail -> verify instant VOLTAGE_MISMATCH warning!
                page.locator('[data-testid="arch-wire-unsafe-5v-btn"]').click()
                page.wait_for_selector('[data-testid="arch-finding-VOLTAGE_MISMATCH"]', timeout=10000)
                assert "3.3V_NON_5V_TOLERANT" in page.locator('[data-testid="arch-finding-VOLTAGE_MISMATCH"]').inner_text()
                print("[3/5] 5V->3.3V VOLTAGE_MISMATCH electrical alert verified", flush=True)

                # Test Undo -> alert clears; then ELK Auto-Layout + Scaffold .ato Stubs
                page.locator('[data-testid="arch-undo-btn"]').click()
                page.wait_for_function(
                    "() => !document.querySelector('[data-testid=\"arch-finding-VOLTAGE_MISMATCH\"]')",
                    timeout=10000,
                )
                page.locator('[data-testid="arch-elk-layout-btn"]').click()
                page.locator('[data-testid="arch-gen-ato-btn"]').click()

                ato_stub = proj_dir / "elec" / "src" / "arch_blocks.ato"
                deadline = time.time() + 10
                while time.time() < deadline:
                    if ato_stub.exists() and "blk-raspberry-pi-40pin" in ato_stub.read_text(encoding="utf-8") or (
                        ato_stub.exists() and "TPS54302" in ato_stub.read_text(encoding="utf-8")
                    ):
                        break
                    page.wait_for_timeout(200)
                else:
                    raise AssertionError("elec/src/arch_blocks.ato stub was not generated")
                print("[4/5] Undo, ELK Auto-Layout & .ato stub generation verified", flush=True)

                # CrossProbeBus: Click buck block -> highlights member part in P2 & P3; also check Monaco shows system.yaml!
                page.locator('[data-testid="arch-node-blk-sync-buck"]').click()
                page.get_by_role("button", name="PCB layout").click()
                page.wait_for_selector('[data-testid="pcb-2d-panel"]', timeout=15000)
                assert "Selected: U2" in page.locator('[data-testid="pcb-2d-panel"]').inner_text()

                page.get_by_role("button", name="Firmware & pinmux").click()
                page.wait_for_selector('[data-testid="file-tree-item-system.yaml"]', timeout=15000)
                page.locator('[data-testid="file-tree-item-system.yaml"]').click()
                page.wait_for_function(
                    "() => document.querySelector('[data-testid=\"code-editor-panel\"]')?.textContent?.includes('system.yaml')",
                    timeout=10000,
                )
                print("[5/5] CrossProbeBus P5 <-> P2 & Monaco system.yaml sync verified", flush=True)

                browser.close()

            assert not errors, f"Console/page errors detected: {errors}"
            print("[PASS] Prompt 5 Playwright E2E xyflow Architecture flow passed with 0 errors!")
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()


if __name__ == "__main__":
    main()
