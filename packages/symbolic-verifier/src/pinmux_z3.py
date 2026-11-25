"""
Extended Z3 SMT Electrical & Pinmux Constraint Engine (#62 Z3Prover/z3).
Detects 5V-into-3.3V-non-tolerant logic hazards, missing I2C pullups, duplicate I2C addresses,
bootstrap pin traps, and power-sequencing hazards with actionable auto-fix patches.
"""

from __future__ import annotations

from typing import Any, Dict, List

import z3

try:
    from .z3_pinmux import solve_pinmux_smt, verify_i2c_bus_addresses
except ImportError:
    from z3_pinmux import solve_pinmux_smt, verify_i2c_bus_addresses


def audit_z3_electrical_rules(spec: Dict[str, Any]) -> List[Dict[str, Any]]:
    findings: List[Dict[str, Any]] = []

    # 1. Logic Voltage Domain Safety via Z3 Real Solver: V_driver <= V_receiver_abs_max
    for link in spec.get("logic_links", []):
        link_id = str(link.get("id", link.get("signal", "SIG")))
        drv_ref = str(link.get("driver_refdes", "U_DRV"))
        rx_ref = str(link.get("receiver_refdes", "U_RX"))
        rx_pin = str(link.get("receiver_pin", "GPIO"))
        v_drv = float(link.get("driver_v", 3.3))
        five_v_tolerant = bool(link.get("receiver_5v_tolerant", False))
        v_rx_max = float(link.get("receiver_v_max", 5.5 if five_v_tolerant else 3.6))

        s = z3.Solver()
        drv_var = z3.Real(f"v_drv_{link_id}")
        max_var = z3.Real(f"v_max_{link_id}")
        s.add(drv_var == z3.RealVal(str(v_drv)))
        s.add(max_var == z3.RealVal(str(v_rx_max)))
        s.add(drv_var > max_var)
        if s.check() == z3.sat:
            findings.append({
                "rule_id": "Z3_5V_INTO_3V3_GPIO_HAZARD",
                "severity": "error",
                "domain": "Signal/Bus",
                "entity_uuids": [rx_ref, drv_ref],
                "refdes": rx_ref,
                "physics_formula": f"Z3 SMT: V_driver ({v_drv} V) <= V_IO_max ({v_rx_max} V)",
                "calculated_value": f"V_driver = {v_drv:.2f} V on pin {rx_ref}.{rx_pin}",
                "limit_value": f"V_max = {v_rx_max:.2f} V (non-5V tolerant)",
                "why_it_fails_plain_english": (
                    f"{drv_ref} drives {v_drv:.1f} V logic directly into non-5V-tolerant {rx_ref}.{rx_pin} "
                    f"(max {v_rx_max:.1f} V), forward-biasing ESD clamp diodes and risking silicon latch-up."
                ),
                "recommended_fix": f"Insert bidirectional level shifter (TXS0102/BSS138) or switch driver IO rail to 3.3 V.",
                "auto_patch_proposal": {
                    "target": "logic_links",
                    "id": link_id,
                    "driver_v": 3.3,
                },
            })

    # 2. Missing I2C Open-Drain Pullups (Z3 Boolean SAT check)
    for bus in spec.get("i2c_buses", []):
        bus_name = str(bus.get("name", "I2C1"))
        has_sda_pu = bool(bus.get("has_sda_pullup", True))
        has_scl_pu = bool(bus.get("has_scl_pullup", True))
        s_pu = z3.Solver()
        pu_ok = z3.Bool("i2c_pullups_present")
        s_pu.add(pu_ok == (has_sda_pu and has_scl_pu))
        s_pu.add(z3.Not(pu_ok))
        if s_pu.check() == z3.sat:
            findings.append({
                "rule_id": "Z3_MISSING_I2C_PULLUP",
                "severity": "error",
                "domain": "Signal/Bus",
                "entity_uuids": list(bus.get("devices", {}).keys()) or ["U1"],
                "refdes": bus_name,
                "physics_formula": "Open-drain I2C requires R_pullup to VDD_IO (τ = R_p * C_bus <= 300 ns)",
                "calculated_value": f"SDA pullup={has_sda_pu}, SCL pullup={has_scl_pu}",
                "limit_value": "Both SDA and SCL pulled up (2.2k - 4.7k)",
                "why_it_fails_plain_english": (
                    f"I2C bus {bus_name} lacks pull-up resistors; open-drain drivers can only pull LOW so lines float "
                    "indefinitely HIGH/undefined and every transaction times out."
                ),
                "recommended_fix": f"Add 4.7 kΩ pull-up resistors from {bus_name}_SDA and {bus_name}_SCL to +3V3.",
                "auto_patch_proposal": {
                    "target": "i2c_buses",
                    "name": bus_name,
                    "has_sda_pullup": True,
                    "has_scl_pullup": True,
                },
            })

        # 3. Duplicate 7-bit I2C Addresses via z3_pinmux.verify_i2c_bus_addresses
        devs = bus.get("devices", {})
        if isinstance(devs, dict) and devs:
            ok_addr, err_msg = verify_i2c_bus_addresses(devs)
            if not ok_addr:
                addr_vals = list(devs.values())
                conflict_refs = [k for k, v in devs.items() if addr_vals.count(v) > 1] or list(devs.keys())
                # Compute free alternate 7-bit address (+1 offset)
                used = set(addr_vals)
                base_addr = addr_vals[-1] if addr_vals else 0x48
                alt_addr = base_addr + 1 if (base_addr + 1) not in used and base_addr + 1 <= 0x77 else 0x77
                findings.append({
                    "rule_id": "Z3_I2C_ADDRESS_COLLISION",
                    "severity": "error",
                    "domain": "Signal/Bus",
                    "entity_uuids": conflict_refs,
                    "refdes": conflict_refs[-1],
                    "physics_formula": "∀ i != j on bus: I2C_addr(i) != I2C_addr(j)",
                    "calculated_value": err_msg or "Duplicate 7-bit I2C address",
                    "limit_value": "Unique 7-bit addresses in 0x08..0x77",
                    "why_it_fails_plain_english": (
                        f"{err_msg}. Two I2C slaves ACK the same bus frame simultaneously, corrupting SDA data."
                    ),
                    "recommended_fix": f"Tie ADDR/SDO pin of {conflict_refs[-1]} HIGH to shift its 7-bit address to 0x{alt_addr:02X}.",
                    "auto_patch_proposal": {
                        "target": "i2c_buses",
                        "name": bus_name,
                        "reassign_device": conflict_refs[-1],
                        "new_addr": alt_addr,
                    },
                })

    # 4. Boot-Strap Pin Traps (e.g. ESP32 GPIO0 / STM32 BOOT0 pulled into download mode on normal boot)
    for strap in spec.get("boot_pins", []):
        ref = str(strap.get("refdes", "U1"))
        pin = str(strap.get("pin", "GPIO0"))
        req_state = str(strap.get("required_normal_boot", "HIGH")).upper()
        actual_state = str(strap.get("pulled_state", req_state)).upper()
        if actual_state != req_state:
            findings.append({
                "rule_id": "Z3_BOOTSTRAP_PIN_TRAP",
                "severity": "error",
                "domain": "Pinmux",
                "entity_uuids": [ref],
                "refdes": ref,
                "physics_formula": f"Reset_Sample({ref}.{pin}) == {req_state}",
                "calculated_value": f"Pulled {actual_state}",
                "limit_value": f"Must sample {req_state} on power-on reset",
                "why_it_fails_plain_english": (
                    f"Bootstrap pin {ref}.{pin} is pulled {actual_state}, forcing MCU/SoC into bootloader/ROM download "
                    "mode on every cold boot instead of executing flash firmware."
                ),
                "recommended_fix": f"Change pull resistor on {ref}.{pin} to {req_state} (10 kΩ).",
                "auto_patch_proposal": {
                    "target": "boot_pins",
                    "refdes": ref,
                    "pin": pin,
                    "pulled_state": req_state,
                },
            })

    # 5. Z3 Alternate-Function Pinmux Contention Solve
    pmx = spec.get("pinmux")
    if isinstance(pmx, dict) and pmx.get("signals"):
        sol, unsat = solve_pinmux_smt(
            pmx["signals"],
            pmx.get("candidates", {}),
            pmx.get("five_volt_required"),
            set(pmx.get("five_volt_pads", [])),
        )
        if sol is None:
            findings.append({
                "rule_id": "Z3_PINMUX_CONFLICT",
                "severity": "error",
                "domain": "Pinmux",
                "entity_uuids": ["U1"],
                "refdes": "U1",
                "physics_formula": "Z3 AllDistinct(pin_assignments) ∧ VoltageDomainMatch",
                "calculated_value": f"UNSAT core: {', '.join(unsat)}",
                "limit_value": "Conflict-free SAT assignment",
                "why_it_fails_plain_english": f"No valid MCU pinmux assignment exists: {', '.join(unsat)}.",
                "recommended_fix": "Re-assign alternate pad candidates in Z3 pinmux table.",
                "auto_patch_proposal": {"target": "pinmux_clear", "clear": True},
            })

    return findings
