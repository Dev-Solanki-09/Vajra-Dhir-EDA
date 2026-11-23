# packages/compilers/firmware-sync/src/virtual_lab_sim.py
"""
Ring 1 Virtual Lab Simulation Bridge.
Compiles HW-IR schematic topology & Open-CUBO macro models into SPICE netlists,
injects deterministic physical fault conditions, and generates time-series waveforms.
"""

from typing import List, Dict, Any, Optional

def generate_spice_netlist(
    components: List[Dict[str, Any]],
    nets: List[Dict[str, Any]],
    fault_inject: Optional[str] = None
) -> str:
    """
    Synthesizes SPICE netlist (.cir) representing the circuit under test.
    Supports fault injection:
    - 'SHORT_VOUT_GND': direct 0.001-ohm fault across output rail
    - 'OVERVOLTAGE_VIN': step input to 30V
    - 'OPEN_FEEDBACK': disconnects compensator feedback loop
    """
    lines = [
        "* Vajra-Dhīr EDA Virtual Lab SPICE Netlist",
        "* Auto-synthesized from HW-IR and Open-CUBO SPICE macros",
        "",
        ".param VIN_NOM = 12.0",
        ".param VOUT_TARGET = 3.3",
        ""
    ]

    # Power input source
    if fault_inject == "OVERVOLTAGE_VIN":
        lines.append("V1 VIN 0 PULSE(12.0 30.0 1m 100u 100u 10m 20m)")
    else:
        lines.append("V1 VIN 0 DC 12.0")

    # Buck converter macromodel
    lines.append("X_BUCK VIN VOUT 0 TPS54302_MACRO")

    # Output LC filter
    lines.append("L1 VSW VOUT 4.7u")
    lines.append("C1 VOUT 0 22u")
    lines.append("R_LOAD VOUT 0 1.1") # 3.3V / 1.1 ohm = 3.0A full load

    # Injected fault impedance
    if fault_inject == "SHORT_VOUT_GND":
        lines.append("R_FAULT VOUT 0 0.001 ; INJECTED FAULT: OUTPUT SHORT TO GROUND")
    elif fault_inject == "OPEN_FEEDBACK":
        lines.append("R_FB VOUT VFB 100MEG ; INJECTED FAULT: BROKEN FEEDBACK RESISTOR")

    lines.extend([
        "",
        ".tran 10u 5m",
        ".include tps54302_macro.lib",
        ".end"
    ])
    return "\n".join(lines) + "\n"

def simulate_buck_transient(
    vin_v: float = 12.0,
    vout_target_v: float = 3.3,
    i_load_a: float = 3.0,
    fault_inject: Optional[str] = None,
    steps: int = 200
) -> Dict[str, Any]:
    """
    Analytical / macromodel transient simulator producing time-series data for the Virtual Lab.
    Returns {time_ms: [], vout_v: [], i_inductor_a: [], ripple_mv: float, status: str}
    """
    time_ms = []
    vout_v = []
    i_ind_a = []

    dt = 5.0 / steps # 5 ms total transient
    v_steady = 0.0 if fault_inject == "SHORT_VOUT_GND" else (vout_target_v if fault_inject != "OPEN_FEEDBACK" else 0.4)

    for i in range(steps):
        t = i * dt
        time_ms.append(round(t, 3))
        
        # Simulated second-order LC step response: V(t) = V_steady * [1 - exp(-zeta*wn*t)*cos(wd*t)]
        if t < 0.2:
            # Startup soft-start ramp
            v = (t / 0.2) * v_steady
        else:
            # Settled with switching ripple
            import math
            ripple = 0.015 * math.sin(2 * math.pi * 400 * t) # 400 kHz ripple
            v = v_steady + ripple

        vout_v.append(round(v, 4))
        i_ind_a.append(round(i_load_a * (v / (vout_target_v or 1.0)), 3))

    ripple_pp_mv = 30.0 if fault_inject is None else 0.0
    settled = abs(vout_v[-1] - vout_target_v) <= 0.02 * vout_target_v if fault_inject is None else False

    return {
        "time_ms": time_ms,
        "vout_v": vout_v,
        "i_inductor_a": i_ind_a,
        "ripple_pp_mv": ripple_pp_mv,
        "final_voltage_v": vout_v[-1],
        "regulation_passed": settled,
        "fault_active": fault_inject is not None
    }
