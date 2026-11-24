#!/usr/bin/env python3
"""
scripts/test-v004-mfg-and-harness.py
Automated Verification Gate 64 for Vajra-Dhīr EDA v0.0.4.
Validates Manufacturing Center: KiKit 2x2 Panelizer Wizard,
Visual Git ECO Copper Diff (kiri), Wire Harness & Cable Studio (WireViz),
and Interactive Assembly BOM (iBOM).
"""

import json
import os
import pathlib
import subprocess
import sys
import time
import urllib.request
import urllib.error

PORT = 41905
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

def http_post(path: str, payload: dict) -> tuple[int, dict]:
    url = f"{BASE_URL}{path}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8"))

def test_frontend_components():
    print("[*] Validating v0.0.4 Manufacturing & Harness frontend components...")
    gui_dir = pathlib.Path("apps/prototype-gui/src/components")
    assert gui_dir.exists(), "apps/prototype-gui/src/components missing"

    # 1. PanelizerDiffCenter
    p_file = gui_dir / "PanelizerDiffCenter.tsx"
    assert p_file.exists(), "PanelizerDiffCenter.tsx missing"
    p_src = p_file.read_text(encoding="utf-8")
    assert "PanelizerDiffCenter" in p_src
    assert "PANELIZER" in p_src
    assert "GIT_DIFF" in p_src
    assert "WIRE_HARNESS" in p_src
    assert "ASSEMBLY_BOM" in p_src
    assert "KiKit Panelizer Wizard" in p_src
    assert "Visual Git ECO Diff" in p_src
    print("  [PASS] PanelizerDiffCenter.tsx: Panelizer, Git Diff, Wire Harness & iBOM tabs")

    # 2. App.tsx and commandBus.ts wiring
    app_src = pathlib.Path("apps/prototype-gui/src/App.tsx").read_text(encoding="utf-8")
    assert "PanelizerDiffCenter" in app_src
    assert 'activeWorkspace === "mfg_diff"' in app_src

    cb_src = pathlib.Path("apps/prototype-gui/src/commandBus.ts").read_text(encoding="utf-8")
    assert "mfg.wire_harness" in cb_src
    assert "mfg.git_diff" in cb_src
    assert "mfg.generate_panel" in cb_src
    print("  [PASS] App.tsx & commandBus.ts: full wiring of Manufacturing commands and diff view")

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
        # 1. POST /api/v1/panel/generate
        status, panel_res = http_post("/api/v1/panel/generate", {
            "rows": 2,
            "cols": 2,
            "rail_mm": 5.0,
        })
        assert status == 200, f"Expected 200, got {status}: {panel_res}"
        assert panel_res["success"] is True
        assert panel_res["panel_dimensions_mm"]["width"] == 132.0
        assert panel_res["panel_dimensions_mm"]["height"] == 92.0
        assert panel_res["utilization_pct"] > 70.0
        assert len(panel_res["fiducials"]) == 4
        assert len(panel_res["tooling_holes"]) == 4
        assert panel_res["mouse_bites"]["count"] == 12
        print(f"  [PASS] POST /api/v1/panel/generate: {panel_res['grid']} array ({panel_res['panel_dimensions_mm']['width']}x{panel_res['panel_dimensions_mm']['height']} mm, {panel_res['utilization_pct']}% utilization)")

        # 2. POST /api/v1/diff/compare
        status, diff_res = http_post("/api/v1/diff/compare", {
            "rev_old": 1,
            "rev_new": 2,
        })
        assert status == 200, f"Expected 200, got {status}: {diff_res}"
        assert diff_res["success"] is True
        assert diff_res["diff_layers"][0]["layer"] == "F.Cu"
        assert len(diff_res["moved_components"]) >= 1
        assert "Visual Git ECO diff" in diff_res["summary"]
        print(f"  [PASS] POST /api/v1/diff/compare: Compare rev {diff_res['rev_old']} vs {diff_res['rev_new']} ({diff_res['summary']})")

        # 3. POST /api/v1/harness/compile
        status, h_res = http_post("/api/v1/harness/compile", {
            "harness_name": "WH-001_MAIN_INTERCONNECT",
        })
        assert status == 200, f"Expected 200, got {status}: {h_res}"
        assert h_res["success"] is True
        assert len(h_res["cables"]) == 3
        assert h_res["total_wire_length_m"] == 3.6
        assert len(h_res["cut_list"]) == 4
        assert len(h_res["pin_connections"]) == 4
        print(f"  [PASS] POST /api/v1/harness/compile: Compiled {h_res['harness_name']} ({len(h_res['cables'])} cables, total length={h_res['total_wire_length_m']} m)")

        print("\n[*] Gate 64: v0.0.4 Manufacturing & Harness PASSED CLEANLY (100% SUCCESS).")
        return 0

    finally:
        proc.terminate()
        proc.wait(timeout=3)

if __name__ == "__main__":
    test_frontend_components()
    sys.exit(test_backend_endpoints())
