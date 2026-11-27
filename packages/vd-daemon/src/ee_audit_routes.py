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
    from .pi_worker import get_last_pi_result
except ImportError:
    from kg_routes import _KG_LOCK, _kg_db_path, open_kg_connection
    from kicad_routes import _ACTIVE_STATE, _ensure_active_workspace, broadcast_ws_event
    from pi_worker import get_last_pi_result


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


def _parse_inductance_uh(val: str) -> float:
    m = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*(uH|µH|mH|nH)?", val or "", re.IGNORECASE)
    if not m:
        return 10.0
    num = float(m.group(1))
    unit = (m.group(2) or "uH").lower()
    if unit.startswith("m"):
        return num * 1000.0
    if unit.startswith("n"):
        return num * 1e-3
    return num


def _build_workspace_circuit_spec(con: Optional[sqlite3.Connection]) -> Dict[str, Any]:
    """Derives an audit spec from active HW-IR SQLite + system.yaml + .ato files."""
    _ensure_active_workspace()
    proj_dir = _ACTIVE_STATE.get("project_dir")
    resistors: List[Dict[str, Any]] = []
    capacitors: List[Dict[str, Any]] = []
    inductors: List[Dict[str, Any]] = []
    traces: List[Dict[str, Any]] = []
    smps_l_uh = 10.0
    smps_c_uf = 33.0
    net_by_ref: Dict[str, str] = {}

    if con is not None:
        try:
            for ref_n, net_n in con.execute(
                "SELECT c.refdes, n.name FROM pin_net_bindings pnb JOIN component_pins cp ON cp.id = pnb.pin_id JOIN components c ON c.id = cp.component_id JOIN nets n ON n.id = pnb.net_id WHERE COALESCE(c.deleted, 0) = 0"
            ).fetchall():
                if net_n and str(net_n).upper() not in ("GND", "VSS", ""):
                    net_by_ref[str(ref_n)] = str(net_n).upper()
        except Exception:
            try:
                for ref_n, net_n in con.execute(
                    "SELECT component_refdes, net_name FROM pin_net_bindings"
                ).fetchall():
                    if net_n and str(net_n).upper() not in ("GND", "VSS", ""):
                        net_by_ref[str(ref_n)] = str(net_n).upper()
            except Exception:
                pass

        # Collect full pin->net bindings for resistor wattage and I2C pullup discovery
        resistor_nets: Dict[str, List[str]] = {}
        all_nets: List[str] = []
        try:
            all_nets = [str(r[0]) for r in con.execute("SELECT name FROM nets").fetchall()]
            for ref_n, net_n in con.execute(
                "SELECT c.refdes, n.name FROM pin_net_bindings pnb JOIN component_pins cp ON cp.id = pnb.pin_id JOIN components c ON c.id = cp.component_id JOIN nets n ON n.id = pnb.net_id WHERE COALESCE(c.deleted, 0) = 0"
            ).fetchall():
                resistor_nets.setdefault(str(ref_n), []).append(str(net_n))
        except Exception:
            pass

        def _net_v(nname: str) -> float:
            nu = nname.upper()
            if nu in ("GND", "VSS", "0"):
                return 0.0
            if "24" in nu:
                return 24.0
            if "12" in nu or "VBUS" in nu or "VIN" in nu:
                return 12.0
            if "5V" in nu:
                return 5.0
            if "3V3" in nu or "3.3" in nu or "VCC" in nu or "VDD" in nu:
                return 3.3
            if "1V8" in nu or "1.8" in nu:
                return 1.8
            return 3.3

        try:
            rows = con.execute(
                "SELECT refdes, value_str, package_name FROM components WHERE COALESCE(deleted, 0) = 0 ORDER BY refdes"
            ).fetchall()
            for ref, val, pkg in rows:
                ref_s = str(ref or "")
                val_s = str(val or "")
                pkg_s = str(pkg or "0603")
                net_hint = net_by_ref.get(ref_s, "")
                v_rail = _net_v(net_hint) if net_hint else 3.3
                if ref_s.startswith("R"):
                    r_ohm = max(0.1, _parse_resistance_ohm(val_s))
                    rnets = resistor_nets.get(ref_s, [])
                    if len(rnets) >= 2:
                        dv = abs(_net_v(rnets[0]) - _net_v(rnets[1]))
                        i_est = round(dv / r_ohm, 4) if dv > 0 else 0.001
                    else:
                        i_est = min(0.5, round(v_rail / max(1.0, r_ohm), 4)) if r_ohm < 100 else 0.0033
                    resistors.append({
                        "refdes": ref_s,
                        "package": "0603" if "0603" in pkg_s else ("1206" if "1206" in pkg_s else ("0402" if "0402" in pkg_s else pkg_s)),
                        "r_ohm": r_ohm,
                        "current_a": i_est,
                        "rated_w": 0.25 if "1206" in pkg_s else (0.063 if "0402" in pkg_s else 0.1),
                    })
                elif ref_s.startswith("C"):
                    c_nom = _parse_capacitance_uf(val_s)
                    v_bias = v_rail if v_rail > 3.3 else (5.0 if c_nom >= 10.0 else 3.3)
                    if ref_s in ("C1", "C3") and c_nom >= 1.0:
                        smps_c_uf = max(smps_c_uf, c_nom)
                    capacitors.append({
                        "refdes": ref_s,
                        "c_nom_uf": c_nom,
                        "v_bias_v": v_bias,
                        "v_rating_v": 25.0,
                        "dielectric": "X5R" if "X5R" in val_s.upper() else "X7R",
                        "min_required_uf": round(c_nom * 0.45, 3),
                    })
                elif ref_s.startswith("L"):
                    l_uh = _parse_inductance_uh(val_s)
                    if ref_s == "L1":
                        smps_l_uh = l_uh
                    inductors.append({
                        "refdes": ref_s,
                        "l_uh": l_uh,
                        "i_peak_a": 1.6,
                        "i_sat_a": 3.5,
                    })
        except Exception:
            pass

        try:
            t_rows = con.execute(
                "SELECT width_nm, COUNT(*) FROM traces WHERE COALESCE(deleted, 0) = 0 GROUP BY width_nm ORDER BY width_nm ASC LIMIT 6"
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

    i2c_buses: List[Dict[str, Any]] = []
    # Dynamically detect I2C SDA/SCL nets & verify real pullup resistors in HW-IR
    if con is not None:
        try:
            net_names = [str(r[0]) for r in con.execute("SELECT name FROM nets").fetchall()]
            sda_nets = [n for n in net_names if "SDA" in n.upper()]
            scl_nets = [n for n in net_names if "SCL" in n.upper()]
            if sda_nets or scl_nets:
                def _has_pullup(target_net: str) -> bool:
                    for ref_k, rnets in resistor_nets.items():
                        if ref_k.startswith("R") and target_net in rnets:
                            if any(rn.upper().startswith(("+", "3V3", "5V", "VCC", "VDD", "VBUS")) for rn in rnets if rn != target_net):
                                return True
                    return False

                has_sda = all(_has_pullup(n) for n in sda_nets) if sda_nets else True
                has_scl = all(_has_pullup(n) for n in scl_nets) if scl_nets else True
                i2c_buses.append({"name": "I2C1", "has_sda_pullup": has_sda, "has_scl_pullup": has_scl, "devices": {"U1": 0x76}})
        except Exception:
            pass
    if not i2c_buses:
        i2c_buses = [{"name": "I2C1", "has_sda_pullup": True, "has_scl_pullup": True, "devices": {"U1": 0x76}}]
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
            "l_uh": smps_l_uh,
            "c_eff_uf": max(4.7, smps_c_uf * 0.72),
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


def collect_unified_diagnostics(con: Optional[sqlite3.Connection]) -> Dict[str, Any]:
    """Collect real consolidated ERC/Footgun/DRC/PI diagnostics, excluding active human waivers."""
    spec = _build_workspace_circuit_spec(con)
    audit = _run_with_kg(spec)
    waived_keys = set()
    if con is not None:
        try:
            for code_s, ent_s in con.execute("SELECT rule_id, COALESCE(entity_id, '') FROM drc_waivers").fetchall():
                waived_keys.add((str(code_s), str(ent_s)))
        except Exception:
            pass

    rows: List[Dict[str, Any]] = []
    for idx, f in enumerate(audit.get("findings") or []):
        rule_id = str(f.get("rule_id") or "EE_RULE")
        entity = str(f.get("refdes") or (f.get("entity_uuids") or ["BOARD"])[0])
        if (rule_id, entity) in waived_keys:
            continue
        sev_raw = str(f.get("severity") or "warning").lower()
        sev = "error" if sev_raw == "error" else ("warn" if "warn" in sev_raw else "info")
        rows.append({
            "id": f"ee-{idx}-{rule_id}-{entity}",
            "rule_id": rule_id,
            "severity": sev,
            "domain": str(f.get("domain") or "Physics"),
            "entity": entity,
            "cause": str(f.get("why_it_fails_plain_english") or f.get("calculated_value") or rule_id),
            "fix": str(f.get("recommended_fix") or "Inspect schematic and parameters"),
            "finding": f,
            "auto_fixable": bool(f.get("auto_patch_proposal")),
        })

    if con is not None:
        daemon_mod = sys.modules.get("daemon") or sys.modules.get("__main__")
        load_snapshot = getattr(daemon_mod, "load_snapshot", None) if daemon_mod else None
        run_deterministic_verify = getattr(daemon_mod, "run_deterministic_verify", None) if daemon_mod else None
        if load_snapshot and run_deterministic_verify:
            try:
                snap = load_snapshot(con)
                drc = run_deterministic_verify(snap)
                for idx, chk in enumerate(drc.get("checks") or []):
                    if chk.get("passed"):
                        continue
                    rule_id = str(chk.get("code") or "DRC")
                    ent = str((chk.get("entity_ids") or ["BOARD"])[0])
                    if (rule_id, ent) in waived_keys:
                        continue
                    rows.append({
                        "id": f"drc-{idx}-{rule_id}",
                        "rule_id": rule_id,
                        "severity": "error" if chk.get("severity") == "error" else "warn",
                        "domain": "DRC",
                        "entity": ent,
                        "cause": str(chk.get("message") or rule_id),
                        "fix": str(chk.get("remediation") or "Resolve PCB placement clearance"),
                        "finding": chk,
                        "auto_fixable": False,
                    })
            except Exception:
                pass

    return {
        "ok": True,
        "error_count": sum(1 for r in rows if r["severity"] == "error"),
        "warning_count": sum(1 for r in rows if r["severity"] == "warn"),
        "diagnostics": rows,
        "engines": audit.get("engines", []),
    }


def handle_ee_get(handler: Any, path: str, full_path: str = "", con: Any = None) -> bool:
    if path == "/api/v1/diagnostics":
        _send_json(handler, 200, collect_unified_diagnostics(con))
        return True

    if path == "/api/v1/ee/audit":
        spec = _build_workspace_circuit_spec(con)
        audit = _run_with_kg(spec)
        last_pi = get_last_pi_result()
        _send_json(handler, 200, {
            "mode": "workspace",
            "spec": spec,
            "audit": audit,
            "pi_summary": {
                "worst_case": last_pi.get("worst_case"),
                "findings": (last_pi.get("cross_integration") or {}).get("p13_findings", []),
            } if last_pi else None,
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

    if path == "/api/v1/diagnostics/waive":
        rule_code = str(req.get("rule_id") or req.get("rule_code") or "").strip()
        entity_id = str(req.get("entity_id") or req.get("entity") or "BOARD").strip()
        rationale = str(req.get("rationale") or "Waived by engineer in Workstation").strip()
        if not rule_code:
            _send_json(handler, 400, {"error": "Missing rule_id"})
            return True
        if con is not None:
            import datetime as _dt
            import uuid as _uuid
            wid = str(_uuid.uuid4())
            b_row = con.execute("SELECT id FROM boards LIMIT 1").fetchone()
            board_id = str(b_row[0]) if b_row else ""
            if board_id:
                now_iso = _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                con.execute(
                    """
                    INSERT INTO drc_waivers (id, board_id, rule_id, entity_id, reason, waived_by, created_at_utc)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (wid, board_id, rule_code, entity_id, rationale, str(req.get("actor") or "human"), now_iso),
                )
                con.commit()
        _send_json(handler, 200, {"ok": True, "rule_id": rule_code, "entity_id": entity_id})
        return True

    return False
