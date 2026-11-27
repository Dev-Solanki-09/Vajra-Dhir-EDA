"""KiCad 10 3-Channel Bridge REST + Live Sync endpoints for vd-daemon (loopback 127.0.0.1 only)."""

from __future__ import annotations

import json
import os
import pathlib
import shutil
import sqlite3
import struct
import threading
from typing import Any, Dict, List, Optional, Set, Tuple

try:
    from .board_3d import build_board_3d_payload, lookup_step_file
    from .kicad_bridge import (
        KiCad10Bridge,
        ensure_external_id_map,
        new_uuidv7,
        sha256_text,
        sync_hwir_to_kicad_pcb,
        sync_hwir_to_kicad_sch,
        sync_kicad_pcb_to_hwir,
        sync_kicad_sch_to_hwir,
    )
except ImportError:
    from board_3d import build_board_3d_payload, lookup_step_file
    from kicad_bridge import (
        KiCad10Bridge,
        ensure_external_id_map,
        new_uuidv7,
        sha256_text,
        sync_hwir_to_kicad_pcb,
        sync_hwir_to_kicad_sch,
        sync_kicad_pcb_to_hwir,
        sync_kicad_sch_to_hwir,
    )

_DB_DIR = pathlib.Path(os.environ.get("VD_DB_DIR") or ".vd-dev")
_BRIDGE = KiCad10Bridge(cas_dir=_DB_DIR / "cas")
_DEFAULT_FIXTURE_DIR = pathlib.Path("fixtures/golden-buck-mcu")

_STATE_LOCK = threading.RLock()
_ACTIVE_STATE: Dict[str, Any] = {
    "project_dir": None,  # Lazily initialized to _DB_DIR / "active-project"
    "pcb_path": None,
    "sch_path": None,
    "revision": 1,
    "last_pcb_sha256": "",
    "last_sch_sha256": "",
    "last_echo_suppressed": False,
}

_WS_LOCK = threading.Lock()
_WS_CLIENTS: Set[Any] = set()
_WS_BY_TAB: Dict[str, Any] = {}


def _ws_encode_frame(text: str) -> bytes:
    payload = text.encode("utf-8")
    length = len(payload)
    header = bytearray([0x81])  # FIN + text frame
    if length < 126:
        header.append(length)
    elif length < 65536:
        header.append(126)
        header.extend(struct.pack("!H", length))
    else:
        header.append(127)
        header.extend(struct.pack("!Q", length))
    return bytes(header) + payload


def register_ws_client(sock: Any, tab_id: Optional[str] = None) -> None:
    stale = None
    with _WS_LOCK:
        if tab_id:
            prev = _WS_BY_TAB.get(tab_id)
            if prev is not None and prev is not sock:
                stale = prev
                _WS_CLIENTS.discard(prev)
            _WS_BY_TAB[tab_id] = sock
        _WS_CLIENTS.add(sock)
    if stale is not None:
        try:
            stale.close()
        except Exception:
            pass


def unregister_ws_client(sock: Any, tab_id: Optional[str] = None) -> None:
    with _WS_LOCK:
        _WS_CLIENTS.discard(sock)
        if tab_id and _WS_BY_TAB.get(tab_id) is sock:
            _WS_BY_TAB.pop(tab_id, None)
        else:
            dead_tabs = [tid for tid, s in _WS_BY_TAB.items() if s is sock]
            for tid in dead_tabs:
                _WS_BY_TAB.pop(tid, None)


def broadcast_ws_event(event: Dict[str, Any]) -> None:
    frame = _ws_encode_frame(json.dumps(event))
    dead: List[Any] = []
    with _WS_LOCK:
        clients = list(_WS_CLIENTS)
    for sock in clients:
        try:
            sock.sendall(frame)
        except Exception:
            dead.append(sock)
    if dead:
        with _WS_LOCK:
            for d in dead:
                _WS_CLIENTS.discard(d)


def _send_json(handler: Any, status: int, body: Dict[str, Any]) -> None:
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler._send_cors()
    handler.end_headers()
    handler.wfile.write(json.dumps(body).encode("utf-8"))


