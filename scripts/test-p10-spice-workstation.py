#!/usr/bin/env python3
"""Prompt 10 Playwright E2E Verification: ngspice-wasm Worker + native ngspice.dll + Ring 2 spicelib + uPlot + P2/P9 bridge."""

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
    with tempfile.TemporaryDirectory(prefix="vd_p10_e2e_", ignore_cleanup_errors=True) as tmp_dir:
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
                print("[1/5] Opening P2 PCB layout to verify Virtual Probe net click -> P10 uPlot...", flush=True)
                page.wait_for_selector('[data-testid="pcb-probe-net-sw_node"]', timeout=20000)
                page.locator('[data-testid="pcb-probe-net-sw_node"]').click()

                page.get_by_role("button", name="Simulation & physics lab").click()
                page.wait_for_selector('[data-testid="simulation-lab-panel"]', timeout=25000)
                page.wait_for_selector('[data-testid="sim-uplot-scope"] .uplot canvas', timeout=20000)
                assert (proj_dir / "sim" / "board.cir").is_file(), "sim/board.cir must be synthesized from HW-IR"
                scope_text = page.locator('[data-testid="sim-uplot-scope"]').inner_text()
                assert "sw_node" in scope_text.lower(), f"Expected P2 Virtual Probe v(sw_node) plotted in uPlot, got: {scope_text}"
                print("[2/5] P2 Virtual Probe net click -> P10 uPlot SW_NODE waveform + sim/board.cir verified", flush=True)

                # Switch back to vout_3v3, run browser ngspice-wasm Web Worker
                page.locator('[data-testid="sim-probe-btn-vout_3v3"]').click()
                page.locator('[data-testid="sim-engine-select"]').select_option("wasm")
                page.locator('[data-testid="sim-run-btn"]').click()
                page.wait_for_function(
                    "() => document.querySelector('[data-testid=\"sim-uplot-scope\"]')?.innerText?.includes('[WASM]')",
                    timeout=35000,
                )
                print("[3/5] Browser ngspice-wasm Web Worker solved live transient into uPlot", flush=True)

                # Inject under-sized 0.47uF capacitor -> P10 + P9 ripple & derating violation
                page.locator('[data-testid="sim-engine-select"]').select_option("native")
                page.locator('[data-testid="sim-inject-undersized-cap"]').click()
                page.wait_for_selector('[data-testid="sim-p9-finding-SPICE_EXCESSIVE_RAIL_RIPPLE"]', timeout=20000)
                page.wait_for_selector('[data-testid="sim-p9-finding-MLCC_DC_BIAS_DERATING"]', timeout=10000)
                print("[4/5] Under-sized 0.47uF capacitor triggered both P10 ripple violation & P9 MLCC derating alert", flush=True)

                # Run Fault Injection & Ring 2 Monte-Carlo sweep
                page.locator('[data-testid="sim-mode-montecarlo"]').click()
                page.wait_for_selector('[data-testid="sim-montecarlo-card"]', timeout=30000)
                assert "ring2-subprocess-gpl3-quarantine" in page.locator('[data-testid="sim-montecarlo-card"]').inner_text()

                page.locator('[data-testid="sim-mode-fault"]').click()
                page.locator('[data-testid="sim-fault-select"]').select_option("short_circuit")
                page.wait_for_function(
                    "() => document.querySelector('[data-testid=\"sim-status-banner\"]')?.innerText?.includes('FAULT')",
                    timeout=20000,
                )
                print("[5/5] Ring 2 spicelib Monte-Carlo + Fault Injection verified cleanly", flush=True)

                browser.close()

            assert not errors, f"Console/page errors detected: {errors}"
            print("[PASS] Prompt 10 Playwright E2E SPICE Virtual Lab flow passed with 0 errors!")
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()


if __name__ == "__main__":
    main()
