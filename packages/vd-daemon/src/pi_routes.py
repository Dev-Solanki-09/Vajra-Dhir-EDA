"""Prompt 13 Power Integrity (atx/padne 2.5D FEM) REST API routes (loopback only)."""

from __future__ import annotations

import json
import sqlite3
import urllib.parse
from typing import Any, Dict, Optional

try:
    from .kicad_routes import _resolve_project_file, broadcast_ws_event
    from .pi_worker import (
        apply_pi_trace_widening_repair,
        get_last_pi_result,
        get_pi_engine_status,
        run_power_integrity_solve,
    )
except ImportError:
    from kicad_routes import _resolve_project_file, broadcast_ws_event
    from pi_worker import (
        apply_pi_trace_widening_repair,
        get_last_pi_result,
        get_pi_engine_status,
        run_power_integrity_solve,
    )


def _send_json(handler: Any, status: int, body: Dict[str, Any]) -> None:
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler._send_cors()
    handler.end_headers()
    handler.wfile.write(json.dumps(body).encode("utf-8"))


def handle_pi_get(handler: Any, path: str, full_path: str = "", con: Optional[sqlite3.Connection] = None) -> bool:
    if path == "/api/v1/pi/status":
        _send_json(handler, 200, get_pi_engine_status())
        return True

    if path == "/api/v1/pi/heatmap":
        parsed = urllib.parse.urlparse(full_path or path)
        qs = urllib.parse.parse_qs(parsed.query)
        net = (qs.get("net") or [None])[0]
        metric = (qs.get("metric") or ["ir_drop_mv"])[0]
        colormap = (qs.get("colormap") or ["viridis"])[0]
        pcb_q = (qs.get("pcb_path") or [None])[0]
        last = get_last_pi_result()
        if last and not pcb_q and (not net or last.get("worst_case", {}).get("net") == net):
            _send_json(handler, 200, last)
            return True
        pcb_path = _resolve_project_file({"pcb_path": pcb_q} if pcb_q else {}, "pcb_path", ".kicad_pcb", prefer_active=True)
        res = run_power_integrity_solve(
            con,
            pcb_path,
            net=net,
            colormap=colormap,
            metric=metric,
        )
        _send_json(handler, 200 if res.get("ok") else 400, res)
        return True

    return False


def handle_pi_post(handler: Any, path: str, req: Dict[str, Any], con: Optional[sqlite3.Connection] = None) -> bool:
    if path in ("/api/v1/pi/solve", "/api/v1/pi/heatmap"):
        pcb_path = _resolve_project_file(req, "pcb_path", ".kicad_pcb", prefer_active=True)
        res = run_power_integrity_solve(
            con,
            pcb_path,
            net=req.get("net"),
            load_current_a=float(req["load_current_a"]) if req.get("load_current_a") is not None else None,
            ambient_temp_c=float(req.get("ambient_temp_c", 25.0)),
            copper_thickness_mm=float(req["copper_thickness_mm"]) if req.get("copper_thickness_mm") is not None else None,
            colormap=str(req.get("colormap", "viridis")),
            metric=str(req.get("metric", "ir_drop_mv")),
            sources=req.get("sources") if isinstance(req.get("sources"), list) else None,
            sinks=req.get("sinks") if isinstance(req.get("sinks"), list) else None,
            use_cache=bool(req.get("use_cache", True)),
        )
        if res.get("ok"):
            broadcast_ws_event({
                "type": "pi:solved",
                "passed": res.get("passed"),
                "max_ir_drop_mv": (res.get("worst_case") or {}).get("max_ir_drop_mv", 0.0),
                "peak_current_density_a_mm2": (res.get("worst_case") or {}).get("peak_current_density_a_mm2", 0.0),
                "cas_sha256": res.get("cas_sha256"),
            })
        _send_json(handler, 200 if res.get("ok") else 400, res)
        return True

    if path == "/api/v1/pi/repair":
        pcb_path = _resolve_project_file(req, "pcb_path", ".kicad_pcb", prefer_active=True)
        res = apply_pi_trace_widening_repair(
            con,
            pcb_path,
            net=str(req.get("net") or "+3.3V"),
            target_width_mm=float(req.get("target_width_mm", 1.25)),
            min_segment_width_threshold_mm=(
                float(req["min_segment_width_threshold_mm"])
                if req.get("min_segment_width_threshold_mm") is not None
                else None
            ),
            load_current_a=float(req["load_current_a"]) if req.get("load_current_a") is not None else None,
        )
        status = 200 if res.get("ok") else (409 if res.get("error_code") == "COPPER_LOCK_VIOLATION" else 400)
        _send_json(handler, status, res)
        return True

    return False