def _ensure_active_workspace() -> pathlib.Path:
    """Returns a writable active project directory, lazily seeded from fixtures/golden-buck-mcu."""
    with _STATE_LOCK:
        if _ACTIVE_STATE["project_dir"]:
            proj_dir = pathlib.Path(_ACTIVE_STATE["project_dir"])
        else:
            proj_dir = _DB_DIR / "active-project"
            if not proj_dir.exists() or not list(proj_dir.glob("*.kicad_pcb")):
                proj_dir.mkdir(parents=True, exist_ok=True)
                if _DEFAULT_FIXTURE_DIR.is_dir():
                    for src_file in _DEFAULT_FIXTURE_DIR.iterdir():
                        if src_file.is_file() and src_file.suffix in (".kicad_pcb", ".kicad_sch", ".kicad_pro", ".ato"):
                            shutil.copy2(src_file, proj_dir / src_file.name)
            _ACTIVE_STATE["project_dir"] = str(proj_dir)
        return proj_dir


def _resolve_project_file(req: Dict[str, Any], key: str, ext: str, prefer_active: bool = False) -> pathlib.Path:
    raw = req.get(key)
    if raw:
        return pathlib.Path(str(raw))
    if req.get("project_dir"):
        proj_dir = pathlib.Path(str(req["project_dir"]))
    elif prefer_active:
        proj_dir = _ensure_active_workspace()
    else:
        proj_dir = _DEFAULT_FIXTURE_DIR if _ACTIVE_STATE["project_dir"] is None else pathlib.Path(_ACTIVE_STATE["project_dir"])
    matches = sorted(
        list(proj_dir.glob(f"*{ext}"))
        + list((proj_dir / "layout").glob(f"*{ext}"))
        + list((proj_dir / "schematics").glob(f"*{ext}"))
    )
    if matches:
        return matches[0]
    return proj_dir / f"golden-buck-mcu{ext}"


def get_active_project_snapshot() -> Dict[str, Any]:
    proj_dir = _ensure_active_workspace()
    pcb_path = _resolve_project_file({}, "pcb_path", ".kicad_pcb", prefer_active=True)
    sch_path = _resolve_project_file({}, "sch_path", ".kicad_sch", prefer_active=True)
    with _STATE_LOCK:
        if _ACTIVE_STATE.get("pcb_path"):
            pcb_path = pathlib.Path(_ACTIVE_STATE["pcb_path"])
        if _ACTIVE_STATE.get("sch_path"):
            sch_path = pathlib.Path(_ACTIVE_STATE["sch_path"])
        pcb_text = pcb_path.read_text(encoding="utf-8") if pcb_path.is_file() else ""
        sch_text = sch_path.read_text(encoding="utf-8") if sch_path.is_file() else ""
        pcb_sha = sha256_text(pcb_text) if pcb_text else ""
        sch_sha = sha256_text(sch_text) if sch_text else ""
        if not _ACTIVE_STATE["last_pcb_sha256"]:
            _ACTIVE_STATE["last_pcb_sha256"] = pcb_sha
        if not _ACTIVE_STATE["last_sch_sha256"]:
            _ACTIVE_STATE["last_sch_sha256"] = sch_sha
        return {
            "project_dir": str(proj_dir),
            "pcb_path": str(pcb_path),
            "sch_path": str(sch_path),
            "pcb_sha256": pcb_sha,
            "sch_sha256": sch_sha,
            "revision": _ACTIVE_STATE["revision"],
            "kicad_pcb": pcb_text,
            "kicad_sch": sch_text,
        }


