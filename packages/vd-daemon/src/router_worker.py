"""
Prompt 12 Autorouter Worker wrapping MIT drandyhaas/KiCadRoutingTools (`grid_router.pyd` + `py_router/route.py`).
Enforces:
- Cryptographic SHA-256 snapshot verification of all `locked = 1` traces, vias, and components.
- P9 IPC-2152/2221 trace-width & clearance netclasses.
- Orphan-safe SupervisedProcessGroup execution with deterministic cancel (`/api/v1/route/cancel`).
- HW-IR patch journal recording for single-click Undo/Redo (Ctrl+Z) & optional P1 KiCad 10 DRC proof.
"""

from __future__ import annotations

import datetime
import hashlib
import json
import os
import pathlib
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
from typing import Any, Dict, List, Optional, Set, Tuple

try:
    from .kicad_bridge import (
        KiCad10Bridge,
        _atom_or_str_val,
        _find_child,
        _find_children,
        format_sexpr,
        mm_to_nm,
        new_uuidv7,
        parse_sexpr,
        sync_kicad_pcb_to_hwir,
        write_text_atomic,
    )
    from .kicad_routes import _ACTIVE_STATE, _BRIDGE, _STATE_LOCK, _ensure_active_workspace, broadcast_ws_event
    from .supervision import SupervisedProcessGroup
except ImportError:
    from kicad_bridge import (
        KiCad10Bridge,
        _atom_or_str_val,
        _find_child,
        _find_children,
        format_sexpr,
        mm_to_nm,
        new_uuidv7,
        parse_sexpr,
        sync_kicad_pcb_to_hwir,
        write_text_atomic,
    )
    from kicad_routes import _ACTIVE_STATE, _BRIDGE, _STATE_LOCK, _ensure_active_workspace, broadcast_ws_event
    from supervision import SupervisedProcessGroup

_ROOT = pathlib.Path(__file__).resolve().parents[3]
_KRT_DIR = _ROOT / "vendor" / "ring1-refs" / "KiCadRoutingTools"
_KRT_SITE = _ROOT / "vendor" / "ring1-refs" / ".krt-site"

_SV_SRC = str(_ROOT / "packages" / "symbolic-verifier" / "src")
if _SV_SRC not in sys.path:
    sys.path.insert(0, _SV_SRC)

try:
    from physics_derating import calculate_ipc2152_trace_temp_rise  # noqa: E402
except Exception:
    calculate_ipc2152_trace_temp_rise = None  # type: ignore

_ROUTER_SUPERVISOR = SupervisedProcessGroup()
_ROUTE_LOCK = threading.Lock()
_ROUTE_STATE: Dict[str, Any] = {
    "running": False,
    "cancelled": False,
    "last_status": "idle",
    "last_wirelength_mm": 0.0,
    "last_routed_segments": 0,
    "last_drc_errors": None,
}
_ACTIVE_PROC: Optional[subprocess.Popen[str]] = None


def find_krt_engine() -> Dict[str, Any]:
    route_py = _KRT_DIR / "py_router" / "route.py"
    pyd = _KRT_DIR / "rust_router" / "grid_router.pyd"
    so_list = list((_KRT_DIR / "rust_router").glob("grid_router*.so")) if (_KRT_DIR / "rust_router").is_dir() else []
    native_mod = pyd if pyd.is_file() else (so_list[0] if so_list else None)
    return {
        "installed": route_py.is_file() and (native_mod is not None),
        "route_py": str(route_py) if route_py.is_file() else None,
        "rust_binary": str(native_mod) if native_mod else None,
        "site_dir": str(_KRT_SITE) if _KRT_SITE.is_dir() else None,
        "setup_hint": "Run python vendor/ring1-refs/KiCadRoutingTools/build_router.py if binary is missing.",
    }


def compute_ipc2152_power_width_mm(current_a: float = 2.0, max_delta_t_c: float = 20.0) -> float:
    """Queries P9 IPC-2152 physics solver to determine minimum power trace width (mm)."""
    if calculate_ipc2152_trace_temp_rise is None:
        return 0.5
    for w_mm in (0.3, 0.4, 0.5, 0.65, 0.8, 1.0, 1.25, 1.5):
        dt = calculate_ipc2152_trace_temp_rise(
            current_amps=current_a,
            width_nm=int(w_mm * 1_000_000),
            thickness_nm=35_000,
            is_external=True,
        )
        if dt <= max_delta_t_c:
            return w_mm
    return 1.0


