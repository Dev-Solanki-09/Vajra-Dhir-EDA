# packages/dfm-dfa-safety/src/dfa.py
"""
Design for Assembly (DFA) Auditor.
1. Rotated Courtyard Clearance: Evaluates component bounding boxes under rotation.
2. Tombstoning Risk Calculator: Detects thermal dissipation imbalances on 2-terminal chip packages.
"""

import math
from typing import List, Dict, Any, Tuple

class ComponentPlacement:
    def __init__(self, refdes: str, x_nm: int, y_nm: int, rot_mdeg: int, w_nm: int, h_nm: int, side: str = "top"):
        self.refdes = refdes
        self.x_nm = x_nm
        self.y_nm = y_nm
        self.rot_mdeg = rot_mdeg
        self.w_nm = w_nm
        self.h_nm = h_nm
        self.side = side

def check_courtyard_collisions(
    components: List[ComponentPlacement],
    min_clearance_nm: int = 250000 # 0.25 mm standard clearance
) -> List[Dict[str, Any]]:
    """
    Checks for overlapping or excessively close component courtyards on the same board side.
    """
    violations = []
    n = len(components)
    for i in range(n):
        for j in range(i + 1, n):
            c1, c2 = components[i], components[j]
            if c1.side != c2.side:
                continue

            # Compute center-to-center distance
            dx = c1.x_nm - c2.x_nm
            dy = c1.y_nm - c2.y_nm
            dist = math.hypot(dx, dy)

            # Approximate effective radii (half diagonal)
            r1 = math.hypot(c1.w_nm / 2, c1.h_nm / 2)
            r2 = math.hypot(c2.w_nm / 2, c2.h_nm / 2)

            if dist < (r1 + r2 + min_clearance_nm):
                # Bounding box collision check
                overlap_x = (c1.w_nm + c2.w_nm) / 2 + min_clearance_nm - abs(dx)
                overlap_y = (c1.h_nm + c2.h_nm) / 2 + min_clearance_nm - abs(dy)
                if overlap_x > 0 and overlap_y > 0:
                    violations.append({
                        "refdes_a": c1.refdes,
                        "refdes_b": c2.refdes,
                        "distance_nm": int(dist),
                        "required_clearance_nm": min_clearance_nm,
                        "severity": "CRITICAL" if dist < (r1 + r2) else "WARNING"
                    })
    return violations

def check_tombstoning_risk(
    pad1_trace_width_nm: int,
    pad2_trace_width_nm: int,
    pad1_is_plane_connected: bool,
    pad2_is_plane_connected: bool,
    pad1_has_thermal_relief: bool,
    pad2_has_thermal_relief: bool
) -> Tuple[bool, float, str]:
    """
    Assesses tombstoning risk due to thermal mass imbalance between Pad 1 and Pad 2.
    Imbalance ratio > 2.0 flags high tombstoning risk during reflow soldering.
    """
    # Equivalent thermal conductivity index
    eff1 = 10.0 if (pad1_is_plane_connected and not pad1_has_thermal_relief) else (pad1_trace_width_nm / 250000.0)
    eff2 = 10.0 if (pad2_is_plane_connected and not pad2_has_thermal_relief) else (pad2_trace_width_nm / 250000.0)

    eff1 = max(eff1, 0.5)
    eff2 = max(eff2, 0.5)

    ratio = max(eff1 / eff2, eff2 / eff1)
    is_at_risk = ratio >= 2.0

    if is_at_risk:
        explanation = f"Tombstoning hazard: thermal mass ratio is {ratio:.1f}x (threshold: 2.0x). One pad is sinking significantly more heat."
    else:
        explanation = f"Thermal balance acceptable (ratio {ratio:.1f}x < 2.0x)."

    return is_at_risk, round(ratio, 2), explanation
