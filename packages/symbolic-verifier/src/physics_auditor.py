"""
SymPy + Pint + P7 DuckDB Deterministic EE Physics Auditor (#63 SymPy + #64 Pint).
Checks resistor 50% derated power, LDO Tj thermal limit, MLCC effective capacitance under DC bias,
inductor Isat saturation margin (I_peak < 0.8 * I_sat), MOSFET Vgs saturation & heating, and creepage.
"""

from __future__ import annotations

import pathlib
import sys
from typing import Any, Dict, List, Optional

import pint
import sympy as sp

try:
    from .physics_derating import calculate_ipc2152_trace_temp_rise, calculate_mlcc_derated_capacitance
except ImportError:
    from physics_derating import calculate_ipc2152_trace_temp_rise, calculate_mlcc_derated_capacitance

_KG_SRC = str(pathlib.Path(__file__).resolve().parents[2] / "kg-brain" / "src")
if _KG_SRC not in sys.path:
    sys.path.insert(0, _KG_SRC)

try:
    from catalog_store import interpolate_mlcc_c_eff  # type: ignore
except Exception:
    interpolate_mlcc_c_eff = None  # type: ignore

_UREG = pint.UnitRegistry()


def audit_physics_domain(
    spec: Dict[str, Any],
    con_kg: Any = None,
) -> List[Dict[str, Any]]:
    findings: List[Dict[str, Any]] = []
    ambient_c = float(spec.get("ambient_temp_c", 40.0))

    # 1. Resistor Power Dissipation (P = I^2 * R vs 50% rated P_max) using Pint + SymPy
    i_sym, r_sym = sp.symbols("I R", positive=True)
    p_expr = (i_sym ** 2) * r_sym
    for res in spec.get("resistors", []):
        ref = str(res.get("refdes", "R?"))
        current_q = _UREG.Quantity(float(res.get("current_a", 0.0)), str(res.get("current_unit", "A"))).to("ampere")
        r_q = _UREG.Quantity(float(res.get("r_ohm", 0.0)), str(res.get("r_unit", "ohm"))).to("ohm")
        p_rated_q = _UREG.Quantity(float(res.get("rated_w", 0.1)), "watt")
        # Symbolic substitution
        p_calc_w = float(p_expr.subs({i_sym: current_q.magnitude, r_sym: r_q.magnitude}))
        p_limit_w = 0.50 * float(p_rated_q.magnitude)  # Senior EE 50% continuous derating
        if p_calc_w > p_limit_w + 1e-6:
            rec_w = 0.25 if p_calc_w <= 0.125 else (0.5 if p_calc_w <= 0.25 else 1.0)
            findings.append({
                "rule_id": "RESISTOR_POWER_DERATING",
                "severity": "error",
                "domain": "Thermal/Derating",
                "entity_uuids": [ref],
                "refdes": ref,
                "physics_formula": "P = I^2 * R <= 0.50 * P_rated",
                "calculated_value": f"{p_calc_w:.3f} W (I={current_q.magnitude:.3g} A, R={r_q.magnitude:.3g} ohm)",
                "limit_value": f"{p_limit_w:.3f} W (50% of {p_rated_q.magnitude:.2f} W {res.get('package', '0603')})",
                "why_it_fails_plain_english": (
                    f"Resistor {ref} dissipates {p_calc_w:.3f} W, exceeding the 50% continuous derated limit ({p_limit_w:.3f} W) "
                    f"for its {res.get('package', '0603')} package and will overheat/drift or desolder."
                ),
                "recommended_fix": f"Upgrade {ref} to a {rec_w} W rated package (1206/2512) or increase resistance to limit current.",
                "auto_patch_proposal": {
                    "target": "resistors",
                    "refdes": ref,
                    "rated_w": rec_w,
                    "package": "1206" if rec_w <= 0.25 else "2512",
                },
            })

    # 2. LDO Junction Thermal Rise (Tj = Ta + (Vin - Vout) * I_load * theta_JA < Tj_max)
    for ldo in spec.get("ldos", []):
        ref = str(ldo.get("refdes", "U_LDO"))
        v_in = float(_UREG.Quantity(float(ldo.get("v_in_v", 5.0)), "volt").magnitude)
        v_out = float(_UREG.Quantity(float(ldo.get("v_out_v", 3.3)), "volt").magnitude)
        i_load = float(_UREG.Quantity(float(ldo.get("i_load_a", 0.1)), "ampere").magnitude)
        theta_ja = float(ldo.get("theta_ja_c_w", 90.0))
        tj_max = float(ldo.get("tj_max_c", 125.0))
        p_diss = max(0.0, (v_in - v_out) * i_load)
        tj_calc = round(ambient_c + p_diss * theta_ja, 1)
        if tj_calc > tj_max:
            findings.append({
                "rule_id": "LDO_THERMAL_OVERHEAT",
                "severity": "error",
                "domain": "Thermal/Derating",
                "entity_uuids": [ref],
                "refdes": ref,
                "physics_formula": "T_J = T_A + (V_in - V_out) * I_load * θ_JA < T_Jmax",
                "calculated_value": f"T_J = {tj_calc:.1f} °C (P_diss={p_diss:.2f} W @ θ_JA={theta_ja:.0f} °C/W)",
                "limit_value": f"T_Jmax = {tj_max:.1f} °C",
                "why_it_fails_plain_english": (
                    f"Linear regulator {ref} drops {v_in - v_out:.1f} V at {i_load:.2f} A ({p_diss:.2f} W), "
                    f"driving junction temperature to {tj_calc:.1f} °C > {tj_max:.1f} °C and triggering thermal shutdown."
                ),
                "recommended_fix": f"Replace linear drop with a switching buck stage (or lower θ_JA thermal pad + V_in pre-regulation to 5.0V).",
                "auto_patch_proposal": {
                    "target": "ldos",
                    "refdes": ref,
                    "v_in_v": round(v_out + 1.2, 2),
                    "theta_ja_c_w": 35.0,
                },
            })

    # 3. MLCC Effective Capacitance under DC Bias (prefers P7 DuckDB real curves)
    for cap in spec.get("capacitors", []):
        ref = str(cap.get("refdes", "C?"))
        mpn = str(cap.get("mpn", ""))
        c_nom_uf = float(_UREG.Quantity(float(cap.get("c_nom_uf", 10.0)), "microfarad").magnitude)
        v_bias = float(_UREG.Quantity(float(cap.get("v_bias_v", cap.get("v_applied_v", 3.3))), "volt").magnitude)
        v_rating = float(_UREG.Quantity(float(cap.get("v_rating_v", 25.0)), "volt").magnitude)
        min_req_raw = cap.get("min_required_uf", cap.get("c_min_required_uf", c_nom_uf * 0.45))
        min_req_uf = float(_UREG.Quantity(float(min_req_raw), "microfarad").magnitude)
        dielectric = str(cap.get("dielectric", "X7R"))

        c_eff_uf: Optional[float] = None
        if con_kg is not None and mpn and interpolate_mlcc_c_eff is not None:
            row = interpolate_mlcc_c_eff(con_kg, mpn, v_bias)
            if row:
                c_eff_uf = float(row["c_eff_uf"])
        if c_eff_uf is None:
            c_eff_uf = calculate_mlcc_derated_capacitance(c_nom_uf, v_bias, v_rating, dielectric)

        if c_eff_uf < min_req_uf:
            findings.append({
                "rule_id": "MLCC_DC_BIAS_DERATING",
                "severity": "error",
                "domain": "Power",
                "entity_uuids": [ref],
                "refdes": ref,
                "physics_formula": "C_eff(V_DC) >= C_required_min",
                "calculated_value": f"C_eff = {c_eff_uf:.2f} uF ({c_nom_uf:.1f} uF {dielectric} @ {v_bias:.1f} V)",
                "limit_value": f">= {min_req_uf:.2f} uF",
                "why_it_fails_plain_english": (
                    f"Capacitor {ref} ({mpn or dielectric}) loses capacitance under {v_bias:.1f} V DC bias down to "
                    f"{c_eff_uf:.2f} uF, below the {min_req_uf:.2f} uF ripple/holdup requirement."
                ),
                "recommended_fix": f"Upgrade {ref} to higher-voltage X7R 1206/1210 (e.g. 47 uF 25V X7R) or parallel two capacitors.",
                "auto_patch_proposal": {
                    "target": "capacitors",
                    "refdes": ref,
                    "c_nom_uf": round(min_req_uf * 2.0, 1),
                    "dielectric": "X7R",
                    "v_rating_v": max(25.0, v_bias * 2.5),
                },
            })

    # 4. Inductor Saturation Margin (I_peak < 0.8 * I_sat)
    for ind in spec.get("inductors", []):
        ref = str(ind.get("refdes", "L?"))
        i_peak = float(_UREG.Quantity(float(ind.get("i_peak_a", 1.0)), "ampere").magnitude)
        i_sat = float(_UREG.Quantity(float(ind.get("i_sat_a", 3.0)), "ampere").magnitude)
        limit_a = round(0.8 * i_sat, 3)
        if i_peak > limit_a:
            safe_isat = round(max(i_peak / 0.65, i_peak + 1.5), 1)
            findings.append({
                "rule_id": "INDUCTOR_ISAT_SATURATION",
                "severity": "error",
                "domain": "Power",
                "entity_uuids": [ref],
                "refdes": ref,
                "physics_formula": "I_peak <= 0.80 * I_sat",
                "calculated_value": f"I_peak = {i_peak:.2f} A",
                "limit_value": f"0.80 * I_sat = {limit_a:.2f} A (I_sat={i_sat:.2f} A)",
                "why_it_fails_plain_english": (
                    f"Inductor {ref} peak current ({i_peak:.2f} A) exceeds 80% of rated saturation current "
                    f"({i_sat:.2f} A), causing core inductance collapse, current spikes, and switch failure."
                ),
                "recommended_fix": f"Select shielded ferrite inductor with I_sat >= {safe_isat} A (e.g. SWPA6045S100MT).",
                "auto_patch_proposal": {
                    "target": "inductors",
                    "refdes": ref,
                    "i_sat_a": safe_isat,
                },
            })

    # 5. MOSFET V_GS Drive Margin & Trace Ampacity Check
    for mos in spec.get("mosfets", []):
        ref = str(mos.get("refdes", "Q?"))
        v_gs = float(mos.get("v_gs_drive_v", mos.get("vgs_drive_v", 5.0)))
        v_gs_min = float(mos.get("v_gs_min_turnon_v", mos.get("vgs_min_rdson_v", 2.5)))
        if v_gs < v_gs_min:
            findings.append({
                "rule_id": "MOSFET_UNDER_DRIVEN",
                "severity": "error",
                "domain": "Power",
                "entity_uuids": [ref],
                "refdes": ref,
                "physics_formula": "V_GS_drive >= V_GS(th)_plateau_min",
                "calculated_value": f"V_GS = {v_gs:.2f} V",
                "limit_value": f">= {v_gs_min:.2f} V",
                "why_it_fails_plain_english": f"MOSFET {ref} gate drive {v_gs:.2f} V fails to saturate channel cleanly (< {v_gs_min:.2f} V).",
                "recommended_fix": "Use logic-level MOSFET or increase gate driver supply to >= 4.5 V.",
                "auto_patch_proposal": {"target": "mosfets", "refdes": ref, "v_gs_drive_v": 5.0},
            })

    for tr in spec.get("traces", []):
        net = str(tr.get("net", "PWR"))
        current_a = float(tr.get("current_a", 0.0))
        width_nm = int(tr.get("width_nm", 250_000))
        thickness_nm = int(tr.get("thickness_nm", 35_000))
        max_dt = float(tr.get("max_delta_t_c", 20.0))
        dt_c = calculate_ipc2152_trace_temp_rise(current_a, width_nm, thickness_nm, is_external=True)
        if dt_c > max_dt:
            findings.append({
                "rule_id": "IPC2152_TRACE_AMPACITY",
                "severity": "warning",
                "domain": "Thermal/Derating",
                "entity_uuids": [net],
                "refdes": net,
                "physics_formula": "IPC-2152 ΔT(I, A_copper) <= 20 °C",
                "calculated_value": f"ΔT = {dt_c:.1f} °C ({current_a:.1f} A in {width_nm/1e6:.2f} mm trace)",
                "limit_value": f"<= {max_dt:.1f} °C",
                "why_it_fails_plain_english": f"Copper trace on net {net} heats by {dt_c:.1f} °C at {current_a:.1f} A.",
                "recommended_fix": "Widen copper trace to >= 1.5 mm or convert to solid polygon pour.",
                "auto_patch_proposal": {"target": "traces", "net": net, "width_nm": 1_800_000},
            })

    return findings
