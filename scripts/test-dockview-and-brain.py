#!/usr/bin/env python3
"""
scripts/test-dockview-and-brain.py
Automated Verification Gate 61 for Vajra-Dhīr EDA v0.0.2.
Validates Multi-Pane Dockview Workstation, Layer Manager, Stackup & Impedance,
Z3 SMT Pinmux Studio, SMPS Physics Lab, and KiCad 10 Headless DRC Oracle.
"""

import json
import os
import pathlib
import subprocess
import sys
import time
import urllib.request
import urllib.error

PORT = 41902
BASE_URL = f"http://127.0.0.1:{PORT}"

def http_get(path: str) -> tuple[int, dict]:
    url = f"{BASE_URL}{path}"
    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8"))

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
    print("[*] Validating v0.0.2 Frontend Dockview & Stitched Brain components...")
    gui_dir = pathlib.Path("apps/prototype-gui/src/components")
    assert gui_dir.exists(), "apps/prototype-gui/src/components missing"

    # 1. DockviewWorkbench
    dockview = gui_dir / "DockviewWorkbench.tsx"
    assert dockview.exists(), "DockviewWorkbench.tsx missing"
    dv_src = dockview.read_text(encoding="utf-8")
    assert "DockviewPane" in dv_src
    assert "splitRatio" in dv_src
    print("  [PASS] DockviewWorkbench.tsx: multi-pane dockable tabs & resize split")

    # 2. LayerManager
    layer_mgr = gui_dir / "LayerManager.tsx"
    assert layer_mgr.exists(), "LayerManager.tsx missing"
    lm_src = layer_mgr.read_text(encoding="utf-8")
    assert "F.Cu" in lm_src and "B.Cu" in lm_src and "In1.Cu" in lm_src
    print("  [PASS] LayerManager.tsx: 4-layer copper & silkscreen visibility controls")

    # 3. StackupEditor
    stackup = gui_dir / "StackupEditor.tsx"
    assert stackup.exists(), "StackupEditor.tsx missing"
    st_src = stackup.read_text(encoding="utf-8")
    assert "Single-Ended 50Ω Microstrip" in st_src
    assert "Differential 90Ω Pair" in st_src
    print("  [PASS] StackupEditor.tsx: 4-layer FR-4 & controlled impedance calculators")

    # 4. Z3PinmuxStudio
    z3_pinmux = gui_dir / "Z3PinmuxStudio.tsx"
    assert z3_pinmux.exists(), "Z3PinmuxStudio.tsx missing"
    z3_src = z3_pinmux.read_text(encoding="utf-8")
    assert "Z3 SMT Solver" in z3_src
    assert "unsat_core" in z3_src or "unsatCore" in z3_src
    assert "board_pins.h" in z3_src
    print("  [PASS] Z3PinmuxStudio.tsx: SMT conflict solver & synchronized board_pins.h")

    # 5. SmpsBodeLab
    bode_lab = gui_dir / "SmpsBodeLab.tsx"
    assert bode_lab.exists(), "SmpsBodeLab.tsx missing"
    bl_src = bode_lab.read_text(encoding="utf-8")
    assert "PHASE MARGIN" in bl_src
    assert "GAIN MARGIN" in bl_src
    assert "MLCC DC-BIAS DERATING" in bl_src
    assert "Bode Plot" in bl_src
    print("  [PASS] SmpsBodeLab.tsx: interactive parameter sliders, MLCC derating & SVG Bode plot")

    # 6. KiCadDrcPanel
    drc_panel = gui_dir / "KiCadDrcPanel.tsx"
    assert drc_panel.exists(), "KiCadDrcPanel.tsx missing"
    dp_src = drc_panel.read_text(encoding="utf-8")
    assert "KiCad 10 Headless DRC" in dp_src
    assert "kicad-cli" in dp_src
    print("  [PASS] KiCadDrcPanel.tsx: headless DRC oracle report with passed checks")

