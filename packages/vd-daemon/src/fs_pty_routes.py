"""Workspace File Tree/Read/Write & ConPTY WebSocket Session routes for Prompt 4 (loopback only)."""

from __future__ import annotations

import json
import os
import pathlib
import secrets
import sqlite3
import tempfile
import threading
import time
import urllib.parse
from typing import Any, Dict, List, Optional

try:
    from .kicad_bridge import sha256_text
    from .kicad_routes import _ensure_active_workspace, poll_external_changes
    from .pty_win import WorkspacePty
except ImportError:
    from kicad_bridge import sha256_text
    from kicad_routes import _ensure_active_workspace, poll_external_changes
    from pty_win import WorkspacePty

_TOKEN_LOCK = threading.Lock()
_PTY_TOKENS: Dict[str, Dict[str, Any]] = {}  # token -> {"cwd": str, "expires_at": float}

_STARTER_ATO = '''module Buck3V3:
    # golden-buck-mcu declarative hardware source
    component U1 "CH224K"  # USB-C PD sink
    component U2 "TPS54302"  # 3A sync buck converter (human-locked)
    component J1 "PWR_12V_IN"  # 12V input header (human-locked)
    component L1 "4.7uH"  # Main buck inductor
    component C1 "10uF 25V"  # Input bulk MLCC
    net VBUS_12V: J1.1 -> U2.VIN
    net SW: U2.SW -> L1.1
    net PLUS3V3: L1.2 -> U1.VDD
'''

_STARTER_SYSTEM_YAML = '''project: golden-buck-mcu
version: "0.0.5"
purpose: "USB-C PD 12V -> 3.3V Sync Buck Regulator + MCU/PD Controller Carrier"
requirements:
  - "Deliver regulated +3V3_OUT rail up to 3.0A with < 40 mVpp ripple"
  - "Protect 3.3V-only MCU & SBC headers against 5V/12V overvoltage hazards"
  - "Enforce locked placement on J1 (USB-C input) and U2 (buck IC)"
blocks:
  - id: blk-power-in
    name: "12V USB-C PD Source"
    kind: power_source
    role: "12V DC Input Header (human-locked)"
    voltage_v: 12
    max_output_ma: 3000
    draw_ma: 0
    tolerance: HIGH_VOLTAGE_POWER
    builtin_pullups: false
    bootstrap_notes: "ESD TVS + 12V VBUS fuse input boundary"
    mounting_footprint: "Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical"
    step_model_ref: ""
    kicad_sheet_uuid: "01950000-0000-7000-8000-000000000001"
    member_refdes: [J1]
    x: 40
    y: 160
  - id: blk-sync-buck
    name: "TPS54302 3.3V Buck"
    kind: regulator
    template_id: generic-buck-5v-3v3-module
    role: "TPS54302 3A Sync Buck Regulator + L1 4.7uH + C1 10uF"
    voltage_v: 3.3
    max_output_ma: 3000
    draw_ma: 30
    tolerance: HIGH_VOLTAGE_POWER
    builtin_pullups: false
    bootstrap_notes: "SW node loop minimized; L1 & C1 decoupled near VIN"
    mounting_footprint: "Package_TO_SOT_SMD:SOT-23-6"
    step_model_ref: ""
    kicad_sheet_uuid: "01950000-0000-7000-8000-000000000002"
    member_refdes: [U2, L1, C1]
    x: 340
    y: 160
  - id: blk-mcu
    name: "MCU & PD Controller"
    kind: mcu
    template_id: stm32g4-core
    role: "STM32/CH224K Control Core (3.3V logic)"
    voltage_v: 3.3
    max_output_ma: 150
    draw_ma: 180
    tolerance: 3.3V_NON_5V_TOLERANT
    builtin_pullups: false
    bootstrap_notes: "NRST pulled high via R3; SWD exposed on header"
    mounting_footprint: "Package_SO:SOIC-16_3.9x9.9mm_P1.27mm"
    step_model_ref: ""
    kicad_sheet_uuid: "01950000-0000-7000-8000-000000000003"
    member_refdes: [U1, R3]
    x: 660
    y: 160
buses:
  - id: bus-vbus-12v
    source: blk-power-in
    target: blk-sync-buck
    protocol: PowerRail
    rail_voltage_v: 12
    expected_ma: 1200
    net_names: [VBUS_12V, +12V]
  - id: bus-3v3-mcu
    source: blk-sync-buck
    target: blk-mcu
    protocol: PowerRail
    rail_voltage_v: 3.3
    expected_ma: 180
    net_names: [+3.3V, +3V3_OUT]
'''

_STARTER_PINS_H = '''/* Vajra-Dhir EDA — golden-buck-mcu Firmware Pinmux */
#pragma once
#define U1_NRST_PIN     "NRST"
#define U2_BUCK_EN_PIN  "PA2"
#define J1_VBUS_NET     "+12V"
#define L1_SWITCH_NET   "SW"
#define C1_BULK_REF     "C1"
'''


