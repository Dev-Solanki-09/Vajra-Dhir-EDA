"""Prompt 9 Senior EE Verification Brain deterministic tests & 8-circuit benchmark."""

from __future__ import annotations

import os
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]
SRC_DIR = pathlib.Path(__file__).resolve().parents[1] / "src"
KG_SRC = ROOT / "packages" / "kg-brain" / "src"

for p in (str(SRC_DIR), str(KG_SRC)):
    if p not in sys.path:
        sys.path.insert(0, p)

from control_auditor import analyze_smps_loop  # noqa: E402
from ee_audit_runner import (  # noqa: E402
    apply_auto_patch_to_circuit,
    build_8_broken_circuits_benchmark,
    run_full_ee_audit,
)


def test_p9_8_broken_circuits_caught_and_repaired_to_green():
    cases = build_8_broken_circuits_benchmark()
    assert len(cases) == 8

    for case in cases:
        res_before = run_full_ee_audit(case["spec"])
        assert res_before["passed"] is False, f"{case['id']} unexpectedly passed before fix"
        rule_ids = [f["rule_id"] for f in res_before["findings"]]
        assert case["expected_rule"] in rule_ids, (
            f"{case['id']} missing expected rule {case['expected_rule']}: got {rule_ids}"
        )

        target_finding = next(
            f for f in res_before["findings"] if f["rule_id"] == case["expected_rule"]
        )
        # Verify complete actionable finding contract
        for key in (
            "rule_id",
            "severity",
            "domain",
            "refdes",
            "physics_formula",
            "calculated_value",
            "limit_value",
            "why_it_fails_plain_english",
            "recommended_fix",
            "auto_patch_proposal",
        ):
            assert target_finding.get(key) not in (None, ""), f"{case['id']} missing {key}"

        repaired_spec = apply_auto_patch_to_circuit(case["spec"], target_finding)
        res_after = run_full_ee_audit(repaired_spec)
        assert res_after["passed"] is True, (
            f"{case['id']} did not turn GREEN after auto-patch: {res_after['findings']}"
        )
        assert res_after["error_count"] == 0


def test_p9_bode_stability_and_margin_calculations():
    stable = analyze_smps_loop(
        l_uh=10.0,
        c_eff_uf=33.0,
        esr_mohm=15.0,
        r_load_ohm=1.1,
        v_in_v=12.0,
        comp_fz_khz=3.5,
        comp_fp_khz=95.0,
        comp_gain_db=8.0,
    )
    assert stable["stable"] is True
    assert stable["phase_margin_deg"] >= 45.0
    assert len(stable["freqs_hz"]) == 45
    assert len(stable["mag_db"]) == 45
    assert len(stable["phase_deg"]) == 45
    assert stable["finding"] is None

    unstable = analyze_smps_loop(
        l_uh=22.0,
        c_eff_uf=47.0,
        esr_mohm=3.0,
        r_load_ohm=2.0,
        v_in_v=12.0,
        comp_fz_khz=80.0,
        comp_fp_khz=120.0,
        comp_gain_db=28.0,
    )
    assert unstable["stable"] is False
    assert unstable["phase_margin_deg"] < 45.0
    assert unstable["finding"] is not None
    assert unstable["finding"]["rule_id"] == "SMPS_LOOP_INSTABILITY"
    assert unstable["finding"]["domain"] == "Control/Stability"


def test_p9_duckdb_mlcc_dc_bias_derating_and_mosfet_vgs_ipc2152():
    from catalog_store import open_kg_connection  # type: ignore

    kg_path = ROOT / "fixtures" / "starter-kg" / "starter_kg.duckdb"
    assert kg_path.is_file(), "starter_kg.duckdb fixture missing"

    spec = {
        "capacitors": [
            {
                "refdes": "C_BUCK_OUT",
                "mpn": "CL21A226MAYNNNE",
                "c_nom_uf": 22.0,
                "v_applied_v": 12.0,
                "v_rating_v": 25.0,
                "dielectric": "X5R",
                "c_min_required_uf": 14.0,
            }
        ],
        "mosfets": [
            {"refdes": "Q_LOAD", "vgs_drive_v": 3.3, "vth_max_v": 2.5, "vgs_min_rdson_v": 4.5}
        ],
        "traces": [
            {"name": "VIN_12V", "current_a": 4.5, "width_nm": 200000, "thickness_nm": 35000, "is_external": True, "max_delta_t_c": 20.0}
        ],
    }

    con_kg = open_kg_connection(kg_path)
    try:
        res = run_full_ee_audit(spec, con_kg=con_kg)
    finally:
        con_kg.close()

    rules = {f["rule_id"] for f in res["findings"]}
    assert "MLCC_DC_BIAS_DERATING" in rules
    assert "MOSFET_UNDER_DRIVEN" in rules
    assert "IPC2152_TRACE_AMPACITY" in rules
    assert res["passed"] is False

    # Verify auto-patch repairs MLCC using 2x cap / upgrade proposal
    mlcc_f = next(f for f in res["findings"] if f["rule_id"] == "MLCC_DC_BIAS_DERATING")
    fixed_spec = apply_auto_patch_to_circuit({"capacitors": spec["capacitors"]}, mlcc_f)
    res_mlcc_fixed = run_full_ee_audit(fixed_spec)
    assert res_mlcc_fixed["passed"] is True
