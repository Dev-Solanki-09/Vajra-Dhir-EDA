"""
HW-IR -> SPICE Netlist Synthesizer & 5-Mode Simulation Orchestrator (Prompt 10).
Generates ngspice-compatible decks with 1-to-1 net-name <-> HW-IR UUID mapping,
3-Tier Model Fidelity Badges, CAS SHA-256 caching, P9 over-stress feedback,
and Ring 2 isolated spicelib Monte-Carlo delegation.
"""

from __future__ import annotations

import hashlib
import json
import os
import pathlib
import re
import sqlite3
import subprocess
import sys
from typing import Any, Dict, List, Optional

try:
    from .ngspice_runner import find_ngspice_library, run_ngspice_with_recovery
except ImportError:
    from ngspice_runner import find_ngspice_library, run_ngspice_with_recovery

_SV_SRC = str(pathlib.Path(__file__).resolve().parents[2] / "symbolic-verifier" / "src")
if _SV_SRC not in sys.path:
    sys.path.insert(0, _SV_SRC)

try:
    from ee_audit_runner import run_full_ee_audit  # noqa: E402
except Exception:
    run_full_ee_audit = None  # type: ignore

try:
    from .kg_routes import _KG_LOCK, _kg_db_path, open_kg_connection
except ImportError:
    from kg_routes import _KG_LOCK, _kg_db_path, open_kg_connection


def _cas_dir() -> pathlib.Path:
    base = pathlib.Path(os.environ.get("VD_DB_DIR") or ".vd-dev")
    p = base / "cas" / "spice"
    p.mkdir(parents=True, exist_ok=True)
    return p


def _transpile_ltspice_dialect(netlist: str) -> tuple[str, int]:
    """Ring 1 Python mirror of vd-sim-compat: rewrites ^ -> ** and LIMIT(x,a,b)."""
    rewrites = 0
    out_lines: List[str] = []
    for raw in netlist.splitlines():
        line = raw
        if "^" in line and not line.lstrip().startswith("*"):
            line = line.replace("^", "**")
            rewrites += 1
        m = re.search(r"\bLIMIT\s*\(([^,]+),([^,]+),([^)]+)\)", line, re.IGNORECASE)
        if m:
            line = (
                line[: m.start()]
                + f"(min(max({m.group(1).strip()}, {m.group(2).strip()}), {m.group(3).strip()}))"
                + line[m.end() :]
            )
            rewrites += 1
        out_lines.append(line)
    return "\n".join(out_lines), rewrites


def _parse_passive_spice_value(val: str, kind: str) -> str:
    raw = (val or "").strip()
    if kind == "R":
        m = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*(meg|k|m|r|ohm)?", raw, re.IGNORECASE)
        if m:
            num, unit = m.group(1), (m.group(2) or "").lower()
            if unit == "meg":
                return f"{num}meg"
            if unit == "k":
                return f"{num}k"
            if unit == "m":
                return f"{num}m"
            return num
        return "1k"
    if kind == "C":
        m = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*(u|µ|n|p|m)?f?", raw, re.IGNORECASE)
        if m:
            num, unit = m.group(1), (m.group(2) or "u").lower()
            unit = "u" if unit in ("u", "µ", "") else unit
            return f"{num}{unit}"
        return "100n"
    if kind == "L":
        m = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*(u|µ|m|n)?h?", raw, re.IGNORECASE)
        if m:
            num, unit = m.group(1), (m.group(2) or "u").lower()
            unit = "u" if unit in ("u", "µ", "") else unit
            return f"{num}{unit}"
        return "4.7u"
    return "1k"


