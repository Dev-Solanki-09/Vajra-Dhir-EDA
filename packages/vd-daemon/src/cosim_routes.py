"""Prompt 11 Co-Simulation & Digital Twin REST routes (loopback 127.0.0.1 only)."""

from __future__ import annotations

import json
import sqlite3
from typing import Any, Dict, Optional

try:
    from .cosim_engine import (
        execute_cosim_scenario,
        find_renode_executable,
        generate_firmware_and_digital_twin,
        run_4_cosim_fault_suite,
    )
    from .kicad_routes import broadcast_ws_event
except ImportError:
    from cosim_engine import (
        execute_cosim_scenario,
        find_renode_executable,
        generate_firmware_and_digital_twin,
        run_4_cosim_fault_suite,
    )
    from kicad_routes import broadcast_ws_event


def _send_json(handler: Any, status: int, body: Dict[str, Any]) -> None:
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler._send_cors()
    handler.end_headers()
    handler.wfile.write(json.dumps(body).encode("utf-8"))


def handle_cosim_get(handler: Any, path: str, full_path: str = "", con: Optional[sqlite3.Connection] = None) -> bool:
    if path == "/api/v1/cosim/status":
        _send_json(handler, 200, {
            "renode": find_renode_executable(),
            "scenarios": ["nominal", "missing_i2c_pullup", "swapped_uart", "i2c_addr_mismatch"],
            "lockstep_bridge": "127.0.0.1 ephemeral TCP <-> ngspice.dll",
        })
        return True

    if path == "/api/v1/cosim/suite-4":
        suite = run_4_cosim_fault_suite(con)
        _send_json(handler, 200, suite)
        return True

    return False


def handle_cosim_post(handler: Any, path: str, req: Dict[str, Any], con: Optional[sqlite3.Connection] = None) -> bool:
    if path == "/api/v1/cosim/generate":
        res = generate_firmware_and_digital_twin(
            con,
            wiring_overrides=req.get("wiring_overrides"),
            code_i2c_addr=int(req.get("code_i2c_addr", 0x76)),
        )
        broadcast_ws_event({"type": "cosim:generated", "files": res["files"]})
        _send_json(handler, 200, res)
        return True

    if path == "/api/v1/cosim/run":
        scenario = str(req.get("scenario", "nominal"))
        res = execute_cosim_scenario(
            con,
            scenario=scenario,
            wiring_overrides=req.get("wiring_overrides"),
            code_i2c_addr=req.get("code_i2c_addr"),
        )
        broadcast_ws_event({
            "type": "cosim:completed",
            "scenario": scenario,
            "ok": res.get("ok", False),
            "twin_highlights": res.get("twin_highlights", []),
        })
        _send_json(handler, 200, res)
        return True

    if path == "/api/v1/cosim/apply-fix":
        fix_kind = str(req.get("fix_kind", "circuit"))  # circuit | firmware
        shortcoming = req.get("shortcoming") or {}
        rule_id = str(shortcoming.get("rule_id", req.get("rule_id", "")))

        wiring_overrides: Dict[str, Any] = {}
        code_addr = 0x76
        if rule_id == "COSIM_I2C_MISSING_PULLUP_NACK":
            wiring_overrides = {"i2c1": {"has_sda_pullup": True, "has_scl_pullup": True}}
        elif rule_id == "COSIM_UART_TX_RX_SWAPPED":
            wiring_overrides = {"uart1": {"tx_rx_swapped": False}}
        elif rule_id == "COSIM_I2C_ADDRESS_MISMATCH":
            if fix_kind == "firmware":
                wiring_overrides = {"i2c1": {"device_addr": 0x77}}
                code_addr = 0x77
            else:
                wiring_overrides = {"i2c1": {"device_addr": 0x76}}
                code_addr = 0x76

        repaired = execute_cosim_scenario(
            con,
            scenario="nominal",
            wiring_overrides=wiring_overrides,
            code_i2c_addr=code_addr,
        )
        broadcast_ws_event({
            "type": "cosim:repaired",
            "rule_id": rule_id,
            "fix_kind": fix_kind,
            "ok": repaired.get("ok", False),
            "twin_highlights": repaired.get("twin_highlights", []),
        })
        _send_json(handler, 200, {
            "fix_kind": fix_kind,
            "rule_id": rule_id,
            "result": repaired,
        })
        return True

    return False