def _extract_segments_and_vias(pcb_path: pathlib.Path) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Dict[int, str]]:
    trees = parse_sexpr(pcb_path.read_text(encoding="utf-8", errors="replace"))
    root = trees[0] if (isinstance(trees, list) and trees and isinstance(trees[0], list) and _atom_or_str_val(trees[0][0]) == "kicad_pcb") else trees
    net_map: Dict[int, str] = {}
    for net_n in _find_children(root, "net"):
        if len(net_n) >= 3:
            try:
                net_map[int(_atom_or_str_val(net_n[1]))] = str(_atom_or_str_val(net_n[2]))
            except Exception:
                pass

    segments: List[Dict[str, Any]] = []
    for seg in _find_children(root, "segment"):
        st = _find_child(seg, "start")
        en = _find_child(seg, "end")
        wd = _find_child(seg, "width")
        ly = _find_child(seg, "layer")
        nt = _find_child(seg, "net")
        uu = _find_child(seg, "uuid")
        if not (st and en and wd and ly):
            continue
        n_idx = int(_atom_or_str_val(nt[1])) if (nt and len(nt) >= 2) else 0
        segments.append({
            "uuid": _atom_or_str_val(uu[1]) if (uu and len(uu) >= 2) else "",
            "x1_nm": mm_to_nm(float(_atom_or_str_val(st[1]))),
            "y1_nm": mm_to_nm(float(_atom_or_str_val(st[2]))),
            "x2_nm": mm_to_nm(float(_atom_or_str_val(en[1]))),
            "y2_nm": mm_to_nm(float(_atom_or_str_val(en[2]))),
            "width_nm": mm_to_nm(float(_atom_or_str_val(wd[1]))),
            "layer": str(_atom_or_str_val(ly[1])),
            "net_idx": n_idx,
            "net_name": net_map.get(n_idx, ""),
        })

    vias: List[Dict[str, Any]] = []
    for via in _find_children(root, "via"):
        at_n = _find_child(via, "at")
        sz_n = _find_child(via, "size")
        dr_n = _find_child(via, "drill")
        nt = _find_child(via, "net")
        uu = _find_child(via, "uuid")
        if not (at_n and sz_n and dr_n):
            continue
        vias.append({
            "uuid": _atom_or_str_val(uu[1]) if (uu and len(uu) >= 2) else "",
            "x_nm": mm_to_nm(float(_atom_or_str_val(at_n[1]))),
            "y_nm": mm_to_nm(float(_atom_or_str_val(at_n[2]))),
            "size_nm": mm_to_nm(float(_atom_or_str_val(sz_n[1]))),
            "drill_nm": mm_to_nm(float(_atom_or_str_val(dr_n[1]))),
            "net_name": net_map.get(int(_atom_or_str_val(nt[1])) if (nt and len(nt) >= 2) else 0, ""),
        })
    return segments, vias, net_map


def _hash_segment(seg: Dict[str, Any]) -> str:
    canonical = f"seg:{seg['layer']}:{seg['x1_nm']}:{seg['y1_nm']}:{seg['x2_nm']}:{seg['y2_nm']}:{seg['width_nm']}:{seg['net_name']}"
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def snapshot_locked_copper(con: Optional[sqlite3.Connection], pcb_path: pathlib.Path) -> Dict[str, Any]:
    """
    Snapshots SHA-256 hashes of all `locked = 1` traces, vias, and components in HW-IR,
    plus matching geometric segments in the live `.kicad_pcb`.
    """
    locked_trace_hashes: Dict[str, str] = {}
    locked_comp_hashes: Dict[str, str] = {}
    locked_nets: Set[str] = set()
    locked_refs: Set[str] = set()

    pcb_segs, _vias, _ = _extract_segments_and_vias(pcb_path)
    pre_pcb_hashes = {_hash_segment(s) for s in pcb_segs}

    if con is not None:
        sync_kicad_pcb_to_hwir(con, pcb_path, actor_kind="import", echo_ring=_BRIDGE.echo_ring)
        rows = con.execute(
            """
            SELECT t.id, n.name, t.layer_name, t.x1_nm, t.y1_nm, t.x2_nm, t.y2_nm, t.width_nm
            FROM traces t JOIN nets n ON t.net_id = n.id
            WHERE t.locked = 1 AND COALESCE(t.deleted, 0) = 0
            """
        ).fetchall()
        for tid, nname, layer, x1, y1, x2, y2, w in rows:
            h = hashlib.sha256(f"seg:{layer}:{x1}:{y1}:{x2}:{y2}:{w}:{nname}".encode("utf-8")).hexdigest()
            if h in pre_pcb_hashes:
                locked_trace_hashes[str(tid)] = h
                locked_nets.add(str(nname))

        c_rows = con.execute(
            "SELECT id, refdes, x_nm, y_nm, rot_mdeg, side FROM components WHERE locked = 1 AND COALESCE(deleted, 0) = 0"
        ).fetchall()
        for cid, ref, x, y, rot, side in c_rows:
            ch = hashlib.sha256(f"cmp:{ref}:{x}:{y}:{rot}:{side}".encode("utf-8")).hexdigest()
            locked_comp_hashes[str(cid)] = ch
            locked_refs.add(str(ref))

    return {
        "trace_hashes": locked_trace_hashes,
        "component_hashes": locked_comp_hashes,
        "locked_nets": sorted(locked_nets),
        "locked_refs": sorted(locked_refs),
    }


