# packages/dfm-dfa-safety/src/dfm.py
"""
Design for Manufacturability (DFM) Rules Engine.
Detects acid traps (acute trace angles) and soldermask dam/bridge violations.
"""

import math
from typing import List, Dict, Any

def check_acid_traps(
    trace_segments: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Detects acid traps where two trace segments meet at an interior angle < 90 degrees.
    Chemical etchant accumulates in acute corners, causing corrosive over-etching.
    """
    violations = []
    for seg in trace_segments:
        # Check angle between incoming and outgoing vector
        angle_deg = seg.get("corner_angle_deg", 90.0)
        if angle_deg < 85.0: # Significant acute corner
            violations.append({
                "net_name": seg.get("net_name", "UNKNOWN"),
                "x_nm": seg.get("x_nm", 0),
                "y_nm": seg.get("y_nm", 0),
                "layer": seg.get("layer", "F.Cu"),
                "corner_angle_deg": round(angle_deg, 1),
                "severity": "ERROR" if angle_deg < 75.0 else "WARNING",
                "description": f"Acute trace angle {angle_deg:.1f}° traps acid etchant; chamfer or radius corner to >= 90°"
            })
    return violations

def check_soldermask_dam_widths(
    pad_spacings: List[Dict[str, Any]],
    min_dam_nm: int = 100000 # 0.10 mm (4 mils) standard photoimageable mask dam
) -> List[Dict[str, Any]]:
    """
    Checks that the soldermask web / dam between adjacent copper pads is wide enough
    to prevent mask slivers from peeling and creating solder bridges during wave/reflow.
    """
    violations = []
    for pair in pad_spacings:
        gap_nm = pair.get("gap_nm", 0)
        if gap_nm < min_dam_nm:
            violations.append({
                "pad_a": pair.get("pad_a", ""),
                "pad_b": pair.get("pad_b", ""),
                "actual_dam_nm": gap_nm,
                "min_required_dam_nm": min_dam_nm,
                "severity": "CRITICAL",
                "description": f"Soldermask dam {gap_nm / 1000:.1f} µm is thinner than fab limit {min_dam_nm / 1000:.1f} µm (solder bridge risk)"
            })
    return violations


def check_panel_and_gerber_dfm(
    rail_width_nm: int = 5_000_000,
    tooling_hole_edge_nm: int = 2_500_000,
    copper_to_edge_nm: int = 500_000,
) -> Dict[str, Any]:
    """
    Pure-MIT manufacturing pre-flight DFM checks (IPC-7525B / fab panel conventions).
    Zero AGPL dependencies; pairs cleanly with Ring-2 kicad-cli DRC outputs.
    """
    violations = []
    if rail_width_nm < 3_000_000:
        violations.append({
            "rule": "PANEL_RAIL_WIDTH_MIN",
            "actual_nm": rail_width_nm,
            "min_nm": 3_000_000,
            "severity": "ERROR",
            "description": "Breakaway conveyor rail thinner than 3.0 mm minimum",
        })
    if tooling_hole_edge_nm < 1_500_000:
        violations.append({
            "rule": "TOOLING_HOLE_EDGE_CLEARANCE",
            "actual_nm": tooling_hole_edge_nm,
            "min_nm": 1_500_000,
            "severity": "ERROR",
            "description": "NPTH tooling hole center closer than 1.5 mm to rail edge",
        })
    if copper_to_edge_nm < 300_000:
        violations.append({
            "rule": "COPPER_TO_BOARD_EDGE_MIN",
            "actual_nm": copper_to_edge_nm,
            "min_nm": 300_000,
            "severity": "ERROR",
            "description": "Copper feature closer than 0.30 mm to routed board edge / V-score",
        })
    return {
        "engine": "vd-dfm-mit",
        "passed": len(violations) == 0,
        "violations": violations,
    }

