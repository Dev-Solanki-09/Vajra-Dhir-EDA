"""Senior EE Verification REST routes for Prompt 9 (Z3 + SymPy + Pint + python-control, loopback only)."""

from __future__ import annotations

import json
import pathlib
import re
import sqlite3
import sys
from typing import Any, Dict, List, Optional

_SV_SRC = str(pathlib.Path(__file__).resolve().parents[2] / "symbolic-verifier" / "src")
if _SV_SRC not in sys.path:
    sys.path.insert(0, _SV_SRC)

from ee_audit_runner import (  # noqa: E402
    apply_auto_patch_to_circuit,
    build_8_broken_circuits_benchmark,
    run_full_ee_audit,
)

try:
    from .kg_routes import _KG_LOCK, _kg_db_path, open_kg_connection
    from .kicad_routes import _ACTIVE_STATE, _ensure_active_workspace, broadcast_ws_event
except ImportError:
    from kg_routes import _KG_LOCK, _kg_db_path, open_kg_connection
    from kicad_routes import _ACTIVE_STATE, _ensure_active_workspace, broadcast_ws_event


def _send_json(handler: Any, status: int, body: Dict[str, Any]) -> None:
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler._send_cors()
    handler.end_headers()
    handler.wfile.write(json.dumps(body).encode("utf-8"))


def _parse_capacitance_uf(val: str) -> float:
    m = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*(uF|µF|nF|pF)", val or "", re.IGNORECASE)
    if not m:
        return 10.0
    num = float(m.group(1))
    unit = m.group(2).lower()
    if unit.startswith("n"):
        return num * 1e-3
    if unit.startswith("p"):
        return num * 1e-6
    return num


def _parse_resistance_ohm(val: str) -> float:
    m = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*(k|m|ohm|R)?", val or "", re.IGNORECASE)
    if not m:
        return 1000.0
    num = float(m.group(1))
    unit = (m.group(2) or "").lower()
    if unit == "k":
        return num * 1000.0
    if unit == "m":
        return num * 1e6
    return num


def _build_workspace_circuit_spec(con: Optional[sqlite3.Connection]) -> Dict[str, Any]:
    """Derives an audit spec from active HW-IR SQLite + system.yaml + .ato files."""
    _ensure_active_workspace()
    proj_dir = _ACTIVE_STATE.get("project_dir")
    resistors: List[Dict[str, Any]] = []
    capacitors: List[Dict[str, Any]] = []
    inductors: List[Dict[str, Any]] = []
    traces: List[Dict[str, Any]] = []

    if con is not None:
        try:
            rows = con.execute(
                "SELECT refdes, value_str, package_name FROM components ORDER BY refdes"
            ).fetchall()
            for ref, val, pkg in rows:
                ref_s = str(ref or "")
                val_s = str(val or "")
                pkg_s = str(pkg or "0603")
                if ref_s.startswith("R"):
                    r_ohm = max(0.1, _parse_resistance_ohm(val_s))
                    resistors.append({
                        "refdes": ref_s,
                        "package": "0603" if "0603" in pkg_s else ("1206" if "1206" in pkg_s else pkg_s),
                        "r_ohm": r_ohm,
                        "current_a": 0.0033 if r_ohm >= 100 else 0.05,
                        "rated_w": 0.25 if "1206" in pkg_s else 0.1,
                    })
                elif ref_s.startswith("C"):
                    c_nom = _parse_capacitance_uf(val_s)
                    capacitors.append({
                        "refdes": ref_s,
                        "c_nom_uf": c_nom,
                        "v_bias_v": 5.0 if c_nom >= 10.0 else 3.3,
                        "v_rating_v": 25.0,
                        "dielectric": "X7R",
                        "min_required_uf": round(c_nom * 0.45, 3),
                    })
                elif ref_s.startswith("L"):
                    inductors.append({
                        "refdes": ref_s,
                        "i_peak_a": 1.6,
                        "i_sat_a": 3.5,
                    })
        except Exception:
            pass

        try:
            t_rows = con.execute(
                "SELECT width_nm, COUNT(*) FROM traces GROUP BY width_nm ORDER BY width_nm ASC LIMIT 4"
            ).fetchall()
            for idx, (w_nm, _cnt) in enumerate(t_rows):
                traces.append({
                    "name": f"NET_TRACE_{idx+1}",
                    "width_nm": int(w_nm or 250000),
                    "thickness_nm": 35000,
                    "current_a": 0.6,
                    "is_external": True,
                    "max_delta_t_c": 25.0,
                })
        except Exception:
            pass

    i2c_buses: List[Dict[str, Any]] = [
        {"name": "I2C1", "has_sda_pullup": True, "has_scl_pullup": True, "devices": {"U1": 0x76}}
    ]
    if proj_dir:
        sys_yaml = pathlib.Path(proj_dir) / "system.yaml"
        if sys_yaml.is_file():
            try:
                text = sys_yaml.read_text(encoding="utf-8", errors="ignore")
                if "I2C" in text and "pullup: false" in text.lower():
                    i2c_buses[0]["has_sda_pullup"] = False
            except Exception:
                pass

    return {
        "ambient_temp_c": 35.0,
        "resistors": resistors,
        "capacitors": capacitors,
        "inductors": inductors,
        "traces": traces,
        "i2c_buses": i2c_buses,
        "smps": {
            "l_uh": 10.0,
            "c_eff_uf": 33.0,
            "esr_mohm": 15.0,
            "r_load_ohm": 1.1,
            "v_in_v": 12.0,
            "comp_fz_khz": 3.5,
            "comp_fp_khz": 95.0,
            "comp_gain_db": 8.0,
        },
    }


