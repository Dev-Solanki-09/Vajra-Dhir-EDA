"""Prompt 17 Engineering Dossier & Bring-Up PDF REST routes (loopback only)."""

from __future__ import annotations

import json
import pathlib
import sqlite3
from typing import Any, Dict, Optional

try:
    from .kicad_routes import _ACTIVE_STATE, _ensure_active_workspace, _resolve_project_file
    from .report_engine import _DEFAULT_TYP_PATH, compile_engineering_dossier
except ImportError:
    from kicad_routes import _ACTIVE_STATE, _ensure_active_workspace, _resolve_project_file
    from report_engine import _DEFAULT_TYP_PATH, compile_engineering_dossier


def _send_json(handler: Any, status: int, body: Dict[str, Any]) -> None:
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler._send_cors()
    handler.end_headers()
    handler.wfile.write(json.dumps(body).encode("utf-8"))


def handle_report_get(handler: Any, path: str, full_path: str = "", con: Optional[sqlite3.Connection] = None) -> bool:
    if path == "/api/v1/report/template":
        _ensure_active_workspace()
        proj_dir = pathlib.Path(_ACTIVE_STATE.get("project_dir") or ".")
        custom = proj_dir / "engineering_dossier.typ"
        src_path = custom if custom.is_file() else _DEFAULT_TYP_PATH
        _send_json(handler, 200, {
            "success": True,
            "path": str(src_path),
            "content": src_path.read_text(encoding="utf-8", errors="replace"),
        })
        return True
    return False


def handle_report_post(handler: Any, path: str, req: Dict[str, Any], con: Optional[sqlite3.Connection] = None) -> bool:
    if path == "/api/v1/report/build-dossier":
        pcb_path = _resolve_project_file(req, "pcb_path", ".kicad_pcb", prefer_active=True)
        try:
            sch_path: Optional[pathlib.Path] = _resolve_project_file(req, "sch_path", ".kicad_sch", prefer_active=True)
        except Exception:
            sch_path = None
        res = compile_engineering_dossier(
            pcb_path=pcb_path,
            sch_path=sch_path,
            con=con,
            typ_override=req.get("typ_content"),
            inject_error_stage=req.get("inject_error_stage"),
        )
        _send_json(handler, 200, res)
        return True
    return False
