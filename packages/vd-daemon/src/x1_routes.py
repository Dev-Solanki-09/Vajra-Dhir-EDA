"""X1 REST route handlers for Constraint Manager, Assembly Variants/BOM Risk, and DFM/DFA/PI Scorecard."""

import json
import math
import pathlib
import sys
from typing import Any, Dict, List

SPEED_OF_LIGHT_MM_PER_PS = 0.299792458
_DFM_SRC = pathlib.Path(__file__).resolve().parents[2] / "dfm-dfa-safety" / "src"


def evaluate_constraints(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Evaluate routed nets against integer nanometer netclass rules."""
    rules = {str(r.get("name", "")): r for r in payload.get("netclasses", []) if isinstance(r, dict)}
    nets = payload.get("nets", [])
    violations: List[Dict[str, Any]] = []
    metrics: List[Dict[str, Any]] = []

    for net in nets:
        name = str(net.get("name", ""))
        nc = str(net.get("netclass", ""))
        width_nm = int(net.get("width_nm", 0))
        clearance_nm = int(net.get("clearance_nm", 0))
        p_len = int(net.get("p_length_nm", 0))
        n_len = net.get("n_length_nm")
        skew_nm = abs(p_len - int(n_len)) if n_len is not None else 0
        er_eff = float(net.get("er_eff", 3.8))
        er_eff = er_eff if er_eff > 0.1 else 3.8
        delay_ps = round(((p_len / 1_000_000.0) * math.sqrt(er_eff)) / SPEED_OF_LIGHT_MM_PER_PS, 2)
        metrics.append({
            "net": name,
            "length_nm": p_len,
            "skew_nm": skew_nm,
            "propagation_delay_ps": delay_ps,
        })

        rule = rules.get(nc)
        if rule is None:
            violations.append({
                "net": name,
                "netclass": nc,
                "rule": "UNKNOWN_NETCLASS",
                "actual_nm": 0,
                "limit_nm": 0,
                "severity": "ERROR",
            })
            continue

        min_w = int(rule.get("min_width_nm", 0))
        min_c = int(rule.get("min_clearance_nm", 0))
        if width_nm < min_w:
            violations.append({
                "net": name, "netclass": nc, "rule": "MIN_TRACE_WIDTH",
                "actual_nm": width_nm, "limit_nm": min_w, "severity": "CRITICAL",
            })
        if clearance_nm < min_c:
            violations.append({
                "net": name, "netclass": nc, "rule": "MIN_CLEARANCE",
                "actual_nm": clearance_nm, "limit_nm": min_c, "severity": "CRITICAL",
            })
        if rule.get("max_skew_nm") is not None and skew_nm > int(rule["max_skew_nm"]):
            violations.append({
                "net": name, "netclass": nc, "rule": "DIFF_PAIR_MAX_SKEW",
                "actual_nm": skew_nm, "limit_nm": int(rule["max_skew_nm"]), "severity": "CRITICAL",
            })
        if rule.get("min_length_nm") is not None and p_len < int(rule["min_length_nm"]):
            violations.append({
                "net": name, "netclass": nc, "rule": "MIN_ROUTED_LENGTH",
                "actual_nm": p_len, "limit_nm": int(rule["min_length_nm"]), "severity": "ERROR",
            })
        if rule.get("max_length_nm") is not None and p_len > int(rule["max_length_nm"]):
            violations.append({
                "net": name, "netclass": nc, "rule": "MAX_ROUTED_LENGTH",
                "actual_nm": p_len, "limit_nm": int(rule["max_length_nm"]), "severity": "ERROR",
            })

    return {
        "engine": "vd-constraint-mgr",
        "passed": len(violations) == 0,
        "checked_nets": len(nets),
        "violations": violations,
        "metrics": metrics,
    }


def analyze_bom_variants(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Evaluate BOM lifecycle, stock, feeder fees, and assembly variant DNP overrides."""
    boards = max(1, int(payload.get("board_count", 1)))
    variant = payload.get("variant") or {}
    variant_name = str(variant.get("name", "DEFAULT"))
    dnp_set = {str(r) for r in variant.get("dnp_refdes", [])}
    overrides = {str(k): str(v) for k, v in (variant.get("overrides") or {}).items()}
    items = payload.get("items", [])

    active_lines = 0
    dnp_excluded = 0
    total_cost = 0.0
    extended_mpns = set()
    risks: List[Dict[str, Any]] = []
    score = 100

    for item in items:
        refdes = str(item.get("refdes", ""))
        if refdes in dnp_set:
            dnp_excluded += 1
            continue
        active_lines += 1
        effective_mpn = overrides.get(refdes, str(item.get("mpn", "")))
        qty = max(1, int(item.get("qty", 1)))
        needed = qty * boards
        unit_price = max(0.0, float(item.get("unit_price_usd", 0.0)))
        total_cost += unit_price * needed

        if str(item.get("feeder_fee_type", "Basic")).lower() == "extended":
            extended_mpns.add(effective_mpn)

        lifecycle = str(item.get("lifecycle", "Active")).lower()
        if lifecycle == "obsolete":
            score -= 25
            risks.append({
                "refdes": refdes, "mpn": effective_mpn, "kind": "OBSOLETE_PART",
                "severity": "CRITICAL", "message": "Component marked Obsolete; substitute MPN required",
            })
        elif lifecycle == "nrnd":
            score -= 10
            risks.append({
                "refdes": refdes, "mpn": effective_mpn, "kind": "NRND_LIFECYCLE",
                "severity": "WARNING", "message": "Component is Not Recommended for New Designs",
            })

        stock_qty = int(item.get("stock_qty", 0))
        if stock_qty < needed:
            score -= 20
            risks.append({
                "refdes": refdes, "mpn": effective_mpn, "kind": "LOW_STOCK",
                "severity": "ERROR", "message": f"Need {needed} pcs across {boards} boards, stock={stock_qty}",
            })

        alternates = item.get("alternate_mpns") or []
        if len(alternates) == 0:
            score -= 5
            risks.append({
                "refdes": refdes, "mpn": effective_mpn, "kind": "SINGLE_SOURCE",
                "severity": "INFO", "message": "No second-source alternate MPN attached",
            })

    return {
        "engine": "vd-bom-analytics",
        "variant_name": variant_name,
        "board_count": boards,
        "active_line_count": active_lines,
        "dnp_excluded_count": dnp_excluded,
        "total_part_cost_usd": round(total_cost, 2),
        "extended_feeder_fees_usd": round(len(extended_mpns) * 3.0, 2),
        "supply_readiness_score": max(0, min(100, score)),
        "risks": risks,
    }


def _send_json(handler: Any, status: int, body: Dict[str, Any]) -> None:
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler._send_cors()
    handler.end_headers()
    handler.wfile.write(json.dumps(body).encode("utf-8"))


def handle_x1_post(handler: Any, path: str, req: Dict[str, Any]) -> bool:
    if path in ("/api/v1/constraints/evaluate", "/api/constraints/evaluate"):
        _send_json(handler, 200, evaluate_constraints(req))
        return True
    if path in ("/api/v1/bom/analyze", "/api/bom/analyze"):
        _send_json(handler, 200, analyze_bom_variants(req))
        return True
    if path in ("/api/v1/dfm/scorecard", "/api/dfm/scorecard"):
        if str(_DFM_SRC) not in sys.path:
            sys.path.insert(0, str(_DFM_SRC))
        from scorecard import compute_dfm_dfa_pi_scorecard  # noqa: E402

        res = compute_dfm_dfa_pi_scorecard(
            trace_segments=list(req.get("trace_segments", [])),
            pad_spacings=list(req.get("pad_spacings", [])),
            components=list(req.get("components", [])),
            tombstone_checks=list(req.get("tombstone_checks", [])),
            max_ir_drop_mv=float(req.get("max_ir_drop_mv", 15.0)),
            pdn_target_z_mohm=float(req.get("pdn_target_z_mohm", 25.0)),
            pdn_actual_z_mohm=float(req.get("pdn_actual_z_mohm", 18.0)),
        )
        _send_json(handler, 200, res)
        return True
    return False
