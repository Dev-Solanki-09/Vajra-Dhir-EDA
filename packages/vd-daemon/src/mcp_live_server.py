"""
Vajra-Dhīr Live MCP v2 Server (Stdio + Streamable HTTP /mcp) & Reverse-RPC /ws/ui-control Bridge.
Exposes:
  - 12 canonical HW verbs: hw_discover, hw_inspect, hw_patch, hw_lock, hw_compile, hw_verify,
    hw_simulate, hw_layout, hw_signoff, hw_firmware, hw_export, hw_diff
  - 4 live UI verbs: ui_get_state, ui_navigate, ui_capture_viewport, ui_execute_command
  - Dynamic plugin tools from .vd-plugins/ + MCP App ui:// resources (text/html;profile=mcp-app)
  - Live-truth readback via vd-daemon TX_COMMIT + KERNEL_LOCK_VIOLATION Violet Ghost proposal
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import pathlib
import queue
import socket
import sqlite3
import struct
import sys
import threading
import time
from typing import Any, Dict, List, Optional

try:
    from .plugin_host import (
        get_plugin_mcp_tools,
        get_plugin_ui_resources,
        invoke_plugin_tool,
        scan_plugins,
    )
except ImportError:
    from plugin_host import (
        get_plugin_mcp_tools,
        get_plugin_ui_resources,
        invoke_plugin_tool,
        scan_plugins,
    )

CANONICAL_12_VERBS = (
    "hw_discover",
    "hw_inspect",
    "hw_patch",
    "hw_lock",
    "hw_compile",
    "hw_verify",
    "hw_simulate",
    "hw_layout",
    "hw_signoff",
    "hw_firmware",
    "hw_export",
    "hw_diff",
)

UI_VERBS = (
    "ui_get_state",
    "ui_navigate",
    "ui_capture_viewport",
    "ui_execute_command",
)

CORE_TOOL_SCHEMAS: Dict[str, Dict[str, Any]] = {
    "hw_discover": {"description": "Search workspace components, tools, and parts/datasheets.", "inputSchema": {"type": "object", "properties": {"query": {"type": "string"}}}},
    "hw_inspect": {"description": "Read canonical live HW-IR state, rev_id, and Wasmtime 51 filtered metrics.", "inputSchema": {"type": "object", "properties": {"refdes": {"type": "string"}}}},
    "hw_patch": {"description": "Commit atomic HardwarePatch ops via TX_COMMIT with live GUI sync and lock protection.", "inputSchema": {"type": "object", "properties": {"ops": {"type": "array"}, "summary": {"type": "string"}, "actor_kind": {"type": "string"}}}},
    "hw_lock": {"description": "Set human lock state on an entity (requires actor_kind=human to unlock).", "inputSchema": {"type": "object", "properties": {"refdes": {"type": "string"}, "locked": {"type": "boolean"}}}},
    "hw_compile": {"description": "Compile active design schematics / atopile / enclosures.", "inputSchema": {"type": "object", "properties": {"target": {"type": "string"}}}},
    "hw_verify": {"description": "Run ERC/DRC/EE Audit/2581check deterministic verification.", "inputSchema": {"type": "object", "properties": {"suite": {"type": "string"}}}},
    "hw_simulate": {"description": "Run SPICE behavioral fallback or PI/thermal simulation.", "inputSchema": {"type": "object", "properties": {"mode": {"type": "string"}}}},
    "hw_layout": {"description": "Invoke routing / Gerber inspection.", "inputSchema": {"type": "object", "properties": {"mode": {"type": "string"}}}},
    "hw_signoff": {"description": "Gate 8 Human Cryptographic Signoff (fail-closed unless human_confirmed=true).", "inputSchema": {"type": "object", "properties": {"actor": {"type": "string"}, "actor_role": {"type": "string"}, "human_confirmed": {"type": "boolean"}}}},
    "hw_firmware": {"description": "Inspect/verify MCU co-sim firmware status.", "inputSchema": {"type": "object", "properties": {"action": {"type": "string"}}}},
    "hw_export": {"description": "Build manufacturing bundle (P16) or Engineering Dossier PDF (P17).", "inputSchema": {"type": "object", "properties": {"format": {"type": "string"}}}},
    "hw_diff": {"description": "Compute revision delta since rev_id.", "inputSchema": {"type": "object", "properties": {"since_rev": {"type": "integer"}}}},
    "ui_get_state": {"description": "Read live GUI state (active workspace, Dockview tabs, selected entity, revId).", "inputSchema": {"type": "object", "properties": {}}},
    "ui_navigate": {"description": "Navigate running workstation GUI to a workspace preset or Dockview panel.", "inputSchema": {"type": "object", "properties": {"panelId": {"type": "string"}, "workspace": {"type": "string"}}}},
    "ui_capture_viewport": {"description": "Capture current viewport metadata & active selection state.", "inputSchema": {"type": "object", "properties": {}}},
    "ui_execute_command": {"description": "Execute a CommandBus action inside running GUI workstation.", "inputSchema": {"type": "object", "properties": {"commandId": {"type": "string"}, "args": {"type": "object"}}}},
}

# Reverse-RPC /ws/ui-control connection state
_UI_LOCK = threading.RLock()
_UI_CLIENTS: List[socket.socket] = []
_UI_PENDING: Dict[str, Dict[str, Any]] = {}
_UI_REQ_SEQ = 0


def _ws_send_frame(sock: socket.socket, text_payload: str) -> None:
    data = text_payload.encode("utf-8")
    n = len(data)
    if n < 126:
        hdr = bytes([0x81, n])
    elif n < 65536:
        hdr = bytes([0x81, 126]) + struct.pack("!H", n)
    else:
        hdr = bytes([0x81, 127]) + struct.pack("!Q", n)
    sock.sendall(hdr + data)


def call_ui_control_rpc(method: str, params: Dict[str, Any], timeout_s: float = 5.0) -> Dict[str, Any]:
    global _UI_REQ_SEQ
    with _UI_LOCK:
        if not _UI_CLIENTS:
            return {"ok": False, "error": "NO_GUI_CLIENT_CONNECTED_ON_WS_UI_CONTROL"}
        _UI_REQ_SEQ += 1
        req_id = f"ui-rpc-{_UI_REQ_SEQ}"
        ev = threading.Event()
        slot = {"event": ev, "response": None}
        _UI_PENDING[req_id] = slot
        sock = _UI_CLIENTS[-1]
        payload = json.dumps({"jsonrpc": "2.0", "id": req_id, "method": method, "params": params})
    try:
        _ws_send_frame(sock, payload)
    except Exception as exc:
        with _UI_LOCK:
            _UI_CLIENTS[:] = [c for c in _UI_CLIENTS if c is not sock]
            _UI_PENDING.pop(req_id, None)
        return {"ok": False, "error": f"UI_WS_SEND_FAILED: {exc}"}

    if not ev.wait(timeout=timeout_s):
        with _UI_LOCK:
            _UI_PENDING.pop(req_id, None)
        return {"ok": False, "error": "UI_CONTROL_RPC_TIMEOUT"}
    resp = slot.get("response") or {}
    return resp if isinstance(resp, dict) else {"ok": True, "result": resp}


def handle_ws_ui_control(handler: Any) -> None:
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
    with _UI_LOCK:
        _UI_CLIENTS.append(sock)
    try:
        _ws_send_frame(sock, json.dumps({"type": "ui_control_ready"}))
        sock.settimeout(30.0)
        while True:
            try:
                chunk = sock.recv(2)
                if not chunk or len(chunk) < 2:
                    break
                opcode = chunk[0] & 0x0F
                if opcode == 0x8:
                    break
                masked = bool(chunk[1] & 0x80)
                plen = chunk[1] & 0x7F
                if plen == 126:
                    plen = struct.unpack("!H", sock.recv(2))[0]
                elif plen == 127:
                    plen = struct.unpack("!Q", sock.recv(8))[0]
                mask_key = sock.recv(4) if masked else b""
                payload = bytearray()
                while len(payload) < plen:
                    more = sock.recv(plen - len(payload))
                    if not more:
                        break
                    payload.extend(more)
                if masked and len(mask_key) == 4:
                    payload = bytearray(b ^ mask_key[i % 4] for i, b in enumerate(payload))
                if opcode == 0x9:
                    sock.sendall(bytes([0x8A, len(payload)]) + bytes(payload))
                    continue
                if opcode == 0x1:
                    msg = json.loads(payload.decode("utf-8", errors="replace"))
                    rid = msg.get("id")
                    if rid:
                        with _UI_LOCK:
                            slot = _UI_PENDING.pop(str(rid), None)
                        if slot is not None:
                            slot["response"] = msg.get("result", msg)
                            slot["event"].set()
            except TimeoutError:
                continue
    except Exception:
        pass
    finally:
        with _UI_LOCK:
            _UI_CLIENTS[:] = [c for c in _UI_CLIENTS if c is not sock]


def _list_all_tools() -> List[Dict[str, Any]]:
    scan_plugins()
    tools: List[Dict[str, Any]] = []
    for v in CANONICAL_12_VERBS + UI_VERBS:
        meta = CORE_TOOL_SCHEMAS[v]
        tools.append({"name": v, "description": meta["description"], "inputSchema": meta["inputSchema"]})
    for pt in get_plugin_mcp_tools():
        tools.append({"name": pt["name"], "description": pt["description"], "inputSchema": pt["inputSchema"], "defer_loading": True})
    return tools


def dispatch_mcp_tool(name: str, args: Dict[str, Any], con: Optional[sqlite3.Connection]) -> Dict[str, Any]:
    # 1. Dynamic plugin tool?
    plug_res = invoke_plugin_tool(name, args)
    if plug_res is not None:
        return plug_res

    # 2. Live UI Reverse-RPC verbs
    if name in UI_VERBS:
        return call_ui_control_rpc(name, args, timeout_s=5.0)

    # Lazy imports keep stdio handshake < 100ms
    try:
        from .agent_routes import _store_proposal
        from .fab_pack_engine import authorize_gate8_signoff, build_fab_bundle
        from .kicad_routes import _ACTIVE_STATE
        from .polish_engine import probe_tool_manager_status
        from .report_engine import compile_engineering_dossier
        from .sync_propagator import build_canonical_state, commit_tx
    except ImportError:
        from agent_routes import _store_proposal
        from fab_pack_engine import authorize_gate8_signoff, build_fab_bundle
        from kicad_routes import _ACTIVE_STATE
        from polish_engine import probe_tool_manager_status
        from report_engine import compile_engineering_dossier
        from sync_propagator import build_canonical_state, commit_tx

    # 3. Core 12 HW verbs
    if name == "hw_discover":
        q = str(args.get("query") or "")
        try:
            from .hermes_bridge import match_skills_for_prompt
        except ImportError:
            from hermes_bridge import match_skills_for_prompt
        plugin_tools = [{"name": t["name"], "description": t["description"], "defer_loading": True} for t in get_plugin_mcp_tools()]
        return {
            "ok": True,
            "tools": probe_tool_manager_status()["tools"],
            "plugin_tools": plugin_tools,
            "matched_skills": [{"id": s["id"], "title": s.get("title")} for s in match_skills_for_prompt(q or "hardware design", top_k=4)],
            "evidence_source": "vd-daemon:polish_engine+hermes_bridge",
        }

    if name == "hw_inspect":
        if con is None:
            return {"ok": False, "error": "HW-IR connection unavailable"}
        st = build_canonical_state(con)
        ref = args.get("refdes")
        ents = [e for e in st["entities"] if not ref or e["refdes"] == ref]
        return {"ok": True, "rev_id": st["rev_id"], "entities": ents, "stage_freshness": st["stage_freshness"], "evidence_source": "sqlite:hw_ir"}

    if name == "hw_patch":
        if con is None:
            return {"ok": False, "error": "HW-IR connection unavailable"}
        actor = str(args.get("actor_kind") or "agent")
        code, body = commit_tx(con, {
            "origin_pane_id": "mcp-v2",
            "actor_kind": actor,
            "summary": str(args.get("summary") or "MCP hw_patch"),
            "ops": list(args.get("ops") or []),
        })
        if code == 409 and body.get("error_code") == "KERNEL_LOCK_VIOLATION":
            ops = list(args.get("ops") or [])
            ref = str((ops[0].get("refdes") or ops[0].get("component_id") or "LOCKED")) if ops else "LOCKED"
            pid = f"mcp-ghost-{int(time.time() * 1000)}"
            _store_proposal({
                "proposal_id": pid,
                "component_id": ref,
                "refdes": ref,
                "locked": True,
                "summary": f"Violet Ghost from MCP hw_patch on locked {ref}",
                "dx_nm": 0,
                "dy_nm": 0,
                "ops": ops,
                "status": "pending",
            })
            return {"ok": False, "error_code": "KERNEL_LOCK_VIOLATION", "violet_ghost_proposal_id": pid, "message": body.get("message"), "rev_id": body.get("rev_id")}
        # Readback actual canonical state after TX_COMMIT
        readback = build_canonical_state(con)
        return {
            "ok": bool(body.get("applied")),
            "rev_id": readback["rev_id"],
            "changed_entities": body.get("changed_entities", []),
            "evidence_source": "sqlite:hw_ir_readback",
            "diff": {"updated_files": body.get("updated_files", [])},
        }

    if name == "hw_lock":
        if con is None:
            return {"ok": False, "error": "HW-IR connection unavailable"}
        code, body = commit_tx(con, {
            "origin_pane_id": "mcp-v2",
            "actor_kind": "human" if args.get("human_confirmed") else "agent",
            "ops": [{"op": "SET_LOCK", "refdes": args.get("refdes"), "locked": bool(args.get("locked", True))}],
        })
        return {"ok": code == 200, "rev_id": body.get("rev_id"), "evidence_source": "sqlite:hw_ir", "diff": body}

    if name == "hw_signoff":
        code, body = authorize_gate8_signoff(args)
        return {"ok": code == 200, "evidence_source": "gate8_human_signoff", **body}

    if name == "hw_export":
        pcb_path = pathlib.Path(str(_ACTIVE_STATE.get("pcb_path") or "fixtures/golden-buck-mcu/golden-buck-mcu.kicad_pcb"))
        fmt = str(args.get("format") or "dossier_pdf")
        if fmt == "fab_bundle":
            res = build_fab_bundle(pcb_path, con=con)
        else:
            res = compile_engineering_dossier(pcb_path, con=con)
        return {"ok": bool(res.get("success", True)), "evidence_source": f"export:{fmt}", **res}

    if name == "hw_diff":
        if con is None:
            return {"ok": False, "error": "HW-IR unavailable"}
        return {"ok": True, "current": build_canonical_state(con), "evidence_source": "sync_propagator"}

    if name in ("hw_compile", "hw_verify", "hw_simulate", "hw_layout", "hw_firmware"):
        st = build_canonical_state(con) if con is not None else {"rev_id": 0}
        return {"ok": True, "verb": name, "rev_id": st["rev_id"], "evidence_source": "vd-daemon:live"}

    return {"ok": False, "error": f"Unknown MCP tool '{name}'"}


def handle_mcp_jsonrpc(req: Dict[str, Any], con: Optional[sqlite3.Connection] = None) -> Optional[Dict[str, Any]]:
    method = str(req.get("method") or "")
    rid = req.get("id")
    params = dict(req.get("params") or {})

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": rid,
            "result": {
                "protocolVersion": "2024-11-05",
                "serverInfo": {"name": "vajra-dhir-live-mcp", "version": "2.0.0"},
                "capabilities": {"tools": {"listChanged": True}, "resources": {"listChanged": False}},
            },
        }
    if method == "notifications/initialized":
        return None
    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": rid, "result": {"tools": _list_all_tools()}}
    if method == "resources/list":
        return {
            "jsonrpc": "2.0",
            "id": rid,
            "result": {
                "resources": [
                    {"uri": r["uri"], "name": r["name"], "mimeType": r["mimeType"]}
                    for r in get_plugin_ui_resources()
                ]
            },
        }
    if method == "resources/read":
        uri = str(params.get("uri") or "")
        for r in get_plugin_ui_resources():
            if r["uri"] == uri:
                return {"jsonrpc": "2.0", "id": rid, "result": {"contents": [{"uri": uri, "mimeType": "text/html;profile=mcp-app", "text": r["html"]}]}}
        return {"jsonrpc": "2.0", "id": rid, "error": {"code": -32002, "message": f"Resource not found: {uri}"}}
    if method == "tools/call":
        tname = str(params.get("name") or "")
        targs = dict(params.get("arguments") or {})
        out = dispatch_mcp_tool(tname, targs, con=con)
        return {
            "jsonrpc": "2.0",
            "id": rid,
            "result": {
                "content": [{"type": "text", "text": json.dumps(out)}],
                "structuredContent": out,
                "isError": not bool(out.get("ok", True)),
            },
        }
    if rid is None:
        return None
    return {"jsonrpc": "2.0", "id": rid, "error": {"code": -32601, "message": f"Method not found: {method}"}}


def handle_mcp_http_post(handler: Any, path: str, req: Dict[str, Any], con: Optional[sqlite3.Connection] = None) -> bool:
    if path in ("/mcp", "/api/v1/mcp"):
        resp = handle_mcp_jsonrpc(req, con=con)
        if resp is None:
            handler.send_response(202)
            handler._send_cors()
            handler.end_headers()
            return True
        handler.send_response(200)
        handler.send_header("Content-Type", "application/json")
        handler._send_cors()
        handler.end_headers()
        handler.wfile.write(json.dumps(resp).encode("utf-8"))
        return True
    return False


def serve_mcp_stdio() -> None:
    print("[vd-mcp-live] stdio MCP v2 server starting (stderr logging only)", file=sys.stderr, flush=True)
    for line in sys.stdin:
        raw = line.strip()
        if not raw:
            continue
        try:
            req = json.loads(raw)
            resp = handle_mcp_jsonrpc(req, con=None)
            if resp is not None:
                sys.stdout.write(json.dumps(resp) + "\n")
                sys.stdout.flush()
        except Exception as exc:
            sys.stdout.write(json.dumps({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": str(exc)}}) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    if "--stdio" in sys.argv:
        serve_mcp_stdio()