def poll_external_changes(
    con: Optional[sqlite3.Connection],
    pcb_path_override: Optional[str] = None,
    sch_path_override: Optional[str] = None,
) -> Dict[str, Any]:
    """Detects external edits on active `.kicad_pcb`/`.kicad_sch` while honoring the 5s Echo Ring."""
    _ensure_active_workspace()
    with _STATE_LOCK:
        pcb_path = pathlib.Path(pcb_path_override) if pcb_path_override else (
            pathlib.Path(_ACTIVE_STATE["pcb_path"]) if _ACTIVE_STATE.get("pcb_path") else _resolve_project_file({}, "pcb_path", ".kicad_pcb", prefer_active=True)
        )
        sch_path = pathlib.Path(sch_path_override) if sch_path_override else (
            pathlib.Path(_ACTIVE_STATE["sch_path"]) if _ACTIVE_STATE.get("sch_path") else _resolve_project_file({}, "sch_path", ".kicad_sch", prefer_active=True)
        )
        pcb_text = pcb_path.read_text(encoding="utf-8") if pcb_path.is_file() else ""
        sch_text = sch_path.read_text(encoding="utf-8") if sch_path.is_file() else ""
        pcb_sha = sha256_text(pcb_text) if pcb_text else ""
        sch_sha = sha256_text(sch_text) if sch_text else ""

        if not _ACTIVE_STATE["last_pcb_sha256"]:
            _ACTIVE_STATE["last_pcb_sha256"] = pcb_sha
        if not _ACTIVE_STATE["last_sch_sha256"]:
            _ACTIVE_STATE["last_sch_sha256"] = sch_sha

        pcb_changed = bool(pcb_sha and pcb_sha != _ACTIVE_STATE["last_pcb_sha256"])
        sch_changed = bool(sch_sha and sch_sha != _ACTIVE_STATE["last_sch_sha256"])
        echo_suppressed = False
        external_changed = False

        if pcb_changed or sch_changed:
            if (pcb_changed and _BRIDGE.echo_ring.should_suppress(pcb_sha)) or (
                sch_changed and _BRIDGE.echo_ring.should_suppress(sch_sha)
            ):
                echo_suppressed = True
            else:
                external_changed = True
                if pcb_changed and con is not None and pcb_path.is_file():
                    try:
                        sync_kicad_pcb_to_hwir(con, pcb_path, actor_kind="human", echo_ring=_BRIDGE.echo_ring)
                    except Exception:
                        pass
                if sch_changed and con is not None and sch_path.is_file():
                    try:
                        sync_kicad_sch_to_hwir(con, sch_path, actor_kind="human", echo_ring=_BRIDGE.echo_ring)
                    except Exception:
                        pass
                _ACTIVE_STATE["revision"] += 1
            _ACTIVE_STATE["last_pcb_sha256"] = pcb_sha
            _ACTIVE_STATE["last_sch_sha256"] = sch_sha
            _ACTIVE_STATE["last_echo_suppressed"] = echo_suppressed

            if external_changed:
                broadcast_ws_event({
                    "type": "external_file_changed",
                    "revision": _ACTIVE_STATE["revision"],
                    "pcb_path": str(pcb_path),
                    "sch_path": str(sch_path),
                    "pcb_sha256": pcb_sha,
                    "sch_sha256": sch_sha,
                    "echo_suppressed": False,
                })

        return {
            "revision": _ACTIVE_STATE["revision"],
            "pcb_path": str(pcb_path),
            "sch_path": str(sch_path),
            "pcb_sha256": pcb_sha,
            "sch_sha256": sch_sha,
            "external_changed": external_changed,
            "echo_suppressed": echo_suppressed,
        }


def sync_after_patch(
    con: sqlite3.Connection,
    explicit_pcb_path: Optional[str] = None,
    ops: Optional[List[Dict[str, Any]]] = None,
    patch_id: str = "",
) -> Dict[str, Any]:
    """Channel A write-through after /api/v1/patch + WebSocket delta broadcast."""
    _ensure_active_workspace()
    with _STATE_LOCK:
        target_pcb = pathlib.Path(explicit_pcb_path) if explicit_pcb_path else (
            pathlib.Path(_ACTIVE_STATE["pcb_path"]) if _ACTIVE_STATE.get("pcb_path") else _resolve_project_file({}, "pcb_path", ".kicad_pcb", prefer_active=True)
        )
        target_sch = pathlib.Path(_ACTIVE_STATE["sch_path"]) if _ACTIVE_STATE.get("sch_path") else _resolve_project_file({}, "sch_path", ".kicad_sch", prefer_active=True)
        sync_res = sync_hwir_to_kicad_pcb(con, target_pcb, echo_ring=_BRIDGE.echo_ring)
        sch_res = sync_hwir_to_kicad_sch(con, target_sch, echo_ring=_BRIDGE.echo_ring)
        _ACTIVE_STATE["last_pcb_sha256"] = sync_res["sha256"]
        _ACTIVE_STATE["last_sch_sha256"] = sch_res.get("sha256", "")
        _ACTIVE_STATE["revision"] += 1
        rev = _ACTIVE_STATE["revision"]

    broadcast_ws_event({
        "type": "patch_applied",
        "patch_id": patch_id,
        "revision": rev,
        "pcb_path": str(target_pcb),
        "pcb_sha256": sync_res["sha256"],
        "sch_sha256": sch_res.get("sha256", ""),
        "ops": ops or [],
    })
    return {
        "pcb_path": str(target_pcb),
        "pcb_sha256": sync_res["sha256"],
        "sch_sha256": sch_res.get("sha256", ""),
        "revision": rev,
    }


