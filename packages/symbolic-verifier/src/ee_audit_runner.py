"""
Unified Senior EE Verification Orchestrator & 8-Broken-Circuit Benchmark Suite (Prompt 9).
Combines Z3 SMT, SymPy + Pint physics, python-control loop stability, and HW-IR/DuckDB data.
"""

from __future__ import annotations

import copy
from typing import Any, Dict, List

try:
    from .control_auditor import analyze_smps_loop
    from .physics_auditor import audit_physics_domain
    from .pinmux_z3 import audit_z3_electrical_rules
except ImportError:
    from control_auditor import analyze_smps_loop
    from physics_auditor import audit_physics_domain
    from pinmux_z3 import audit_z3_electrical_rules


def run_full_ee_audit(circuit_spec: Dict[str, Any], con_kg: Any = None) -> Dict[str, Any]:
    findings: List[Dict[str, Any]] = []
    findings.extend(audit_z3_electrical_rules(circuit_spec))
    findings.extend(audit_physics_domain(circuit_spec, con_kg=con_kg))

    smps_cfg = circuit_spec.get("smps") or {}
    bode = analyze_smps_loop(
        l_uh=float(smps_cfg.get("l_uh", 10.0)),
        c_eff_uf=float(smps_cfg.get("c_eff_uf", 33.0)),
        esr_mohm=float(smps_cfg.get("esr_mohm", 15.0)),
        r_load_ohm=float(smps_cfg.get("r_load_ohm", 1.1)),
        v_in_v=float(smps_cfg.get("v_in_v", 12.0)),
        comp_fz_khz=float(smps_cfg.get("comp_fz_khz", 3.5)),
        comp_fp_khz=float(smps_cfg.get("comp_fp_khz", 95.0)),
        comp_gain_db=float(smps_cfg.get("comp_gain_db", 8.0)),
    )
    if bode.get("finding"):
        findings.append(bode["finding"])

    domains = {
        "Power": [],
        "Signal/Bus": [],
        "Thermal/Derating": [],
        "Pinmux": [],
        "Control/Stability": [],
    }
    for f in findings:
        dom = f.get("domain", "Power")
        domains.setdefault(dom, []).append(f)

    error_count = sum(1 for f in findings if f.get("severity") == "error")
    return {
        "passed": error_count == 0,
        "error_count": error_count,
        "finding_count": len(findings),
        "domains": domains,
        "findings": findings,
        "bode": {
            "freqs_hz": bode["freqs_hz"],
            "mag_db": bode["mag_db"],
            "phase_deg": bode["phase_deg"],
            "phase_margin_deg": bode["phase_margin_deg"],
            "gain_margin_db": bode["gain_margin_db"],
            "crossover_hz": bode["crossover_hz"],
            "stable": bode["stable"],
        },
        "engines": ["z3-solver", "sympy", "pint", "python-control", "duckdb-kg"],
    }


def apply_auto_patch_to_circuit(circuit_spec: Dict[str, Any], finding: Dict[str, Any]) -> Dict[str, Any]:
    """Applies a finding's deterministic auto_patch_proposal to produce a repaired circuit spec."""
    fixed = copy.deepcopy(circuit_spec)
    patch = finding.get("auto_patch_proposal") or {}
    tgt = patch.get("target")

    if tgt == "logic_links":
        for link in fixed.get("logic_links", []):
            if str(link.get("id", link.get("signal", ""))) == str(patch.get("id")):
                link["driver_v"] = patch.get("driver_v", 3.3)
    elif tgt == "i2c_buses":
        for bus in fixed.get("i2c_buses", []):
            if bus.get("name") == patch.get("name"):
                if "has_sda_pullup" in patch:
                    bus["has_sda_pullup"] = patch["has_sda_pullup"]
                if "has_scl_pullup" in patch:
                    bus["has_scl_pullup"] = patch["has_scl_pullup"]
                if patch.get("reassign_device") and isinstance(bus.get("devices"), dict):
                    bus["devices"][patch["reassign_device"]] = patch["new_addr"]
    elif tgt == "ldos":
        for ldo in fixed.get("ldos", []):
            if ldo.get("refdes") == patch.get("refdes"):
                ldo["v_in_v"] = patch.get("v_in_v", ldo.get("v_in_v"))
                ldo["theta_ja_c_w"] = patch.get("theta_ja_c_w", ldo.get("theta_ja_c_w"))
    elif tgt == "resistors":
        for res in fixed.get("resistors", []):
            if res.get("refdes") == patch.get("refdes"):
                res["rated_w"] = patch.get("rated_w", res.get("rated_w"))
                res["package"] = patch.get("package", res.get("package"))
    elif tgt == "inductors":
        for ind in fixed.get("inductors", []):
            if ind.get("refdes") == patch.get("refdes"):
                ind["i_sat_a"] = patch.get("i_sat_a", ind.get("i_sat_a"))
    elif tgt == "capacitors":
        for cap in fixed.get("capacitors", []):
            if cap.get("refdes") == patch.get("refdes"):
                cap["c_nom_uf"] = patch.get("c_nom_uf", cap.get("c_nom_uf"))
                cap["dielectric"] = patch.get("dielectric", cap.get("dielectric"))
                cap["v_rating_v"] = patch.get("v_rating_v", cap.get("v_rating_v"))
                cap["mpn"] = ""
    elif tgt == "boot_pins":
        for strap in fixed.get("boot_pins", []):
            if strap.get("refdes") == patch.get("refdes") and strap.get("pin") == patch.get("pin"):
                strap["pulled_state"] = patch.get("pulled_state", strap.get("required_normal_boot"))
    elif tgt == "smps":
        smps = fixed.setdefault("smps", {})
        smps["comp_fz_khz"] = patch.get("comp_fz_khz", 3.5)
        smps["comp_fp_khz"] = patch.get("comp_fp_khz", 95.0)
        smps["comp_gain_db"] = patch.get("comp_gain_db", 8.0)

    return fixed


