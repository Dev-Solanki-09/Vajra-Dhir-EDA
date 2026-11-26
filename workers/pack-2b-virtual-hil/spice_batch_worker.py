"""
STRICTLY RING 2 ISOLATED SUBPROCESS WORKER (GPL-3.0 Quarantine).
Never imported into Ring 1 packages/* or vd-daemon.
Loads nunobrum/spicelib from vendor/quarantine/spicelib ONLY inside this subprocess
to mutate component tolerances (1%/5%/10%) for Monte-Carlo envelope sweeps.
"""

from __future__ import annotations

import json
import pathlib
import random
import re
import sys

_ROOT = pathlib.Path(__file__).resolve().parents[2]
_SPICELIB_DIR = _ROOT / "vendor" / "quarantine" / "spicelib"
_DAEMON_SRC = _ROOT / "packages" / "vd-daemon" / "src"

for _p in (str(_SPICELIB_DIR), str(_DAEMON_SRC)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import spicelib  # noqa: E402
from ngspice_runner import run_ngspice_with_recovery  # noqa: E402


def _scale_component_value(token: str, factor: float) -> str:
    m = re.match(r"^([0-9]+(?:\.[0-9]+)?)([a-zA-Z]*)$", token.strip())
    if not m:
        return token
    num = float(m.group(1)) * factor
    return f"{num:.5g}{m.group(2)}"


def _mutate_tolerances(netlist: str, tol_pct: float, rng: random.Random) -> str:
    frac = max(0.0, float(tol_pct)) / 100.0
    out_lines = []
    for line in netlist.splitlines():
        s = line.strip()
        if s and s[0].upper() in ("R", "C", "L") and not s.startswith("*"):
            parts = line.split()
            if len(parts) >= 4:
                factor = 1.0 + rng.uniform(-frac, frac)
                parts[3] = _scale_component_value(parts[3], factor)
                out_lines.append(" ".join(parts))
                continue
        out_lines.append(line)
    return "\n".join(out_lines)


def run_montecarlo_batch(netlist: str, tolerance_pct: float = 5.0, runs: int = 5) -> dict:
    rng = random.Random(20261126)
    nominal_res = run_ngspice_with_recovery(netlist)
    vouts_min = []
    vouts_max = []
    ripples_mv = []
    corner_results = []

    for idx in range(max(1, min(12, int(runs)))):
        # Include exact worst-case low/high corners on runs 0 and 1
        if idx == 0:
            frac = 1.0 + (tolerance_pct / 100.0)
            mutated = "\n".join(
                (" ".join([p[0], p[1], p[2], _scale_component_value(p[3], frac)] + p[4:])
                 if (l.strip()[:1].upper() in ("R", "C", "L") and len(l.split()) >= 4 and (p := l.split())) else l)
                for l in netlist.splitlines()
            )
        elif idx == 1:
            frac = max(0.1, 1.0 - (tolerance_pct / 100.0))
            mutated = "\n".join(
                (" ".join([p[0], p[1], p[2], _scale_component_value(p[3], frac)] + p[4:])
                 if (l.strip()[:1].upper() in ("R", "C", "L") and len(l.split()) >= 4 and (p := l.split())) else l)
                for l in netlist.splitlines()
            )
        else:
            mutated = _mutate_tolerances(netlist, tolerance_pct, rng)

        res = run_ngspice_with_recovery(mutated)
        vecs = res.get("vectors") or {}
        v_arr = [float(x) for x in vecs.get("vout_3v3", [])] if isinstance(vecs.get("vout_3v3"), list) else []
        if v_arr:
            tail = v_arr[int(len(v_arr) * 0.65) :] or v_arr
            r_mv = round((max(tail) - min(tail)) * 1000.0, 2)
            vouts_min.append(round(min(v_arr), 4))
            vouts_max.append(round(max(v_arr), 4))
            ripples_mv.append(r_mv)
            corner_results.append({"run": idx + 1, "min_v": vouts_min[-1], "max_v": vouts_max[-1], "ripple_mv_pp": r_mv})

    return {
        "ok": nominal_res.get("ok", False),
        "spicelib_version": getattr(spicelib, "__version__", "quarantined"),
        "ring_isolation": "ring2-subprocess-gpl3-quarantine",
        "tolerance_pct": tolerance_pct,
        "runs_executed": len(corner_results),
        "worst_case_min_v": min(vouts_min) if vouts_min else 0.0,
        "worst_case_max_v": max(vouts_max) if vouts_max else 0.0,
        "worst_case_ripple_mv_pp": max(ripples_mv) if ripples_mv else 0.0,
        "corners": corner_results,
        "nominal_run": nominal_res,
    }


if __name__ == "__main__":
    req = json.loads(sys.stdin.read() or "{}")
    out = run_montecarlo_batch(
        netlist=str(req.get("netlist", "")),
        tolerance_pct=float(req.get("tolerance_pct", 5.0)),
        runs=int(req.get("runs", 5)),
    )
    print(json.dumps(out))