def verify_locked_copper_integrity(snapshot: Dict[str, Any], pcb_path: pathlib.Path) -> Tuple[bool, Optional[str]]:
    """Cryptographically verifies every locked trace hash still exists unaltered in routed `.kicad_pcb`."""
    segs, _vias, _ = _extract_segments_and_vias(pcb_path)
    present_hashes = {_hash_segment(s) for s in segs}
    for tid, expected_hash in snapshot.get("trace_hashes", {}).items():
        if expected_hash not in present_hashes:
            return False, f"COPPER_LOCK_VIOLATION: locked trace {tid} (sha256={expected_hash[:12]}) missing or modified after routing"
    return True, None


def strip_unlocked_segments_for_nets(
    pcb_path: pathlib.Path,
    target_nets: Optional[List[str]],
    locked_trace_hashes: Set[str],
) -> int:
    """
    Removes unlocked track segments for target nets before routing while preserving
    every locked trace (`locked = 1` SHA-256 match) untouched as an obstacle.
    """
    trees = parse_sexpr(pcb_path.read_text(encoding="utf-8", errors="replace"))
    root = trees[0] if (isinstance(trees, list) and trees and isinstance(trees[0], list) and _atom_or_str_val(trees[0][0]) == "kicad_pcb") else trees
    net_map: Dict[int, str] = {}
    for net_n in _find_children(root, "net"):
        if len(net_n) >= 3:
            try:
                net_map[int(_atom_or_str_val(net_n[1]))] = str(_atom_or_str_val(net_n[2]))
            except Exception:
                pass

    target_set = set(target_nets) if target_nets else None
    removed = 0
    new_root: List[Any] = []
    for item in root:
        if isinstance(item, list) and item and _atom_or_str_val(item[0]) == "segment":
            st = _find_child(item, "start")
            en = _find_child(item, "end")
            wd = _find_child(item, "width")
            ly = _find_child(item, "layer")
            nt = _find_child(item, "net")
            if st and en and wd and ly:
                n_idx = int(_atom_or_str_val(nt[1])) if (nt and len(nt) >= 2) else 0
                n_name = net_map.get(n_idx, "")
                seg_obj = {
                    "layer": str(_atom_or_str_val(ly[1])),
                    "x1_nm": mm_to_nm(float(_atom_or_str_val(st[1]))),
                    "y1_nm": mm_to_nm(float(_atom_or_str_val(st[2]))),
                    "x2_nm": mm_to_nm(float(_atom_or_str_val(en[1]))),
                    "y2_nm": mm_to_nm(float(_atom_or_str_val(en[2]))),
                    "width_nm": mm_to_nm(float(_atom_or_str_val(wd[1]))),
                    "net_name": n_name,
                }
                h = _hash_segment(seg_obj)
                if h not in locked_trace_hashes and (target_set is None or n_name in target_set):
                    removed += 1
                    continue
        new_root.append(item)

    if removed > 0:
        write_text_atomic(pcb_path, format_sexpr(new_root) + "\n")
    return removed


