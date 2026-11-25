"""
Vajra-Dhir EDA — Additive Agent SSE Streaming & Fail-Closed Proposal Routes

Strictly loopback-enforced ($0 deterministic_offline default or 127.0.0.1 Ollama).
All mutations execute under _tx_actor_ctx = 'agent' (allow_lock_override = 0)
so SQLite triggers abort (HTTP 409 KERNEL_LOCK_VIOLATION) on human-locked rows.
"""

from __future__ import annotations

import json
import os
import pathlib
import secrets
import sqlite3
import threading
import time
import urllib.parse
import urllib.request
from typing import Callable, Mapping

ALLOWED_MCP_VERBS = frozenset({
    "hw_query",
    "hw_patch",
    "hw_lock",
    "hw_verify",
    "hw_drc",
    "hw_route",
    "hw_sim",
    "hw_search",
    "hw_export",
    "hw_cam",
    "hw_diff",
    "hw_project",
})

LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})

_PROPOSAL_LOCK = threading.Lock()
_PROPOSAL_STORE: dict[str, dict] = {}


def _uuid7() -> str:
    ms = int(time.time() * 1000) & ((1 << 48) - 1)
    rand_a = secrets.randbits(12)
    rand_b = secrets.randbits(62)
    val = (ms << 80) | (0x7 << 76) | (rand_a << 64) | (0x2 << 62) | rand_b
    h = f"{val:032x}"
    return f"{h[0:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"


def resolve_llm_provider(env: Mapping[str, str] | None = None) -> tuple[str, str | None]:
    cfg = env if env is not None else os.environ
    provider = (cfg.get("VD_LLM_PROVIDER") or "deterministic_offline").strip().lower()
    if provider == "deterministic_offline":
        return provider, None
    if provider == "ollama":
        raw_url = (cfg.get("OLLAMA_HOST") or "http://127.0.0.1:11434").strip()
        if "://" not in raw_url:
            raw_url = f"http://{raw_url}"
        parsed = urllib.parse.urlparse(raw_url)
        host = (parsed.hostname or "").lower()
        if parsed.scheme not in ("http", "https") or host not in LOOPBACK_HOSTS:
            raise ValueError(
                f"NDA_AIRGAP_VIOLATION: External LLM endpoint refused ({raw_url}); only loopback 127.0.0.1/localhost permitted"
            )
        return "ollama", f"{parsed.scheme}://{parsed.netloc}"
    raise ValueError(f"Unsupported VD_LLM_PROVIDER '{provider}'; expected deterministic_offline or ollama")


def _send_json(handler, status: int, payload: dict) -> None:
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler._send_cors()
    handler.end_headers()
    handler.wfile.write(body)


def _write_sse(handler, event_name: str, data: dict) -> None:
    chunk = f"event: {event_name}\ndata: {json.dumps(data)}\n\n".encode("utf-8")
    handler.wfile.write(chunk)
    handler.wfile.flush()


def _select_target_component(con: sqlite3.Connection, prompt: str) -> sqlite3.Row | None:
    cur = con.cursor()
    rows = cur.execute(
        "SELECT id, refdes, x_nm, y_nm, rot_mdeg, side, locked, lock_reason FROM components ORDER BY refdes"
    ).fetchall()
    if not rows:
        return None
    upper = prompt.upper()
    for row in rows:
        if str(row["refdes"]).upper() in upper:
            return row
    for row in rows:
        if int(row["locked"] or 0) == 0:
            return row
    return rows[0]


def _maybe_query_loopback_ollama(endpoint: str, prompt: str) -> str | None:
    try:
        req = urllib.request.Request(
            f"{endpoint}/api/generate",
            data=json.dumps({"model": os.environ.get("VD_OLLAMA_MODEL", "qwen2.5-coder"), "prompt": prompt, "stream": False}).encode("utf-8"),
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=2.5) as resp:
            parsed = json.loads(resp.read().decode("utf-8"))
            return str(parsed.get("response", "")).strip() or None
    except Exception:
        return None


