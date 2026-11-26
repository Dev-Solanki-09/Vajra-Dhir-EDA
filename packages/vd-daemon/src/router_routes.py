"""Prompt 12 KiCadRoutingTools REST API routes (loopback only)."""

from __future__ import annotations

import json
import sqlite3
from typing import Any, Dict, Optional

try:
    from .kicad_routes import _resolve_project_file
    from .router_worker import (
        _ROUTE_STATE,
        cancel_active_route,
        find_krt_engine,
        lock_trace_segment_in_hwir,
        run_autoroute,
        snapshot_locked_copper,
    )
except ImportError:
    from kicad_routes import _resolve_project_file
    from router_worker import (
        _ROUTE_STATE,
        cancel_active_route,
        find_krt_engine,
        lock_trace_segment_in_hwir,
        run_autoroute,
        snapshot_locked_copper,
    )


def _send_json(handler: Any, status: int, body: Dict[str, Any]) -> None:
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler._send_cors()
    handler.end_headers()
    handler.wfile.write(json.dumps(body).encode("utf-8"))


def handle_router_get(handler: Any, path: str, full_path: str = "", con: Optional[sqlite3.Connection] = None) -> bool:
    if path == "/api/v1/route/status":
        try:
            pcb_path = _resolve_project_file({}, "pcb_path", ".kicad_pcb", prefer_active=True)
            snap = snapshot_locked_copper(con, pcb_path)
        except Exception:
            snap = {"trace_hashes": {}, "locked_nets": [], "locked_refs": []}
        _send_json(handler, 200, {
            "engine": find_krt_engine(),
            "state": dict(_ROUTE_STATE),
            "locked_traces_count": len(snap.get("trace_hashes", {})),
            "locked_nets": snap.get("locked_nets", []),
        })
        return True
    return False


def handle_router_post(handler: Any, path: str, req: Dict[str, Any], con: Optional[sqlite3.Connection] = None) -> bool:
    if path in ("/api/v1/route/auto", "/api/v1/route/diff-pair"):
        if con is None:
            _send_json(handler, 500, {"error": "HW-IR database unavailable"})
            return True
        pcb_path = _resolve_project_file(req, "pcb_path", ".kicad_pcb", prefer_active=True)
        res = run_autoroute(
            con,
            pcb_path,
            nets=req.get("nets") if isinstance(req.get("nets"), list) else None,
            diff_pairs=req.get("diff_pairs") if isinstance(req.get("diff_pairs"), list) else None,
            track_width_mm=float(req.get("track_width_mm", 0.25)),
            clearance_mm=float(req.get("clearance_mm", 0.2)),
            diff_pair_gap_mm=float(req.get("diff_pair_gap_mm", 0.15)),
            reroute_unlocked=bool(req.get("reroute_unlocked", False)),
            preview_only=bool(req.get("preview_only", False)),
            run_drc=bool(req.get("run_drc", False)),
        )
        _send_json(handler, 200 if res.get("ok") else 409, res)
        return True

    if path == "/api/v1/route/lock-trace":
        if con is None:
            _send_json(handler, 500, {"error": "HW-IR database unavailable"})
            return True
        pcb_path = _resolve_project_file(req, "pcb_path", ".kicad_pcb", prefer_active=True)
        res = lock_trace_segment_in_hwir(
            con,
            pcb_path,
            net_name=req.get("net_name"),
            trace_id=req.get("trace_id"),
            locked=bool(req.get("locked", True)),
        )
        _send_json(handler, 200 if res.get("ok") else 404, res)
        return True

    if path == "/api/v1/route/cancel":
        _send_json(handler, 200, cancel_active_route())
        return True

    return False
