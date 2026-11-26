"""Prompt 15 & 16 Manufacturing Gerber Export & Fab Pack REST routes (loopback only)."""

from __future__ import annotations

import json
import os
import pathlib
import sqlite3
import urllib.parse
from typing import Any, Dict, Optional

try:
    from .kicad_bridge import sha256_text
    from .kicad_routes import _BRIDGE, _resolve_project_file
except ImportError:
    from kicad_bridge import sha256_text
    from kicad_routes import _BRIDGE, _resolve_project_file


def _send_json(handler: Any, status: int, body: Dict[str, Any]) -> None:
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler._send_cors()
    handler.end_headers()
    handler.wfile.write(json.dumps(body).encode("utf-8"))


def _gerber_cas_dir() -> pathlib.Path:
    base = pathlib.Path(os.environ.get("VD_DB_DIR") or ".vd-dev")
    p = base / "cas" / "gerbers"
    p.mkdir(parents=True, exist_ok=True)
    return p


def export_cached_gerbers(pcb_path: pathlib.Path, use_cache: bool = True) -> Dict[str, Any]:
    pcb_path = pathlib.Path(pcb_path).resolve()
    pcb_sha = sha256_text(pcb_path.read_text(encoding="utf-8", errors="replace"))
    cache_file = _gerber_cas_dir() / f"{pcb_sha}.json"
    if use_cache and cache_file.is_file():
        try:
            data = json.loads(cache_file.read_text(encoding="utf-8"))
            data["cache_hit"] = True
            return data
        except Exception:
            pass
    res = _BRIDGE.export_gerbers_with_contents(pcb_path)
    res["cache_hit"] = False
    cache_file.write_text(json.dumps(res), encoding="utf-8")
    return res


def handle_fab_get(handler: Any, path: str, full_path: str = "", con: Optional[sqlite3.Connection] = None) -> bool:
    if path == "/api/v1/fab/gerbers":
        parsed = urllib.parse.urlparse(full_path or path)
        qs = urllib.parse.parse_qs(parsed.query)
        pcb_q = (qs.get("pcb_path") or [None])[0]
        pcb_path = _resolve_project_file({"pcb_path": pcb_q} if pcb_q else {}, "pcb_path", ".kicad_pcb", prefer_active=True)
        res = export_cached_gerbers(pcb_path, use_cache=True)
        _send_json(handler, 200 if res.get("success") else 400, res)
        return True
    return False


def handle_fab_post(handler: Any, path: str, req: Dict[str, Any], con: Optional[sqlite3.Connection] = None) -> bool:
    if path == "/api/v1/fab/gerbers":
        pcb_path = _resolve_project_file(req, "pcb_path", ".kicad_pcb", prefer_active=True)
        res = export_cached_gerbers(pcb_path, use_cache=bool(req.get("use_cache", True)))
        _send_json(handler, 200 if res.get("success") else 400, res)
        return True
    return False