def handle_agent_post(
    handler,
    path: str,
    req: dict,
    db_dir: pathlib.Path,
    autosave_writer: Callable[[str, list], None],
    wal_checkpointer: Callable[[sqlite3.Connection, int, bool], None],
) -> bool:
    if path in ("/api/v1/agent/chat", "/api/agent/chat"):
        prompt = str(req.get("prompt", "")).strip() or "Analyze placement spacing on SW_NODE"
        try:
            provider, ollama_endpoint = resolve_llm_provider()
        except ValueError as err:
            _send_json(handler, 403, {"error": str(err), "airgap": True})
            return True

        comp = _select_target_component(handler.con, prompt)
        if comp is None:
            _send_json(handler, 404, {"error": "No components found in HW-IR"})
            return True

        comp_id = str(comp["id"])
        refdes = str(comp["refdes"])
        locked = bool(int(comp["locked"] or 0))
        x_nm = int(comp["x_nm"])
        y_nm = int(comp["y_nm"])
        dx_nm = 1_000_000
        dy_nm = 0
        proposal_id = _uuid7()

        ops = [
            {
                "op": "MOVE_COMPONENT",
                "component_id": comp_id,
                "x_nm": x_nm + dx_nm,
                "y_nm": y_nm + dy_nm,
                "rot_mdeg": int(comp["rot_mdeg"] or 0),
                "side": str(comp["side"] or "top"),
            }
        ]

        with _PROPOSAL_LOCK:
            _PROPOSAL_STORE[proposal_id] = {
                "proposal_id": proposal_id,
                "component_id": comp_id,
                "refdes": refdes,
                "locked": locked,
                "summary": f"Translate {refdes} (+1.00 mm X) to reduce loop area",
                "dx_nm": dx_nm,
                "dy_nm": dy_nm,
                "ops": ops,
                "status": "pending",
            }

        handler.send_response(200)
        handler.send_header("Content-Type", "text/event-stream; charset=utf-8")
        handler.send_header("Cache-Control", "no-cache")
        handler._send_cors()
        handler.end_headers()

        ollama_note = _maybe_query_loopback_ollama(ollama_endpoint, prompt) if ollama_endpoint else None
        thought_msg = ollama_note or (
            f"Evaluating integer-nm clearance around {refdes} "
            f"({'LOCKED by human' if locked else 'unlocked'})."
        )
        _write_sse(handler, "thought_delta", {"text": thought_msg})

        verb = "hw_query"
        assert verb in ALLOWED_MCP_VERBS
        _write_sse(handler, "tool_call", {"verb": verb, "args": {"refdes": refdes, "component_id": comp_id}})
        _write_sse(
            handler,
            "tool_result",
            {"verb": verb, "summary": f"{refdes} at ({x_nm} nm, {y_nm} nm), locked={locked}"},
        )
        _write_sse(
            handler,
            "proposal_card",
            {
                "proposal_id": proposal_id,
                "title": f"Shift {refdes} +1.00 mm X",
                "component_id": comp_id,
                "refdes": refdes,
                "locked": locked,
                "before_x_nm": x_nm,
                "before_y_nm": y_nm,
                "after_x_nm": x_nm + dx_nm,
                "after_y_nm": y_nm + dy_nm,
                "dx_nm": dx_nm,
                "dy_nm": dy_nm,
                "ops": ops,
            },
        )
        _write_sse(handler, "done", {"provider": provider, "airgap": True})
        return True

    if path.startswith("/api/v1/agent/proposals/") or path.startswith("/api/agent/proposals/"):
        parts = [p for p in path.split("/") if p]
        if len(parts) < 5:
            _send_json(handler, 404, {"error": "Malformed proposal path"})
            return True
        action = parts[-1]
        proposal_id = parts[-2]
        with _PROPOSAL_LOCK:
            proposal = _PROPOSAL_STORE.get(proposal_id)

        if proposal is None:
            _send_json(handler, 404, {"error": f"Unknown proposal {proposal_id}"})
            return True

        if action == "reject":
            with _PROPOSAL_LOCK:
                proposal["status"] = "rejected"
            _send_json(handler, 200, {"proposal_id": proposal_id, "status": "rejected", "accepted": False})
            return True

        if action == "accept":
            cur = handler.con.cursor()
            try:
                cur.execute(
                    "UPDATE _tx_actor_ctx SET actor_kind = 'agent', allow_lock_override = 0 WHERE singleton = 1"
                )
                inv_ops = []
                for op in proposal["ops"]:
                    if op.get("op") == "MOVE_COMPONENT":
                        cid = op["component_id"]
                        old = cur.execute(
                            "SELECT x_nm, y_nm, rot_mdeg, side FROM components WHERE id = ?",
                            (cid,),
                        ).fetchone()
                        if old:
                            inv_ops.append(
                                {
                                    "op": "MOVE_COMPONENT",
                                    "component_id": cid,
                                    "x_nm": old[0],
                                    "y_nm": old[1],
                                    "rot_mdeg": old[2],
                                    "side": old[3],
                                }
                            )
                        cur.execute(
                            "UPDATE components SET x_nm = ?, y_nm = ?, rot_mdeg = ?, side = ? WHERE id = ?",
                            (op["x_nm"], op["y_nm"], op.get("rot_mdeg", 0), op.get("side", "top"), cid),
                        )

                patch_id = _uuid7()
                cur.execute("UPDATE projects SET rev_lamport = rev_lamport + 1")
                lamport_row = cur.execute("SELECT rev_lamport, id FROM projects LIMIT 1").fetchone()
                cur.execute("DELETE FROM hardware_patches WHERE project_id = ? AND undone = 1", (lamport_row[1],))
                cur.execute(
                    """
                    INSERT INTO hardware_patches
                    (patch_id, project_id, actor_kind, actor_id, lamport_ts, summary, forward_ops_json, inverse_ops_json, undone, applied_at_utc)
                    VALUES (?, ?, 'agent', 'agent-proposal', ?, ?, ?, ?, 0, '2026-11-25T00:00:00Z')
                    """,
                    (
                        patch_id,
                        lamport_row[1],
                        lamport_row[0],
                        proposal["summary"],
                        json.dumps(proposal["ops"]),
                        json.dumps(inv_ops),
                    ),
                )
                handler.con.commit()
                wal_checkpointer(handler.con, lamport_row[0], False)
                autosave_writer(str(db_dir / "board.vd.autosave.jsonl"), proposal["ops"])
                with _PROPOSAL_LOCK:
                    proposal["status"] = "accepted"
                _send_json(
                    handler,
                    200,
                    {
                        "accepted": True,
                        "proposal_id": proposal_id,
                        "patch_id": patch_id,
                        "new_lamport": lamport_row[0],
                        "status": "accepted",
                    },
                )
                return True
            except sqlite3.IntegrityError as e:
                handler.con.rollback()
                err_msg = str(e)
                code = "KERNEL_LOCK_VIOLATION" if "KERNEL_LOCK_VIOLATION" in err_msg else "DB_INTEGRITY_ERROR"
                status = 409 if code == "KERNEL_LOCK_VIOLATION" else 400
                _send_json(
                    handler,
                    status,
                    {
                        "accepted": False,
                        "proposal_id": proposal_id,
                        "error_code": code,
                        "message": err_msg,
                    },
                )
                return True

        _send_json(handler, 404, {"error": f"Unknown proposal action '{action}'"})
        return True

    return False