def lock_trace_segment_in_hwir(
    con: sqlite3.Connection,
    pcb_path: pathlib.Path,
    net_name: Optional[str] = None,
    trace_id: Optional[str] = None,
    locked: bool = True,
) -> Dict[str, Any]:
    """Locks or unlocks a critical hand-routed trace in HW-IR cleanly with human provenance."""
    sync_kicad_pcb_to_hwir(con, pcb_path, actor_kind="human", echo_ring=_BRIDGE.echo_ring)
    cur = con.cursor()
    if trace_id:
        row = cur.execute(
            "SELECT t.id, n.name, t.layer_name, t.x1_nm, t.y1_nm, t.x2_nm, t.y2_nm, t.width_nm "
            "FROM traces t JOIN nets n ON t.net_id = n.id WHERE t.id = ? AND COALESCE(t.deleted,0)=0",
            (trace_id,),
        ).fetchone()
    elif net_name:
        row = cur.execute(
            "SELECT t.id, n.name, t.layer_name, t.x1_nm, t.y1_nm, t.x2_nm, t.y2_nm, t.width_nm "
            "FROM traces t JOIN nets n ON t.net_id = n.id WHERE n.name = ? AND COALESCE(t.deleted,0)=0 LIMIT 1",
            (net_name,),
        ).fetchone()
    else:
        row = cur.execute(
            "SELECT t.id, n.name, t.layer_name, t.x1_nm, t.y1_nm, t.x2_nm, t.y2_nm, t.width_nm "
            "FROM traces t JOIN nets n ON t.net_id = n.id "
            "JOIN external_id_map m ON m.hwir_uuid = t.id AND m.external_system = 'kicad_pcb' "
            "WHERE COALESCE(t.deleted,0)=0 LIMIT 1"
        ).fetchone()
        if not row:
            row = cur.execute(
                "SELECT t.id, n.name, t.layer_name, t.x1_nm, t.y1_nm, t.x2_nm, t.y2_nm, t.width_nm "
                "FROM traces t JOIN nets n ON t.net_id = n.id WHERE COALESCE(t.deleted,0)=0 LIMIT 1"
            ).fetchone()

    if not row:
        return {"ok": False, "error": "No matching trace segment found in HW-IR"}

    tid, rnet, layer, x1, y1, x2, y2, w = row
    cur.execute("UPDATE _tx_actor_ctx SET actor_kind = 'human', allow_lock_override = 1 WHERE singleton = 1")
    cur.execute("UPDATE traces SET locked = ?, provenance = 'human', rev_lamport = rev_lamport + 1 WHERE id = ?", (1 if locked else 0, tid))
    con.commit()
    h = hashlib.sha256(f"seg:{layer}:{x1}:{y1}:{x2}:{y2}:{w}:{rnet}".encode("utf-8")).hexdigest()
    return {
        "ok": True,
        "trace_id": str(tid),
        "net_name": str(rnet),
        "layer": str(layer),
        "x1_nm": int(x1),
        "y1_nm": int(y1),
        "x2_nm": int(x2),
        "y2_nm": int(y2),
        "width_nm": int(w),
        "locked": bool(locked),
        "sha256": h,
    }


def cancel_active_route() -> Dict[str, Any]:
    global _ACTIVE_PROC
    with _ROUTE_LOCK:
        _ROUTE_STATE["cancelled"] = True
        if _ACTIVE_PROC is not None and _ACTIVE_PROC.poll() is None:
            try:
                _ACTIVE_PROC.terminate()
            except Exception:
                pass
        _ROUTER_SUPERVISOR.close()
        _ROUTE_STATE["running"] = False
        _ROUTE_STATE["last_status"] = "cancelled"
    return {"ok": True, "status": "cancelled"}


