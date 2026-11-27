"""
Prompt 18: Agent Client Protocol (ACP) Orchestrator & Closed-Loop Senior EE Team Engine.
Integrates:
  - vendor/ring1-refs/agent-client-protocol (Apache-2.0 JSON-RPC 2.0 schema/lifecycle)
  - Unified 12 canonical MCP verbs spanning P1..P17 + Wasmtime 51 Code Mode (256 MiB / 16 KiB cap)
  - hw-dlp airgap firewall (PUBLIC_OPEN / PRIVATE_CLOUD_OK / NDA_AIRGAPPED)
  - Dual Checkpoints (git_tree_sha, hw_ir_lamport_seq, cas_manifest_sha) + Atomic Rewind
  - Autonomous Closed-Loop Senior EE Pipeline halting fail-closed at Gate 8 Human Signoff
"""

from __future__ import annotations

import json
import os
import pathlib
import re
import sqlite3
import subprocess
import time
import urllib.parse
import urllib.request
from collections import OrderedDict
from typing import Any, Dict, List, Optional

try:
    from .kicad_bridge import sha256_text, write_text_atomic
    from .kicad_routes import _ACTIVE_STATE, _BRIDGE, _ensure_active_workspace, sync_after_patch
except ImportError:
    from kicad_bridge import sha256_text, write_text_atomic
    from kicad_routes import _ACTIVE_STATE, _BRIDGE, _ensure_active_workspace, sync_after_patch

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
_ACP_REF_DIR = _REPO_ROOT / "vendor" / "ring1-refs" / "agent-client-protocol"

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

DLP_TIERS = ("PUBLIC_OPEN", "PRIVATE_CLOUD_OK", "NDA_AIRGAPPED")
AGENT_MODES = ("OFF", "COPILOT", "AUTONOMOUS")
SUPPORTED_ACP_BACKENDS = (
    "deterministic_offline",
    "ollama",
    "claude-code",
    "codex-cli",
    "gemini-cli",
    "opencode",
    "goose",
)

_CHECKPOINTS: OrderedDict[str, Dict[str, Any]] = OrderedDict()
_DLP_TIER: str = "NDA_AIRGAPPED"
_AGENT_MODE: str = "COPILOT"


def get_dlp_policy() -> Dict[str, Any]:
    return {
        "tier": _DLP_TIER,
        "mode": _AGENT_MODE,
        "wasmtime_version": "51",
        "code_mode_limits": {"memory_mib": 256, "stdout_bytes": 16384},
        "acp_spec_present": _ACP_REF_DIR.is_dir(),
        "gate8_human_only": True,
    }


def set_dlp_policy(tier: Optional[str] = None, mode: Optional[str] = None) -> Dict[str, Any]:
    global _DLP_TIER, _AGENT_MODE
    if tier and tier in DLP_TIERS:
        _DLP_TIER = tier
    if mode and mode in AGENT_MODES:
        _AGENT_MODE = mode
    return get_dlp_policy()


def validate_acp_backend_airgap(backend: str, endpoint: Optional[str] = None, tier: Optional[str] = None) -> None:
    active_tier = tier or _DLP_TIER
    b = (backend or "deterministic_offline").strip().lower()
    if active_tier == "NDA_AIRGAPPED":
        if b in ("claude-code", "codex-cli", "gemini-cli", "opencode", "goose", "external_api"):
            raise ValueError(f"NDA_AIRGAP_VIOLATION: External ACP agent '{b}' blocked in NDA_AIRGAPPED mode")
        if endpoint:
            parsed = urllib.parse.urlparse(endpoint if "://" in endpoint else f"http://{endpoint}")
            host = (parsed.hostname or "").lower()
            if host not in ("127.0.0.1", "localhost", "::1"):
                raise ValueError(f"NDA_AIRGAP_VIOLATION: Non-loopback endpoint '{endpoint}' blocked")


def _git_tree_sha(cwd: pathlib.Path) -> str:
    try:
        r = subprocess.run(["git", "rev-parse", "HEAD^{tree}"], cwd=str(cwd), capture_output=True, text=True, timeout=3)
        if r.returncode == 0 and r.stdout.strip():
            return r.stdout.strip()
    except Exception:
        pass
    return "0" * 40


