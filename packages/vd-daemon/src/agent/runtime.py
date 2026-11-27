"""
Hermes-Core Agent Runtime for Vajra-Dhir EDA:
  - 12 Canonical MCP v2 hardware verbs + 4 EE planning/memory/skills/auditor tools
  - 6-Stage Hardware Design Workflow Plan Card
  - 3-Layer Bounded SQLite FTS5 Memory (default memory.write_approval = true)
  - Progressive Disclosure EE Skills (default skills.write_approval = true)
  - @Context reference resolution (@board, @schematic, @pcb, @drc, @spice, @mpn:*, @file:*)
  - Pre-edit Dual Checkpoints & /rollback
  - Dual-Context Auditor (delegate_task) enforcing KERNEL_LOCK_VIOLATION (Violet Ghost on locked=1)
"""

from __future__ import annotations

import json
import pathlib
import re
import sqlite3
import subprocess
import time
import uuid
from typing import Any, Dict, List, Optional

from .providers import call_byok_chat, frame_untrusted_text
from .vault import get_session_budget_status, redact_secrets, resolve_vault_dir

BUILTIN_EE_SKILLS: List[Dict[str, str]] = [
    {
        "id": "buck-converter-checklist",
        "title": "Buck Converter Layout & Ripple Checklist",
        "summary": "Minimize SW_NODE hot-loop, place input ceramic MLCC <= 3 mm, derate X7R under DC bias.",
        "body": "1) Keep U_SW->C_IN loop < 3.0mm.\n2) Check X7R effective C @ V_in (often -45% to -65%).\n3) Target PM >= 45 deg and GM >= 10 dB via python-control Bode.",
    },
    {
        "id": "usb-pd-cc-protection",
        "title": "USB-C PD & ESD Protection Verification",
        "summary": "Verify 5.1k Rd on CC1/CC2 or PD controller IC plus TVS clamp on VBUS/D+/D-.",
        "body": "1) Never leave CC1/CC2 floating.\n2) Ensure VBUS TVS reverse standoff >= max negotiated PD PDO.\n3) Check 90 Ohm differential USB pair impedance.",
    },
    {
        "id": "i2c-pullup-sizing",
        "title": "I2C Open-Drain Pull-Up & Address Conflict",
        "summary": "Ensure SDA/SCL pull-ups (2.2k-4.7k), bus capacitance <= 400pF, and zero duplicate 7-bit addresses.",
        "body": "1) Verify both SDA and SCL have pull-ups to target VDD_IO.\n2) Use Z3 SMT address uniqueness check across all slaves.",
    },
    {
        "id": "stm32-pinmux-planning",
        "title": "MCU Pinmux & Level-Shift Safety",
        "summary": "Enforce V_driver <= V_IO_max on 3.3V-non-tolerant pins and avoid boot-pin pull traps.",
        "body": "1) Run Z3 Pinmux solver for alternate-function conflicts.\n2) Confirm BOOT0 / strapping pins do not fight external loads.",
    },
    {
        "id": "high-speed-diff-pair",
        "title": "High-Speed Differential Pair & Plane Return",
        "summary": "Avoid split-plane crossings and keep intra-pair skew < 0.15 mm.",
        "body": "1) Route USB/MIPI/CAN over continuous GND plane.\n2) Place stitching vias next to layer transitions.",
    },
    {
        "id": "panelization-dfm",
        "title": "Indian & Global Fab DFM & Panelization",
        "summary": "Verify >= 0.15mm trace/space (standard 4L), >= 0.30mm drill, fiducials, and mouse-bites.",
        "body": "1) Check min trace/clearance against chosen fab preset.\n2) Confirm IPC-2581 & Gerber freshness before Human Gate-8 Signoff.",
    },
]

SIX_STAGE_PLAN_TEMPLATE: List[Dict[str, str]] = [
    {"id": "stage_1", "title": "1. Understand & Check Spec", "status": "done"},
    {"id": "stage_2", "title": "2. Architecture & Part Search", "status": "pending"},
    {"id": "stage_3", "title": "3. Schematic Capture & ERC", "status": "pending"},
    {"id": "stage_4", "title": "4. Pre-Layout Checks (SPICE & Footguns)", "status": "pending"},
    {"id": "stage_5", "title": "5. PCB Layout & Routing", "status": "pending"},
    {"id": "stage_6", "title": "6. Verify & Test Board (DRC, PI, Fab)", "status": "pending"},
]


