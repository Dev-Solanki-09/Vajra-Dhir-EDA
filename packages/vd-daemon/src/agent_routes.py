"""
Vajra-Dhir EDA — Additive Agent SSE Streaming & Fail-Closed Proposal Routes

Strictly loopback-enforced ($0 deterministic_offline default or 127.0.0.1 Ollama).
All mutations execute under _tx_actor_ctx = 'agent' (allow_lock_override = 0)
so SQLite triggers abort (HTTP 409 KERNEL_LOCK_VIOLATION) on human-locked rows.
"""

from __future__ import annotations

from collections import OrderedDict
from datetime import datetime, timezone
import json
import os
import pathlib
import re
import secrets
import sqlite3
import threading
import time
import urllib.parse
import urllib.request
from typing import Callable, Mapping

try:
    from .acp_orchestrator import (
        CANONICAL_12_VERBS,
        create_dual_checkpoint,
        get_dlp_policy,
        rewind_dual_checkpoint,
        run_autonomous_ee_loop,
        set_dlp_policy,
    )
    from .agent import (
        HermesRuntime,
        PROVIDER_CATALOG,
        clear_provider_secret,
        get_provider_secret_status,
        get_session_budget_status,
        set_provider_secret,
        test_provider_connection,
    )
    from .kicad_routes import _ACTIVE_STATE
except ImportError:
    from acp_orchestrator import (
        CANONICAL_12_VERBS,
        create_dual_checkpoint,
        get_dlp_policy,
        rewind_dual_checkpoint,
        run_autonomous_ee_loop,
        set_dlp_policy,
    )
    from agent import (
        HermesRuntime,
        PROVIDER_CATALOG,
        clear_provider_secret,
        get_provider_secret_status,
        get_session_budget_status,
        set_provider_secret,
        test_provider_connection,
    )
    from kicad_routes import _ACTIVE_STATE

_HERMES_RUNTIME = HermesRuntime(pathlib.Path(__file__).resolve().parents[3])
APPROVAL_PATH_RE = re.compile(r"^/api(?:/v1)?/agent/approvals/([0-9a-zA-Z_-]{6,64})/(accept|reject)$")

ALLOWED_MCP_VERBS = frozenset(CANONICAL_12_VERBS)

LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})
PROPOSAL_PATH_RE = re.compile(r"^/api(?:/v1)?/agent/proposals/([0-9a-fA-F-]{8,64})/(accept|reject)$")
MAX_PROPOSALS = 256

_PROPOSAL_LOCK = threading.Lock()
_PROPOSAL_STORE: OrderedDict[str, dict] = OrderedDict()


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError(f"NDA_AIRGAP_VIOLATION: Refused HTTP {code} redirect to {newurl}")


_NO_REDIRECT_OPENER = urllib.request.build_opener(_NoRedirectHandler())


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
        with _NO_REDIRECT_OPENER.open(req, timeout=2.5) as resp:
            parsed = json.loads(resp.read().decode("utf-8"))
            return str(parsed.get("response", "")).strip() or None
    except Exception:
        return None


def _store_proposal(proposal: dict) -> None:
    with _PROPOSAL_LOCK:
        _PROPOSAL_STORE[proposal["proposal_id"]] = proposal
        while len(_PROPOSAL_STORE) > MAX_PROPOSALS:
            _PROPOSAL_STORE.popitem(last=False)


