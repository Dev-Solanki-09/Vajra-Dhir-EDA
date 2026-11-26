"""Prompt 20 Production Polish, Tool Manager, Fab Presets, Harness & Safety REST routes."""

from __future__ import annotations

import json
import sqlite3
import urllib.parse
from typing import Any, Dict, Optional

try:
    from .polish_engine import (
        evaluate_ai_safety_rails,
        get_fab_presets_state,
        probe_tool_manager_status,
        run_three_tier_spice_fallback,
        set_3d_calibration,
        verify_multiboard_harness,
        _CALIBRATION_OVERRIDES,
    )
except ImportError:
    from polish_engine import (
        evaluate_ai_safety_rails,
        get_fab_presets_state,
        probe_tool_manager_status,
        run_three_tier_spice_fallback,
        set_3d_calibration,
        verify_multiboard_harness,
        _CALIBRATION_OVERRIDES,
    )


def _send_json(handler: Any, status: int, body: Dict[str, Any]) -> None:
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler._send_cors()
    handler.end_headers()
    handler.wfile.write(json.dumps(body).encode("utf-8"))


def handle_polish_get(handler: Any, path: str, full_path: str = "", con: Optional[sqlite3.Connection] = None) -> bool:
    if path == "/api/v1/polish/fab-presets":
        qs = urllib.parse.parse_qs(urllib.parse.urlparse(full_path or path).query)
        pid = (qs.get("preset") or [None])[0]
        _send_json(handler, 200, get_fab_presets_state(pid))
        return True
    if path == "/api/v1/polish/tools":
        _send_json(handler, 200, probe_tool_manager_status())
        return True
    if path == "/api/v1/polish/calibrate-3d":
        _send_json(handler, 200, {"overrides": _CALIBRATION_OVERRIDES})
        return True
    return False


def handle_polish_post(handler: Any, path: str, req: Dict[str, Any], con: Optional[sqlite3.Connection] = None) -> bool:
    if path == "/api/v1/polish/fab-presets":
        _send_json(handler, 200, get_fab_presets_state(req.get("preset_id")))
        return True
    if path == "/api/v1/polish/spice-fallback":
        comps = req.get("components")
        if comps is None and con is not None:
            rows = con.execute("SELECT refdes, value_str, mpn FROM components ORDER BY refdes").fetchall()
            comps = [{"refdes": r[0], "value": r[1], "mpn": r[2]} for r in rows]
        _send_json(handler, 200, run_three_tier_spice_fallback(list(comps or [])))
        return True
    if path == "/api/v1/polish/harness-check":
        _send_json(handler, 200, verify_multiboard_harness(req))
        return True
    if path == "/api/v1/polish/safety-check":
        code, body = evaluate_ai_safety_rails(req)
        _send_json(handler, code, body)
        return True
    if path == "/api/v1/polish/calibrate-3d":
        fp = str(req.get("footprint") or "DEFAULT")
        _send_json(handler, 200, set_3d_calibration(fp, req))
        return True
    return False