def _parse_query(full_path: str) -> Dict[str, str]:
    if "?" not in full_path:
        return {}
    _, qs = full_path.split("?", 1)
    import urllib.parse
    parsed = urllib.parse.parse_qs(qs)
    return {k: v[0] for k, v in parsed.items() if v}


def handle_kicad_get(handler: Any, path: str, full_path: str = "", con: Optional[sqlite3.Connection] = None) -> bool:
    if path in ("/api/v1/kicad/status", "/api/kicad/status"):
        _send_json(handler, 200, _BRIDGE.status())
        return True

    if path in ("/api/v1/kicad/files", "/api/kicad/files"):
        q = _parse_query(full_path or getattr(handler, "path", path))
        proj_override = q.get("project_dir")
        pcb_override = q.get("pcb_path")
        sch_override = q.get("sch_path")
        if proj_override or pcb_override or sch_override:
            proj_dir = pathlib.Path(proj_override) if proj_override else (
                pathlib.Path(pcb_override).parent if pcb_override else pathlib.Path(sch_override).parent  # type: ignore[arg-type]
            )
            pcb_p = pathlib.Path(pcb_override) if pcb_override else _resolve_project_file({"project_dir": str(proj_dir)}, "pcb_path", ".kicad_pcb")
            sch_p = pathlib.Path(sch_override) if sch_override else _resolve_project_file({"project_dir": str(proj_dir)}, "sch_path", ".kicad_sch")
            pcb_txt = pcb_p.read_text(encoding="utf-8") if pcb_p.is_file() else ""
            sch_txt = sch_p.read_text(encoding="utf-8") if sch_p.is_file() else ""
            res = {
                "project_dir": str(proj_dir),
                "pcb_path": str(pcb_p),
                "sch_path": str(sch_p),
                "pcb_sha256": sha256_text(pcb_txt) if pcb_txt else "",
                "sch_sha256": sha256_text(sch_txt) if sch_txt else "",
                "revision": _ACTIVE_STATE["revision"],
                "kicad_pcb": pcb_txt,
                "kicad_sch": sch_txt,
            }
            _send_json(handler, 200, res)
            return True

        snap = get_active_project_snapshot()
        _send_json(handler, 200, snap)
        return True

    if path in ("/api/v1/kicad/events", "/api/kicad/events"):
        q = _parse_query(full_path or getattr(handler, "path", path))
        ev = poll_external_changes(
            con,
            pcb_path_override=q.get("pcb_path"),
            sch_path_override=q.get("sch_path"),
        )
        _send_json(handler, 200, ev)
        return True

    if path in ("/api/v1/3d/board-mesh", "/api/3d/board-mesh"):
        q = _parse_query(full_path or getattr(handler, "path", path))
        pcb_override = q.get("pcb_path")
        if pcb_override:
            pcb_p = pathlib.Path(pcb_override)
            pcb_txt = pcb_p.read_text(encoding="utf-8") if pcb_p.is_file() else ""
        else:
            snap = get_active_project_snapshot()
            pcb_p = pathlib.Path(snap["pcb_path"])
            pcb_txt = snap["kicad_pcb"]
        payload = build_board_3d_payload(pcb_txt, pcb_path=pcb_p, con=con)
        _send_json(handler, 200, payload)
        return True

    if path.startswith("/api/v1/3d/step/") or path.startswith("/api/3d/step/"):
        sha = path.rsplit("/", 1)[-1].lower()
        step_file = lookup_step_file(sha)
        if step_file is None:
            _send_json(handler, 404, {"error": "STEP_MODEL_NOT_FOUND", "sha256": sha})
            return True
        data = step_file.read_bytes()
        handler.send_response(200)
        handler.send_header("Content-Type", "application/step")
        handler.send_header("Cache-Control", "public, max-age=31536000, immutable")
        handler._send_cors()
        handler.end_headers()
        handler.wfile.write(data)
        return True

    return False


