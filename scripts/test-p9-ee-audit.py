#!/usr/bin/env python3
"""Prompt 9 Playwright E2E Verification: Senior EE Brain (Z3 + SymPy + Pint + python-control Bode + 8/8 Repair)."""

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


EXPECTED_8_CASES = [
    "case_1_5v_into_3v3_sbc_gpio",
    "case_2_missing_i2c_pullup",
    "case_3_duplicate_i2c_address",
    "case_4_overheated_ldo",
    "case_5_underrated_0603_resistor",
    "case_6_saturated_buck_inductor",
    "case_7_unstable_smps_loop",
    "case_8_bootstrap_pin_trap",
]


def main() -> None:
    port = _free_port()
    with tempfile.TemporaryDirectory(prefix="vd_p9_e2e_", ignore_cleanup_errors=True) as tmp_dir:
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
                page.get_by_role("button", name="Simulation & physics lab").click()
                print("[1/5] Opened Simulation & physics lab...", flush=True)

                try:
                    page.wait_for_selector('[data-testid="ee-audit-panel"]', timeout=20000)
                except Exception:
                    print("DEBUG errors:", errors, flush=True)
                    print("DEBUG sim_lab text:", page.locator('[data-testid="workstation-viewport"]').inner_text()[:800], flush=True)
                    raise
                page.wait_for_selector('[data-testid="ee-audit-panel"] .uplot canvas', timeout=15000)
                print("[2/5] EeAuditPanel + python-control Bode uPlot charts rendered", flush=True)

                page.locator('[data-testid="ee-audit-run-benchmark8"]').click()
                page.wait_for_selector('[data-testid="ee-benchmark8-view"]', timeout=15000)
                summary_txt = page.locator('[data-testid="ee-benchmark8-summary"]').inner_text()
                assert "8 / 8 caught" in summary_txt, f"Unexpected benchmark summary: {summary_txt}"
                for cid in EXPECTED_8_CASES:
                    page.wait_for_selector(f'[data-testid="ee-case-{cid}"]', timeout=5000)
                print("[3/5] 8-Circuit Regression Suite caught all 8 broken designs", flush=True)

                # Violet Ghost preview + CrossProbe check
                page.locator('[data-testid="ee-preview-fix-case_6_saturated_buck_inductor"]').click()
                page.wait_for_selector('[data-testid="ee-ghost-preview-case_6_saturated_buck_inductor"]', timeout=5000)
                page.locator('[data-testid="ee-apply-fix-case_6_saturated_buck_inductor"]').click()
                page.wait_for_function(
                    "() => document.querySelector('[data-testid=\"ee-case-status-case_6_saturated_buck_inductor\"]')?.textContent?.includes('GREEN')",
                    timeout=10000,
                )
                print("[4/5] Preview Fix (Violet Ghost) + Apply Fix on L1 turned GREEN", flush=True)

                # Apply all remaining fixes -> 8/8 GREEN
                page.locator('[data-testid="ee-apply-all-benchmark8"]').click()
                page.wait_for_function(
                    "() => document.querySelector('[data-testid=\"ee-benchmark8-repaired-count\"]')?.textContent?.includes('8 / 8 GREEN')",
                    timeout=20000,
                )
                print("[5/5] All 8/8 benchmark circuits repaired to GREEN cleanly", flush=True)

                browser.close()

            assert not errors, f"Console/page errors detected: {errors}"
            print("[PASS] Prompt 9 Playwright E2E Senior EE Verification passed with 0 errors!")
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()


if __name__ == "__main__":
    main()
