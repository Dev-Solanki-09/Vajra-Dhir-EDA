"""
Isolated Native ngspice.dll (Modified BSD) execution runner for Vajra-Dhir EDA (Prompt 10).
Discovers KiCad 10's shipped ngspice.dll (zero global install needed) and runs SPICE decks
in an isolated child process so C-level ngspice calls can never crash vd-daemon.
"""

from __future__ import annotations

import ctypes
import json
import math
import os
import pathlib
import re
import subprocess
import sys
from typing import Any, Dict, List, Optional

try:
    from .kicad_bridge import find_kicad_cli
except ImportError:
    from kicad_bridge import find_kicad_cli


class _NgComplex(ctypes.Structure):
    _fields_ = [("cx_real", ctypes.c_double), ("cx_imag", ctypes.c_double)]


class _VectorInfo(ctypes.Structure):
    _fields_ = [
        ("v_name", ctypes.c_char_p),
        ("v_type", ctypes.c_int),
        ("v_flags", ctypes.c_short),
        ("v_realdata", ctypes.POINTER(ctypes.c_double)),
        ("v_compdata", ctypes.POINTER(_NgComplex)),
        ("v_length", ctypes.c_int),
    ]


SPICE_RECOVERY_LADDER = [
    ("nominal", None),
    ("gmin_stepping", ".options gmin=1e-8"),
    ("source_stepping", ".options gmin=1e-8 srcsteps=10"),
    ("tolerance_relaxation", ".options reltol=0.005 abstol=1e-10 chgtol=1e-14"),
    ("uic_bypass", "UIC"),
]


_NGSPICE_LIB_CACHE: Optional[Dict[str, Any]] = None


def find_ngspice_library() -> Dict[str, Any]:
    global _NGSPICE_LIB_CACHE
    if _NGSPICE_LIB_CACHE is not None and _NGSPICE_LIB_CACHE.get("installed"):
        p = _NGSPICE_LIB_CACHE.get("path")
        if p and os.path.isfile(p):
            return dict(_NGSPICE_LIB_CACHE)

    candidates: List[pathlib.Path] = []
    local_app = os.environ.get("LOCALAPPDATA", "")
    if local_app:
        candidates.append(pathlib.Path(local_app) / "Programs" / "KiCad" / "10.0" / "bin" / "ngspice.dll")
        candidates.append(pathlib.Path(local_app) / "Programs" / "KiCad" / "10" / "bin" / "ngspice.dll")
    candidates.extend([
        pathlib.Path("C:/Program Files/KiCad/10.0/bin/ngspice.dll"),
        pathlib.Path("C:/Program Files/KiCad/10/bin/ngspice.dll"),
        pathlib.Path("/usr/lib/x86_64-linux-gnu/libngspice.so"),
        pathlib.Path("/usr/lib/libngspice.so"),
    ])
    for cand in candidates:
        if cand.is_file():
            res = {"installed": True, "path": str(cand), "source": "kicad-10-bundled-bsd"}
            _NGSPICE_LIB_CACHE = res
            return dict(res)

    cli = find_kicad_cli()
    if cli.get("path"):
        cand = pathlib.Path(cli["path"]).parent / "ngspice.dll"
        if cand.is_file():
            res = {"installed": True, "path": str(cand), "source": "kicad-10-bundled-bsd"}
            _NGSPICE_LIB_CACHE = res
            return dict(res)
    return {"installed": False, "path": None, "source": None}


def inject_convergence_option(netlist: str, directive: Optional[str]) -> str:
    if not directive:
        return netlist
    if directive == "UIC":
        return re.sub(
            r"^(\.tran\s+[^\r\n]+)",
            lambda m: m.group(1) if "uic" in m.group(1).lower() else f"{m.group(1)} uic",
            netlist,
            flags=re.IGNORECASE | re.MULTILINE,
        )
    lines = netlist.splitlines()
    for idx, line in enumerate(lines):
        if line.strip().lower() == ".end":
            lines.insert(idx, directive)
            return "\n".join(lines)
    return f"{netlist}\n{directive}\n.end"


