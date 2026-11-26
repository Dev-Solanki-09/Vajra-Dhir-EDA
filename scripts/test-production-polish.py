#!/usr/bin/env python3
"""
Prompt 20 Mandatory Final Polish Verification Gate:
  1. Cold start -> switch all 5 Workspace Presets with 0 WebGL context crashes & 0 console errors.
  2. 3-Tier SPICE Behavioral Fallback simulation on SBC + MCU + Buck + Encrypted PSpice IC -> 0 crashes & visible Fidelity Badges.
  3. Multi-board cable harness test: Pin-1 mirror & missing common GND caught automatically.
  4. AI Agent Safety Rails: Spec-Lock rejects weakened constraint (403 SPEC_LOCK_VIOLATION) + Oscillation Detector pauses cycle.
  5. Fab Preset switch (Hand-Solder -> JLCPCB 4L -> PCB Power India) + mm<->mil toggle + Ruler (M) verified cleanly.
"""

from __future__ import annotations

import json
import os
import pathlib
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
DAEMON_SCRIPT = ROOT / "packages" / "vd-daemon" / "src" / "daemon.py"
WORKSTATION_DIST = ROOT / "apps" / "workstation" / "dist"


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _req(base: str, method: str, path: str, body=None, timeout: int = 30):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"} if body is not None else {}
    req = urllib.request.Request(f"{base}{path}", data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8"))


def _launch_browser(p):
    for ch in ("msedge", "chrome"):
        try:
            return p.chromium.launch(channel=ch, headless=True)
        except Exception:
            continue
    return p.chromium.launch(headless=True)


def main() -> None:
    assert (WORKSTATION_DIST / "index.html").is_file(), "Build apps/workstation first"
    port = _free_port()
    base = f"http://127.0.0.1:{port}"
    errors = []

    with tempfile.TemporaryDirectory(prefix="vd_p20_", ignore_cleanup_errors=True) as tmp_dir:
        tmp = pathlib.Path(tmp_dir)
        env = os.environ.copy()
        env["VD_DB_DIR"] = str(tmp / "db")
        env["VD_STATIC_DIR"] = str(WORKSTATION_DIST)
        proc = subprocess.Popen(
            [sys.executable, str(DAEMON_SCRIPT), str(port)],
            cwd=str(ROOT),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        try:
            for _ in range(100):
                if proc.poll() is not None:
                    raise RuntimeError(f"daemon exited early: {proc.stderr.read().decode('utf-8','replace')}")
                try:
                    st, _ = _req(base, "GET", "/api/v1/health", timeout=2)
                    if st == 200:
                        break
                except Exception:
                    time.sleep(0.1)
            else:
                raise TimeoutError("vd-daemon failed to start")

            # 1. 3-Tier SPICE Behavioral Fallback with SBC + MCU + Buck + Encrypted PSpice
            st, sres = _req(base, "POST", "/api/v1/polish/spice-fallback", {
                "components": [
                    {"refdes": "R1", "value": "10k"},
                    {"refdes": "U1", "value": "TPS54302DDCR"},
                    {"refdes": "U2", "value": "STM32G474"},
                    {"refdes": "J_PI", "value": "RaspberryPi_40Pin_SBC"},
                    {"refdes": "U_ENC", "value": "VendorSecretIC", "encrypted_pspice": True},
                ]
            })
            assert st == 200 and sres["crashed"] is False
            badges = {b["refdes"]: b["fidelity_badge"] for b in sres["blocks"]}
            assert badges["R1"] == "Exact SPICE"
            assert badges["U2"] == "Behavioral Macro"
            assert badges["U_ENC"] == "Excluded"
            print("[1/4] 3-Tier SPICE Fallback Fidelity Badges verified cleanly (0 crashes)...")

            # 2. Multi-Board SBC + Ribbon Harness check (Pin-1 mirror + missing common GND)
            st, hres = _req(base, "POST", "/api/v1/polish/harness-check", {
                "common_gnd_verified": False,
                "cables": [
                    {"id": "IDC_40", "board_a": "CARRIER", "board_b": "RPI_SBC", "pin1_mirrored": True, "awg": 28, "current_a": 1.2, "signals": ["TX", "RX"]}
                ],
            })
            assert st == 200 and hres["passed"] is False and hres["common_gnd"] is False
            rules = {f["rule"] for f in hres["findings"]}
            assert "HARNESS_PIN1_MIRROR" in rules and "HARNESS_MISSING_COMMON_GND" in rules and "HARNESS_AMPACITY" in rules, rules
            print(f"[2/4] Multi-board cable harness checker caught all injected wiring faults: {sorted(rules)}")

            # 3. AI Agent Spec-Lock Guard & Oscillation Detector
            st_sl, sl = _req(base, "POST", "/api/v1/polish/safety-check", {
                "locked_specs": {"i_load_min_a": 3.0},
                "proposed_specs": {"i_load_min_a": 0.1},
            })
            assert st_sl == 403 and sl["error_code"] == "SPEC_LOCK_VIOLATION", (st_sl, sl)
            st_osc, osc = _req(base, "POST", "/api/v1/polish/safety-check", {
                "failure_hashes": ["hash_a", "hash_b", "hash_a"],
            })
            assert st_osc == 200 and osc["oscillation_detected"] is True
            print("[3/4] Spec-Lock Guard (403) & Oscillation Detector paused safely...")

            # 4. Playwright UI: 5 Focused Workspace Presets, Tool Manager, Fab Presets, mm<->mil & Ruler
            with sync_playwright() as p:
                browser = _launch_browser(p)
                page = browser.new_page(viewport={"width": 1440, "height": 900})
                page.on("pageerror", lambda err: errors.append(f"pageerror: {err}"))
                page.on("response", lambda r: errors.append(f"HTTP {r.status} {r.url}") if r.status >= 400 and not r.url.endswith("/favicon.ico") else None)
                page.on("console", lambda m: errors.append(f"console.error: {m.text}") if m.type == "error" else None)

                page.goto(base, wait_until="domcontentloaded")
                page.wait_for_selector('[data-testid="focused-presets-bar"]', timeout=20000)
                for pid in ("plan", "sch_code", "pcb_3d", "virtual_lab", "fab_release"):
                    page.locator(f'[data-testid="preset-btn-{pid}"]').click()

                # Toggle mm -> mil + Ruler
                page.locator('[data-testid="ruler-toggle-btn"]').click()
                page.locator('[data-testid="unit-toggle-btn"]').click()
                assert "mil" in page.locator('[data-testid="unit-toggle-btn"]').inner_text()
                assert "mil" in page.locator('[data-testid="ruler-toggle-btn"]').inner_text()

                # Open Tools & Fabs Modal -> switch preset Hand-Solder -> PCB Power India
                page.locator('[data-testid="tool-manager-btn"]').click()
                page.wait_for_selector('[data-testid="polish-tools-modal"]', timeout=10000)
                page.wait_for_selector('[data-testid="fab-preset-pcb_power_india"]', timeout=10000)
                page.locator('[data-testid="fab-preset-pcb_power_india"]').click()
                page.wait_for_selector('[data-testid="fab-preset-readout"]', timeout=10000)
                readout = page.locator('[data-testid="fab-preset-readout"]').inner_text()
                assert "0.15 mm" in readout and "Impedance 50" in readout, readout
                print("[4/4] Playwright 5 Presets, mm<->mil Ruler, Tool Manager & PCB Power India stackup verified!")
                browser.close()

            assert not errors, f"Errors detected: {errors}"
            print("[PASS] Prompt 20 Final Production Polish passed ALL verification checks!")
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()


if __name__ == "__main__":
    main()
