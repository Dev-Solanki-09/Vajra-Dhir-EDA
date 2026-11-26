"""Prompt 10 SPICE Simulation & HW-IR Netlist Synthesis REST routes (loopback only)."""

from __future__ import annotations

import json
import pathlib
import sqlite3
from typing import Any, Dict, Optional

try:
    from .kicad_bridge import write_text_atomic
    from .kicad_routes import _ACTIVE_STATE, _ensure_active_workspace, broadcast_ws_event
    from .ngspice_runner import find_ngspice_library
    from .spice_synth import run_spice_simulation_pipeline, synthesize_spice_from_hwir
except ImportError:
    from kicad_bridge import write_text_atomic
    from kicad_routes import _ACTIVE_STATE, _ensure_active_workspace, broadcast_ws_event
    from ngspice_runner import find_ngspice_library
    from spice_synth import run_spice_simulation_pipeline, synthesize_spice_from_hwir


def _send_json(handler: Any, status: int, body: Dict[str, Any]) -> None:
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler._send_cors()
    handler.end_headers()
    handler.wfile.write(json.dumps(body).encode("utf-8"))


def _save_workspace_cir(netlist: str) -> Optional[str]:
    _ensure_active_workspace()
    proj_dir = _ACTIVE_STATE.get("project_dir")
    if not proj_dir:
        return None
    sim_dir = pathlib.Path(proj_dir) / "sim"
    sim_dir.mkdir(parents=True, exist_ok=True)
    cir_path = sim_dir / "board.cir"
    write_text_atomic(cir_path, netlist)
    return "sim/board.cir"


def handle_spice_get(handler: Any, path: str, full_path: str = "", con: Optional[sqlite3.Connection] = None) -> bool:
    if path == "/api/v1/sim/status":
        lib_info = find_ngspice_library()
        worker_file = pathlib.Path(__file__).resolve().parents[3] / "workers" / "pack-2b-virtual-hil" / "spice_batch_worker.py"
        _send_json(handler, 200, {
            "ngspice_native": lib_info,
            "ngspice_wasm_worker": "@vajradhir/sim-worker (eecircuit-engine MIT)",
            "spicelib_ring2_worker": worker_file.is_file(),
            "modes": ["op", "tran", "ac", "montecarlo", "fault"],
            "fault_types": ["none", "short_circuit", "overvoltage", "reverse_polarity", "surge_2x", "brownout_dip"],
        })
        return True

    if path == "/api/v1/sim/synthesize":
        synth = synthesize_spice_from_hwir(con, mode="tran")
        rel_path = _save_workspace_cir(synth["netlist"])
        _send_json(handler, 200, {**synth, "cir_file": rel_path})
        return True

    return False


def handle_spice_post(handler: Any, path: str, req: Dict[str, Any], con: Optional[sqlite3.Connection] = None) -> bool:
    if path == "/api/v1/sim/synthesize":
        mode = str(req.get("mode", "tran"))
        fault_type = str(req.get("fault_type", "none"))
        c_out_uf = float(req["c_out_uf"]) if req.get("c_out_uf") is not None else None
        l_uh = float(req["l_uh"]) if req.get("l_uh") is not None else None
        r_load_ohm = float(req["r_load_ohm"]) if req.get("r_load_ohm") is not None else None
        v_in_v = float(req.get("v_in_v", 12.0))
        synth = synthesize_spice_from_hwir(
            con,
            mode=mode,
            fault_type=fault_type,
            c_out_uf=c_out_uf,
            l_uh=l_uh,
            r_load_ohm=r_load_ohm,
            v_in_v=v_in_v,
        )
        rel_path = _save_workspace_cir(synth["netlist"])
        _send_json(handler, 200, {**synth, "cir_file": rel_path})
        return True

    if path == "/api/v1/sim/run":
        mode = str(req.get("mode", "tran"))
        fault_type = str(req.get("fault_type", "none"))
        custom_netlist = req.get("netlist") if isinstance(req.get("netlist"), str) and req.get("netlist", "").strip() else None
        c_out_uf = float(req["c_out_uf"]) if req.get("c_out_uf") is not None else None
        l_uh = float(req["l_uh"]) if req.get("l_uh") is not None else None
        r_load_ohm = float(req["r_load_ohm"]) if req.get("r_load_ohm") is not None else None
        v_in_v = float(req.get("v_in_v", 12.0))
        tol_pct = float(req.get("tol_pct", 5.0))
        use_cache = bool(req.get("use_cache", True))

        res = run_spice_simulation_pipeline(
            con,
            mode=mode,
            fault_type=fault_type,
            custom_netlist=custom_netlist,
            c_out_uf=c_out_uf,
            l_uh=l_uh,
            r_load_ohm=r_load_ohm,
            v_in_v=v_in_v,
            tol_pct=tol_pct,
            use_cache=use_cache,
        )
        if res.get("netlist"):
            res["cir_file"] = _save_workspace_cir(res["netlist"])

        broadcast_ws_event({
            "type": "sim:completed",
            "mode": mode,
            "ok": res["ok"],
            "ripple_mv_pp": res.get("metrics", {}).get("ripple_mv_pp", 0),
            "p9_error_count": len([f for f in res.get("p9_stress_findings", []) if f.get("severity") == "error"]),
        })
        _send_json(handler, 200, res)
        return True

    return False
