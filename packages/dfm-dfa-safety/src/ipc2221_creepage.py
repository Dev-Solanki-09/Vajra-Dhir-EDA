# packages/dfm-dfa-safety/src/ipc2221_creepage.py
"""
IPC-2221 Table 6-1 Electrical Clearance & Creepage Safety Calculator.
Calculates required physical separation between conductors as a function of peak working voltage.
"""

from typing import Dict, Any

# IPC-2221 Table 6-1 (External uncoated conductors, sea level to 3050m)
# Voltage range (V_peak) -> Minimum clearance in nanometers (1 mm = 1,000,000 nm)
IPC_2221_EXTERNAL_UNCOATED_NM = [
    (15.0, 100000),    # 0 - 15V: 0.10 mm
    (30.0, 100000),    # 16 - 30V: 0.10 mm
    (50.0, 150000),    # 31 - 50V: 0.15 mm
    (100.0, 250000),   # 51 - 100V: 0.25 mm
    (150.0, 400000),   # 101 - 150V: 0.40 mm
    (300.0, 800000),   # 151 - 300V: 0.80 mm
    (500.0, 1500000),  # 301 - 500V: 1.50 mm
]

# Internal conductors
IPC_2221_INTERNAL_NM = [
    (15.0, 50000),     # 0.05 mm
    (30.0, 50000),     # 0.05 mm
    (50.0, 100000),    # 0.10 mm
    (100.0, 100000),   # 0.10 mm
    (150.0, 200000),   # 0.20 mm
    (300.0, 300000),   # 0.30 mm
    (500.0, 500000),   # 0.50 mm
]

def get_required_clearance_nm(voltage_peak_v: float, is_external: bool = True) -> int:
    """
    Returns required clearance in nanometers according to IPC-2221 Table 6-1.
    """
    table = IPC_2221_EXTERNAL_UNCOATED_NM if is_external else IPC_2221_INTERNAL_NM
    for v_max, clearance_nm in table:
        if voltage_peak_v <= v_max:
            return clearance_nm

    # Beyond 500V: base + 0.00305 mm per volt over 500V
    excess_v = voltage_peak_v - 500.0
    base_nm = 1500000 if is_external else 500000
    added_nm = int(excess_v * 3050)
    return base_nm + added_nm

def verify_trace_clearance(
    actual_spacing_nm: int,
    voltage_a_v: float,
    voltage_b_v: float,
    is_external: bool = True
) -> Dict[str, Any]:
    """
    Checks if spacing between two nets complies with IPC-2221 clearance rules.
    """
    voltage_diff_v = abs(voltage_a_v - voltage_b_v)
    required_nm = get_required_clearance_nm(voltage_diff_v, is_external)
    passes = actual_spacing_nm >= required_nm

    return {
        "actual_spacing_nm": actual_spacing_nm,
        "required_spacing_nm": required_nm,
        "voltage_difference_v": round(voltage_diff_v, 2),
        "margin_nm": actual_spacing_nm - required_nm,
        "is_compliant": passes
    }