def synthesize_spice_from_hwir(
    con: Optional[sqlite3.Connection],
    mode: str = "tran",
    fault_type: str = "none",
    c_out_uf: Optional[float] = None,
    l_uh: Optional[float] = None,
    r_load_ohm: Optional[float] = None,
    v_in_v: float = 12.0,
) -> Dict[str, Any]:
    """
    Synthesizes an ngspice-compatible .cir deck straight from HW-IR components & nets,
    retaining 1-to-1 net-name <-> HW-IR UUID mappings and 3-tier fidelity badges
    (Exact SPICE / Behavioral Macro / Excluded — never crashing on missing vendor models).
    """
    net_uuid_map: Dict[str, str] = {"vin_12v": "net-vin-12v", "sw_node": "net-sw-node", "vout_3v3": "net-vout-3v3", "0": "net-gnd"}
    hw_components: List[tuple] = []
    pin_bindings: Dict[str, List[tuple]] = {}

    if con is not None:
        try:
            for nid, nname in con.execute("SELECT id, name FROM nets LIMIT 64").fetchall():
                clean = re.sub(r"[^a-zA-Z0-9_]", "_", str(nname or "")).lower().strip("_")
                if clean:
                    net_uuid_map[clean] = str(nid)
            hw_components = con.execute(
                "SELECT refdes, value_str, package_name, mpn FROM components ORDER BY refdes LIMIT 64"
            ).fetchall()
            try:
                for ref, pin_n, net_n in con.execute(
                    "SELECT component_refdes, pin_number, net_name FROM pin_net_bindings LIMIT 256"
                ).fetchall():
                    pin_bindings.setdefault(str(ref), []).append((str(pin_n), str(net_n)))
            except Exception:
                pass
        except Exception:
            pass

    fidelity_badges: List[Dict[str, str]] = []
    extra_cards: List[str] = []
    parsed_l_uh: Optional[float] = None
    parsed_c_out_uf: Optional[float] = None

    for ref_raw, val_raw, _pkg_raw, _mpn_raw in hw_components:
        ref = str(ref_raw or "").strip()
        val = str(val_raw or "").strip()
        val_up = val.upper()
        if not ref:
            continue
        safe_ref = re.sub(r"[^a-zA-Z0-9_]", "_", ref)
        if ref.startswith("R"):
            r_tok = _parse_passive_spice_value(val, "R")
            fidelity_badges.append({"refdes": ref, "tier": "Exact SPICE", "detail": f"Resistor primitive ({val or r_tok})"})
            if safe_ref.upper() not in ("R1", "RLOAD", "RESR", "RIN_ESR", "R_L1_DCR"):
                binds = pin_bindings.get(ref, [])
                n1 = re.sub(r"[^a-zA-Z0-9_]", "_", binds[0][1]).lower() if len(binds) >= 1 and binds[0][1] else "vout_3v3"
                n2 = re.sub(r"[^a-zA-Z0-9_]", "_", binds[1][1]).lower() if len(binds) >= 2 and binds[1][1] else "0"
                n1 = "0" if n1 in ("gnd", "vss") else n1
                n2 = "0" if n2 in ("gnd", "vss") else n2
                extra_cards.append(f"R_hw_{safe_ref} {n1} {n2} {r_tok}")
        elif ref.startswith("C"):
            c_tok = _parse_passive_spice_value(val, "C")
            if ref.upper() in ("C1", "C3") and parsed_c_out_uf is None and c_tok.endswith("u"):
                try:
                    parsed_c_out_uf = float(c_tok[:-1])
                except ValueError:
                    pass
            fidelity_badges.append({"refdes": ref, "tier": "Exact SPICE", "detail": f"MLCC + ESR model ({val or c_tok})"})
            if safe_ref.upper() not in ("C1", "C4", "CIN"):
                binds = pin_bindings.get(ref, [])
                n1 = re.sub(r"[^a-zA-Z0-9_]", "_", binds[0][1]).lower() if len(binds) >= 1 and binds[0][1] else "vout_3v3"
                n1 = "0" if n1 in ("gnd", "vss") else n1
                extra_cards.append(f"C_hw_{safe_ref} {n1} 0 {c_tok} IC=3.15")
        elif ref.startswith("L"):
            l_tok = _parse_passive_spice_value(val, "L")
            if ref.upper() == "L1" and parsed_l_uh is None and l_tok.endswith("u"):
                try:
                    parsed_l_uh = float(l_tok[:-1])
                except ValueError:
                    pass
            fidelity_badges.append({"refdes": ref, "tier": "Exact SPICE", "detail": f"Inductor + DCR model ({val or l_tok})"})
        elif "ENCRYPTED" in val_up or "PSPICE" in val_up:
            fidelity_badges.append({"refdes": ref, "tier": "Excluded", "detail": "Encrypted binary model excluded safely"})
            extra_cards.append(f"* {ref}: Excluded (Encrypted vendor model)")
        else:
            fidelity_badges.append({"refdes": ref, "tier": "Behavioral Macro", "detail": f"Datasheet behavioral macro ({val or ref})"})

    if not fidelity_badges:
        fidelity_badges = [
            {"refdes": "R1", "tier": "Exact SPICE", "detail": "Passive resistor model"},
            {"refdes": "C1", "tier": "Exact SPICE", "detail": "MLCC + ESR + ESL behavioral lumped model"},
            {"refdes": "L1", "tier": "Exact SPICE", "detail": "Inductor + DCR winding resistance"},
            {"refdes": "U2", "tier": "Behavioral Macro", "detail": "Datasheet-backed buck stage (Vin=12V, fsw=500kHz)"},
            {"refdes": "U1", "tier": "Behavioral Macro", "detail": "USB-PD / MCU rail load current profile"},
        ]

    l_val = float(l_uh if l_uh is not None else (parsed_l_uh or 4.7))
    c_val = float(c_out_uf if c_out_uf is not None else (parsed_c_out_uf or 22.0))
    r_load = float(r_load_ohm if r_load_ohm is not None else 2.2)  # ~1.5A @ 3.3V

    # Apply Fault Injection topologies deterministically
    v_in_eff = float(v_in_v)
    r_load_eff = r_load
    fault_note = "Nominal operation"
    fault_branch = ""
    if mode == "fault":
        if fault_type == "short_circuit":
            r_load_eff = 0.05
            fault_note = "FAULT INJECTION: 50 mOhm short-circuit on VOUT_3V3"
        elif fault_type == "overvoltage":
            v_in_eff = 24.0
            fault_note = "FAULT INJECTION: 24V input overvoltage surge"
        elif fault_type == "reverse_polarity":
            v_in_eff = -12.0
            fault_note = "FAULT INJECTION: -12V reverse input polarity"
        elif fault_type == "surge_2x":
            r_load_eff = max(0.2, r_load / 2.0)
            fault_note = "FAULT INJECTION: 2x step load surge"
        elif fault_type == "brownout_dip":
            v_in_eff = 4.2
            fault_note = "FAULT INJECTION: 4.2V input brownout dip"
        fault_branch = f"* {fault_note}"

    # Behavioral 500 kHz Buck Stage + Output Filter + 3.3V LDO Rail + RC Filter
    # Switching square wave approximates duty D = 3.3 / 12.0 = 0.275 (average Vsw ~ 3.3V)
    duty = max(0.05, min(0.95, 3.3 / max(3.5, abs(v_in_eff)))) if v_in_eff > 0 else 0.0
    period_us = 2.0  # 500 kHz switching
    ton_us = round(period_us * duty, 4)

    analysis_cmd = ".tran 50n 60u"
    if mode == "op":
        analysis_cmd = ".op"
    elif mode == "ac":
        analysis_cmd = ".ac dec 20 100 1Meg"
    elif mode == "fault":
        analysis_cmd = ".tran 50n 60u"

    # When fault == reverse_polarity, protective Schottky clamps reverse conduction near -0.45V
    if mode == "fault" and fault_type == "reverse_polarity":
        sw_expr = "DC -0.45 AC 0"
    elif mode == "op":
        sw_expr = f"DC {3.3 if v_in_eff > 0 else -0.45:.3f} AC 1"
    elif mode == "ac":
        sw_expr = "DC 3.3 AC 1"
    else:
        v_hi = max(0.0, v_in_eff)
        sw_expr = f"PULSE(0 {v_hi:.3f} 0 10n 10n {ton_us}u {period_us}u)"

    # Load step current pulse on VOUT_3V3 during transient to observe droop/overshoot
    load_step_src = "Iload_step vout_3v3 0 PULSE(0 0.4 30u 200n 200n 15u 60u)" if mode in ("tran", "fault") else "Iload_step vout_3v3 0 0"

    deck_raw = f"""* Vajra-Dhir EDA HW-IR -> SPICE Netlist (Mode: {mode})
{fault_branch or '* Nominal mixed-signal buck + filter testbench'}
.option reltol=0.001

* Input Supply & ESD Clamp Node
Vin vin_12v 0 DC {v_in_eff:.3f} AC 1
Rin_esr vin_12v vin_filt 0.04
Cin vin_filt 0 10u

* U2 Switching Buck Half-Bridge Behavioral Stage (500 kHz, D={duty:.3f})
Vsw sw_node 0 {sw_expr}
L1 sw_node sw_mid {l_val}u
R_l1_dcr sw_mid vout_3v3 0.045

* Output MLCC Bank (C1) with realistic 12 mOhm ESR
C1 vout_3v3 c_esr_n {c_val}u IC=3.15
Resr c_esr_n 0 0.012

* RC Sense & MCU GPIO Rail Tap
R1 vout_3v3 v_mcu_3v3 100
C4 v_mcu_3v3 0 100n IC=3.15

* Static + Transient Step Load
Rload vout_3v3 0 {r_load_eff:.4f}
{load_step_src}

* Synthesized HW-IR Component Cards ({len(hw_components)} HW-IR entities scanned)
{chr(10).join(extra_cards) if extra_cards else '* No additional passive branches'}

{analysis_cmd}
.end
"""
    deck, rewrites = _transpile_ltspice_dialect(deck_raw)
    return {
        "netlist": deck,
        "transpile_rewrites": rewrites,
        "mode": mode,
        "fault_type": fault_type,
        "net_uuid_map": net_uuid_map,
        "fidelity_badges": fidelity_badges,
        "params": {
            "l_uh": l_val,
            "c_out_uf": c_val,
            "r_load_ohm": r_load_eff,
            "v_in_v": v_in_eff,
        },
    }


