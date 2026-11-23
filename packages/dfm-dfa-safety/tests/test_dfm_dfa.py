# packages/dfm-dfa-safety/tests/test_dfm_dfa.py
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src")))

from dfa import ComponentPlacement, check_courtyard_collisions, check_tombstoning_risk
from dfm import check_acid_traps, check_soldermask_dam_widths
from ipc2221_creepage import get_required_clearance_nm, verify_trace_clearance
from dft_d356 import generate_ipcd356_records

def test_courtyard_collision_detection():
    # Two overlapping 0603 caps
    c1 = ComponentPlacement("C1", x_nm=10000000, y_nm=10000000, rot_mdeg=0, w_nm=1600000, h_nm=800000)
    c2 = ComponentPlacement("C2", x_nm=10500000, y_nm=10000000, rot_mdeg=0, w_nm=1600000, h_nm=800000)
    violations = check_courtyard_collisions([c1, c2], min_clearance_nm=250000)
    assert len(violations) > 0
    assert violations[0]["refdes_a"] == "C1"
    assert violations[0]["refdes_b"] == "C2"
    print("[PASS] DFA Courtyard collision detection verified.")

def test_tombstoning_risk_calculation():
    # Pad 1 connected to heavy ground plane with NO thermal relief, Pad 2 connected to 0.25mm trace
    at_risk, ratio, msg = check_tombstoning_risk(
        pad1_trace_width_nm=250000,
        pad2_trace_width_nm=250000,
        pad1_is_plane_connected=True,
        pad2_is_plane_connected=False,
        pad1_has_thermal_relief=False,
        pad2_has_thermal_relief=False
    )
    assert at_risk is True
    assert ratio >= 2.0
    assert "Tombstoning hazard" in msg

    # With thermal relief enabled on both pads
    safe, ratio_safe, _ = check_tombstoning_risk(
        pad1_trace_width_nm=250000,
        pad2_trace_width_nm=250000,
        pad1_is_plane_connected=True,
        pad2_is_plane_connected=False,
        pad1_has_thermal_relief=True,
        pad2_has_thermal_relief=False
    )
    assert safe is False
    print("[PASS] DFA Tombstoning thermal imbalance calculator verified.")

def test_dfm_acid_trap_and_mask_dam():
    # Acute trace corner (45 degrees) -> Acid trap
    traces = [{"net_name": "VIN_POWER", "x_nm": 5000000, "y_nm": 5000000, "corner_angle_deg": 45.0}]
    traps = check_acid_traps(traces)
    assert len(traps) == 1
    assert traps[0]["severity"] == "ERROR"

    # Thin mask dam (50 um < 100 um limit) -> Solder bridge risk
    spacings = [{"pad_a": "U1.1", "pad_b": "U1.2", "gap_nm": 50000}]
    bridges = check_soldermask_dam_widths(spacings, min_dam_nm=100000)
    assert len(bridges) == 1
    assert bridges[0]["severity"] == "CRITICAL"
    print("[PASS] DFM Acid trap and Soldermask dam width checks verified.")

def test_ipc2221_clearance_verification():
    # 5V vs 0V (delta 5V): requires 0.10 mm (100,000 nm)
    res_low = verify_trace_clearance(actual_spacing_nm=150000, voltage_a_v=5.0, voltage_b_v=0.0)
    assert res_low["is_compliant"] is True
    assert res_low["required_spacing_nm"] == 100000

    # 48V vs 0V (delta 48V): requires 0.15 mm (150,000 nm)
    res_high = verify_trace_clearance(actual_spacing_nm=120000, voltage_a_v=48.0, voltage_b_v=0.0)
    assert res_high["is_compliant"] is False
    assert res_high["required_spacing_nm"] == 150000
    print("[PASS] IPC-2221 clearance rules verified.")

def test_ipcd356_generation():
    test_points = [
        {"net_name": "VBUS_12V", "refdes": "TP1", "pin_number": "1", "side": "top", "x_nm": 12700000, "y_nm": 25400000, "dia_nm": 1000000},
        {"net_name": "GND", "refdes": "TP2", "pin_number": "1", "side": "bottom", "x_nm": 15240000, "y_nm": 25400000, "dia_nm": 1000000}
    ]
    records = generate_ipcd356_records(test_points, "TEST_BUCK")
    assert "P  JOB  TEST_BUCK" in records
    assert "317 VBUS_12V" in records
    assert "317 GND" in records
    assert "999" in records
    print("[PASS] IPC-D-356 Test-point generator verified.")

if __name__ == "__main__":
    test_courtyard_collision_detection()
    test_tombstoning_risk_calculation()
    test_dfm_acid_trap_and_mask_dam()
    test_ipc2221_clearance_verification()
    test_ipcd356_generation()
    print("ALL DFM/DFA/IPC-2221 TESTS PASSED CLEANLY.")