def handle_kicad_post(handler: Any, path: str, req: Dict[str, Any], con: Optional[sqlite3.Connection]) -> bool:
    if not (path.startswith("/api/v1/kicad/") or path.startswith("/api/kicad/")):
        return False

    try:
        if path in ("/api/v1/kicad/active-project", "/api/kicad/active-project"):
            proj_dir = pathlib.Path(str(req.get("project_dir") or _ensure_active_workspace()))
            pcb_p = _resolve_project_file({"project_dir": str(proj_dir), "pcb_path": req.get("pcb_path")}, "pcb_path", ".kicad_pcb", prefer_active=True)
            sch_p = _resolve_project_file({"project_dir": str(proj_dir), "sch_path": req.get("sch_path")}, "sch_path", ".kicad_sch", prefer_active=True)
            with _STATE_LOCK:
                _ACTIVE_STATE["project_dir"] = str(proj_dir)
                _ACTIVE_STATE["pcb_path"] = str(pcb_p)
                _ACTIVE_STATE["sch_path"] = str(sch_p)
                _ACTIVE_STATE["last_pcb_sha256"] = sha256_text(pcb_p.read_text(encoding="utf-8")) if pcb_p.is_file() else ""
                _ACTIVE_STATE["last_sch_sha256"] = sha256_text(sch_p.read_text(encoding="utf-8")) if sch_p.is_file() else ""
                _ACTIVE_STATE["revision"] += 1
            if req.get("sync_hwir", True) and con is not None:
                if sch_p.is_file():
                    sync_kicad_sch_to_hwir(con, sch_p, actor_kind=str(req.get("actor_kind", "human")), echo_ring=_BRIDGE.echo_ring)
                if pcb_p.is_file():
                    sync_kicad_pcb_to_hwir(con, pcb_p, actor_kind=str(req.get("actor_kind", "human")), echo_ring=_BRIDGE.echo_ring)
            _send_json(handler, 200, get_active_project_snapshot())
            return True

        if path in ("/api/v1/kicad/sync", "/api/kicad/sync"):
            if con is None:
                _send_json(handler, 500, {"error": "HWIR_DB_UNAVAILABLE", "message": "SQLite HW-IR connection missing"})
                return True
            ensure_external_id_map(con)
            direction = str(req.get("direction", "hwir_to_kicad_pcb"))
            actor_kind = str(req.get("actor_kind", "import"))
            if direction == "hwir_to_kicad_pcb":
                pcb_path = _resolve_project_file(req, "pcb_path", ".kicad_pcb", prefer_active=True)
                res = sync_hwir_to_kicad_pcb(con, pcb_path, echo_ring=_BRIDGE.echo_ring)
                with _STATE_LOCK:
                    _ACTIVE_STATE["last_pcb_sha256"] = res["sha256"]
                    _ACTIVE_STATE["revision"] += 1
                broadcast_ws_event({"type": "patch_applied", "revision": _ACTIVE_STATE["revision"], "pcb_path": str(pcb_path), "pcb_sha256": res["sha256"]})
                _send_json(handler, 200, res)
                return True
            if direction == "kicad_pcb_to_hwir":
                pcb_path = _resolve_project_file(req, "pcb_path", ".kicad_pcb", prefer_active=True)
                res = sync_kicad_pcb_to_hwir(con, pcb_path, actor_kind=actor_kind, echo_ring=_BRIDGE.echo_ring)
                _send_json(handler, 200, res)
                return True
            if direction == "kicad_sch_to_hwir":
                sch_path = _resolve_project_file(req, "sch_path", ".kicad_sch", prefer_active=True)
                res = sync_kicad_sch_to_hwir(con, sch_path, actor_kind=actor_kind, echo_ring=_BRIDGE.echo_ring)
                _send_json(handler, 200, res)
                return True
            _send_json(handler, 400, {"error": "INVALID_SYNC_DIRECTION", "direction": direction})
            return True

        if path in ("/api/v1/kicad/erc", "/api/kicad/erc"):
            sch_path = _resolve_project_file(req, "sch_path", ".kicad_sch", prefer_active=True)
            res = _BRIDGE.run_erc(sch_path, con=con)
            broadcast_ws_event({"type": "erc_updated", "error_count": res["error_count"], "warning_count": res["warning_count"]})
            _send_json(handler, 200, res)
            return True

        if path in ("/api/v1/kicad/drc", "/api/kicad/drc"):
            pcb_path = _resolve_project_file(req, "pcb_path", ".kicad_pcb", prefer_active=True)
            res = _BRIDGE.run_drc(pcb_path, con=con)
            broadcast_ws_event({"type": "drc_updated", "error_count": res["error_count"], "warning_count": res["warning_count"]})
            _send_json(handler, 200, res)
            return True

        if path in ("/api/v1/kicad/netlist", "/api/kicad/netlist"):
            sch_path = _resolve_project_file(req, "sch_path", ".kicad_sch", prefer_active=True)
            _send_json(handler, 200, _BRIDGE.export_netlist(sch_path))
            return True

        if path in ("/api/v1/kicad/export/gerbers", "/api/kicad/export/gerbers"):
            pcb_path = _resolve_project_file(req, "pcb_path", ".kicad_pcb", prefer_active=True)
            _send_json(handler, 200, _BRIDGE.export_gerbers_and_drill(pcb_path))
            return True

        if path in ("/api/v1/kicad/export/drill", "/api/kicad/export/drill"):
            pcb_path = _resolve_project_file(req, "pcb_path", ".kicad_pcb", prefer_active=True)
            _send_json(handler, 200, _BRIDGE.export_gerbers_and_drill(pcb_path))
            return True

        if path in ("/api/v1/kicad/export/ipc2581", "/api/kicad/export/ipc2581"):
            pcb_path = _resolve_project_file(req, "pcb_path", ".kicad_pcb", prefer_active=True)
            _send_json(handler, 200, _BRIDGE.export_ipc2581(pcb_path))
            return True

        if path in ("/api/v1/kicad/export/step", "/api/kicad/export/step"):
            pcb_path = _resolve_project_file(req, "pcb_path", ".kicad_pcb", prefer_active=True)
            subst = bool(req.get("subst_models", True))
            _send_json(handler, 200, _BRIDGE.export_step(pcb_path, subst_models=subst))
            return True

        if path in ("/api/v1/kicad/export/pdf", "/api/kicad/export/pdf"):
            sch_path = _resolve_project_file(req, "sch_path", ".kicad_sch", prefer_active=True)
            _send_json(handler, 200, _BRIDGE.export_sch_pdf(sch_path))
            return True

        if path in ("/api/v1/kicad/export", "/api/kicad/export"):
            fmt = str(req.get("format", "gerbers")).lower()
            if fmt in ("gerbers", "drill"):
                _send_json(handler, 200, _BRIDGE.export_gerbers_and_drill(_resolve_project_file(req, "pcb_path", ".kicad_pcb", prefer_active=True)))
                return True
            if fmt == "ipc2581":
                _send_json(handler, 200, _BRIDGE.export_ipc2581(_resolve_project_file(req, "pcb_path", ".kicad_pcb", prefer_active=True)))
                return True
            if fmt == "step":
                _send_json(handler, 200, _BRIDGE.export_step(_resolve_project_file(req, "pcb_path", ".kicad_pcb", prefer_active=True)))
                return True
            if fmt == "pdf":
                _send_json(handler, 200, _BRIDGE.export_sch_pdf(_resolve_project_file(req, "sch_path", ".kicad_sch", prefer_active=True)))
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
