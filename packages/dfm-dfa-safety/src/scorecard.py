"""Pure-MIT DFM / DFA / PI unified manufacturing scorecard engine."""

from typing import Any, Dict, List

from dfa import ComponentPlacement, check_courtyard_collisions, check_tombstoning_risk
from dfm import check_acid_traps, check_soldermask_dam_widths


def compute_dfm_dfa_pi_scorecard(
    *,
    trace_segments: List[Dict[str, Any]],
    pad_spacings: List[Dict[str, Any]],
    components: List[Dict[str, Any]],
    tombstone_checks: List[Dict[str, Any]],
    max_ir_drop_mv: float = 15.0,
    pdn_target_z_mohm: float = 25.0,
    pdn_actual_z_mohm: float = 18.0,
) -> Dict[str, Any]:
    """Compute unified DFM, DFA, and PDN Power-Integrity scorecard (0..100)."""
    acid_traps = check_acid_traps(trace_segments)
    dam_violations = check_soldermask_dam_widths(pad_spacings)
    dfm_issues = acid_traps + dam_violations

    placements = [
        ComponentPlacement(
            refdes=str(c.get("refdes", "U?")),
            x_nm=int(c.get("x_nm", 0)),
            y_nm=int(c.get("y_nm", 0)),
            rot_mdeg=int(c.get("rot_mdeg", 0)),
            w_nm=int(c.get("w_nm", 1_000_000)),
            h_nm=int(c.get("h_nm", 1_000_000)),
            side=str(c.get("side", "top")),
        )
        for c in components
    ]
    courtyard_hits = check_courtyard_collisions(placements)
    tombstone_hits = []
    for tc in tombstone_checks:
        risk, ratio, reason = check_tombstoning_risk(
            int(tc.get("pad1_trace_width_nm", 250_000)),
            int(tc.get("pad2_trace_width_nm", 250_000)),
            bool(tc.get("pad1_is_plane_connected", False)),
            bool(tc.get("pad2_is_plane_connected", False)),
            bool(tc.get("pad1_has_thermal_relief", True)),
            bool(tc.get("pad2_has_thermal_relief", True)),
        )
        if risk:
            tombstone_hits.append({"ratio": ratio, "description": reason, "severity": "WARNING"})

    dfa_issues = courtyard_hits + tombstone_hits

    dfm_score = max(0, 100 - 15 * len(acid_traps) - 20 * len(dam_violations))
    dfa_score = max(0, 100 - 20 * len(courtyard_hits) - 10 * len(tombstone_hits))

    pi_deduction = 0
    pi_issues: List[Dict[str, Any]] = []
    if max_ir_drop_mv > 50.0:
        pi_deduction += 25
        pi_issues.append({
            "rule": "PDN_IR_DROP_LIMIT",
            "actual_mv": max_ir_drop_mv,
            "limit_mv": 50.0,
            "severity": "CRITICAL",
        })
    if pdn_target_z_mohm > 0 and pdn_actual_z_mohm > pdn_target_z_mohm:
        pi_deduction += 20
        pi_issues.append({
            "rule": "PDN_IMPEDANCE_TARGET_EXCEEDED",
            "actual_mohm": pdn_actual_z_mohm,
            "target_mohm": pdn_target_z_mohm,
            "severity": "ERROR",
        })
    pi_score = max(0, 100 - pi_deduction)

    overall = round((dfm_score * 0.40) + (dfa_score * 0.35) + (pi_score * 0.25))
    grade = (
        "A" if overall >= 90 else
        "B" if overall >= 80 else
        "C" if overall >= 70 else
        "D" if overall >= 60 else
        "F"
    )
    all_issues = dfm_issues + dfa_issues + pi_issues
    blocking = sum(1 for item in all_issues if item.get("severity") in ("CRITICAL", "ERROR"))

    return {
        "dfm_score": dfm_score,
        "dfa_score": dfa_score,
        "pi_score": pi_score,
        "overall_score": overall,
        "grade": grade,
        "blocking_count": blocking,
        "dfm_violations": dfm_issues,
        "dfa_violations": dfa_issues,
        "pi_violations": pi_issues,
    }
