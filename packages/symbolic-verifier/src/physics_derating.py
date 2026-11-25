# packages/symbolic-verifier/src/physics_derating.py
"""
Physics-Based Electrical Derating & IPC-2152 Thermal Current Calculator.
Uses Pint for exact unit registry dimensional analysis and SymPy for symbolic formulas.
"""

import math
import pint
import sympy as sp
from typing import Dict, Any

ureg = pint.UnitRegistry()

# IPC-2152 (2009) Universal Chart anchor grid (still-air baseline, no internal plane)
_IPC2152_AREAS_MIL2 = (10.0, 25.0, 50.0, 100.0, 200.0, 500.0, 1000.0)
_IPC2152_DELTAS_C = (10.0, 20.0, 30.0, 45.0, 75.0, 100.0)
_IPC2152_CURRENTS_A = (
    (0.65, 1.15, 1.75, 2.70, 4.10, 7.20, 11.0),
    (0.95, 1.68, 2.55, 3.90, 5.95, 10.4, 15.9),
    (1.20, 2.10, 3.20, 4.90, 7.45, 13.0, 19.9),
    (1.50, 2.65, 4.00, 6.15, 9.35, 16.3, 25.0),
    (1.98, 3.50, 5.30, 8.15, 12.4, 21.6, 33.0),
    (2.35, 4.15, 6.30, 9.65, 14.7, 25.6, 39.2),
)


def _ipc2152_interp_current(area_mil2: float, delta_t_c: float, is_external: bool) -> float:
    """2D log-log interpolation/extrapolation on the IPC-2152 (2009) universal chart."""
    if area_mil2 <= 0.0 or delta_t_c <= 0.0:
        return 0.0
    la = math.log(area_mil2)
    ld = math.log(delta_t_c)
    areas = _IPC2152_AREAS_MIL2
    deltas = _IPC2152_DELTAS_C

    ai = 0
    while ai < len(areas) - 2 and area_mil2 > areas[ai + 1]:
        ai += 1
    di = 0
    while di < len(deltas) - 2 and delta_t_c > deltas[di + 1]:
        di += 1

    la0, la1 = math.log(areas[ai]), math.log(areas[ai + 1])
    ld0, ld1 = math.log(deltas[di]), math.log(deltas[di + 1])
    ta = (la - la0) / (la1 - la0)
    td = (ld - ld0) / (ld1 - ld0)

    c00 = math.log(_IPC2152_CURRENTS_A[di][ai])
    c10 = math.log(_IPC2152_CURRENTS_A[di][ai + 1])
    c01 = math.log(_IPC2152_CURRENTS_A[di + 1][ai])
    c11 = math.log(_IPC2152_CURRENTS_A[di + 1][ai + 1])

    log_i = (
        c00 * (1.0 - ta) * (1.0 - td)
        + c10 * ta * (1.0 - td)
        + c01 * (1.0 - ta) * td
        + c11 * ta * td
    )
    layer_factor = 1.0 if is_external else 0.85
    return math.exp(log_i) * layer_factor

def calculate_mlcc_derated_capacitance(
    c_nom_uf: float,
    v_applied_v: float,
    v_rating_v: float,
    dielectric: str = "X7R"
) -> float:
    """
    Computes effective capacitance under DC bias voltage.
    Class 2 dielectrics (X5R, X7R) experience severe ferroelectric domain saturation.
    Formula: C_eff = C_nom * [1 - alpha * (V / V_r)^beta]
    """
    if v_rating_v <= 0:
        return 0.0
    v_ratio = min(v_applied_v / v_rating_v, 1.0)
    
    if dielectric.upper() in ("C0G", "NP0"):
        return c_nom_uf # Paraelectric C0G does not suffer DC bias degradation
    elif dielectric.upper() == "X7R":
        alpha, beta = 0.70, 1.35
    elif dielectric.upper() == "X5R":
        alpha, beta = 0.80, 1.45
    else:
        alpha, beta = 0.75, 1.40
        
    c_eff = c_nom_uf * max(0.10, 1.0 - alpha * (v_ratio ** beta))
    return round(c_eff, 4)

def calculate_ipc2221_trace_temp_rise(
    current_amps: float,
    width_nm: int,
    thickness_nm: int,
    is_external: bool = True
) -> float:
    """
    Calculates trace temperature rise (Delta T in Celsius) via IPC-2221 (1998).
    Area A in square mils.
    Formula: Delta T = [ I / (k * A^0.725) ]^(1 / 0.44)
    External: k = 0.048, Internal: k = 0.024
    """
    width_mils = width_nm / 25400.0
    thickness_mils = thickness_nm / 25400.0
    area_sq_mils = width_mils * thickness_mils

    if area_sq_mils <= 0 or current_amps <= 0:
        return 0.0

    k = 0.048 if is_external else 0.024
    delta_t = (current_amps / (k * (area_sq_mils ** 0.725))) ** (1.0 / 0.44)
    return round(delta_t, 2)


def calculate_ipc2152_trace_temp_rise(
    current_amps: float,
    width_nm: int,
    thickness_nm: int,
    is_external: bool = True
) -> float:
    """
    Calculates trace temperature rise (Delta T in Celsius) via IPC-2152 (2009)
    2D log-log interpolation over the universal current-temperature chart.
    """
    width_mils = width_nm / 25400.0
    thickness_mils = thickness_nm / 25400.0
    area_sq_mils = width_mils * thickness_mils

    if area_sq_mils <= 0 or current_amps <= 0:
        return 0.0

    lo, hi = 0.05, 500.0
    while _ipc2152_interp_current(area_sq_mils, hi, is_external) < current_amps and hi < 10000.0:
        hi *= 2.0
    for _ in range(48):
        mid = 0.5 * (lo + hi)
        if _ipc2152_interp_current(area_sq_mils, mid, is_external) < current_amps:
            lo = mid
        else:
            hi = mid
    return round(0.5 * (lo + hi), 2)

def verify_component_derating(
    v_applied: float,
    v_rated: float,
    p_dissipated_w: float,
    p_rated_w: float,
    category: str
) -> Dict[str, Any]:
    """
    Applies standard MIL-STD-975 / ECSS-Q-ST-30-11C engineering derating limits:
    - Capacitors: Max 50% voltage rating
    - Resistors: Max 50% power rating
    - Semiconductors: Max 80% breakdown voltage
    """
    v_stress = v_applied / v_rated if v_rated > 0 else 1.0
    p_stress = p_dissipated_w / p_rated_w if p_rated_w > 0 else 1.0
    
    max_v_stress = 0.50 if category.lower() == "capacitor" else 0.80
    max_p_stress = 0.50
    
    passes_voltage = v_stress <= max_v_stress
    passes_power = p_stress <= max_p_stress
    
    return {
        "v_stress_ratio": round(v_stress, 3),
        "v_stress_limit": max_v_stress,
        "passes_voltage_derating": passes_voltage,
        "p_stress_ratio": round(p_stress, 3),
        "p_stress_limit": max_p_stress,
        "passes_power_derating": passes_power,
        "overall_derating_pass": passes_voltage and passes_power
    }