def handle_agent_get(handler, path: str, full_path: str = "", con: sqlite3.Connection | None = None) -> bool:
    if path in ("/api/v1/agent/policy", "/api/agent/policy"):
        pol = get_dlp_policy()
        pol["canonical_verbs"] = list(CANONICAL_12_VERBS)
        pol["agent_settings"] = dict(_HERMES_RUNTIME.agent_settings)
        _send_json(handler, 200, pol)
        return True
    if path == "/api/v1/agent/providers":
        ids = [p["id"] for p in PROVIDER_CATALOG if p.get("requires_key")]
        _send_json(handler, 200, {
            "providers": PROVIDER_CATALOG,
            "vault_status": get_provider_secret_status(ids),
            "settings": dict(_HERMES_RUNTIME.agent_settings),
            "dlp": get_dlp_policy(),
            "budget": get_session_budget_status(),
        })
        return True
    if path == "/api/v1/agent/budget":
        _send_json(handler, 200, get_session_budget_status())
        return True
    if path == "/api/v1/agent/skills":
        qs = urllib.parse.parse_qs(urllib.parse.urlparse(full_path or path).query)
        sid = (qs.get("id") or [""])[0].strip()
        if sid:
            loaded = _HERMES_RUNTIME.get_skill(sid)
            _send_json(handler, 200 if loaded else 404, {"skill": loaded} if loaded else {"error": "SKILL_NOT_FOUND"})
            return True
        _send_json(handler, 200, {
            "skills": _HERMES_RUNTIME.list_skills(),
            "skills_write_approval": _HERMES_RUNTIME.agent_settings.get("skills_write_approval", True),
        })
        return True
    if path == "/api/v1/agent/memory":
        qs = urllib.parse.parse_qs(urllib.parse.urlparse(full_path or path).query)
        q = (qs.get("q") or [""])[0]
        _send_json(handler, 200, {
            "entries": _HERMES_RUNTIME.list_memory(query=q),
            "memory_write_approval": _HERMES_RUNTIME.agent_settings.get("memory_write_approval", True),
            "pending_approvals": [v for v in _HERMES_RUNTIME.pending_approvals.values() if v.get("status") == "pending"],
        })
        return True
    if path == "/api/v1/agent/plan":
        _send_json(handler, 200, {"stages": _HERMES_RUNTIME.active_plan})
        return True
    return False