def _parse_monaco_diagnostics(netlist: str, logs: List[str]) -> List[Dict[str, Any]]:
    diags: List[Dict[str, Any]] = []
    lines = netlist.splitlines()
    for entry in logs:
        low = entry.lower()
        if any(k in low for k in ("error", "unknown", "timestep too small", "singular", "no such")):
            m = re.search(r"line\s+(\d+)", low)
            line_no = int(m.group(1)) if m else max(1, len(lines))
            diags.append({
                "line": min(line_no, max(1, len(lines))),
                "severity": "error",
                "message": entry.strip(),
            })
    return diags[:10]


def execute_ngspice_dll_once(netlist: str, dll_path: Optional[str] = None) -> Dict[str, Any]:
    info = find_ngspice_library() if not dll_path else {"installed": True, "path": dll_path}
    if not info["installed"] or not info["path"]:
        return {"ok": False, "error": "ngspice.dll not found", "logs": [], "vectors": {}, "plot": ""}

    p = pathlib.Path(info["path"])
    if hasattr(os, "add_dll_directory"):
        os.add_dll_directory(str(p.parent))
    lib = ctypes.CDLL(str(p))

    cb_char = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_void_p)
    cb_stat = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.c_int, ctypes.c_bool, ctypes.c_bool, ctypes.c_int, ctypes.c_void_p)
    cb_exit = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.c_int, ctypes.c_bool, ctypes.c_bool, ctypes.c_int, ctypes.c_void_p)

    logs: List[str] = []

    def _on_char(msg: bytes, _ident: int, _ud: Any) -> int:
        if msg:
            logs.append(msg.decode("utf-8", errors="replace"))
        return 0

    def _on_stat(_stat: int, _imm: bool, _quit: bool, _ident: int, _ud: Any) -> int:
        return 0

    def _on_exit(_status: int, _imm: bool, _quit: bool, _ident: int, _ud: Any) -> int:
        return 0

    c1, c2, c3 = cb_char(_on_char), cb_stat(_on_stat), cb_exit(_on_exit)
    lib.ngSpice_Init(c1, c2, c3, None, None, None, None)

    lib.ngSpice_CurPlot.restype = ctypes.c_char_p
    lib.ngSpice_AllVecs.argtypes = [ctypes.c_char_p]
    lib.ngSpice_AllVecs.restype = ctypes.POINTER(ctypes.c_char_p)
    lib.ngGet_Vec_Info.argtypes = [ctypes.c_char_p]
    lib.ngGet_Vec_Info.restype = ctypes.POINTER(_VectorInfo)

    raw_lines = [line.encode("utf-8", errors="replace") for line in netlist.splitlines()] + [None]
    arr = (ctypes.c_char_p * len(raw_lines))(*raw_lines)
    circ_rc = int(lib.ngSpice_Circ(arr))
    if circ_rc != 0:
        return {
            "ok": False,
            "error": f"ngSpice_Circ returned {circ_rc}",
            "logs": logs,
            "vectors": {},
            "plot": "",
        }

    run_rc = int(lib.ngSpice_Command(b"run"))
    plot_b = lib.ngSpice_CurPlot()
    plot_name = plot_b.decode("utf-8", errors="replace") if plot_b else ""
    if run_rc != 0 or not plot_name or plot_name == "const":
        return {
            "ok": False,
            "error": f"ngspice run returned {run_rc} (plot={plot_name or 'none'})",
            "logs": logs,
            "vectors": {},
            "plot": plot_name,
        }

    vp = lib.ngSpice_AllVecs(plot_b)
    vectors: Dict[str, Any] = {}
    i = 0
    while vp and vp[i]:
        vname_b = vp[i]
        vname = vname_b.decode("utf-8", errors="replace")
        vi_ptr = lib.ngGet_Vec_Info(vname_b)
        if vi_ptr:
            vi = vi_ptr.contents
            n = int(vi.v_length)
            # Downsample uniformly if huge (> 600 points) to keep UI JSON snappy
            stride = max(1, n // 500)
            if vi.v_realdata:
                vectors[vname] = [round(float(vi.v_realdata[k]), 6) for k in range(0, n, stride)]
            elif vi.v_compdata:
                mags: List[float] = []
                phases: List[float] = []
                mags_db: List[float] = []
                for k in range(0, n, stride):
                    re_v = float(vi.v_compdata[k].cx_real)
                    im_v = float(vi.v_compdata[k].cx_imag)
                    mag = math.hypot(re_v, im_v)
                    mags.append(round(mag, 6))
                    mags_db.append(round(20.0 * math.log10(max(mag, 1e-12)), 3))
                    phases.append(round(math.degrees(math.atan2(im_v, re_v)), 2))
                vectors[vname] = {
                    "mag": mags,
                    "mag_db": mags_db,
                    "phase_deg": phases,
                }
        i += 1

    has_err = any("run simulation(s) aborted" in l.lower() or "timestep too small" in l.lower() for l in logs)
    return {
        "ok": len(vectors) > 0 and not has_err,
        "error": "" if (len(vectors) > 0 and not has_err) else "Simulation aborted",
        "logs": logs[-80:],
        "vectors": vectors,
        "plot": plot_name,
    }


def run_ngspice_with_recovery(netlist: str, timeout_sec: float = 25.0) -> Dict[str, Any]:
    """
    Executes netlist in an isolated child Python process against KiCad 10 ngspice.dll,
    walking the deterministic vd-solver-recovery ladder on convergence failures.
    """
    info = find_ngspice_library()
    if not info["installed"]:
        return {
            "ok": False,
            "engine": "ngspice-native",
            "error": "ngspice.dll not found",
            "diagnostics": [{"line": 1, "severity": "error", "message": "Native ngspice.dll unavailable"}],
            "vectors": {},
        }

    runner_path = str(pathlib.Path(__file__).resolve())
    for step_idx, (label, directive) in enumerate(SPICE_RECOVERY_LADDER):
        deck = inject_convergence_option(netlist, directive)
        proc = subprocess.run(
            [sys.executable, runner_path, "--stdin-json"],
            input=json.dumps({"netlist": deck, "dll_path": info["path"]}),
            text=True,
            capture_output=True,
            timeout=timeout_sec,
            check=False,
        )
        if proc.returncode == 0 and proc.stdout.strip():
            try:
                res = json.loads(proc.stdout)
                if res.get("ok"):
                    res["engine"] = "ngspice-native-dll"
                    res["dll_path"] = info["path"]
                    res["ladder_step"] = step_idx
                    res["ladder_label"] = label
                    res["diagnostics"] = []
                    return res
                last_res = res
            except json.JSONDecodeError:
                last_res = {"ok": False, "error": proc.stderr or proc.stdout, "logs": []}
        else:
            last_res = {"ok": False, "error": proc.stderr or f"exit={proc.returncode}", "logs": []}

    logs = last_res.get("logs", []) if isinstance(last_res, dict) else []
    return {
        "ok": False,
        "engine": "ngspice-native-dll",
        "dll_path": info["path"],
        "ladder_step": len(SPICE_RECOVERY_LADDER) - 1,
        "ladder_label": "exhausted",
        "error": last_res.get("error", "Convergence failure") if isinstance(last_res, dict) else "Failure",
        "logs": logs,
        "diagnostics": _parse_monaco_diagnostics(netlist, logs),
        "vectors": {},
    }


def _main() -> None:
    if "--stdin-json" in sys.argv:
        payload = json.loads(sys.stdin.read() or "{}")
        res = execute_ngspice_dll_once(
            netlist=str(payload.get("netlist", "")),
            dll_path=payload.get("dll_path"),
        )
        print(json.dumps(res))


if __name__ == "__main__":
    _main()