def ensure_ide_starter_files(root: pathlib.Path) -> pathlib.Path:
    root = pathlib.Path(root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    defaults = {
        root / "elec" / "src" / "main.ato": _STARTER_ATO,
        root / "firmware" / "board_pins.h": _STARTER_PINS_H,
        root / "system.yaml": _STARTER_SYSTEM_YAML,
    }
    for fp, body in defaults.items():
        if not fp.exists():
            fp.parent.mkdir(parents=True, exist_ok=True)
            fp.write_text(body, encoding="utf-8")
    return root


def _send_json(handler: Any, status: int, body: Dict[str, Any]) -> None:
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler._send_cors()
    handler.end_headers()
    handler.wfile.write(json.dumps(body).encode("utf-8"))


def _parse_query(full_path: str) -> Dict[str, str]:
    if "?" not in full_path:
        return {}
    _, qs = full_path.split("?", 1)
    parsed = urllib.parse.parse_qs(qs)
    return {k: v[0] for k, v in parsed.items() if v}


def _safe_resolve_under_root(root: pathlib.Path, rel_path: str) -> pathlib.Path:
    cleaned = urllib.parse.unquote(rel_path or "").replace("\\", "/").strip()
    if not cleaned or "\x00" in cleaned or cleaned.startswith("/") or ":" in cleaned.split("/")[0]:
        raise PermissionError("PATH_TRAVERSAL_BLOCKED")
    parts = [p for p in cleaned.split("/") if p]
    if any(p in ("..", ".") for p in parts):
        raise PermissionError("PATH_TRAVERSAL_BLOCKED")
    root_res = root.resolve()
    target = (root_res / "/".join(parts)).resolve()
    if not target.is_relative_to(root_res):
        raise PermissionError("PATH_TRAVERSAL_BLOCKED")
    return target


def mint_pty_token(cwd: pathlib.Path) -> Dict[str, Any]:
    token = secrets.token_urlsafe(24)
    expires = time.time() + 3600.0
    with _TOKEN_LOCK:
        # Prune expired
        now = time.time()
        dead = [k for k, v in _PTY_TOKENS.items() if float(v["expires_at"]) < now]
        for d in dead:
            _PTY_TOKENS.pop(d, None)
        _PTY_TOKENS[token] = {"cwd": str(cwd.resolve()), "expires_at": expires}
    return {"token": token, "cwd": str(cwd.resolve()), "expires_in_sec": 3600}


def validate_pty_token(token: str) -> Optional[pathlib.Path]:
    if not token:
        return None
    with _TOKEN_LOCK:
        meta = _PTY_TOKENS.get(token)
        if not meta or float(meta["expires_at"]) < time.time():
            return None
        return pathlib.Path(str(meta["cwd"])).resolve()


def _atomic_write_utf8(target: pathlib.Path, content: str) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=".vd_edit_", dir=str(target.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_name, target)
    except Exception:
        if os.path.exists(tmp_name):
            os.remove(tmp_name)
        raise


def handle_fs_pty_get(handler: Any, path: str, full_path: str = "", con: Optional[sqlite3.Connection] = None) -> bool:
    if path in ("/api/v1/fs/tree", "/api/fs/tree"):
        root = ensure_ide_starter_files(_ensure_active_workspace())
        entries: List[Dict[str, Any]] = []
        skip_dirs = {".git", "node_modules", "__pycache__", ".vd-dev"}
        for p in sorted(root.rglob("*")):
            if any(part in skip_dirs for part in p.relative_to(root).parts):
                continue
            rel = p.relative_to(root).as_posix()
            if p.is_file():
                entries.append({
                    "path": rel,
                    "name": p.name,
                    "kind": "file",
                    "size_bytes": p.stat().st_size,
                })
        _send_json(handler, 200, {"root_dir": str(root), "entries": entries})
        return True

    if path in ("/api/v1/fs/read", "/api/fs/read"):
        q = _parse_query(full_path or getattr(handler, "path", path))
        root = ensure_ide_starter_files(_ensure_active_workspace())
        try:
            target = _safe_resolve_under_root(root, q.get("path", ""))
        except PermissionError:
            _send_json(handler, 403, {"error": "PATH_TRAVERSAL_BLOCKED"})
            return True
        if not target.is_file():
            _send_json(handler, 404, {"error": "FILE_NOT_FOUND", "path": q.get("path", "")})
            return True
        txt = target.read_text(encoding="utf-8", errors="replace")
        _send_json(handler, 200, {
            "path": target.relative_to(root).as_posix(),
            "content": txt,
            "sha256": sha256_text(txt),
            "size_bytes": len(txt.encode("utf-8")),
        })
        return True

    if path in ("/api/v1/pty/session", "/api/pty/session"):
        root = ensure_ide_starter_files(_ensure_active_workspace())
        _send_json(handler, 200, mint_pty_token(root))
        return True

    return False


def handle_fs_pty_post(handler: Any, path: str, req: Dict[str, Any], con: Optional[sqlite3.Connection] = None) -> bool:
    if path in ("/api/v1/fs/write", "/api/fs/write"):
        root = ensure_ide_starter_files(_ensure_active_workspace())
        rel = str(req.get("path", ""))
        content = str(req.get("content", ""))
        try:
            target = _safe_resolve_under_root(root, rel)
        except PermissionError:
            _send_json(handler, 403, {"error": "PATH_TRAVERSAL_BLOCKED", "path": rel})
            return True
        _atomic_write_utf8(target, content)
        if target.suffix.lower() in (".kicad_pcb", ".kicad_sch"):
            try:
                poll_external_changes(con)
            except Exception:
                pass
        _send_json(handler, 200, {
            "saved": True,
            "path": target.relative_to(root).as_posix(),
            "sha256": sha256_text(content),
            "size_bytes": len(content.encode("utf-8")),
        })
        return True

    if path in ("/api/v1/pty/session", "/api/pty/session"):
        root = ensure_ide_starter_files(_ensure_active_workspace())
        _send_json(handler, 200, mint_pty_token(root))
        return True

    return False


def _ws_encode_frame(payload: bytes, opcode: int = 0x1) -> bytes:
    length = len(payload)
    header = bytearray([0x80 | opcode])
    if length < 126:
        header.append(length)
    elif length < 65536:
        header.append(126)
        import struct
        header.extend(struct.pack("!H", length))
    else:
        header.append(127)
        import struct
        header.extend(struct.pack("!Q", length))
    return bytes(header) + payload


def handle_ws_pty(handler: Any, full_path: str) -> None:
    import base64
    import hashlib
    import struct

    q = _parse_query(full_path)
    cwd = validate_pty_token(q.get("token", ""))
    if cwd is None:
        _send_json(handler, 403, {"error": "PTY_TOKEN_INVALID"})
        return

    ws_key = handler.headers.get("Sec-WebSocket-Key")
    if not ws_key:
        handler.send_response(400)
        handler._send_cors()
        handler.end_headers()
        handler.wfile.write(b"Missing Sec-WebSocket-Key")
        return

    accept_raw = hashlib.sha1((ws_key.strip() + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode("utf-8")).digest()
    accept_b64 = base64.b64encode(accept_raw).decode("ascii")
    handler.send_response(101, "Switching Protocols")
    handler.send_header("Upgrade", "websocket")
    handler.send_header("Connection", "Upgrade")
    handler.send_header("Sec-WebSocket-Accept", accept_b64)
    handler.end_headers()

    sock = handler.connection
    pty_proc = WorkspacePty(cwd=cwd, cols=int(q.get("cols", 100)), rows=int(q.get("rows", 30)))
    stop_ev = threading.Event()

    def _pump_pty_to_ws() -> None:
        try:
            while not stop_ev.is_set() and not pty_proc.closed:
                data = pty_proc.read(4096)
                if not data:
                    break
                # Encode valid UTF-8 for xterm.js text frames
                txt = data.decode("utf-8", errors="replace").encode("utf-8")
                sock.sendall(_ws_encode_frame(txt, 0x1))
        except Exception:
            pass

    reader = threading.Thread(target=_pump_pty_to_ws, daemon=True)
    reader.start()

    try:
        sock.settimeout(30.0)
        while not stop_ev.is_set():
            try:
                hdr = sock.recv(2)
                if not hdr or len(hdr) < 2:
                    break
                opcode = hdr[0] & 0x0F
                if opcode == 0x8:
                    break
                masked = bool(hdr[1] & 0x80)
                plen = hdr[1] & 0x7F
                if plen == 126:
                    plen = struct.unpack("!H", sock.recv(2))[0]
                elif plen == 127:
                    plen = struct.unpack("!Q", sock.recv(8))[0]
                mask_key = sock.recv(4) if masked else b""
                payload = bytearray()
                while len(payload) < plen:
                    chunk = sock.recv(plen - len(payload))
                    if not chunk:
                        break
                    payload.extend(chunk)
                if masked and len(mask_key) == 4:
                    payload = bytearray(b ^ mask_key[i % 4] for i, b in enumerate(payload))
                if opcode == 0x9:
                    sock.sendall(_ws_encode_frame(bytes(payload), 0xA))
                    continue
                if opcode in (0x1, 0x2):
                    raw_bytes = bytes(payload)
                    if raw_bytes.startswith(b'{"type":"resize"') or raw_bytes.startswith(b'{"type": "resize"'):
                        try:
                            ctl = json.loads(raw_bytes.decode("utf-8"))
                            pty_proc.resize(ctl.get("cols", 100), ctl.get("rows", 30))
                            continue
                        except Exception:
                            pass
                    pty_proc.write(raw_bytes)
            except TimeoutError:
                continue
    except Exception:
        pass
    finally:
        stop_ev.set()
        pty_proc.close()