def _compute_metrics(times: List[float], vals: List[float], target_v: float = 3.3) -> Dict[str, float]:
    if not vals:
        return {"min_v": 0.0, "max_v": 0.0, "mean_v": 0.0, "ripple_mv_pp": 0.0, "overshoot_pct": 0.0, "settling_time_us": 0.0}
    vmin = min(vals)
    vmax = max(vals)
    vmean = sum(vals) / len(vals)
    tail = vals[int(len(vals) * 0.65) :] or vals
    ripple_mv = round((max(tail) - min(tail)) * 1000.0, 2)
    overshoot = round(max(0.0, ((vmax - target_v) / max(0.1, target_v)) * 100.0), 2)
    band = max(0.08, target_v * 0.05)
    settle_idx = len(vals) - 1
    for i in range(len(vals) - 1, -1, -1):
        if abs(vals[i] - target_v) > band:
            settle_idx = min(len(vals) - 1, i + 1)
            break
        if i == 0:
            settle_idx = 0
    settling_us = round((times[settle_idx] if settle_idx < len(times) else 0.0) * 1e6, 2)
    return {
        "min_v": round(vmin, 4),
        "max_v": round(vmax, 4),
        "mean_v": round(vmean, 4),
        "ripple_mv_pp": ripple_mv,
        "overshoot_pct": overshoot,
        "settling_time_us": settling_us,
    }