def build_8_broken_circuits_benchmark() -> List[Dict[str, Any]]:
    """
    Canonical 8 deliberately broken circuits required by Prompt 9 Verification Gate:
    1. 5V -> 3.3V SBC GPIO clash
    2. Missing I2C pull-up
    3. Duplicate I2C address
    4. Overheated LDO Tj > 125C
    5. Under-rated 0603 resistor wattage
    6. Saturated buck inductor
    7. Unstable SMPS phase margin < 20 deg
    8. Boot-pin pulled wrong
    """
    return [
        {
            "id": "case_1_5v_into_3v3_sbc_gpio",
            "expected_rule": "Z3_5V_INTO_3V3_GPIO_HAZARD",
            "spec": {
                "logic_links": [
                    {
                        "id": "UART_TX",
                        "driver_refdes": "U_ARDUINO",
                        "driver_v": 5.0,
                        "receiver_refdes": "J_RPI",
                        "receiver_pin": "GPIO15_RXD",
                        "receiver_5v_tolerant": False,
                    }
                ]
            },
        },
        {
            "id": "case_2_missing_i2c_pullup",
            "expected_rule": "Z3_MISSING_I2C_PULLUP",
            "spec": {
                "i2c_buses": [
                    {"name": "I2C1", "has_sda_pullup": False, "has_scl_pullup": False, "devices": {"U_BME": 0x76}}
                ]
            },
        },
        {
            "id": "case_3_duplicate_i2c_address",
            "expected_rule": "Z3_I2C_ADDRESS_COLLISION",
            "spec": {
                "i2c_buses": [
                    {"name": "I2C1", "has_sda_pullup": True, "has_scl_pullup": True, "devices": {"U_SENS1": 0x76, "U_SENS2": 0x76}}
                ]
            },
        },
        {
            "id": "case_4_overheated_ldo",
            "expected_rule": "LDO_THERMAL_OVERHEAT",
            "spec": {
                "ambient_temp_c": 40.0,
                "ldos": [
                    {"refdes": "U_LDO", "v_in_v": 12.0, "v_out_v": 3.3, "i_load_a": 0.25, "theta_ja_c_w": 90.0, "tj_max_c": 125.0}
                ],
            },
        },
        {
            "id": "case_5_underrated_0603_resistor",
            "expected_rule": "RESISTOR_POWER_DERATING",
            "spec": {
                "resistors": [
                    {"refdes": "R_SHUNT", "package": "0603", "r_ohm": 1.0, "current_a": 0.45, "rated_w": 0.1}
                ]
            },
        },
        {
            "id": "case_6_saturated_buck_inductor",
            "expected_rule": "INDUCTOR_ISAT_SATURATION",
            "spec": {
                "inductors": [
                    {"refdes": "L1", "i_peak_a": 2.9, "i_sat_a": 2.15}
                ]
            },
        },
        {
            "id": "case_7_unstable_smps_loop",
            "expected_rule": "SMPS_LOOP_INSTABILITY",
            "spec": {
                "smps": {
                    "l_uh": 22.0,
                    "c_eff_uf": 47.0,
                    "esr_mohm": 3.0,
                    "r_load_ohm": 2.0,
                    "v_in_v": 12.0,
                    "comp_fz_khz": 80.0,
                    "comp_fp_khz": 120.0,
                    "comp_gain_db": 28.0,
                }
            },
        },
        {
            "id": "case_8_bootstrap_pin_trap",
            "expected_rule": "Z3_BOOTSTRAP_PIN_TRAP",
            "spec": {
                "boot_pins": [
                    {"refdes": "U_ESP32", "pin": "GPIO0", "required_normal_boot": "HIGH", "pulled_state": "LOW"}
                ]
            },
        },
    ]
