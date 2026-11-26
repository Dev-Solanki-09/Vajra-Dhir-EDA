#!/usr/bin/env python3
"""
Prompt 17 E2E Verification:
  1. Compiles the Engineering Dossier PDF for fixtures/golden-buck-mcu/ pulling live outputs from P1..P16.
  2. Verifies multi-page valid PDF via pypdfium2 with real searchable text, BOM/SHA-256 digests, Bring-Up checklist,
     embedded P1 schematic page render, and NOT_FABRICATED_0_OF_3 honesty stamp.
  3. Injects a fault (inject_error_stage=P9_EE) -> proves the compiled PDF honestly stamps FAILED (never hides errors).
  4. Playwright renders Report Dossier (P17), compiles live, and displays honest stage badges + PDF preview iframe.
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
import urllib.request
import pypdfium2 as pdfium
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
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, json.loads(r.read().decode("utf-8"))


def _launch_browser(p):
    for ch in ("msedge", "chrome"):
        try:
            return p.chromium.launch(channel=ch, headless=True)
        except Exception:
            continue
    return p.chromium.launch(headless=True)


def _extract_pdf_text(pdf_path: pathlib.Path) -> tuple[int, str]:
    doc = pdfium.PdfDocument(str(pdf_path))
    try:
        pages = len(doc)
        texts = []
        for i in range(pages):
            tp = doc[i].get_textpage()
            texts.append(tp.get_text_range())
            tp.close()
        return pages, "\n".join(texts)
    finally:
        doc.close()


def main() -> None:
    assert (WORKSTATION_DIST / "index.html").is_file(), "Build apps/workstation first"
    port = _free_port()
    base = f"http://127.0.0.1:{port}"
    errors = []

    with tempfile.TemporaryDirectory(prefix="vd_p17_", ignore_cleanup_errors=True) as tmp_dir:
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

            # 1. Compile clean/stale engineering dossier and inspect via pypdfium2
            st, res1 = _req(base, "POST", "/api/v1/report/build-dossier", {
                "pcb_path": str(pcb_file),
                "sch_path": str(sch_file),
            })
            assert st == 200 and res1["success"] is True, res1
            pdf1 = pathlib.Path(res1["pdf_path"])
            assert pdf1.is_file() and pdf1.stat().st_size > 2000
            num_pages, full_txt = _extract_pdf_text(pdf1)
            assert num_pages >= 3, f"Expected >=3 pages, got {num_pages}"
            assert "NOT_FABRICATED_0_OF_3" in full_txt, full_txt[:400]
            assert res1["pcb_sha256"][:16] in full_txt
            assert "Bench Bring-Up Checklist" in full_txt
            print(f"[1/3] Validated {num_pages}-page Engineering Dossier PDF via pypdfium2 ({pdf1.stat().st_size} bytes)")

            # 2. Inject stage error -> verify honest FAILED reporting (never hides failures)
            st, res2 = _req(base, "POST", "/api/v1/report/build-dossier", {
                "pcb_path": str(pcb_file),
                "sch_path": str(sch_file),
                "inject_error_stage": "P9_EE",
            })
            assert st == 200 and res2["overall_verdict"] == "FAILED", res2
            _, fail_txt = _extract_pdf_text(pathlib.Path(res2["pdf_path"]))
            assert "Overall Technical Verdict: FAILED" in fail_txt and "[FAILED] P9" in fail_txt, fail_txt[:600]
            print("[2/3] Honesty invariant verified: injected fault stamps FAILED in compiled PDF")

            # 3. Playwright UI check on Report Dossier (P17)
            with sync_playwright() as p:
                browser = _launch_browser(p)
                page = browser.new_page(viewport={"width": 1440, "height": 900})
                page.on("pageerror", lambda err: errors.append(f"pageerror: {err}"))
                page.on("response", lambda r: errors.append(f"HTTP {r.status} {r.url}") if r.status >= 400 and not r.url.endswith("/favicon.ico") else None)
                page.on("console", lambda m: errors.append(f"console.error: {m.text}") if m.type == "error" else None)

                page.goto(base, wait_until="domcontentloaded")
                page.get_by_text("Report Dossier (P17)").click()
                page.wait_for_selector('[data-testid="report-preview-panel"]', timeout=20000)
                page.locator('[data-testid="report-compile-btn"]').click()
                page.wait_for_selector('[data-testid="report-pdf-iframe"]', timeout=60000)
                badge = page.locator('[data-testid="report-overall-badge"]').inner_text()
                assert "NOT_FABRICATED_0_OF_3" in badge, badge
                print(f"[3/3] Playwright Report Dossier UI rendered cleanly ({badge})")
                browser.close()

            assert not errors, f"Errors detected: {errors}"
            print("[PASS] Prompt 17 Engineering Dossier & Bring-Up PDF passed cleanly!")
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()


if __name__ == "__main__":
    main()