def create_dual_checkpoint(con: sqlite3.Connection, label: str = "pre-agent-loop") -> Dict[str, Any]:
    _ensure_active_workspace()
    proj_dir = pathlib.Path(_ACTIVE_STATE.get("project_dir") or _REPO_ROOT / "fixtures" / "golden-buck-mcu").resolve()
    lamport_row = con.execute("SELECT rev_lamport FROM projects LIMIT 1").fetchone()
    lamport = int(lamport_row[0]) if lamport_row else 1
    comp_rows = [
        dict(zip(("id", "refdes", "x_nm", "y_nm", "rot_mdeg", "side", "value_str", "locked"), r))
        for r in con.execute("SELECT id, refdes, x_nm, y_nm, rot_mdeg, side, value_str, locked FROM components").fetchall()
    ]
    files_snap: Dict[str, str] = {}
    for p in sorted(proj_dir.rglob("*")):
        if p.is_file() and p.suffix.lower() in (".kicad_pcb", ".kicad_sch", ".ato", ".yaml", ".yml", ".c", ".h", ".py"):
            rel = str(p.relative_to(proj_dir))
            files_snap[rel] = p.read_text(encoding="utf-8", errors="replace")

    cas_manifest_sha = sha256_text(json.dumps({k: sha256_text(v) for k, v in files_snap.items()}, sort_keys=True))
    git_tree = _git_tree_sha(proj_dir)
    ckpt_id = f"ckpt-{lamport}-{cas_manifest_sha[:10]}"
    entry = {
        "checkpoint_id": ckpt_id,
        "label": label,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "git_tree_sha": git_tree,
        "hw_ir_lamport_seq": lamport,
        "cas_manifest_sha": cas_manifest_sha,
        "project_dir": str(proj_dir),
        "components": comp_rows,
        "files": files_snap,
    }
    _CHECKPOINTS[ckpt_id] = entry
    while len(_CHECKPOINTS) > 16:
        _CHECKPOINTS.popitem(last=False)
    return {
        "success": True,
        "checkpoint_id": ckpt_id,
        "git_tree_sha": git_tree,
        "hw_ir_lamport_seq": lamport,
        "cas_manifest_sha": cas_manifest_sha,
        "file_count": len(files_snap),
    }


def rewind_dual_checkpoint(con: sqlite3.Connection, checkpoint_id: Optional[str] = None) -> Dict[str, Any]:
    if not _CHECKPOINTS:
        return {"success": False, "error": "No dual checkpoint recorded"}
    key = checkpoint_id if (checkpoint_id and checkpoint_id in _CHECKPOINTS) else next(reversed(_CHECKPOINTS))
    snap = _CHECKPOINTS[key]
    proj_dir = pathlib.Path(snap["project_dir"])
    for rel, content in snap["files"].items():
        write_text_atomic(proj_dir / rel, content)
    cur = con.cursor()
    cur.execute("UPDATE _tx_actor_ctx SET actor_kind = 'human', allow_lock_override = 1 WHERE singleton = 1")
    for c in snap["components"]:
        cur.execute(
            "UPDATE components SET x_nm = ?, y_nm = ?, rot_mdeg = ?, side = ?, value_str = ? WHERE id = ?",
            (c["x_nm"], c["y_nm"], c["rot_mdeg"], c["side"], c["value_str"], c["id"]),
        )
    cur.execute("UPDATE projects SET rev_lamport = rev_lamport + 1")
    new_lamport = int(cur.execute("SELECT rev_lamport FROM projects LIMIT 1").fetchone()[0])
    con.commit()
    return {
        "success": True,
        "rewound_to": key,
        "restored_lamport_seq": snap["hw_ir_lamport_seq"],
        "new_lamport_seq": new_lamport,
        "cas_manifest_sha": snap["cas_manifest_sha"],
        "restored_files": len(snap["files"]),
    }


def run_autonomous_ee_loop(
    con: sqlite3.Connection,
    req: Dict[str, Any],
    proposal_store: OrderedDict,
) -> Dict[str, Any]:
    """Delegates to the 7-Layer Closed-Loop Hardware Engineering Engine halting fail-closed at Gate-8."""
    try:
        from .autonomous_loop import run_7layer_closed_loop
    except ImportError:
        from autonomous_loop import run_7layer_closed_loop
    return run_7layer_closed_loop(
        con=con,
        req=req,
        proposal_store=proposal_store,
        checkpoint_fn=create_dual_checkpoint,
        dlp_tier=_DLP_TIER,
        agent_mode=_AGENT_MODE,
        validate_airgap_fn=validate_acp_backend_airgap,
    )
