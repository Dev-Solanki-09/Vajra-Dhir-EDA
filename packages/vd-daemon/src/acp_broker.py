"""
ACP (Agent Client Protocol) Stdio + HTTP JSON-RPC 2.0 Broker for Vajra-Dhīr EDA.
Supports newline-delimited JSON-RPC 2.0: initialize, session/new, session/prompt,
session/cancel, and stderr logging discipline (never pollutes stdout frames).
"""

from __future__ import annotations

import json
import sqlite3
import sys
import threading
import time
from typing import Any, Dict, Optional

_SESSION_LOCK = threading.RLock()
_SESSIONS: Dict[str, Dict[str, Any]] = {}


def handle_acp_jsonrpc(req: Dict[str, Any], con: Optional[sqlite3.Connection] = None) -> Optional[Dict[str, Any]]:
    try:
        from .acp_orchestrator import CANONICAL_12_VERBS, create_dual_checkpoint, get_dlp_policy
    except ImportError:
        from acp_orchestrator import CANONICAL_12_VERBS, create_dual_checkpoint, get_dlp_policy
    method = str(req.get("method") or "")
    rid = req.get("id")
    params = dict(req.get("params") or {})

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": rid,
            "result": {
                "protocolVersion": "1.0",
                "agentInfo": {"name": "vajra-dhir-acp-broker", "version": "0.1.0"},
                "capabilities": {"prompts": True, "cancellable": True, "mcpTools": len(CANONICAL_12_VERBS)},
                "dlpPolicy": get_dlp_policy(),
            },
        }

    if method == "session/new":
        sid = f"acp-sess-{int(time.time() * 1000) % 10_000_000}"
        ckpt = create_dual_checkpoint(con, label=f"acp-{sid}") if con is not None else None
        with _SESSION_LOCK:
            _SESSIONS[sid] = {"sessionId": sid, "cancelled": False, "checkpoint": ckpt, "history": []}
        return {"jsonrpc": "2.0", "id": rid, "result": {"sessionId": sid, "checkpoint": ckpt}}

    if method == "session/cancel":
        sid = str(params.get("sessionId") or "")
        with _SESSION_LOCK:
            if sid in _SESSIONS:
                _SESSIONS[sid]["cancelled"] = True
        return {"jsonrpc": "2.0", "id": rid, "result": {"cancelled": True, "sessionId": sid}}

    if method == "session/prompt":
        sid = str(params.get("sessionId") or "")
        prompt = str(params.get("prompt") or "")
        with _SESSION_LOCK:
            sess = _SESSIONS.get(sid)
            if sess is None:
                return {"jsonrpc": "2.0", "id": rid, "error": {"code": -32001, "message": f"Unknown session {sid}"}}
            if sess.get("cancelled"):
                return {"jsonrpc": "2.0", "id": rid, "result": {"stopReason": "cancelled", "sessionId": sid}}
            sess["history"].append(prompt)
        return {
            "jsonrpc": "2.0",
            "id": rid,
            "result": {
                "stopReason": "end_turn",
                "sessionId": sid,
                "updates": [
                    {"sessionUpdate": "thought_chunk", "text": f"ACP offline evaluation: {prompt}"},
                    {"sessionUpdate": "tool_call", "tool": "hw_inspect", "status": "completed"},
                ],
                "gate8RequiredForSignoff": True,
            },
        }

    if rid is None:
        return None
    return {"jsonrpc": "2.0", "id": rid, "error": {"code": -32601, "message": f"Method not found: {method}"}}


def handle_acp_http_post(handler: Any, path: str, req: Dict[str, Any], con: Optional[sqlite3.Connection] = None) -> bool:
    if path in ("/api/v1/acp/rpc", "/api/v1/acp"):
        resp = handle_acp_jsonrpc(req, con=con)
        handler.send_response(200)
        handler.send_header("Content-Type", "application/json")
        handler._send_cors()
        handler.end_headers()
        handler.wfile.write(json.dumps(resp or {"ok": True}).encode("utf-8"))
        return True
    return False


def serve_acp_stdio() -> None:
    print("[acp-broker] listening on stdio (logs to stderr only)", file=sys.stderr, flush=True)
    for line in sys.stdin:
        raw = line.strip()
        if not raw:
            continue
        try:
            req = json.loads(raw)
            resp = handle_acp_jsonrpc(req, con=None)
            if resp is not None:
                sys.stdout.write(json.dumps(resp) + "\n")
                sys.stdout.flush()
        except Exception as exc:
            sys.stdout.write(json.dumps({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": str(exc)}}) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    serve_acp_stdio()
