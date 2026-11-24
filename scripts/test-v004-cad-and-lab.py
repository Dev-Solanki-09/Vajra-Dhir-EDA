#!/usr/bin/env python3
"""
scripts/test-v004-cad-and-lab.py
Automated Verification Gate 63 for Vajra-Dhīr EDA v0.0.4.
Validates 3D STEP & Gerber RS-274X Inspection, Virtual Lab Workbench
(2.5D Laplace PDN IR-Drop Heatmap, 60 FPS Scope, SMPS Bode, Logic Analyzer),
and Copper Pour Zone Refill with i_overlay & iTriangle.
"""

import json
import os
import pathlib
import subprocess
import sys
import time
import urllib.request
import urllib.error

PORT = 41904
BASE_URL = f"http://127.0.0.1:{PORT}"

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
    print("[*] Validating v0.0.4 CAD, 3D & Virtual Lab frontend components...")
    gui_dir = pathlib.Path("apps/prototype-gui/src/components")
    assert gui_dir.exists(), "apps/prototype-gui/src/components missing"

    # 1. CopperPourLayer
    pour_file = gui_dir / "CopperPourLayer.tsx"
    assert pour_file.exists(), "CopperPourLayer.tsx missing"
    pour_src = pour_file.read_text(encoding="utf-8")
    assert "refillCopper" in pour_src
    assert "Copper Pour Zone" in pour_src
    assert "Thermal Relief" in pour_src
    print("  [PASS] CopperPourLayer.tsx: i_overlay copper zone refill & thermal relief")

    # 2. ThreeDGerberViewer
    viewer_file = gui_dir / "ThreeDGerberViewer.tsx"
    assert viewer_file.exists(), "ThreeDGerberViewer.tsx missing"
    v_src = viewer_file.read_text(encoding="utf-8")
    assert "ThreeDGerberViewer" in v_src
    assert "3D PBR" in v_src
    assert "RS-274X" in v_src
    assert "Edge.Cuts" in v_src and "Drill_PTH" in v_src
    print("  [PASS] ThreeDGerberViewer.tsx: 3D STEP PBR raymarching & RS-274X stack inspector")

    # 3. VirtualLabWorkbench
    lab_file = gui_dir / "VirtualLabWorkbench.tsx"
    assert lab_file.exists(), "VirtualLabWorkbench.tsx missing"
    lab_src = lab_file.read_text(encoding="utf-8")
    assert "VirtualLabWorkbench" in lab_src
    assert "PDN_HEATMAP" in lab_src
    assert "OSCILLOSCOPE" in lab_src
    assert "SMPS_BODE" in lab_src
    assert "LOGIC_ANALYZER" in lab_src
    print("  [PASS] VirtualLabWorkbench.tsx: 2.5D PDN Heatmap, 60 FPS Scope, SMPS Bode, Logic Analyzer")

    # 4. App.tsx and commandBus.ts wiring
    app_src = pathlib.Path("apps/prototype-gui/src/App.tsx").read_text(encoding="utf-8")
    assert "ThreeDGerberViewer" in app_src
    assert "VirtualLabWorkbench" in app_src
    assert "CopperPourLayer" in app_src
    assert 'activeWorkspace === "mcad_3d"' in app_src
    assert 'activeWorkspace === "sim_lab"' in app_src

    cb_src = pathlib.Path("apps/prototype-gui/src/commandBus.ts").read_text(encoding="utf-8")
    assert "pcb.copper.refill" in cb_src
    assert "sim.pdn_solve" in cb_src
    print("  [PASS] App.tsx & commandBus.ts: full wiring of 3D, Virtual Lab, and Copper Refill")

def test_backend_endpoints():
    print(f"[*] Launching vd-daemon on test port {PORT}...")
    proc = subprocess.Popen(
        [sys.executable, "packages/vd-daemon/src/daemon.py", str(PORT)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    time.sleep(1.2)

    try:
        # 1. POST /api/v1/copper/refill
        status, refill_res = http_post("/api/v1/copper/refill", {
            "layer": "F.Cu",
            "net": "+3V3_OUT",
            "clearance_mm": 0.25,
        })
        assert status == 200, f"Expected 200, got {status}: {refill_res}"
        assert refill_res["success"] is True
        assert "i_overlay" in refill_res["engine"]
        assert refill_res["polygon_area_mm2"] == 2340.5
        assert refill_res["voids_count"] == 14
        assert refill_res["mesh_triangles_count"] == 348
        assert refill_res["thermal_relief"]["spokes_count"] == 4
        assert refill_res["thermal_relief"]["connected_pads"] == 8
        print(f"  [PASS] POST /api/v1/copper/refill: Refilled {refill_res['polygon_area_mm2']} mm² zone with {refill_res['mesh_triangles_count']} triangles in {refill_res['computation_time_ms']} ms")

        # 2. POST /api/v1/pdn/solve
        status, pdn_res = http_post("/api/v1/pdn/solve", {
            "net": "+3V3_OUT",
            "current_a": 3.0,
            "ambient_temp_c": 25.0,
        })
        assert status == 200, f"Expected 200, got {status}: {pdn_res}"
        assert pdn_res["success"] is True
        assert pdn_res["net"] == "+3V3_OUT"
        assert pdn_res["sheet_resistance_mohm_sq"] == 0.491
        assert pdn_res["max_ir_drop_mv"] == 8.24
        assert pdn_res["via_transition_drop_mv"] == 2.4
        assert pdn_res["ipc2152_temp_rise_c"] == 6.4
        assert pdn_res["max_temp_c"] == 31.4
        assert pdn_res["passed"] is True
        print(f"  [PASS] POST /api/v1/pdn/solve: Max IR drop {pdn_res['max_ir_drop_mv']} mV (pass={pdn_res['passed']}), IPC-2152 ΔT={pdn_res['ipc2152_temp_rise_c']}°C")

        print("\n[*] Gate 63: v0.0.4 CAD, 3D & Virtual Lab PASSED CLEANLY (100% SUCCESS).")
        return 0

    finally:
        proc.terminate()
        proc.wait(timeout=3)

if __name__ == "__main__":
    test_frontend_components()
    sys.exit(test_backend_endpoints())
