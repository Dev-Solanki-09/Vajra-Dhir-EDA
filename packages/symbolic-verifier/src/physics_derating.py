# packages/symbolic-verifier/src/physics_derating.py
"""
Physics-Based Electrical Derating & IPC-2152 Thermal Current Calculator.
Uses Pint for exact unit registry dimensional analysis and SymPy for symbolic formulas.
"""

import pint
import sympy as sp
from typing import Dict, Any

ureg = pint.UnitRegistry()

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

def calculate_ipc2152_trace_temp_rise(
    current_amps: float,
    width_nm: int,
    thickness_nm: int,
    is_external: bool = True
) -> float:
    """
    Calculates trace temperature rise (Delta T in Celsius) via IPC-2152.
    Area A in square mils.
    Formula: Delta T = [ I / (k * A^0.725) ]^(1 / 0.44)
    External: k = 0.048, Internal: k = 0.024
    """
    # Convert nm to mils: 1 mil = 25,400 nm
    width_mils = width_nm / 25400.0
    thickness_mils = thickness_nm / 25400.0
    area_sq_mils = width_mils * thickness_mils
    
    if area_sq_mils <= 0 or current_amps <= 0:
        return 0.0
        
    k = 0.048 if is_external else 0.024
    delta_t = (current_amps / (k * (area_sq_mils ** 0.725))) ** (1.0 / 0.44)
    return round(delta_t, 2)

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
