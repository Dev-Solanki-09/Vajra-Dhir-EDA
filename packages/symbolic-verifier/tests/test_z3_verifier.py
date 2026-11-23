# packages/symbolic-verifier/tests/test_z3_verifier.py
import os
import sys
import sqlite3

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src")))

from z3_pinmux import solve_pinmux_smt, verify_i2c_bus_addresses
from physics_derating import (
    calculate_mlcc_derated_capacitance,
    calculate_ipc2152_trace_temp_rise,
    verify_component_derating
)
from footgun_engine import audit_hw_ir_database

def test_z3_pinmux_sat():
    signals = ["USART1_TX", "USART1_RX", "I2C1_SDA", "I2C1_SCL"]
    candidates = {
        "USART1_TX": ["PA9", "PB6"],
        "USART1_RX": ["PA10", "PB7"],
        "I2C1_SDA": ["PB7", "PB9"],
        "I2C1_SCL": ["PB6", "PB8"]
    }
    solution, unsat_core = solve_pinmux_smt(signals, candidates)
    assert solution is not None, f"Expected SAT, got UNSAT: {unsat_core}"
    assert len(solution) == 4
    # All pads must be distinct
    assigned_pads = list(solution.values())
    assert len(set(assigned_pads)) == 4
    for sig in signals:
        assert solution[sig] in candidates[sig]
    print("[PASS] Z3 SMT Pinmux SAT solved successfully.")

def test_z3_pinmux_unsat_core():
    # 2 signals competing for a single available pad -> MUST BE UNSAT with core
    signals = ["SIG_A", "SIG_B"]
    candidates = {
        "SIG_A": ["PA0"],
        "SIG_B": ["PA0"]
    }
    solution, unsat_core = solve_pinmux_smt(signals, candidates)
    assert solution is None, "Expected UNSAT for conflicting pads"
    assert len(unsat_core) > 0
    assert any("conflict_SIG_A_vs_SIG_B" in c for c in unsat_core)
    print(f"[PASS] Z3 SMT UNSAT core correctly identified: {unsat_core}")

def test_i2c_bus_verification():
    # Unique addresses
    valid_bus = {"U1_BME280": 0x76, "U2_EEPROM": 0x50, "U3_RTC": 0x68}
    ok, err = verify_i2c_bus_addresses(valid_bus)
    assert ok is True
    assert err is None

    # Address collision
    clash_bus = {"U1_BME280": 0x76, "U2_ANOTHER_BME": 0x76}
    ok, err = verify_i2c_bus_addresses(clash_bus)
    assert ok is False
    assert "I2C Address Collision" in err
    print("[PASS] I2C bus collision verification verified.")

def test_physics_derating_calculations():
    # MLCC DC-bias derating
    c_nom = 10.0 # 10uF
    c_eff = calculate_mlcc_derated_capacitance(c_nom, v_applied_v=12.0, v_rating_v=16.0, dielectric="X7R")
    assert c_eff < c_nom, "Capacitance must degrade under 75% rated voltage"
    assert c_eff > 2.0, "Capacitance should not completely vanish"
    
    # IPC-2152 trace temperature rise
    # 2A through 0.25mm (250,000 nm) 1oz copper (35,000 nm)
    delta_t = calculate_ipc2152_trace_temp_rise(current_amps=2.0, width_nm=250000, thickness_nm=35000, is_external=True)
    assert delta_t > 0.0
    assert delta_t < 150.0 # Realistic rise
    
    # Derating check
    res = verify_component_derating(v_applied=12.0, v_rated=16.0, p_dissipated_w=0.1, p_rated_w=0.25, category="capacitor")
    assert res["passes_voltage_derating"] is False # 12/16 = 75% > 50% limit for capacitor
    assert res["passes_power_derating"] is True   # 0.1/0.25 = 40% <= 50% limit
    print("[PASS] Physics-based derating and IPC-2152 verified.")

def test_sqlite_footgun_checks():
    conn = sqlite3.connect(":memory:")
    with open("packages/hw-ir/schema/001_init.sql", "r", encoding="utf-8") as f:
        conn.executescript(f.read())
        
    # Insert dummy project & board
    conn.execute("""
        INSERT INTO projects (id, name, domain, target_fab_or_pdk, spec_contract_json, created_at_utc, updated_at_utc)
        VALUES ('018e0000-0000-7000-8000-000000000001', 'Test', 'pcb', 'jlcpcb', '{}', '2026-11-24T00:00:00Z', '2026-11-24T00:00:00Z')
    """)
    conn.execute("""
        INSERT INTO boards (id, project_id, name, board_kind, outline_polygon_nm, provenance, locked)
        VALUES ('018e0000-0000-7000-8000-000000000002', '018e0000-0000-7000-8000-000000000001', 'main', 'rigid_pcb', '[]', 'human', 0)
    """)
    conn.execute("""
        INSERT INTO components (id, board_id, refdes, value_str, package_name, footprint_ref, symbol_ref, provenance)
        VALUES ('018e0000-0000-7000-8000-000000000003', '018e0000-0000-7000-8000-000000000002', 'U1', 'MCU', 'QFN-32', 'pkg:QFN', 'sym:MCU', 'human')
    """)
    # Floating input pin on U1
    conn.execute("""
        INSERT INTO component_pins (id, component_id, pin_number, pin_name, elec_type)
        VALUES ('018e0000-0000-7000-8000-000000000004', '018e0000-0000-7000-8000-000000000003', '1', 'EN', 'input')
    """)
    
    violations = audit_hw_ir_database(conn)
    assert any(v.fg_code == "FG-01" for v in violations), "FG-01 Floating Input pin must be flagged"
    print(f"[PASS] SQLite HW-IR Footgun Engine detected {len(violations)} violations.")

if __name__ == "__main__":
    test_z3_pinmux_sat()
    test_z3_pinmux_unsat_core()
    test_i2c_bus_verification()
    test_physics_derating_calculations()
    test_sqlite_footgun_checks()
    print("ALL SYMBOLIC-VERIFIER TESTS PASSED CLEANLY.")