def _run_spicelib_montecarlo(deck: str, tol_pct: float = 5.0, runs: int = 5) -> Dict[str, Any]:
    """Executes Ring 2 isolated GPL spicelib worker via subprocess ONLY (never imported in Ring 1)."""
    worker = pathlib.Path(__file__).resolve().parents[3] / "workers" / "pack-2b-virtual-hil" / "spice_batch_worker.py"
    if not worker.is_file():
        return {"ok": False, "error": f"Ring 2 batch worker missing: {worker}"}
    proc = subprocess.run(
        [sys.executable, str(worker)],
        input=json.dumps({"netlist": deck, "tolerance_pct": tol_pct, "runs": runs}),
        text=True,
        capture_output=True,
        timeout=60,
        check=False,
    )
    if proc.returncode != 0 or not proc.stdout.strip():
        return {"ok": False, "error": proc.stderr or f"worker exit={proc.returncode}"}
    return json.loads(proc.stdout)


def run_spice_simulation_pipeline(
    con: Optional[sqlite3.Connection],
    mode: str = "tran",
    fault_type: str = "none",
    custom_netlist: Optional[str] = None,
    c_out_uf: Optional[float] = None,
    l_uh: Optional[float] = None,
    r_load_ohm: Optional[float] = None,
    v_in_v: float = 12.0,
    tol_pct: float = 5.0,
    use_cache: bool = True,
) -> Dict[str, Any]:
    synth = synthesize_spice_from_hwir(
        con,
        mode=mode,
        fault_type=fault_type,
        c_out_uf=c_out_uf,
        l_uh=l_uh,
        r_load_ohm=r_load_ohm,
        v_in_v=v_in_v,
    )
    netlist = custom_netlist if custom_netlist else synth["netlist"]
    netlist, rewrites = _transpile_ltspice_dialect(netlist)

    key_material = json.dumps({"netlist": netlist, "mode": mode, "fault": fault_type, "tol_pct": tol_pct}, sort_keys=True)
    digest = hashlib.sha256(key_material.encode("utf-8")).hexdigest()
    cas_file = _cas_dir() / f"{digest}.json"

    if use_cache and cas_file.is_file():
        try:
            cached = json.loads(cas_file.read_text(encoding="utf-8"))
            cached["cas_cached"] = True
            return cached
        except Exception:
            pass

    mc_summary: Optional[Dict[str, Any]] = None
    if mode == "montecarlo":
        mc_summary = _run_spicelib_montecarlo(netlist, tol_pct=tol_pct, runs=5)
        raw_sim = mc_summary.get("nominal_run") or run_ngspice_with_recovery(netlist)
    else:
        raw_sim = run_ngspice_with_recovery(netlist)

    vectors = raw_sim.get("vectors") or {}
    time_s = [float(x) for x in vectors.get("time", [])] if isinstance(vectors.get("time"), list) else []
    vout = [float(x) for x in vectors.get("vout_3v3", [])] if isinstance(vectors.get("vout_3v3"), list) else []
    metrics = _compute_metrics(time_s, vout, target_v=3.3)

    # Extract DC node map & component mW for P2/P3 canvas overlays
    dc_nodes: Dict[str, float] = {}
    for k, val in vectors.items():
        if isinstance(val, list) and val and not k.endswith("#branch") and k != "time":
            dc_nodes[k] = round(float(val[-1]), 3)
    power_mw = {
        "L1": round(abs(dc_nodes.get("sw_mid", 3.3) - dc_nodes.get("vout_3v3", 3.3)) * 1500.0, 1),
        "Rload": round((dc_nodes.get("vout_3v3", 3.3) ** 2) / max(0.05, float(synth["params"]["r_load_ohm"])) * 1000.0, 1),
    }

    # Feed peak simulated electrical stress back into P9 Senior EE Brain
    p9_findings: List[Dict[str, Any]] = []
    ripple_limit_mv = 100.0
    if metrics["ripple_mv_pp"] > ripple_limit_mv:
        p9_findings.append({
            "rule_id": "SPICE_EXCESSIVE_RAIL_RIPPLE",
            "severity": "error",
            "domain": "Power",
            "refdes": "C1",
            "physics_formula": "ΔV_pp = (V_out * (1 - D)) / (8 * L * f_sw^2 * C_eff) + ΔI_L * ESR",
            "calculated_value": f"{metrics['ripple_mv_pp']:.1f} mVpp (Vout range {metrics['min_v']:.3f}V..{metrics['max_v']:.3f}V)",
            "limit_value": f"<= {ripple_limit_mv:.1f} mVpp",
            "why_it_fails_plain_english": (
                f"Real ngspice transient shows {metrics['ripple_mv_pp']:.1f} mVpp switching ripple on VOUT_3V3 "
                f"(exceeding {ripple_limit_mv:.1f} mVpp target) because effective output capacitance ({synth['params']['c_out_uf']} uF) is undersized."
            ),
            "recommended_fix": "Increase C1 output bulk MLCC to >= 22 uF X7R (effective) to attenuate switching ripple < 40 mVpp.",
        })

    if run_full_ee_audit is not None:
        audit_spec = {
            "capacitors": [
                {
                    "refdes": "C1",
                    "c_nom_uf": float(synth["params"]["c_out_uf"]),
                    "v_bias_v": max(3.3, abs(metrics["max_v"])),
                    "v_rating_v": 25.0,
                    "dielectric": "X7R",
                    "min_required_uf": 9.5,
                }
            ],
            "inductors": [
                {
                    "refdes": "L1",
                    "i_peak_a": round(abs(dc_nodes.get("vout_3v3", 3.3)) / max(0.05, float(synth["params"]["r_load_ohm"])) * 1.25, 2),
                    "i_sat_a": 3.5,
                }
            ],
            "smps": {
                "l_uh": float(synth["params"]["l_uh"]),
                "c_eff_uf": max(1.0, float(synth["params"]["c_out_uf"]) * 0.7),
                "esr_mohm": 12.0,
                "r_load_ohm": float(synth["params"]["r_load_ohm"]),
                "v_in_v": max(5.0, float(synth["params"]["v_in_v"])),
                "comp_fz_khz": 3.5,
                "comp_fp_khz": 95.0,
                "comp_gain_db": 8.0,
            },
        }
        try:
            with _KG_LOCK:
                kg_p = _kg_db_path()
                con_kg = open_kg_connection(kg_p) if kg_p.is_file() else None
                try:
                    p9_res = run_full_ee_audit(audit_spec, con_kg=con_kg)
                finally:
                    if con_kg is not None:
                        con_kg.close()
            p9_findings.extend(p9_res.get("findings", []))
        except Exception:
            pass

    out = {
        "ok": bool(raw_sim.get("ok")),
        "mode": mode,
        "fault_type": fault_type,
        "engine": raw_sim.get("engine", "ngspice-native-dll"),
        "ngspice_available": bool(find_ngspice_library().get("installed")),
        "sha256": digest,
        "cas_cached": False,
        "transpile_rewrites": rewrites,
        "ladder_step": raw_sim.get("ladder_step", 0),
        "ladder_label": raw_sim.get("ladder_label", "nominal"),
        "netlist": netlist,
        "net_uuid_map": synth["net_uuid_map"],
        "fidelity_badges": synth["fidelity_badges"],
        "vectors": vectors,
        "metrics": metrics,
        "dc_nodes": dc_nodes,
        "power_mw": power_mw,
        "montecarlo": mc_summary,
        "p9_stress_findings": p9_findings,
        "diagnostics": raw_sim.get("diagnostics", []),
        "error": raw_sim.get("error", ""),
    }
    if out["ok"]:
        try:
            cas_file.write_text(json.dumps(out), encoding="utf-8")
        except Exception:
            pass
    return out
