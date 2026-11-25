"""
SMPS & Active-Filter Stability Engine powered by python-control (#65 python-control).
Computes open-loop Type-II/III transfer functions, crossover frequency, phase margin (>=45 deg),
gain margin (>=10 dB), and full Bode magnitude/phase curves for Workstation uPlot rendering.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List

import control as ct
import numpy as np


def analyze_smps_loop(
    l_uh: float = 10.0,
    c_eff_uf: float = 33.0,
    esr_mohm: float = 15.0,
    r_load_ohm: float = 1.1,
    v_in_v: float = 12.0,
    comp_fz_khz: float = 8.0,
    comp_fp_khz: float = 95.0,
    comp_gain_db: float = 14.0,
) -> Dict[str, Any]:
    """
    Models a buck power-stage LC plant + Type-II/III error-amplifier compensator in s-domain
    using python-control (`control.tf`, `control.margin`, `control.frequency_response`).
    """
    l_h = max(1e-8, float(l_uh) * 1e-6)
    c_f = max(1e-9, float(c_eff_uf) * 1e-6)
    r_esr = max(1e-4, float(esr_mohm) * 1e-3)
    r_load = max(0.05, float(r_load_ohm))

    # Power stage plant: G_vd(s) = Vin * (1 + s*C*ESR) / (L*C*s^2 + (L/R + C*ESR)*s + 1)
    g_plant = ct.tf(
        [v_in_v * c_f * r_esr, v_in_v],
        [l_h * c_f, (l_h / r_load) + c_f * r_esr, 1.0],
    )

    # Type-III compensator: integrator + double zero (to cancel LC double pole) + two HF poles
    wz = 2.0 * math.pi * max(0.1, comp_fz_khz) * 1000.0
    wp = 2.0 * math.pi * max(comp_fz_khz + 1.0, comp_fp_khz) * 1000.0
    wp2 = 2.0 * math.pi * 350_000.0
    k_lin = 10.0 ** (comp_gain_db / 20.0)
    wi = 2.0 * math.pi * 200.0
    # Numerator: k_lin * wi * (1 + s/wz)^2 = k_lin * wi * (s^2/wz^2 + 2s/wz + 1)
    # Denominator: s * (1 + s/wp) * (1 + s/wp2) = (1/(wp*wp2)) s^3 + (1/wp + 1/wp2) s^2 + s
    g_comp = ct.tf(
        [k_lin * wi / (wz * wz), 2.0 * k_lin * wi / wz, k_lin * wi],
        [1.0 / (wp * wp2), (1.0 / wp) + (1.0 / wp2), 1.0, 0.0],
    )

    loop_tf = g_comp * g_plant
    gm_lin, pm_deg, _wcg, wcp = ct.margin(loop_tf)

    gm_db = 40.0 if (gm_lin is None or math.isinf(gm_lin) or gm_lin <= 0) else round(20.0 * math.log10(gm_lin), 2)
    pm_val = 0.0 if (pm_deg is None or math.isnan(pm_deg)) else round(float(pm_deg), 2)
    crossover_hz = 0.0 if (wcp is None or math.isnan(wcp)) else round(float(wcp) / (2.0 * math.pi), 1)

    freqs_hz = np.logspace(2, 6, 45)
    omega = 2.0 * math.pi * freqs_hz
    fresp = ct.frequency_response(loop_tf, omega)
    mag_arr = np.asarray(fresp.magnitude).reshape(-1)
    phase_rad = np.unwrap(np.asarray(fresp.phase).reshape(-1))

    mag_db = [round(20.0 * math.log10(max(float(m), 1e-9)), 2) for m in mag_arr]
    phase_deg = [round(math.degrees(float(p)), 2) for p in phase_rad]

    stable = pm_val >= 45.0 and gm_db >= 10.0
    finding: Dict[str, Any] | None = None
    if not stable:
        finding = {
            "rule_id": "SMPS_LOOP_INSTABILITY",
            "severity": "error",
            "domain": "Control/Stability",
            "entity_uuids": ["U2"],
            "refdes": "U2",
            "physics_formula": "PM = 180° + arg(G_comp(jω_c)·G_vd(jω_c)) >= 45°; GM >= 10 dB",
            "calculated_value": f"PM={pm_val:.1f} deg, GM={gm_db:.1f} dB @ {crossover_hz:.0f} Hz",
            "limit_value": "PM >= 45.0 deg, GM >= 10.0 dB",
            "why_it_fails_plain_english": (
                f"SMPS feedback loop has insufficient phase margin ({pm_val:.1f}° < 45°), risking sustained "
                "ringing or oscillation during load transients because compensator zero is mistuned relative to LC double-pole."
            ),
            "recommended_fix": "Lower compensator zero near LC corner (fz=3.5 kHz, fp=95 kHz, gain=8 dB) to restore >55° phase margin.",
            "auto_patch_proposal": {
                "target": "smps",
                "comp_fz_khz": 3.5,
                "comp_fp_khz": 95.0,
                "comp_gain_db": 8.0,
            },
        }

    return {
        "engine": "python-control",
        "phase_margin_deg": pm_val,
        "gain_margin_db": gm_db,
        "crossover_hz": crossover_hz,
        "stable": stable,
        "freqs_hz": [round(float(f), 1) for f in freqs_hz],
        "mag_db": mag_db,
        "phase_deg": phase_deg,
        "finding": finding,
    }
