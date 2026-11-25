"""KiCad 10 3-Channel Bridge REST endpoints for vd-daemon (loopback 127.0.0.1 only)."""

from __future__ import annotations

import json
import os
import pathlib
import sqlite3
from typing import Any, Dict, Optional

try:
    from .kicad_bridge import (
        KiCad10Bridge,
        ensure_external_id_map,
        sync_hwir_to_kicad_pcb,
        sync_kicad_pcb_to_hwir,
        sync_kicad_sch_to_hwir,
    )
except ImportError:
    from kicad_bridge import (
        KiCad10Bridge,
        ensure_external_id_map,
        sync_hwir_to_kicad_pcb,
        sync_kicad_pcb_to_hwir,
        sync_kicad_sch_to_hwir,
    )

_BRIDGE = KiCad10Bridge(cas_dir=pathlib.Path(os.environ.get("VD_DB_DIR") or ".vd-dev") / "cas")
_DEFAULT_FIXTURE_DIR = pathlib.Path("fixtures/golden-buck-mcu")


def _send_json(handler: Any, status: int, body: Dict[str, Any]) -> None:
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler._send_cors()
    handler.end_headers()
    handler.wfile.write(json.dumps(body).encode("utf-8"))


def _resolve_project_file(req: Dict[str, Any], key: str, ext: str) -> pathlib.Path:
    raw = req.get(key)
    if raw:
        return pathlib.Path(str(raw))
    proj_dir = pathlib.Path(str(req.get("project_dir") or _DEFAULT_FIXTURE_DIR))
    matches = sorted(proj_dir.glob(f"*{ext}"))
    if matches:
        return matches[0]
    return proj_dir / f"golden-buck-mcu{ext}"


def handle_kicad_get(handler: Any, path: str) -> bool:
    if path in ("/api/v1/kicad/status", "/api/kicad/status"):
        _send_json(handler, 200, _BRIDGE.status())
        return True
    return False


