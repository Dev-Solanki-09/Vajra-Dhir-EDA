# packages/compilers/firmware-sync/tests/test_firmware_sync.py
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src")))

from sync_pins import generate_board_pins_h, generate_zephyr_overlay, reverse_sync_board_pins
from virtual_lab_sim import generate_spice_netlist, simulate_buck_transient

def test_pinmux_board_pins_generation():
    pins = [
        {"signal_name": "STATUS_LED", "pin_number": 13, "port": "GPIOC", "active_low": False, "description": "Heartbeat LED"},
        {"signal_name": "CAN_TX", "pin_number": 9, "port": "GPIOA", "active_low": False, "description": "CAN-FD Transmit"},
        {"signal_name": "CAN_RX", "pin_number": 10, "port": "GPIOA", "active_low": False, "description": "CAN-FD Receive"},
        {"signal_name": "FAULT_N", "pin_number": 5, "port": "GPIOB", "active_low": True, "description": "Active-low fault line"}
    ]
    header = generate_board_pins_h(pins, "STM32G4_MOTOR_CTRL")
    assert "#define PIN_STATUS_LED (13U)" in header
    assert "#define PORT_STATUS_LED GPIOC" in header
    assert "#define ACTIVE_LOW_FAULT_N (1U)" in header
    assert "#define ACTIVE_LOW_STATUS_LED (0U)" in header

    # Test reverse-sync
    parsed = reverse_sync_board_pins(header)
    assert parsed["STATUS_LED"] == 13
    assert parsed["CAN_TX"] == 9
    assert parsed["CAN_RX"] == 10
    assert parsed["FAULT_N"] == 5
    print("[PASS] board_pins.h generation and reverse-sync verified.")

def test_zephyr_overlay_generation():
    i2c_nodes = [
        {"node_name": "bme280", "addr_hex": "0x76", "compatible": "bosch,bme280"}
    ]
    overlay = generate_zephyr_overlay(i2c_nodes=i2c_nodes, can_nodes=[{"can_id": "can1"}])
    assert "&i2c1 {" in overlay
    assert "compatible = \"bosch,bme280\";" in overlay
    assert "reg = <0x76>;" in overlay
    assert "&can1 {" in overlay
    assert "bus-speed = <1000000>;" in overlay
    print("[PASS] Zephyr DeviceTree overlay generation verified.")

def test_virtual_lab_spice_and_fault_injection():
    # 1. Nominal simulation
    res_nom = simulate_buck_transient(vin_v=12.0, vout_target_v=3.3, i_load_a=3.0, fault_inject=None)
    assert res_nom["regulation_passed"] is True
    assert abs(res_nom["final_voltage_v"] - 3.3) < 0.05
    assert len(res_nom["time_ms"]) == len(res_nom["vout_v"])

    # 2. Short-circuit fault injection
    res_fault = simulate_buck_transient(vin_v=12.0, vout_target_v=3.3, i_load_a=3.0, fault_inject="SHORT_VOUT_GND")
    assert res_fault["regulation_passed"] is False
    assert res_fault["final_voltage_v"] == 0.0
    assert res_fault["fault_active"] is True

    # 3. Netlist export
    netlist = generate_spice_netlist([], [], fault_inject="OVERVOLTAGE_VIN")
    assert "PULSE(12.0 30.0" in netlist
    assert ".tran" in netlist
    print("[PASS] Virtual Lab SPICE generation and fault injection verified.")

if __name__ == "__main__":
    test_pinmux_board_pins_generation()
    test_zephyr_overlay_generation()
    test_virtual_lab_spice_and_fault_injection()
    print("ALL FIRMWARE-SYNC & VIRTUAL LAB TESTS PASSED.")
