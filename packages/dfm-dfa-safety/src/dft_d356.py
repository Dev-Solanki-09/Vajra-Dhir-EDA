# packages/dfm-dfa-safety/src/dft_d356.py
"""
IPC-D-356 Test-Point & Bed-of-Nails Fixture Generator.
Extracts accessible test pads, vias, and component pins from HW-IR
to produce standardized IPC-D-356 netlist records for electrical testing (E-Test).
"""

from typing import List, Dict, Any

def generate_ipcd356_records(
    test_points: List[Dict[str, Any]],
    board_name: str = "BOARD"
) -> str:
    """
    Generates standard IPC-D-356 test netlist lines.
    Format per record:
    P01: Primary test point
    Columns:
    - 317: Test point record opcode
    - Net name (up to 14 chars)
    - RefDes / Pin number
    - Access side (M = middle, T = top, B = bottom)
    - Coordinates X, Y in mils/inches or metric
    - Diameter / Pad size
    """
    lines = [
        "C  Vajra-Dhīr EDA IPC-D-356 Electrical Test Fixture Data",
        f"C  Board: {board_name}",
        "C  Format: IPC-D-356 Rev A",
        "P  JOB  " + board_name[:14],
        "P  UNITS CUST 0" # Metric nanometers / standard
    ]

    for tp in test_points:
        net = tp.get("net_name", "UNNAMED")[:14].ljust(14)
        ref = tp.get("refdes", "TP")[:8].ljust(8)
        pin = str(tp.get("pin_number", "1"))[:4].ljust(4)
        side = "T" if tp.get("side", "top") == "top" else "B"
        x_mils = int(tp.get("x_nm", 0) / 25400)
        y_mils = int(tp.get("y_nm", 0) / 25400)
        diam_mils = int(tp.get("dia_nm", 762000) / 25400)

        # Standard 317 test point format: 317 <net> <ref> <pin> <side> <x> <y> <size>
        rec = f"317 {net} {ref} {pin} D{diam_mils:04d} {side} X{x_mils:+07d} Y{y_mils:+07d}"
        lines.append(rec)

    lines.append("999") # End of job record
    return "\n".join(lines) + "\n"