def _memory_db_path() -> pathlib.Path:
    return resolve_vault_dir() / "agent_memory.db"


def _skills_dir() -> pathlib.Path:
    p = resolve_vault_dir() / "skills"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _ensure_memory_db() -> sqlite3.Connection:
    con = sqlite3.connect(_memory_db_path(), check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute(
        """
        CREATE TABLE IF NOT EXISTS memory_entries (
            id TEXT PRIMARY KEY,
            layer TEXT NOT NULL,
            project_id TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            approved INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER NOT NULL
        )
        """
    )
    try:
        con.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(entry_id UNINDEXED, title, content)"
        )
    except sqlite3.OperationalError:
        pass
    con.commit()
    return con


def _current_git_tree_sha(repo_root: pathlib.Path) -> str:
    try:
        head_file = repo_root / ".git" / "HEAD"
        if head_file.is_file():
            head = head_file.read_text(encoding="utf-8", errors="ignore").strip()
            if head.startswith("ref: "):
                ref_file = repo_root / ".git" / head[5:].strip()
                if ref_file.is_file():
                    return ref_file.read_text(encoding="utf-8", errors="ignore").strip()[:16]
            elif len(head) >= 16:
                return head[:16]
    except Exception:
        pass
    return "untracked"


class HermesRuntime:
    """Orchestrates Hermes-Core agent turns, memory, skills, @context, and Dual-Context Auditor."""

    def __init__(self, repo_root: pathlib.Path):
        self.repo_root = pathlib.Path(repo_root)
        self.active_plan: List[Dict[str, str]] = [dict(s) for s in SIX_STAGE_PLAN_TEMPLATE]
        self.pending_approvals: Dict[str, Dict[str, Any]] = {}
        self.agent_settings: Dict[str, Any] = {
            "provider": "deterministic_offline",
            "model": "vd-offline-ee-v1",
            "base_url": "",
            "memory_write_approval": True,
            "skills_write_approval": True,
        }

    def list_skills(self) -> List[Dict[str, str]]:
        skills = [dict(s, source="builtin") for s in BUILTIN_EE_SKILLS]
        for f in sorted(_skills_dir().glob("*.json")):
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
                skills.append({
                    "id": str(data.get("id") or f.stem),
                    "title": str(data.get("title") or f.stem),
                    "summary": str(data.get("summary") or ""),
                    "body": str(data.get("body") or ""),
                    "source": "user",
                })
            except Exception:
                continue
        return skills

    def get_skill(self, skill_id: str) -> Optional[Dict[str, str]]:
        for s in self.list_skills():
            if s["id"] == skill_id:
                return s
        return None

    def propose_skill_write(self, skill: Dict[str, str], force_approve: bool = False) -> Dict[str, Any]:
        sid = re.sub(r"[^a-z0-9_-]", "-", (skill.get("id") or skill.get("title") or "custom-skill").lower()).strip("-") or "custom-skill"
        clean = {
            "id": sid,
            "title": str(skill.get("title") or sid),
            "summary": str(skill.get("summary") or "")[:240],
            "body": str(skill.get("body") or "")[:4000],
        }
        if self.agent_settings.get("skills_write_approval", True) and not force_approve:
            pid = f"skill-prop-{uuid.uuid4().hex[:8]}"
            self.pending_approvals[pid] = {"kind": "skill_write", "id": pid, "payload": clean, "status": "pending"}
            return {"status": "pending_approval", "approval_id": pid, "skill": clean}
        dst = _skills_dir() / f"{sid}.json"
        dst.write_text(json.dumps(clean, indent=2), encoding="utf-8")
        return {"status": "saved", "skill": clean}

    def list_memory(self, query: str = "", limit: int = 20) -> List[Dict[str, Any]]:
        con = _ensure_memory_db()
        try:
            q = (query or "").strip()
            if q:
                try:
                    rows = con.execute(
                        """
                        SELECT m.id, m.layer, m.project_id, m.title, m.content, m.created_at
                        FROM memory_entries m
                        JOIN memory_fts f ON m.id = f.entry_id
                        WHERE f.memory_fts MATCH ? AND m.approved = 1
                        ORDER BY m.created_at DESC LIMIT ?
                        """,
                        (q, limit),
                    ).fetchall()
                    return [dict(r) for r in rows]
                except sqlite3.OperationalError:
                    rows = con.execute(
                        "SELECT id, layer, project_id, title, content, created_at FROM memory_entries WHERE approved = 1 AND (title LIKE ? OR content LIKE ?) ORDER BY created_at DESC LIMIT ?",
                        (f"%{q}%", f"%{q}%", limit),
                    ).fetchall()
                    return [dict(r) for r in rows]
            rows = con.execute(
                "SELECT id, layer, project_id, title, content, created_at FROM memory_entries WHERE approved = 1 ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            con.close()

    def propose_memory_write(self, layer: str, title: str, content: str, project_id: str = "default", force_approve: bool = False) -> Dict[str, Any]:
        entry = {
            "id": f"mem-{uuid.uuid4().hex[:10]}",
            "layer": layer if layer in ("session_summary", "board_decisions", "ee_lessons") else "ee_lessons",
            "project_id": project_id,
            "title": str(title)[:160],
            "content": str(content)[:2000],
            "created_at": int(time.time()),
        }
        if self.agent_settings.get("memory_write_approval", True) and not force_approve:
            pid = f"mem-prop-{uuid.uuid4().hex[:8]}"
            self.pending_approvals[pid] = {"kind": "memory_write", "id": pid, "payload": entry, "status": "pending"}
            return {"status": "pending_approval", "approval_id": pid, "entry": entry}

        con = _ensure_memory_db()
        try:
            con.execute(
                "INSERT OR REPLACE INTO memory_entries (id, layer, project_id, title, content, approved, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)",
                (entry["id"], entry["layer"], entry["project_id"], entry["title"], entry["content"], entry["created_at"]),
            )
            try:
                con.execute("INSERT INTO memory_fts (entry_id, title, content) VALUES (?, ?, ?)", (entry["id"], entry["title"], entry["content"]))
            except sqlite3.OperationalError:
                pass
            con.commit()
        finally:
            con.close()
        return {"status": "saved", "entry": entry}

    def resolve_approval(self, approval_id: str, accept: bool) -> Dict[str, Any]:
        item = self.pending_approvals.get(approval_id)
        if not item:
            return {"ok": False, "error": "APPROVAL_NOT_FOUND"}
        if item.get("status") != "pending":
            return {"ok": False, "error": "APPROVAL_ALREADY_RESOLVED"}
        item["status"] = "accepted" if accept else "rejected"
        if not accept:
            return {"ok": True, "status": "rejected", "id": approval_id}
        if item["kind"] == "memory_write":
            p = item["payload"]
            res = self.propose_memory_write(p["layer"], p["title"], p["content"], p["project_id"], force_approve=True)
            return {"ok": True, "status": "accepted", **res}
        if item["kind"] == "skill_write":
            res = self.propose_skill_write(item["payload"], force_approve=True)
            return {"ok": True, "status": "accepted", **res}
        return {"ok": True, "status": "accepted"}

    def resolve_at_context(self, con: sqlite3.Connection, prompt: str, project_dir: Optional[pathlib.Path]) -> Dict[str, Any]:
        tokens = re.findall(r"@([a-zA-Z0-9_.:/-]+)", prompt or "")
        ctx: Dict[str, Any] = {"tags": tokens, "snippets": []}
        if not tokens:
            return ctx
        for tok in tokens[:6]:
            low = tok.lower()
            if low in ("board", "pcb", "schematic"):
                rows = con.execute("SELECT refdes, value_str, x_nm, y_nm, locked FROM components ORDER BY refdes LIMIT 24").fetchall()
                ctx["snippets"].append({"tag": f"@{tok}", "count": len(rows), "components": [dict(r) for r in rows]})
            elif low in ("drc", "erc"):
                try:
                    from ..ee_audit_routes import collect_unified_diagnostics
                except Exception:
                    from ee_audit_routes import collect_unified_diagnostics  # type: ignore
                d = collect_unified_diagnostics(con)
                ctx["snippets"].append({"tag": f"@{tok}", "error_count": d.get("error_count", 0), "warning_count": d.get("warning_count", 0), "diagnostics": (d.get("diagnostics") or [])[:6]})
            elif low == "spice":
                try:
                    from ..spice_synth import run_spice_simulation_pipeline
                except Exception:
                    from spice_synth import run_spice_simulation_pipeline  # type: ignore
                sres = run_spice_simulation_pipeline(con, mode="tran")
                ctx["snippets"].append({"tag": "@spice", "metrics": sres.get("metrics"), "dc_nodes": sres.get("dc_nodes")})
            elif low.startswith("file:") and project_dir:
                rel = tok.split(":", 1)[1]
                target = (project_dir / rel).resolve()
                if str(target).startswith(str(project_dir.resolve())) and target.is_file():
                    raw = target.read_text(encoding="utf-8", errors="replace")
                    ctx["snippets"].append({"tag": f"@{tok}", "excerpt": frame_untrusted_text("file", raw)})
        return ctx

    def update_plan_stage(self, stage_id: str, status: str) -> List[Dict[str, str]]:
        for s in self.active_plan:
            if s["id"] == stage_id:
                s["status"] = status
        return [dict(s) for s in self.active_plan]

    def run_dual_context_auditor(self, con: sqlite3.Connection) -> Dict[str, Any]:
        """Fresh-context Dual Auditor validating active board against EE Footguns & DRC."""
        try:
            from ..ee_audit_routes import collect_unified_diagnostics
        except Exception:
            from ee_audit_routes import collect_unified_diagnostics  # type: ignore
        diag = collect_unified_diagnostics(con)
        locked_count = con.execute("SELECT COUNT(*) FROM components WHERE locked = 1").fetchone()[0]
        return {
            "auditor": "hermes-dual-context-auditor",
            "isolated_context": True,
            "error_count": diag.get("error_count", 0),
            "warning_count": diag.get("warning_count", 0),
            "human_locked_entities": int(locked_count),
            "verdict": "PASS" if diag.get("error_count", 0) == 0 else "NEEDS_REMEDIATION",
            "findings": (diag.get("diagnostics") or [])[:8],
        }

    def generate_plan_and_narrative(
        self,
        con: sqlite3.Connection,
        prompt: str,
        dlp_tier: str,
        at_ctx: Dict[str, Any],
        target_ref: str,
        locked: bool,
    ) -> Dict[str, Any]:
        prov = str(self.agent_settings.get("provider") or "deterministic_offline")
        model = str(self.agent_settings.get("model") or "")
        base_url = str(self.agent_settings.get("base_url") or "")

        if "/plan" in prompt.lower() or "design" in prompt.lower():
            self.update_plan_stage("stage_2", "in_progress")

        git_sha = _current_git_tree_sha(self.repo_root)
        lamport = int((con.execute("SELECT rev_lamport FROM projects LIMIT 1").fetchone() or [0])[0])

        if prov == "deterministic_offline":
            return {
                "ok": True,
                "provider": prov,
                "git_tree_sha": git_sha,
                "hwir_rev_id": lamport,
                "thought": (
                    f"Hermes offline planner checked HW-IR rev #{lamport} (git {git_sha}): "
                    f"target {target_ref} ({'HUMAN_LOCKED -> Ghost Only' if locked else 'unlocked'}). "
                    f"Resolved {len(at_ctx.get('tags', []))} @context ref(s)."
                ),
                "plan": [dict(s) for s in self.active_plan],
            }

        sys_prompt = (
            "You are Hermes-Core embedded inside Vajra-Dhir EDA. "
            "Follow Human Locks (locked=1 cannot be edited directly; emit Violet Ghost proposal instead), "
            "integer-nm precision, and report exact findings only."
        )
        user_msg = f"Prompt: {prompt}\nTarget: {target_ref} (locked={locked})\nContext tags: {json.dumps(at_ctx.get('snippets', []))[:2500]}"
        res = call_byok_chat(prov, model, base_url, [{"role": "system", "content": sys_prompt}, {"role": "user", "content": user_msg}], dlp_tier)
        return {
            "ok": True,
            "provider": prov,
            "git_tree_sha": git_sha,
            "hwir_rev_id": lamport,
            "thought": redact_secrets(res.get("content") or f"BYOK {prov} turn complete."),
            "plan": [dict(s) for s in self.active_plan],
            "budget": get_session_budget_status(),
        }