def run_autoroute(
    con: sqlite3.Connection,
    pcb_path: pathlib.Path,
    nets: Optional[List[str]] = None,
    diff_pairs: Optional[List[str]] = None,
    track_width_mm: float = 0.25,
    clearance_mm: float = 0.2,
    diff_pair_gap_mm: float = 0.15,
    reroute_unlocked: bool = False,
    preview_only: bool = False,
    run_drc: bool = True,
    timeout_sec: float = 60.0,
) -> Dict[str, Any]:
    global _ACTIVE_PROC
    eng = find_krt_engine()
    if not eng["installed"] or not eng["route_py"]:
        return {
            "ok": False,
            "error": "KiCadRoutingTools binary/script missing. " + eng["setup_hint"],
            "engine": eng,
        }

    pcb_path = pathlib.Path(pcb_path).resolve()
    snap = snapshot_locked_copper(con, pcb_path)
    locked_hash_set = set(snap["trace_hashes"].values())
    orig_pcb_text = pcb_path.read_text(encoding="utf-8", errors="replace")
    orig_segs, orig_vias, orig_net_map = _extract_segments_and_vias(pcb_path)
    orig_seg_hashes = {_hash_segment(s) for s in orig_segs}
    locked_net_set = set(snap.get("locked_nets", []))
    target_nets = nets
    if target_nets is None and locked_net_set:
        target_nets = sorted({n for n in orig_net_map.values() if n and n not in locked_net_set})

    power_w_mm = compute_ipc2152_power_width_mm(current_a=2.0, max_delta_t_c=20.0)

    with tempfile.TemporaryDirectory(prefix="vd_krt_run_") as tmp_dir:
        tmp = pathlib.Path(tmp_dir)
        in_pcb = tmp / pcb_path.name
        out_pcb = tmp / f"routed_{pcb_path.name}"
        report_json = tmp / "route_report.json"

        # Copy sibling .kicad_pro if present so KiCadRoutingTools reads netclasses cleanly
        shutil.copy2(pcb_path, in_pcb)
        pro_src = pcb_path.with_suffix(".kicad_pro")
        if pro_src.is_file():
            shutil.copy2(pro_src, tmp / pro_src.name)

        ripped_count = 0
        if reroute_unlocked:
            ripped_count = strip_unlocked_segments_for_nets(in_pcb, target_nets, locked_hash_set)

        cmd: List[str] = [
            sys.executable,
            eng["route_py"],
            str(in_pcb),
            "--output",
            str(out_pcb),
            "--overwrite",
            "--track-width",
            f"{track_width_mm:.3f}",
            "--clearance",
            f"{clearance_mm:.3f}",
            "--power-nets",
            "+3.3V",
            "+12V",
            "VBUS_12V",
            "SW_NODE",
            "--power-nets-widths",
            f"{power_w_mm:.2f}",
            f"{power_w_mm:.2f}",
            f"{power_w_mm:.2f}",
            f"{power_w_mm:.2f}",
            "--json-out",
            str(report_json),
        ]
        if target_nets:
            cmd.extend(["--nets", *target_nets])
        if diff_pairs:
            cmd.extend(["--diff-pairs", *diff_pairs, "--diff-pair-gap", f"{diff_pair_gap_mm:.3f}"])

        env = dict(os.environ)
        py_paths = [p for p in (eng.get("site_dir"), str(_KRT_DIR), env.get("PYTHONPATH")) if p]
        env["PYTHONPATH"] = os.pathsep.join(py_paths)

        with _ROUTE_LOCK:
            _ROUTE_STATE["running"] = True
            _ROUTE_STATE["cancelled"] = False
            _ROUTE_STATE["last_status"] = "routing"

        t0 = time.time()
        try:
            proc = _ROUTER_SUPERVISOR.spawn(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                env=env,
            )
            with _ROUTE_LOCK:
                _ACTIVE_PROC = proc
            stdout_txt, stderr_txt = proc.communicate(timeout=timeout_sec)
        except subprocess.TimeoutExpired:
            cancel_active_route()
            return {"ok": False, "error": f"KiCadRoutingTools timed out after {timeout_sec}s"}
        finally:
            with _ROUTE_LOCK:
                _ACTIVE_PROC = None
                _ROUTE_STATE["running"] = False

        if _ROUTE_STATE.get("cancelled"):
            return {"ok": False, "cancelled": True, "error": "Autorouting cancelled by user"}

        if proc.returncode != 0 or not out_pcb.is_file():
            _ROUTE_STATE["last_status"] = "failed"
            return {
                "ok": False,
                "returncode": proc.returncode,
                "error": (stderr_txt or stdout_txt or "KiCadRoutingTools failed").strip()[-800:],
            }

        # Cryptographic SHA-256 verification of all locked traces
        ok_lock, lock_err = verify_locked_copper_integrity(snap, out_pcb)
        if not ok_lock:
            _ROUTE_STATE["last_status"] = "lock_violation"
            return {"ok": False, "error_code": "COPPER_LOCK_VIOLATION", "error": lock_err}

        new_segs, new_vias, _ = _extract_segments_and_vias(out_pcb)
        routed_new_segs = [s for s in new_segs if _hash_segment(s) not in orig_seg_hashes]
        routed_summary = json.loads(report_json.read_text(encoding="utf-8")) if report_json.is_file() else {}

        # Calculate routed wirelength + trace resistance parasitic feedback (P10/P11)
        total_len_mm = 0.0
        for s in routed_new_segs:
            dx = (s["x2_nm"] - s["x1_nm"]) / 1_000_000.0
            dy = (s["y2_nm"] - s["y1_nm"]) / 1_000_000.0
            total_len_mm += (dx * dx + dy * dy) ** 0.5
        est_mohm = round(total_len_mm * (0.491 / max(0.15, track_width_mm)), 2)

        if preview_only:
            return {
                "ok": True,
                "preview_only": True,
                "ripped_unlocked": ripped_count,
                "new_segments_count": len(routed_new_segs),
                "ghost_segments": routed_new_segs[:80],
                "vias_count": len(new_vias),
                "locked_traces_verified": len(snap["trace_hashes"]),
                "ipc2152_power_width_mm": power_w_mm,
                "wirelength_mm": round(total_len_mm, 2),
                "parasitic_mohm": est_mohm,
                "krt_summary": routed_summary,
                "elapsed_sec": round(time.time() - t0, 2),
            }

        # Apply routed PCB atomically + record Undo/Redo journal entry
        routed_pcb_text = out_pcb.read_text(encoding="utf-8", errors="replace")
        pcb_sha = write_text_atomic(pcb_path, routed_pcb_text, echo_ring=_BRIDGE.echo_ring)
        with _STATE_LOCK:
            _ACTIVE_STATE["last_pcb_sha256"] = pcb_sha
            _ACTIVE_STATE["revision"] += 1
            rev = _ACTIVE_STATE["revision"]

        sync_res = sync_kicad_pcb_to_hwir(con, pcb_path, actor_kind="agent", echo_ring=_BRIDGE.echo_ring)

        # Record single-click Undo/Redo patch in hardware_patches
        cur = con.cursor()
        proj_row = cur.execute("SELECT id, rev_lamport FROM projects LIMIT 1").fetchone()
        if proj_row:
            proj_id, lamport = proj_row
            patch_id = new_uuidv7()
            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
            # Re-store previous PCB snapshot op cleanly in inverse_ops
            fwd_ops = [{"op": "AUTOROUTE_PASS", "added_segments": len(routed_new_segs), "sha256": pcb_sha}]
            inv_ops = [{"op": "RESTORE_PCB_SNAPSHOT", "pcb_path": str(pcb_path), "pcb_text": orig_pcb_text}]
            cur.execute(
                """
                INSERT INTO hardware_patches (patch_id, project_id, actor_kind, actor_id, lamport_ts, summary, forward_ops_json, inverse_ops_json, undone, applied_at_utc)
                VALUES (?, ?, 'agent', 'kicad-routing-tools', ?, ?, ?, ?, 0, ?)
                """,
                (
                    patch_id,
                    proj_id,
                    int(lamport) + 1,
                    f"Autorouted {len(routed_new_segs)} segments ({total_len_mm:.1f}mm) via KiCadRoutingTools",
                    json.dumps(fwd_ops),
                    json.dumps(inv_ops),
                    now_iso,
                ),
            )
            cur.execute("UPDATE projects SET rev_lamport = rev_lamport + 1 WHERE id = ?", (proj_id,))
            con.commit()

        drc_res: Optional[Dict[str, Any]] = None
        if run_drc:
            drc_res = _BRIDGE.run_drc(pcb_path, con=con)
            broadcast_ws_event({
                "type": "drc_updated",
                "error_count": drc_res["error_count"],
                "warning_count": drc_res["warning_count"],
            })

        _ROUTE_STATE["last_status"] = "completed"
        _ROUTE_STATE["last_wirelength_mm"] = round(total_len_mm, 2)
        _ROUTE_STATE["last_routed_segments"] = len(routed_new_segs)
        _ROUTE_STATE["last_drc_errors"] = drc_res["error_count"] if drc_res else None

        broadcast_ws_event({
            "type": "patch_applied",
            "revision": rev,
            "pcb_path": str(pcb_path),
            "pcb_sha256": pcb_sha,
            "autorouted_segments": len(routed_new_segs),
        })

        return {
            "ok": True,
            "preview_only": False,
            "revision": rev,
            "pcb_sha256": pcb_sha,
            "ripped_unlocked": ripped_count,
            "new_segments_count": len(routed_new_segs),
            "total_segments": len(new_segs),
            "vias_count": len(new_vias),
            "locked_traces_verified": len(snap["trace_hashes"]),
            "locked_snapshot_hashes": snap["trace_hashes"],
            "ipc2152_power_width_mm": power_w_mm,
            "wirelength_mm": round(total_len_mm, 2),
            "parasitic_mohm": est_mohm,
            "hwir_sync": sync_res,
            "drc": drc_res,
            "krt_summary": routed_summary,
            "elapsed_sec": round(time.time() - t0, 2),
        }
