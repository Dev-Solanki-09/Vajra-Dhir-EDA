#!/usr/bin/env python3
"""Prompt 11 Playwright E2E Verification: Renode/SBC Digital Twin, Firmware Gen, Lockstep VCD+uPlot, & 4 Fault Cases."""

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
    with tempfile.TemporaryDirectory(prefix="vd_p11_e2e_", ignore_cleanup_errors=True) as tmp_dir:
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
                page.get_by_role("button", name="Firmware & pinmux").click()
                print("[1/5] Opened Firmware & pinmux workspace...", flush=True)

                page.wait_for_selector('[data-testid="cosim-panel"]', timeout=25000)
                page.wait_for_selector('[data-testid="mit-vcd-viewer"] [data-testid="vcd-cursor-line"]', state="attached", timeout=20000)
                page.wait_for_selector('[data-testid="cosim-uart-console"]', timeout=15000)
                print("[2/5] CosimPanel + synchronized VCD cursor + UART monitor verified", flush=True)

                page.locator('[data-testid="cosim-generate-btn"]').click()
                page.wait_for_function(
                    "() => document.querySelector('[data-testid=\"cosim-status-banner\"]')?.innerText?.includes('Generated')",
                    timeout=15000,
                )
                assert (proj_dir / "firmware" / "include" / "board_pins.h").is_file()
                assert (proj_dir / "sim" / "board.repl").is_file()
                assert (proj_dir / "sim" / "wiring.json").is_file()
                print("[3/5] Generated board_pins.h, board.repl, wiring.json, & ELF fixture", flush=True)

                page.locator('[data-testid="cosim-run-suite4-btn"]').click()
                page.wait_for_selector('[data-testid="cosim-suite4-grid"]', timeout=25000)
                for scen in ("nominal", "missing_i2c_pullup", "swapped_uart", "i2c_addr_mismatch"):
                    page.wait_for_selector(f'[data-testid="cosim-case-{scen}"]', timeout=5000)
                assert "GREEN" in page.locator('[data-testid="cosim-case-status-nominal"]').inner_text()
                assert "CIRCUIT_BUG" in page.locator('[data-testid="cosim-case-status-missing_i2c_pullup"]').inner_text()
                assert "COSIM_UART_TX_RX_SWAPPED" in page.locator('[data-testid="cosim-case-status-swapped_uart"]').inner_text()
                assert "INTEGRATION_MISMATCH" in page.locator('[data-testid="cosim-case-status-i2c_addr_mismatch"]').inner_text()
                print("[4/5] 4-Case Code-on-Circuit Fault Suite caught all injected hardware & mismatch bugs", flush=True)

                # Apply Circuit fix (missing pullup) & Firmware fix (0x76 -> 0x77) -> both GREEN
                page.locator('[data-testid="cosim-fix-circuit-missing_i2c_pullup"]').click()
                page.wait_for_function(
                    "() => document.querySelector('[data-testid=\"cosim-case-status-missing_i2c_pullup\"]')?.innerText?.includes('GREEN')",
                    timeout=15000,
                )
                page.locator('[data-testid="cosim-fix-firmware-i2c_addr_mismatch"]').click()
                page.wait_for_function(
                    "() => document.querySelector('[data-testid=\"cosim-case-status-i2c_addr_mismatch\"]')?.innerText?.includes('GREEN')",
                    timeout=15000,
                )
                print("[5/5] Applied Circuit & Firmware fixes -> verified GREEN cleanly", flush=True)

                browser.close()

            assert not errors, f"Console/page errors detected: {errors}"
            print("[PASS] Prompt 11 Playwright E2E Renode/SBC Digital Twin passed with 0 errors!")
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()


if __name__ == "__main__":
    main()