def handle_agent_post(
    handler,
    path: str,
    req: dict,
    db_dir: pathlib.Path,
    autosave_writer: Callable[[str, list], None],
    wal_checkpointer: Callable[[sqlite3.Connection, int, bool], None],
) -> bool:
    if path in ("/api/v1/agent/policy", "/api/agent/policy"):
        pol = set_dlp_policy(tier=req.get("tier"), mode=req.get("mode"))
        _send_json(handler, 200, pol)
        return True

    if path == "/api/v1/agent/settings":
        for k in ("provider", "model", "base_url"):
            if k in req and req[k] is not None:
                _HERMES_RUNTIME.agent_settings[k] = str(req[k]).strip()
        for k in ("memory_write_approval", "skills_write_approval"):
            if k in req:
                _HERMES_RUNTIME.agent_settings[k] = bool(req[k])
        _send_json(handler, 200, {"ok": True, "settings": dict(_HERMES_RUNTIME.agent_settings)})
        return True

    if path == "/api/v1/agent/vault":
        prov = str(req.get("provider") or "").strip().lower()
        if not prov:
            _send_json(handler, 400, {"error": "Missing provider"})
            return True
        if req.get("clear"):
            _send_json(handler, 200, clear_provider_secret(prov))
            return True
        res = set_provider_secret(prov, str(req.get("api_key") or ""))
        _send_json(handler, 200, res)
        return True

    if path == "/api/v1/agent/test-connection":
        pol = get_dlp_policy()
        dlp_tier = str(req.get("dlp_tier") or pol.get("tier") or "NDA_AIRGAPPED")
        res = test_provider_connection(
            provider=str(req.get("provider") or _HERMES_RUNTIME.agent_settings.get("provider") or "deterministic_offline"),
            model=str(req.get("model") or _HERMES_RUNTIME.agent_settings.get("model") or ""),
            base_url=str(req.get("base_url") or _HERMES_RUNTIME.agent_settings.get("base_url") or ""),
            api_key=req.get("api_key"),
            dlp_tier=dlp_tier,
        )
        code = 403 if res.get("error_code") == "NDA_AIRGAP_VIOLATION" else (200 if res.get("ok") else 400)
        _send_json(handler, code, res)
        return True

    if path == "/api/v1/agent/audit":
        _send_json(handler, 200, _HERMES_RUNTIME.run_dual_context_auditor(handler.con))
        return True

    if path == "/api/v1/agent/memory":
        res = _HERMES_RUNTIME.propose_memory_write(
            layer=str(req.get("layer") or "ee_lessons"),
            title=str(req.get("title") or "Engineering Decision"),
            content=str(req.get("content") or ""),
            project_id=str(req.get("project_id") or "default"),
            force_approve=bool(req.get("approved", False)),
        )
        _send_json(handler, 200, res)
        return True

    if path == "/api/v1/agent/skills":
        res = _HERMES_RUNTIME.propose_skill_write(req, force_approve=bool(req.get("approved", False)))
        _send_json(handler, 200, res)
        return True

    if path == "/api/v1/agent/plan/stage":
        stages = _HERMES_RUNTIME.update_plan_stage(str(req.get("stage_id") or ""), str(req.get("status") or "done"))
        _send_json(handler, 200, {"ok": True, "stages": stages})
        return True

    app_match = APPROVAL_PATH_RE.match(path)
    if app_match:
        aid, action = app_match.group(1), app_match.group(2)
        res = _HERMES_RUNTIME.resolve_approval(aid, accept=(action == "accept"))
        _send_json(handler, 200 if res.get("ok") else 404, res)
        return True

    if path in ("/api/v1/agent/checkpoint", "/api/agent/checkpoint"):
        res = create_dual_checkpoint(handler.con, label=str(req.get("label") or "manual"))
        _send_json(handler, 200, res)
        return True

    if path in ("/api/v1/agent/rewind", "/api/agent/rewind"):
        res = rewind_dual_checkpoint(handler.con, checkpoint_id=req.get("checkpoint_id"))
        _send_json(handler, 200 if res.get("success") else 404, res)
        return True

    if path in ("/api/v1/agent/autonomous", "/api/agent/autonomous"):
        res = run_autonomous_ee_loop(handler.con, req, _PROPOSAL_STORE)
        code = int(res.pop("_http_status", 200 if res.get("success") else 400))
        _send_json(handler, code, res)
        return True

    if path in ("/api/v1/agent/chat", "/api/agent/chat"):
        pol = get_dlp_policy()
        if pol.get("mode") == "OFF" and not req.get("allow_in_off_mode"):
            _send_json(handler, 409, {"error_code": "AGENT_MODE_OFF", "error": "Agent dock is set to manual OFF mode."})
            return True
        prompt = str(req.get("prompt", "")).strip() or "Analyze placement spacing on SW_NODE"
        if prompt.lower().startswith("/rollback"):
            rw = rewind_dual_checkpoint(handler.con)
            handler.send_response(200)
            handler.send_header("Content-Type", "text/event-stream; charset=utf-8")
            handler.send_header("Cache-Control", "no-cache")
            handler._send_cors()
            handler.end_headers()
            _write_sse(handler, "thought_delta", {"text": f"Rolled back workspace to checkpoint {rw.get('rewound_to', 'latest')}." if rw.get("success") else str(rw.get("error") or "No checkpoint available")})
            _write_sse(handler, "done", {"provider": "rollback", "airgap": True})
            return True

        try:
            provider, ollama_endpoint = resolve_llm_provider()
        except ValueError as err:
            _send_json(handler, 403, {"error": str(err), "error_code": "NDA_AIRGAP_VIOLATION", "airgap": True})
            return True

        # Check active Hermes BYOK provider against DLP policy if non-offline
        eff_prov = str(req.get("provider") or _HERMES_RUNTIME.agent_settings.get("provider") or provider)
        if eff_prov != "deterministic_offline" and eff_prov != "ollama":
            try:
                hermes_test = _HERMES_RUNTIME.generate_plan_and_narrative(
                    handler.con,
                    prompt,
                    str(pol.get("tier") or "NDA_AIRGAPPED"),
                    {"tags": [], "snippets": []},
                    "BOARD",
                    False,
                )
            except PermissionError as err:
                _send_json(handler, 403, {"error": str(err), "error_code": "NDA_AIRGAP_VIOLATION", "airgap": True})
                return True
            except Exception as exc:
                _send_json(handler, 400, {"error": str(exc)})
                return True
        else:
            hermes_test = None

        comp = _select_target_component(handler.con, prompt)
        if comp is None:
            _send_json(handler, 404, {"error": "No components found in HW-IR"})
            return True

        comp_id = str(comp["id"])
        refdes = str(comp["refdes"])
        locked = bool(int(comp["locked"] or 0))
        proj_dir = _ACTIVE_STATE.get("project_dir")
        at_ctx = _HERMES_RUNTIME.resolve_at_context(
            handler.con, prompt, pathlib.Path(str(proj_dir)) if proj_dir else None
        )
        hermes_res = hermes_test or _HERMES_RUNTIME.generate_plan_and_narrative(
            handler.con,
            prompt,
            str(pol.get("tier") or "NDA_AIRGAPPED"),
            at_ctx,
            refdes,
            locked,
        )
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

        _store_proposal(
            {
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
        )

        handler.send_response(200)
        handler.send_header("Content-Type", "text/event-stream; charset=utf-8")
        handler.send_header("Cache-Control", "no-cache")
        handler._send_cors()
        handler.end_headers()

        ollama_note = _maybe_query_loopback_ollama(ollama_endpoint, prompt) if ollama_endpoint else None
        thought_msg = ollama_note or hermes_res.get("thought") or (
            f"Evaluating integer-nm clearance around {refdes} "
            f"({'LOCKED by human' if locked else 'unlocked'})."
        )
        _write_sse(handler, "plan_card", {"stages": hermes_res.get("plan", _HERMES_RUNTIME.active_plan)})
        _write_sse(handler, "thought_delta", {"text": thought_msg})

        verb = "hw_inspect"
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

    match = PROPOSAL_PATH_RE.match(path)
    if match:
        proposal_id, action = match.group(1), match.group(2)

        with _PROPOSAL_LOCK:
            proposal = _PROPOSAL_STORE.get(proposal_id)
            if proposal is None:
                _send_json(handler, 404, {"error": f"Unknown proposal {proposal_id}"})
                return True

            current_status = proposal["status"]
            if current_status != "pending":
                _send_json(
                    handler,
                    409,
                    {
                        "accepted": False,
                        "proposal_id": proposal_id,
                        "status": current_status,
                        "error_code": "PROPOSAL_STATE_CONFLICT",
                        "message": f"Proposal already finalized with status '{current_status}'; replay refused.",
                    },
                )
                return True

            if action == "reject":
                proposal["status"] = "rejected"
                _send_json(handler, 200, {"proposal_id": proposal_id, "status": "rejected", "accepted": False})
                return True

            # Atomically reserve transition before SQLite execution to prevent concurrent double-accept
            proposal["status"] = "applying"
            ops_snapshot = list(proposal["ops"])
            summary_snapshot = str(proposal["summary"])

        cur = handler.con.cursor()
        try:
            cur.execute(
                "UPDATE _tx_actor_ctx SET actor_kind = 'agent', allow_lock_override = 0 WHERE singleton = 1"
            )
            inv_ops = []
            for op in ops_snapshot:
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
            applied_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            cur.execute("UPDATE projects SET rev_lamport = rev_lamport + 1")
            lamport_row = cur.execute("SELECT rev_lamport, id FROM projects LIMIT 1").fetchone()
            cur.execute("DELETE FROM hardware_patches WHERE project_id = ? AND undone = 1", (lamport_row[1],))
            cur.execute(
                """
                INSERT INTO hardware_patches
                (patch_id, project_id, actor_kind, actor_id, lamport_ts, summary, forward_ops_json, inverse_ops_json, undone, applied_at_utc)
                VALUES (?, ?, 'agent', 'agent-proposal', ?, ?, ?, ?, 0, ?)
                """,
                (
                    patch_id,
                    lamport_row[1],
                    lamport_row[0],
                    summary_snapshot,
                    json.dumps(ops_snapshot),
                    json.dumps(inv_ops),
                    applied_utc,
                ),
            )
            handler.con.commit()
            try:
                wal_checkpointer(handler.con, lamport_row[0], False)
                autosave_writer(str(db_dir / "board.vd.autosave.jsonl"), ops_snapshot)
            except (OSError, sqlite3.Error):
                pass
            with _PROPOSAL_LOCK:
                if proposal_id in _PROPOSAL_STORE:
                    _PROPOSAL_STORE[proposal_id]["status"] = "accepted"
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
            with _PROPOSAL_LOCK:
                if proposal_id in _PROPOSAL_STORE:
                    # Keep rejected/conflict finality on lock violations or revert non-lock error to pending
                    _PROPOSAL_STORE[proposal_id]["status"] = "conflict" if code == "KERNEL_LOCK_VIOLATION" else "pending"
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
        except Exception as e:
            handler.con.rollback()
            with _PROPOSAL_LOCK:
                if proposal_id in _PROPOSAL_STORE:
                    _PROPOSAL_STORE[proposal_id]["status"] = "pending"
            _send_json(handler, 500, {"accepted": False, "error_code": "PROPOSAL_EXEC_ERROR", "message": str(e)})
            return True

    if path.startswith("/api/v1/agent/proposals/") or path.startswith("/api/agent/proposals/"):
        _send_json(handler, 404, {"error": "Malformed proposal route"})
        return True

    return False
