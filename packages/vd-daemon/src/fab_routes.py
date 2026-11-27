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
    from .fab_pack_engine import (
        authorize_gate8_signoff,
        build_fab_bundle,
        validate_ipc2581_xml,
    )
except ImportError:
    from kicad_bridge import sha256_text
    from kicad_routes import _BRIDGE, _resolve_project_file
    from fab_pack_engine import (
        authorize_gate8_signoff,
        build_fab_bundle,
        validate_ipc2581_xml,
    )


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


def _serve_cas_artifact(handler: Any, sha_hex: str) -> bool:
    if not sha_hex or len(sha_hex) != 64 or not all(c in "0123456789abcdef" for c in sha_hex.lower()):
        return False
    cas_root = pathlib.Path(_BRIDGE.cas.root_dir)
    matches = []
    for base in (cas_root / "sha256", cas_root):
        cas_dir = base / sha_hex[:2] / sha_hex[2:4]
        if cas_dir.is_dir():
            matches.extend(sorted(cas_dir.glob(f"{sha_hex}.*")))
            if matches:
                break
    if not matches:
        return False
    target = matches[0]
    ext = target.suffix.lower()
    mime = {
        ".svg": "image/svg+xml; charset=utf-8",
        ".html": "text/html; charset=utf-8",
        ".csv": "text/csv; charset=utf-8",
        ".xml": "application/xml; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".pdf": "application/pdf",
    }.get(ext, "application/octet-stream")
    data = target.read_bytes()
    handler.send_response(200)
    handler.send_header("Content-Type", mime)
    handler.send_header("Content-Length", str(len(data)))
    handler._send_cors()
    handler.end_headers()
    handler.wfile.write(data)
    return True


def handle_fab_get(handler: Any, path: str, full_path: str = "", con: Optional[sqlite3.Connection] = None) -> bool:
    if path == "/api/v1/fab/status":
        try:
            pcb_path = _resolve_project_file({}, "pcb_path", ".kicad_pcb", prefer_active=True)
            pcb_exists = pathlib.Path(pcb_path).is_file()
            pcb_sha = sha256_text(pathlib.Path(pcb_path).read_text(encoding="utf-8", errors="replace")) if pcb_exists else ""
        except Exception:
            pcb_path = ""
            pcb_exists = False
            pcb_sha = ""
        gerber_cache_hit = bool(pcb_sha and (_gerber_cas_dir() / f"{pcb_sha}.json").is_file())
        bringup_tps = [
            {"tp": "TP_VIN", "net": "VIN_12V", "expected_min_v": 11.4, "expected_max_v": 12.6, "check": "Reverse-polarity & fuse continuity"},
            {"tp": "TP_3V3", "net": "VOUT_3V3", "expected_min_v": 3.13, "expected_max_v": 3.47, "check": "Buck regulation before MCU jumper"},
            {"tp": "TP_SW", "net": "SW_NODE", "expected_min_v": 0.0, "expected_max_v": 12.6, "check": "Oscilloscope 500kHz switching edge"},
            {"tp": "TP_GND", "net": "GND", "expected_min_v": -0.02, "expected_max_v": 0.02, "check": "Continuity < 0.2 Ohm across plane"},
        ]
        _send_json(handler, 200, {
            "ok": True,
            "fabrication_status": "NOT_FABRICATED_0_OF_3",
            "pcb_path": str(pcb_path),
            "pcb_exists": pcb_exists,
            "pcb_sha256": pcb_sha,
            "gerbers_cached": gerber_cache_hit,
            "gerbers_stale": not gerber_cache_hit,
            "ipc2581_validated": False,
            "bringup_test_points": bringup_tps,
        })
        return True

    if path == "/api/v1/fab/gerbers":
        parsed = urllib.parse.urlparse(full_path or path)
        qs = urllib.parse.parse_qs(parsed.query)
        pcb_q = (qs.get("pcb_path") or [None])[0]
        pcb_path = _resolve_project_file({"pcb_path": pcb_q} if pcb_q else {}, "pcb_path", ".kicad_pcb", prefer_active=True)
        res = export_cached_gerbers(pcb_path, use_cache=True)
        _send_json(handler, 200 if res.get("success") else 400, res)
        return True

    if path.startswith("/api/v1/fab/artifact/"):
        sha_hex = path.rsplit("/", 1)[-1]
        if _serve_cas_artifact(handler, sha_hex):
            return True
        _send_json(handler, 404, {"success": False, "error": "CAS artifact not found"})
        return True

    return False


def handle_fab_post(handler: Any, path: str, req: Dict[str, Any], con: Optional[sqlite3.Connection] = None) -> bool:
    if path == "/api/v1/fab/gerbers":
        pcb_path = _resolve_project_file(req, "pcb_path", ".kicad_pcb", prefer_active=True)
        res = export_cached_gerbers(pcb_path, use_cache=bool(req.get("use_cache", True)))
        _send_json(handler, 200 if res.get("success") else 400, res)
        return True

    if path == "/api/v1/fab/validate-2581":
        xml_override = req.get("xml_path")
        if xml_override:
            val = validate_ipc2581_xml(pathlib.Path(str(xml_override)))
            _send_json(handler, 200, {"success": bool(val.get("valid")), "validation": val})
            return True
        pcb_path = _resolve_project_file(req, "pcb_path", ".kicad_pcb", prefer_active=True)
        exp = _BRIDGE.export_ipc2581(pcb_path)
        xml_path = pathlib.Path(exp["cas_artifact"]["artifact_path"])
        val = validate_ipc2581_xml(xml_path)
        _send_json(handler, 200, {"success": bool(val.get("valid")), "cas_artifact": exp["cas_artifact"], "validation": val})
        return True

    if path == "/api/v1/fab/build-bundle":
        if req.get("release_authorized") is True and not req.get("human_confirmed"):
            _send_json(handler, 403, {
                "success": False,
                "error_code": "GATE8_HUMAN_SIGNOFF_REQUIRED",
                "release_authorized": False,
                "error": "Release authorization cannot be bypassed without Gate 8 human signoff.",
            })
            return True
        pcb_path = _resolve_project_file(req, "pcb_path", ".kicad_pcb", prefer_active=True)
        res = build_fab_bundle(pcb_path, con=con)
        _send_json(handler, 200, res)
        return True

    if path == "/api/v1/fab/signoff":
        status, body = authorize_gate8_signoff(req)
        _send_json(handler, status, body)
        return True

    return False