def handle_kicad_post(handler: Any, path: str, req: Dict[str, Any], con: Optional[sqlite3.Connection]) -> bool:
    if not (path.startswith("/api/v1/kicad/") or path.startswith("/api/kicad/")):
        return False

    try:
        if path in ("/api/v1/kicad/sync", "/api/kicad/sync"):
            if con is None:
                _send_json(handler, 500, {"error": "HWIR_DB_UNAVAILABLE", "message": "SQLite HW-IR connection missing"})
                return True
            ensure_external_id_map(con)
            direction = str(req.get("direction", "hwir_to_kicad_pcb"))
            actor_kind = str(req.get("actor_kind", "import"))
            if direction == "hwir_to_kicad_pcb":
                pcb_path = _resolve_project_file(req, "pcb_path", ".kicad_pcb")
                res = sync_hwir_to_kicad_pcb(con, pcb_path, echo_ring=_BRIDGE.echo_ring)
                _send_json(handler, 200, res)
                return True
            if direction == "kicad_pcb_to_hwir":
                pcb_path = _resolve_project_file(req, "pcb_path", ".kicad_pcb")
                res = sync_kicad_pcb_to_hwir(con, pcb_path, actor_kind=actor_kind, echo_ring=_BRIDGE.echo_ring)
                _send_json(handler, 200, res)
                return True
            if direction == "kicad_sch_to_hwir":
                sch_path = _resolve_project_file(req, "sch_path", ".kicad_sch")
                res = sync_kicad_sch_to_hwir(con, sch_path, actor_kind=actor_kind, echo_ring=_BRIDGE.echo_ring)
                _send_json(handler, 200, res)
                return True
            _send_json(handler, 400, {"error": "INVALID_SYNC_DIRECTION", "direction": direction})
            return True

        if path in ("/api/v1/kicad/erc", "/api/kicad/erc"):
            sch_path = _resolve_project_file(req, "sch_path", ".kicad_sch")
            _send_json(handler, 200, _BRIDGE.run_erc(sch_path, con=con))
            return True

        if path in ("/api/v1/kicad/drc", "/api/kicad/drc"):
            pcb_path = _resolve_project_file(req, "pcb_path", ".kicad_pcb")
            _send_json(handler, 200, _BRIDGE.run_drc(pcb_path, con=con))
            return True

        if path in ("/api/v1/kicad/netlist", "/api/kicad/netlist"):
            sch_path = _resolve_project_file(req, "sch_path", ".kicad_sch")
            _send_json(handler, 200, _BRIDGE.export_netlist(sch_path))
            return True

        if path in ("/api/v1/kicad/export/gerbers", "/api/kicad/export/gerbers"):
            pcb_path = _resolve_project_file(req, "pcb_path", ".kicad_pcb")
            _send_json(handler, 200, _BRIDGE.export_gerbers_and_drill(pcb_path))
            return True

        if path in ("/api/v1/kicad/export/drill", "/api/kicad/export/drill"):
            pcb_path = _resolve_project_file(req, "pcb_path", ".kicad_pcb")
            _send_json(handler, 200, _BRIDGE.export_gerbers_and_drill(pcb_path))
            return True

        if path in ("/api/v1/kicad/export/ipc2581", "/api/kicad/export/ipc2581"):
            pcb_path = _resolve_project_file(req, "pcb_path", ".kicad_pcb")
            _send_json(handler, 200, _BRIDGE.export_ipc2581(pcb_path))
            return True

        if path in ("/api/v1/kicad/export/step", "/api/kicad/export/step"):
            pcb_path = _resolve_project_file(req, "pcb_path", ".kicad_pcb")
            subst = bool(req.get("subst_models", True))
            _send_json(handler, 200, _BRIDGE.export_step(pcb_path, subst_models=subst))
            return True

        if path in ("/api/v1/kicad/export/pdf", "/api/kicad/export/pdf"):
            sch_path = _resolve_project_file(req, "sch_path", ".kicad_sch")
            _send_json(handler, 200, _BRIDGE.export_sch_pdf(sch_path))
            return True

        if path in ("/api/v1/kicad/export", "/api/kicad/export"):
            fmt = str(req.get("format", "gerbers")).lower()
            if fmt in ("gerbers", "drill"):
                _send_json(handler, 200, _BRIDGE.export_gerbers_and_drill(_resolve_project_file(req, "pcb_path", ".kicad_pcb")))
                return True
            if fmt == "ipc2581":
                _send_json(handler, 200, _BRIDGE.export_ipc2581(_resolve_project_file(req, "pcb_path", ".kicad_pcb")))
                return True
            if fmt == "step":
                _send_json(handler, 200, _BRIDGE.export_step(_resolve_project_file(req, "pcb_path", ".kicad_pcb")))
                return True
            if fmt == "pdf":
                _send_json(handler, 200, _BRIDGE.export_sch_pdf(_resolve_project_file(req, "sch_path", ".kicad_sch")))
                return True
            _send_json(handler, 400, {"error": "UNSUPPORTED_EXPORT_FORMAT", "format": fmt})
            return True

    except sqlite3.IntegrityError as exc:
        if con is not None:
            con.rollback()
            con.execute("UPDATE _tx_actor_ctx SET actor_kind = 'human', allow_lock_override = 0 WHERE singleton = 1")
            con.commit()
        msg = str(exc)
        code = "KERNEL_LOCK_VIOLATION" if "KERNEL_LOCK_VIOLATION" in msg else "DB_INTEGRITY_ERROR"
        _send_json(handler, 409 if code == "KERNEL_LOCK_VIOLATION" else 400, {"error": code, "message": msg})
        return True
    except FileNotFoundError as exc:
        _send_json(handler, 404, {"error": "KICAD_RESOURCE_NOT_FOUND", "message": str(exc)})
        return True
    except Exception as exc:
        _send_json(handler, 500, {"error": "KICAD_BRIDGE_ERROR", "message": str(exc)})
        return True

    return False
