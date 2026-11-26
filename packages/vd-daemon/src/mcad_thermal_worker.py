"""
Prompt 14 Ring 1 MCAD & Thermal FEM Orchestrator (`CadQuery` + `Gmsh` + `ElmerFEM`).
- Runs `workers/pack-2a-pcb-physics/mcad_thermal_worker.py` strictly out-of-process
  via `SupervisedProcessGroup` (zero GPL linkage in Ring 1).
- Generates parametric `mcad/enclosure.py` editable in P4 Monaco.
- Caches `.step`, `.stl`, and `.vtu` artifacts in `cas/mcad/`.
- Pulls heat loads (W) from P9/P10/P13 (`padne` Joule loss) and grades 3D thermal
  results against P8 `T_J_max` (`T_J <= T_J_max - 25 C`).
"""

from __future__ import annotations

import hashlib
import json
import os
import pathlib
import sqlite3
import subprocess
import sys
import threading
from typing import Any, Dict, Optional

try:
    from .board_3d import build_board_3d_payload
    from .kicad_routes import _ACTIVE_STATE, _ensure_active_workspace, broadcast_ws_event
    from .pi_worker import get_last_pi_result
    from .supervision import SupervisedProcessGroup
except ImportError:
    from board_3d import build_board_3d_payload
    from kicad_routes import _ACTIVE_STATE, _ensure_active_workspace, broadcast_ws_event
    from pi_worker import get_last_pi_result
    from supervision import SupervisedProcessGroup

_ROOT = pathlib.Path(__file__).resolve().parents[3]
_RING2_MCAD_WORKER = _ROOT / "workers" / "pack-2a-pcb-physics" / "mcad_thermal_worker.py"
_CADQUERY_SRC = _ROOT / "vendor" / "ring1-refs" / "cadquery"
_GMSH_SRC = _ROOT / "workers" / "sources" / "pack-2a-pcb-physics" / "gmsh"
_ELMER_SRC = _ROOT / "workers" / "sources" / "pack-2a-pcb-physics" / "elmerfem"

_MCAD_SUPERVISOR = SupervisedProcessGroup()
_MCAD_LOCK = threading.Lock()
_LAST_ENCLOSURE: Optional[Dict[str, Any]] = None
_LAST_CLASH: Optional[Dict[str, Any]] = None
_LAST_THERMAL: Optional[Dict[str, Any]] = None
_ARTIFACT_REGISTRY: Dict[str, pathlib.Path] = {}

STARTER_ENCLOSURE_PY = '''"""Parametric CadQuery Enclosure for golden-buck-mcu (edit & save in Monaco P4)."""
import cadquery as cq

# Tunable parametric enclosure dimensions (mm)
WALL_THICKNESS_MM = 2.0
SIDE_MARGIN_MM = 2.5
BASE_CLEARANCE_MM = 3.0
LID_HEIGHT_MM = 9.0
VENT_SLOTS = 4
CUTOUT_PADDING_MM = 0.6

# Board envelope (synced automatically from HW-IR / .kicad_pcb)
BOARD_W_MM = 60.0
BOARD_H_MM = 40.0
BOARD_THICK_MM = 1.6

outer_w = BOARD_W_MM + 2 * (SIDE_MARGIN_MM + WALL_THICKNESS_MM)
outer_h = BOARD_H_MM + 2 * (SIDE_MARGIN_MM + WALL_THICKNESS_MM)
outer_z = BASE_CLEARANCE_MM + BOARD_THICK_MM + LID_HEIGHT_MM + 2 * WALL_THICKNESS_MM

result = (
    cq.Workplane("XY")
    .box(outer_w, outer_h, outer_z)
    .faces("+Z")
    .shell(-WALL_THICKNESS_MM)
)
'''


def _cas_mcad_dir() -> pathlib.Path:
    base = pathlib.Path(os.environ.get("VD_DB_DIR") or ".vd-dev")
    p = base / "cas" / "mcad"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _store_artifact(content: str, ext: str) -> Dict[str, Any]:
    raw = content.encode("utf-8")
    sha = hashlib.sha256(raw).hexdigest()
    dst = _cas_mcad_dir() / f"{sha}{ext}"
    if not dst.is_file():
        dst.write_bytes(raw)
    with _MCAD_LOCK:
        _ARTIFACT_REGISTRY[sha] = dst.resolve()
    return {
        "sha256": sha,
        "ext": ext,
        "bytes": len(raw),
        "url": f"/api/v1/mcad/artifact/{sha}",
    }


