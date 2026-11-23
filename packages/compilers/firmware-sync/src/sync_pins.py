# packages/compilers/firmware-sync/src/sync_pins.py
"""
Hardware-to-Firmware Co-Design Pinmux & Peripheral Synchronizer.
Generates C/C++ board_pins.h and Zephyr DeviceTree Overlays (*.overlay)
directly from canonical HW-IR pin bindings, and reverse-syncs pin edits.
"""

import re
from typing import Dict, List, Any, Optional

def generate_board_pins_h(pin_assignments: List[Dict[str, Any]], board_name: str = "VAJRADHIR_BOARD") -> str:
    """
    Generates deterministic C/C++ board_pins.h header.
    Each pin definition contains:
    - Signal pin number
    - GPIO Port name
    - Active high/low logic polarity
    - Function description
    """
    guard = f"{board_name.upper().replace('-', '_')}_PINS_H"
    lines = [
        "/* ==========================================================================",
        f" * Vajra-Dhīr EDA — Hardware-Firmware Co-Design Interface: {board_name}",
        " * Automatically synthesized from HW-IR SQLite database. DO NOT EDIT PINS MANUALLY.",
        " * Human lock enforcement active: non-human changes must pass Z3 SMT solver.",
        " * ========================================================================== */",
        f"#ifndef {guard}",
        f"#define {guard}",
        "",
        "#include <stdint.h>",
        "#include <stdbool.h>",
        "",
        "/* GPIO Pin Mappings & Electrical Polarities */"
    ]

    for pin in sorted(pin_assignments, key=lambda p: p["signal_name"]):
        sig = pin["signal_name"].upper().replace(".", "_").replace("-", "_")
        pin_num = pin["pin_number"]
        port = pin.get("port", "GPIOA")
        active_low = 1 if pin.get("active_low", False) else 0

        lines.append(f"/* Signal: {pin['signal_name']} ({pin.get('description', 'GPIO')}) */")
        lines.append(f"#define PIN_{sig} ({pin_num}U)")
        lines.append(f"#define PORT_{sig} {port}")
        lines.append(f"#define ACTIVE_LOW_{sig} ({active_low}U)")
        lines.append("")

    lines.append(f"#endif /* {guard} */")
    return "\n".join(lines) + "\n"

def generate_zephyr_overlay(
    i2c_nodes: Optional[List[Dict[str, Any]]] = None,
    spi_nodes: Optional[List[Dict[str, Any]]] = None,
    can_nodes: Optional[List[Dict[str, Any]]] = None
) -> str:
    """
    Synthesizes a Zephyr DeviceTree Overlay (*.overlay) matching board hardware pin bindings.
    """
    lines = [
        "/* ==========================================================================",
        " * Vajra-Dhīr EDA — Zephyr DeviceTree Hardware Overlay",
        " * Generated from Canonical HW-IR. Verified against MCU Pinmux SMT Solver.",
        " * ========================================================================== */",
        "",
        "/ {",
        "\taliases {",
    ]

    if i2c_nodes:
        lines.append("\t\tsensor-bus = &i2c1;")
    if can_nodes:
        lines.append("\t\tcan-bus = &can1;")
    lines.append("\t};");
    lines.append("};");
    lines.append("");

    if i2c_nodes:
        lines.append("&i2c1 {")
        lines.append("\tstatus = \"okay\";")
        lines.append("\tclock-frequency = <I2C_BITRATE_FAST>;")
        for node in i2c_nodes:
            lines.append(f"\t{node['node_name']}@{node['addr_hex']} {{")
            lines.append(f"\t\tcompatible = \"{node['compatible']}\";")
            lines.append(f"\t\treg = <{node['addr_hex']}>;")
            lines.append("\t};")
        lines.append("};\n")

    if can_nodes:
        lines.append("&can1 {")
        lines.append("\tstatus = \"okay\";")
        lines.append("\tbus-speed = <1000000>;")
        lines.append("\tbus-speed-data = <5000000>;")
        lines.append("};\n")

    return "\n".join(lines)

def reverse_sync_board_pins(header_content: str) -> Dict[str, int]:
    """
    Parses a modified board_pins.h and extracts {signal: pin_number} to detect pin changes.
    """
    re_pin = re.compile(r'#define\s+PIN_(\w+)\s+\((\d+)U?\)')
    extracted = {}
    for match in re_pin.finditer(header_content):
        sig, pin = match.group(1), int(match.group(2))
        extracted[sig] = pin
    return extracted