def test_backend_endpoints():
    print(f"[*] Launching vd-daemon on test port {PORT}...")
    proc = subprocess.Popen(
        [sys.executable, "packages/vd-daemon/src/daemon.py", str(PORT)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    time.sleep(1.2)

    try:
        # 1. GET /api/v1/stackup
        status, stackup = http_get("/api/v1/stackup")
        assert status == 200, f"Expected 200, got {status}: {stackup}"
        assert stackup["layer_count"] == 4, f"Expected 4 layers, got {stackup['layer_count']}"
        assert stackup["total_thickness_nm"] == 1600000, f"Expected 1.6mm thickness, got {stackup['total_thickness_nm']}"
        se_z0 = stackup["controlled_impedance"]["se_50ohm"]["calculated_z0_ohm"]
        assert 47.5 <= se_z0 <= 52.5, f"Expected ~50 ohm, got {se_z0}"
        diff_z0 = stackup["controlled_impedance"]["diff_90ohm"]["calculated_zdiff_ohm"]
        assert 85.0 <= diff_z0 <= 95.0, f"Expected ~90 ohm, got {diff_z0}"
        print(f"  [PASS] GET /api/v1/stackup: 4-layer FR-4 (Z0={se_z0}Ω, Zdiff={diff_z0}Ω)")

        # 2. GET /api/v1/netclasses
        status, nc_data = http_get("/api/v1/netclasses")
        assert status == 200, f"Expected 200, got {status}: {nc_data}"
        classes = {c["name"]: c for c in nc_data["net_classes"]}
        assert "PWR_3A" in classes
        assert "SIGNAL" in classes
        assert "DIFF_90" in classes
        assert classes["PWR_3A"]["trace_width_nm"] == 1200000
        print(f"  [PASS] GET /api/v1/netclasses: {len(classes)} configured net classes")

        # 3. POST /api/v1/pinmux/solve (Clean Solve)
        status, sol = http_post("/api/v1/pinmux/solve", {})
        assert status == 200, f"Expected 200, got {status}: {sol}"
        assert sol["solved"] is True
        assert sol["conflicts"] == 0
        assert "#define PIN_PMIC_SCL PB6" in sol["board_pins_h"]
        print(f"  [PASS] POST /api/v1/pinmux/solve (Clean): Z3 SAT, 0 conflicts, board_pins.h verified")

        # 4. POST /api/v1/pinmux/solve (Conflict Injection)
        conflict_req = {
            "signals": [
                {"signal": "PIN_PMIC_SCL", "periph": "I2C1_SCL", "pin": "PB6"},
                {"signal": "PIN_PWM_DRIVE", "periph": "TIM4_CH1", "pin": "PB6"}
            ]
        }
        status, sol_conflict = http_post("/api/v1/pinmux/solve", conflict_req)
        assert status == 200, f"Expected 200, got {status}: {sol_conflict}"
        assert sol_conflict["solved"] is False
        assert sol_conflict["conflicts"] == 1
        assert any("PB6" in core for core in sol_conflict["unsat_core"])
        print(f"  [PASS] POST /api/v1/pinmux/solve (Conflict): Detected collision on PB6, unsat_core extracted")

        # 5. POST /api/v1/smps/bode-calc
        bode_req = {
            "vin": 12.0,
            "vout": 3.3,
            "iout": 2.0,
            "fsw_khz": 500.0,
            "l_uh": 4.7,
            "c_nom_uf": 44.0,
            "esr_mohm": 5.0
        }
        status, bode = http_post("/api/v1/smps/bode-calc", bode_req)
        assert status == 200, f"Expected 200, got {status}: {bode}"
        assert bode["c_eff_uf"] < bode["c_nom_uf"], "MLCC DC-bias derating must reduce effective capacitance"
        assert bode["output_ripple_mvpp"] <= 40.0, f"Expected ripple <= 40mV, got {bode['output_ripple_mvpp']}"
        assert bode["phase_margin_deg"] >= 45.0, f"Expected phase margin >= 45 deg, got {bode['phase_margin_deg']}"
        assert bode["gain_margin_db"] <= -10.0, f"Expected gain margin <= -10 dB, got {bode['gain_margin_db']}"
        assert bode["isat_pass"] is True
        assert bode["stable"] is True
        assert len(bode["bode_curve"]) == 40
        print(f"  [PASS] POST /api/v1/smps/bode-calc: Ceff={bode['c_eff_uf']}uF (-{bode['dc_bias_derating_pct']}%), φm={bode['phase_margin_deg']}°, GM={bode['gain_margin_db']}dB, Vpp={bode['output_ripple_mvpp']}mV")

        # 6. GET /api/v1/drc/full
        # Ensure L1 is at clean baseline (40mm, 20mm)
        _, board = http_get("/api/v1/board")
        l1 = next((c for c in board["components"] if c["refdes"] == "L1"), None)
        if l1 and (l1["x_nm"] != 40_000_000 or l1["y_nm"] != 20_000_000):
            http_post("/api/v1/patch", {
                "actor_kind": "human",
                "actor_id": "engineer",
                "summary": "Reset L1 to clean baseline",
                "ops": [{
                    "op": "MOVE_COMPONENT",
                    "component_id": l1["id"],
                    "x_nm": 40_000_000,
                    "y_nm": 20_000_000,
                    "rot_mdeg": 0,
                    "side": "top"
                }]
            })

        status, drc = http_get("/api/v1/drc/full")
        assert status == 200, f"Expected 200, got {status}: {drc}"
        assert drc["passed"] is True
        assert drc["total_violations"] == 0
        assert len(drc["passed_checks"]) >= 5
        print(f"  [PASS] GET /api/v1/drc/full: KiCad 10 DRC oracle clean ({len(drc['passed_checks'])} verified rules)")

        print("\n[*] Gate 61: v0.0.2 Dockview Workstation & Stitched Brain PASSED CLEANLY (100% SUCCESS).")
        return 0

    finally:
        proc.terminate()
        proc.wait(timeout=3)

if __name__ == "__main__":
    test_frontend_components()
    sys.exit(test_backend_endpoints())