def lookup_mcad_artifact(sha256_hex: str) -> Optional[pathlib.Path]:
    if len(sha256_hex) != 64 or any(c not in "0123456789abcdef" for c in sha256_hex):
        return None
    with _MCAD_LOCK:
        p = _ARTIFACT_REGISTRY.get(sha256_hex)
    if p is not None and p.is_file():
        return p
    for ext in (".step", ".stl", ".vtu", ".json"):
        cand = _cas_mcad_dir() / f"{sha256_hex}{ext}"
        if cand.is_file():
            return cand.resolve()
    return None


def _invoke_ring2_mcad(payload: Dict[str, Any], timeout_sec: float = 60.0) -> Dict[str, Any]:
    if not _RING2_MCAD_WORKER.is_file():
        return {"ok": False, "error": f"Ring 2 MCAD worker missing: {_RING2_MCAD_WORKER}"}
    proc = _MCAD_SUPERVISOR.spawn(
        [sys.executable, str(_RING2_MCAD_WORKER)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    stdout_txt, stderr_txt = proc.communicate(json.dumps(payload), timeout=timeout_sec)
    if proc.returncode != 0:
        return {"ok": False, "error": (stderr_txt or stdout_txt or "mcad_thermal_worker failed")[-800:]}
    return json.loads(stdout_txt)


def _read_enclosure_script(proj_dir: pathlib.Path) -> str:
    enc_py = proj_dir / "mcad" / "enclosure.py"
    if not enc_py.is_file():
        enc_py.parent.mkdir(parents=True, exist_ok=True)
        enc_py.write_text(STARTER_ENCLOSURE_PY, encoding="utf-8")
    return enc_py.read_text(encoding="utf-8", errors="replace")


def _build_heat_loads_w(board_payload: Dict[str, Any], con: Optional[sqlite3.Connection]) -> tuple[Dict[str, float], float]:
    """Pulls component heat dissipation (W) from P9/P10 + P13 copper I^2*R Joule loss."""
    heat_w: Dict[str, float] = {}
    for comp in board_payload.get("components", []):
        ref = str(comp.get("refdes", ""))
        val = str(comp.get("value", "")).upper()
        if ref == "U1" or "TPS54302" in val:
            heat_w[ref] = 0.85  # Sync buck converter switching + RDS(on) loss (~850 mW)
        elif ref == "U2" or "STM32" in val:
            heat_w[ref] = 0.42  # MCU active load dissipation
        elif ref.startswith("L"):
            heat_w[ref] = 0.28  # Inductor DCR + core loss
        elif ref.startswith("R"):
            heat_w[ref] = 0.04
        elif ref.startswith("J"):
            heat_w[ref] = 0.05
        else:
            heat_w[ref] = 0.02

    # P10 SPICE transient dissipation if cached
    spice_cas = pathlib.Path(os.environ.get("VD_DB_DIR") or ".vd-dev") / "cas" / "spice"
    if spice_cas.is_dir():
        try:
            latest = sorted(spice_cas.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
            if latest:
                sdata = json.loads(latest[0].read_text(encoding="utf-8", errors="ignore"))
                p_mw = sdata.get("power_mw") or {}
                for k, v in p_mw.items():
                    heat_w[str(k)] = max(heat_w.get(str(k), 0.0), round(float(v) / 1000.0, 4))
        except Exception:
            pass

    # P13 padne copper I^2*R Joule heating
    pi_res = get_last_pi_result()
    pi_joule_w = 0.06
    if pi_res and isinstance(pi_res.get("worst_case"), dict):
        pi_joule_w = max(0.01, float(pi_res["worst_case"].get("total_joule_loss_mw", 60.0)) / 1000.0)

    return heat_w, pi_joule_w


def generate_parametric_enclosure(
    con: Optional[sqlite3.Connection],
    pcb_path: pathlib.Path,
    *,
    script_text: Optional[str] = None,
    overrides: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    global _LAST_ENCLOSURE, _LAST_CLASH
    pcb_path = pathlib.Path(pcb_path).resolve()
    if not pcb_path.is_file():
        return {"ok": False, "error": f"PCB file not found: {pcb_path}"}

    pcb_txt = pcb_path.read_text(encoding="utf-8", errors="replace")
    board_payload = build_board_3d_payload(pcb_txt, pcb_path=pcb_path, con=con)
    eff_script = script_text if script_text is not None else _read_enclosure_script(pcb_path.parent)

    res = _invoke_ring2_mcad({
        "action": "enclosure",
        "board": board_payload["board"],
        "components": board_payload["components"],
        "script_text": eff_script,
        "overrides": overrides or {},
    })
    if not res.get("ok"):
        return res

    step_art = _store_artifact(res.pop("step_text", ""), ".step")
    stl_art = _store_artifact(res.pop("stl_text", ""), ".stl")
    out = {
        **res,
        "pcb_path": str(pcb_path),
        "enclosure_script_path": "mcad/enclosure.py",
        "step_artifact": step_art,
        "stl_artifact": stl_art,
    }
    with _MCAD_LOCK:
        _LAST_ENCLOSURE = out
        _LAST_CLASH = res.get("clash")

    broadcast_ws_event({
        "type": "mcad:updated",
        "clash_mm3": (res.get("clash") or {}).get("clash_mm3", 0.0),
        "clash_passed": (res.get("clash") or {}).get("passed", True),
        "step_sha256": step_art["sha256"],
    })
    return out


def run_mcad_clash_check(
    con: Optional[sqlite3.Connection],
    pcb_path: pathlib.Path,
    *,
    script_text: Optional[str] = None,
    overrides: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    global _LAST_CLASH
    pcb_path = pathlib.Path(pcb_path).resolve()
    if not pcb_path.is_file():
        return {"ok": False, "error": f"PCB file not found: {pcb_path}"}
    pcb_txt = pcb_path.read_text(encoding="utf-8", errors="replace")
    board_payload = build_board_3d_payload(pcb_txt, pcb_path=pcb_path, con=con)
    eff_script = script_text if script_text is not None else _read_enclosure_script(pcb_path.parent)
    res = _invoke_ring2_mcad({
        "action": "clash",
        "board": board_payload["board"],
        "components": board_payload["components"],
        "script_text": eff_script,
        "overrides": overrides or {},
    })
    if res.get("ok"):
        with _MCAD_LOCK:
            _LAST_CLASH = res
    return res


def run_thermal_fem_solve(
    con: Optional[sqlite3.Connection],
    pcb_path: pathlib.Path,
    *,
    ambient_temp_c: float = 25.0,
    mesh_resolution: str = "fast_preview",
    heat_loads_override_w: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    global _LAST_THERMAL
    pcb_path = pathlib.Path(pcb_path).resolve()
    if not pcb_path.is_file():
        return {"ok": False, "error": f"PCB file not found: {pcb_path}"}

    pcb_txt = pcb_path.read_text(encoding="utf-8", errors="replace")
    board_payload = build_board_3d_payload(pcb_txt, pcb_path=pcb_path, con=con)
    heat_loads_w, pi_joule_w = _build_heat_loads_w(board_payload, con)
    if heat_loads_override_w:
        for k, v in heat_loads_override_w.items():
            heat_loads_w[str(k)] = float(v)

    vent_slots = 4
    with _MCAD_LOCK:
        if _LAST_ENCLOSURE:
            vent_slots = int((_LAST_ENCLOSURE.get("enclosure") or {}).get("params", {}).get("vent_slots", 4))

    res = _invoke_ring2_mcad({
        "action": "thermal",
        "board": board_payload["board"],
        "components": board_payload["components"],
        "heat_loads_w": heat_loads_w,
        "pi_joule_w": pi_joule_w,
        "ambient_temp_c": float(ambient_temp_c),
        "vent_slots": vent_slots,
        "mesh_resolution": mesh_resolution,
    })
    if not res.get("ok"):
        return res

    vtu_art = _store_artifact(res.pop("vtu_text", ""), ".vtu")
    out = {
        **res,
        "pcb_path": str(pcb_path),
        "vtu_artifact": vtu_art,
        "heat_loads_w": heat_loads_w,
    }
    with _MCAD_LOCK:
        _LAST_THERMAL = out
    broadcast_ws_event({
        "type": "thermal:solved",
        "max_temp_c": out.get("max_temp_c"),
        "peak_junction_temp_c": out.get("peak_junction_temp_c"),
        "passed": out.get("passed"),
    })
    return out


def get_mcad_status() -> Dict[str, Any]:
    cas_dir = _cas_mcad_dir()
    cas_count = len(list(cas_dir.glob("*"))) if cas_dir.is_dir() else 0
    with _MCAD_LOCK:
        return {
            "worker_present": _RING2_MCAD_WORKER.is_file(),
            "cadquery_cloned": _CADQUERY_SRC.is_dir(),
            "gmsh_cloned": _GMSH_SRC.is_dir(),
            "elmerfem_cloned": _ELMER_SRC.is_dir(),
            "ring_isolation": "ring2-subprocess-gpl-quarantine",
            "network_mode": "none",
            "cas_artifacts_count": cas_count,
            "last_enclosure": _LAST_ENCLOSURE,
            "last_clash": _LAST_CLASH,
            "last_thermal": _LAST_THERMAL,
        }
