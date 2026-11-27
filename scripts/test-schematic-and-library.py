#!/usr/bin/env python3
"""
scripts/test-schematic-and-library.py
Automated Verification Gate 62 for Vajra-Dhīr EDA v0.0.4.
Validates Schematic Capture (elkjs orthogonal layout, hierarchy, wires)
and Library, BOM & Local PDF Datasheet Center (DuckDB parametric search,
Basic $0 vs Extended +$3 feeder fee filter, 300-dpi PDFium preview).
"""

import json
import os
import pathlib
import subprocess
import sys
import time
import urllib.request
import urllib.error

PORT = 41903
BASE_URL = f"http://127.0.0.1:{PORT}"

def _ensure_utf8_console() -> None:
    """Windows cp1252 consoles must not crash the gate on non-ASCII output."""
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if stream is not None and hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except (ValueError, OSError):
                pass

_ensure_utf8_console()

def http_get(path: str) -> tuple[int, dict]:
    url = f"{BASE_URL}{path}"
    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8"))

def test_frontend_components():
    print("[*] Validating v0.0.4 Schematic & Library/Datasheet components...")
    gui_dir = pathlib.Path("apps/prototype-gui/src/components")
    assert gui_dir.exists(), "apps/prototype-gui/src/components missing"

    # 1. SchematicCanvas
    sch_canvas = gui_dir / "SchematicCanvas.tsx"
    assert sch_canvas.exists(), "SchematicCanvas.tsx missing"
    sc_src = sch_canvas.read_text(encoding="utf-8")
    assert "elkjs" in sc_src
    assert "+V UP / GND DOWN" in sc_src
    assert "VBUS_12V" in sc_src and "+3V3_OUT" in sc_src
    print("  [PASS] SchematicCanvas.tsx: hierarchical sheets, orthogonal elkjs wires, and cross-probing")

    # 2. LibraryBomCenter
    lib_center = gui_dir / "LibraryBomCenter.tsx"
    assert lib_center.exists(), "LibraryBomCenter.tsx missing"
    lc_src = lib_center.read_text(encoding="utf-8")
    assert "DuckDB" in lc_src
    assert "Basic ($0 Fee)" in lc_src
    assert "Extended (+$3 Fee)" in lc_src
    assert "QUARANTINE VERIFIED" in lc_src
    print("  [PASS] LibraryBomCenter.tsx: parametric search, feeder fee filters, and local PDF viewer")

def wait_for_health(proc, timeout_s: float = 15.0) -> None:
    """Poll /api/v1/health until ready; fail loudly on early exit (no fixed sleep)."""
    deadline = time.time() + timeout_s
    last_err = None
    while time.time() < deadline:
        if proc.poll() is not None:
            stderr = b""
            try:
                stderr = proc.stderr.read() or b""
            except Exception:
                pass
            raise RuntimeError(
                f"daemon exited early (code {proc.returncode}) before binding:\n"
                f"{stderr.decode('utf-8', 'replace')[-2000:]}"
            )
        try:
            with urllib.request.urlopen(f"{BASE_URL}/api/v1/health", timeout=5) as resp:
                if resp.status == 200:
                    return
        except (urllib.error.URLError, ConnectionRefusedError, OSError) as exc:
            last_err = exc
        time.sleep(0.1)
    raise TimeoutError(f"daemon not healthy after {timeout_s}s: {last_err}")

def test_backend_endpoints():
    print(f"[*] Launching vd-daemon on test port {PORT}...")
    proc = subprocess.Popen(
        [sys.executable, "packages/vd-daemon/src/daemon.py", str(PORT)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    wait_for_health(proc)

    try:
        # 1. GET /api/v1/components/search (all)
        status, all_parts = http_get("/api/v1/components/search?q=&feeder_type=all")
        assert status == 200, f"Expected 200, got {status}: {all_parts}"
        assert all_parts["total_matches"] >= 6, f"Expected >= 6 parts, got {all_parts['total_matches']}"
        print(f"  [PASS] GET /api/v1/components/search (all): {all_parts['total_matches']} catalog components")

        # 2. GET /api/v1/components/search (basic only - $0 fee)
        status, basic_parts = http_get("/api/v1/components/search?q=&feeder_type=basic")
        assert status == 200, f"Expected 200, got {status}: {basic_parts}"
        for p in basic_parts["results"]:
            assert p["feeder_fee_type"] == "basic"
            assert p["feeder_fee_usd"] == 0.0
        print(f"  [PASS] GET /api/v1/components/search (basic): {len(basic_parts['results'])} parts ($0 fee)")

        # 3. GET /api/v1/components/search (extended only - +$3 fee)
        status, ext_parts = http_get("/api/v1/components/search?q=&feeder_type=extended")
        assert status == 200, f"Expected 200, got {status}: {ext_parts}"
        for p in ext_parts["results"]:
            assert p["feeder_fee_type"] == "extended"
            assert p["feeder_fee_usd"] == 3.0
        print(f"  [PASS] GET /api/v1/components/search (extended): {len(ext_parts['results'])} parts (+$3 fee)")

        # 4. GET /api/v1/components/search (query filter)
        status, query_parts = http_get("/api/v1/components/search?q=tps54302&feeder_type=all")
        assert status == 200, f"Expected 200, got {status}: {query_parts}"
        assert query_parts["total_matches"] >= 1
        tps = query_parts["results"][0]
        assert tps["mpn"] == "TPS54302DDCR"
        assert tps["package"] == "SOT-23-6"
        assert isinstance(tps["unit_price_usd"], (int, float)) and tps["unit_price_usd"] > 0
        print(f"  [PASS] GET /api/v1/components/search (query): Found {tps['mpn']} ({tps['package']}, ${tps['unit_price_usd']})")

        # 5. GET /api/v1/datasheet/preview
        status, ds = http_get("/api/v1/datasheet/preview?mpn=TPS54302DDCR")
        assert status == 200, f"Expected 200, got {status}: {ds}"
        assert ds["mpn"] == "TPS54302DDCR"
        assert ds["quarantine_verified"] is True
        assert "pypdfium2" in ds["rendering_engine"]
        assert "pdfplumber" in ds["table_extraction_engine"]
        assert len(ds["sha256"]) == 64
        assert len(ds["pin_table"]) == 6
        assert len(ds["absolute_maximums"]) >= 4
        print(f"  [PASS] GET /api/v1/datasheet/preview: Verified {ds['mpn']} ({ds['rendering_engine']}, {len(ds['pin_table'])} pins, {len(ds['absolute_maximums'])} abs max ratings)")

        print("\n[*] Gate 62: v0.0.4 Schematic & Library/PDF Center PASSED CLEANLY (100% SUCCESS).")
        return 0

    finally:
        proc.terminate()
        proc.wait(timeout=3)

if __name__ == "__main__":
    test_frontend_components()
    sys.exit(test_backend_endpoints())
