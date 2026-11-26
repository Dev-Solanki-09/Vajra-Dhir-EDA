"""Prompt 14 CadQuery + Gmsh + ElmerFEM MCAD & 3D Thermal FEM REST routes (loopback only)."""

from __future__ import annotations

import json
import sqlite3
import urllib.parse
from typing import Any, Dict, Optional

try:
    from .kicad_routes import _resolve_project_file
    from .mcad_thermal_worker import (
        generate_parametric_enclosure,
        get_mcad_status,
        lookup_mcad_artifact,
        run_mcad_clash_check,
        run_thermal_fem_solve,
    )
except ImportError:
    from kicad_routes import _resolve_project_file
    from mcad_thermal_worker import (
        generate_parametric_enclosure,
        get_mcad_status,
        lookup_mcad_artifact,
        run_mcad_clash_check,
        run_thermal_fem_solve,
    )


def _send_json(handler: Any, status: int, body: Dict[str, Any]) -> None:
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler._send_cors()
    handler.end_headers()
    handler.wfile.write(json.dumps(body).encode("utf-8"))


def handle_mcad_get(handler: Any, path: str, full_path: str = "", con: Optional[sqlite3.Connection] = None) -> bool:
    if path == "/api/v1/mcad/status":
        _send_json(handler, 200, get_mcad_status())
        return True

    if path == "/api/v1/mcad/enclosure":
        parsed = urllib.parse.urlparse(full_path or path)
        qs = urllib.parse.parse_qs(parsed.query)
        pcb_q = (qs.get("pcb_path") or [None])[0]
        pcb_path = _resolve_project_file({"pcb_path": pcb_q} if pcb_q else {}, "pcb_path", ".kicad_pcb", prefer_active=True)
        res = generate_parametric_enclosure(con, pcb_path)
        _send_json(handler, 200 if res.get("ok") else 400, res)
        return True

    if path.startswith("/api/v1/mcad/artifact/"):
        sha = path.rsplit("/", 1)[-1].lower()
        art_path = lookup_mcad_artifact(sha)
        if art_path is None:
            _send_json(handler, 404, {"error": "MCAD_ARTIFACT_NOT_FOUND", "sha256": sha})
            return True
        ctype = (
            "application/step" if art_path.suffix == ".step"
            else "model/stl" if art_path.suffix == ".stl"
            else "application/xml"
        )
        handler.send_response(200)
        handler.send_header("Content-Type", ctype)
        handler.send_header("Cache-Control", "public, max-age=31536000, immutable")
        handler._send_cors()
        handler.end_headers()
        handler.wfile.write(art_path.read_bytes())
        return True

    return False


def handle_mcad_post(handler: Any, path: str, req: Dict[str, Any], con: Optional[sqlite3.Connection] = None) -> bool:
    if path == "/api/v1/mcad/enclosure":
        pcb_path = _resolve_project_file(req, "pcb_path", ".kicad_pcb", prefer_active=True)
        res = generate_parametric_enclosure(
            con,
            pcb_path,
            script_text=req.get("script_text") if isinstance(req.get("script_text"), str) else None,
            overrides=req.get("overrides") if isinstance(req.get("overrides"), dict) else None,
        )
        _send_json(handler, 200 if res.get("ok") else 400, res)
        return True

    if path == "/api/v1/mcad/clash":
        pcb_path = _resolve_project_file(req, "pcb_path", ".kicad_pcb", prefer_active=True)
        res = run_mcad_clash_check(
            con,
            pcb_path,
            script_text=req.get("script_text") if isinstance(req.get("script_text"), str) else None,
            overrides=req.get("overrides") if isinstance(req.get("overrides"), dict) else None,
        )
        _send_json(handler, 200 if res.get("ok") else 400, res)
        return True

    if path == "/api/v1/thermal/solve":
        pcb_path = _resolve_project_file(req, "pcb_path", ".kicad_pcb", prefer_active=True)
        res = run_thermal_fem_solve(
            con,
            pcb_path,
            ambient_temp_c=float(req.get("ambient_temp_c", 25.0)),
            mesh_resolution=str(req.get("mesh_resolution", "fast_preview")),
            heat_loads_override_w=req.get("heat_loads_w") if isinstance(req.get("heat_loads_w"), dict) else None,
        )
        _send_json(handler, 200 if res.get("ok") else 400, res)
        return True

    return False