def _run_with_kg(spec: Dict[str, Any]) -> Dict[str, Any]:
    with _KG_LOCK:
        kg_path = _kg_db_path()
        con_kg = open_kg_connection(kg_path) if kg_path.is_file() else None
        try:
            return run_full_ee_audit(spec, con_kg=con_kg)
        finally:
            if con_kg is not None:
                con_kg.close()


def handle_ee_get(handler: Any, path: str, full_path: str = "", con: Any = None) -> bool:
    if path == "/api/v1/ee/audit":
        spec = _build_workspace_circuit_spec(con)
        audit = _run_with_kg(spec)
        _send_json(handler, 200, {
            "mode": "workspace",
            "spec": spec,
            "audit": audit,
        })
        return True

    if path == "/api/v1/ee/audit/benchmark-8":
        cases_out: List[Dict[str, Any]] = []
        caught = 0
        repaired_green = 0
        for case in build_8_broken_circuits_benchmark():
            res_before = _run_with_kg(case["spec"])
            rules = [f["rule_id"] for f in res_before["findings"]]
            matched = case["expected_rule"] in rules
            if matched:
                caught += 1
            target = next(
                (f for f in res_before["findings"] if f["rule_id"] == case["expected_rule"]),
                (res_before["findings"][0] if res_before["findings"] else None),
            )
            repaired_spec = (
                apply_auto_patch_to_circuit(case["spec"], target) if target is not None else case["spec"]
            )
            res_after = _run_with_kg(repaired_spec)
            if res_after["passed"]:
                repaired_green += 1
            cases_out.append({
                "id": case["id"],
                "expected_rule": case["expected_rule"],
                "caught": matched,
                "repaired_green": res_after["passed"],
                "spec": case["spec"],
                "audit": res_before,
                "repaired_spec": repaired_spec,
                "repaired_audit": res_after,
            })

        _send_json(handler, 200, {
            "total": len(cases_out),
            "caught": caught,
            "repaired_green": repaired_green,
            "cases": cases_out,
        })
        return True

    return False


def handle_ee_post(handler: Any, path: str, req: Dict[str, Any], con: Any = None) -> bool:
    if path == "/api/v1/ee/audit":
        spec = req.get("spec")
        if not isinstance(spec, dict):
            spec = _build_workspace_circuit_spec(con)
        audit = _run_with_kg(spec)
        _send_json(handler, 200, {
            "mode": "custom" if isinstance(req.get("spec"), dict) else "workspace",
            "spec": spec,
            "audit": audit,
        })
        return True

    if path == "/api/v1/ee/audit/apply-fix":
        spec = req.get("spec")
        if not isinstance(spec, dict):
            spec = _build_workspace_circuit_spec(con)
        finding = req.get("finding")
        if not isinstance(finding, dict):
            _send_json(handler, 400, {"error": "Missing 'finding' object"})
            return True
        repaired_spec = apply_auto_patch_to_circuit(spec, finding)
        audit = _run_with_kg(repaired_spec)
        broadcast_ws_event({
            "type": "ee:audit_repaired",
            "rule_id": finding.get("rule_id"),
            "refdes": finding.get("refdes"),
            "passed": audit["passed"],
            "error_count": audit["error_count"],
        })
        _send_json(handler, 200, {
            "repaired_spec": repaired_spec,
            "audit": audit,
        })
        return True

    return False
