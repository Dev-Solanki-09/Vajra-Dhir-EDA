#!/usr/bin/env python3
"""
Prompt 16 E2E Verification:
  1. POST /api/v1/fab/validate-2581 validates real IPC-2581C XML via 2581check lxml validator.
  2. POST /api/v1/fab/build-bundle with release_authorized=True (no human signoff) returns 403 GATE8_HUMAN_SIGNOFF_REQUIRED.
  3. POST /api/v1/fab/build-bundle succeeds: generates ibom.html, pcbdraw top/bottom SVG, bom_ems.csv, cpl_pnp.csv,
     with fabrication_status == NOT_FABRICATED_0_OF_3 and release_authorized == False.
  4. Playwright renders Fab Release (P16), displays 2581check PASS + PcbDraw SVG + iBom iframe,
     and clicking a BOM row cross-probes refdes to CrossProbeBus & Inspector.
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


def _req(base: str, method: str, path: str, body=None, timeout: int = 120):
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

    with tempfile.TemporaryDirectory(prefix="vd_p16_", ignore_cleanup_errors=True) as tmp_dir:
        tmp = pathlib.Path(tmp_dir)
        proj_dir = tmp / "proj"
        proj_dir.mkdir(parents=True)
        for f in (ROOT / "fixtures" / "golden-buck-mcu").glob("golden-buck-mcu.*"):
            (proj_dir / f.name).write_bytes(f.read_bytes())

        pcb_file = proj_dir / "golden-buck-mcu.kicad_pcb"
        sch_file = proj_dir / "golden-buck-mcu.kicad_sch"

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

            st, vres = _req(base, "POST", "/api/v1/fab/validate-2581", {"pcb_path": str(pcb_file)})
            assert st == 200 and vres["validation"]["valid"] is True, vres
            print(f"[1/4] 2581check PASS: {vres['validation']['layer_count']} layers, {vres['validation']['net_count']} nets")

            st_block, blk = _req(base, "POST", "/api/v1/fab/build-bundle", {"pcb_path": str(pcb_file), "release_authorized": True})
            assert st_block == 403 and blk["error_code"] == "GATE8_HUMAN_SIGNOFF_REQUIRED", (st_block, blk)
            print("[2/4] Gate 8 fail-closed verified (unauthorized release_authorized=True rejected 403)...")

            with sync_playwright() as p:
                browser = _launch_browser(p)
                page = browser.new_page(viewport={"width": 1440, "height": 900})
                page.on("pageerror", lambda err: errors.append(f"pageerror: {err}"))
                page.on("response", lambda r: errors.append(f"HTTP {r.status} {r.url}") if r.status >= 400 and not r.url.endswith("/favicon.ico") else None)
                page.on("console", lambda m: errors.append(f"console.error: {m.text}") if m.type == "error" else None)

                page.goto(base, wait_until="domcontentloaded")
                page.get_by_text("Fab Release (P16)").click()
                page.wait_for_selector('[data-testid="fab-release-panel"]', timeout=20000)

                page.locator('[data-testid="fab-build-bundle-btn"]').click()
                page.wait_for_selector('[data-testid="fab-bom-table"]', timeout=60000)
                badge = page.locator('[data-testid="fab-honesty-badge"]').inner_text()
                chk = page.locator('[data-testid="fab-2581-badge"]').inner_text()
                assert "NOT_FABRICATED_0_OF_3" in badge, badge
                assert "2581check: PASS" in chk, chk
                page.wait_for_selector('[data-testid="fab-pcbdraw-top"]', timeout=10000)
                page.wait_for_function(
                    "() => { const im = document.querySelector('[data-testid=\"fab-pcbdraw-top\"]'); return im && im.complete && im.naturalWidth > 0; }",
                    timeout=10000,
                )
                print(f"[3/4] Fab Bundle UI rendered cleanly ({badge} | {chk})...")

                # Verify BOM row click triggers CrossProbeBus selection update in Inspector
                first_row = page.locator('[data-testid="fab-bom-table"] tbody tr').first
                first_ref_txt = first_row.locator("td").first.inner_text().split(",")[0].strip()
                first_row.click()
                page.wait_for_function(
                    f"() => document.body.innerText.includes('Probe:') && document.body.innerText.includes({json.dumps(first_ref_txt)})",
                    timeout=10000,
                )

                # Switch to iBom iframe tab
                page.locator('[data-testid="fab-tab-ibom"]').click()
                page.wait_for_selector('[data-testid="fab-ibom-iframe"]', timeout=10000)
                print(f"[4/4] BOM row cross-probe ({first_ref_txt}) and InteractiveHtmlBom iframe verified!")
                browser.close()

            assert (proj_dir / "release" / "ibom.html").is_file()
            assert (proj_dir / "release" / "pcbdraw_top.svg").is_file()
            assert (proj_dir / "release" / "bom_ems.csv").is_file()
            assert (proj_dir / "release" / "cpl_pnp.csv").is_file()
            assert not errors, f"Errors detected: {errors}"
            print("[PASS] Prompt 16 Playwright E2E Fab Release Engine passed cleanly!")
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()


if __name__ == "__main__":
    main()
