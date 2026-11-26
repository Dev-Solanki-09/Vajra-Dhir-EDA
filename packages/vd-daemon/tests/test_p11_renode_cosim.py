"""Prompt 11 Co-Simulation tests: Firmware generation, Renode/SBC twin, loopback 127.0.0.1 ngspice lockstep, and 4 fault cases."""

from __future__ import annotations

import json
import os
import pathlib
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _req(base: str, method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    r = urllib.request.Request(
        f"{base}{path}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if data is not None else {},
    )
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf-8"))


def test_p11_4case_cosim_suite_lockstep_and_fixes() -> None:
    port = _free_port()
    with tempfile.TemporaryDirectory(prefix="vd_p11_cosim_", ignore_cleanup_errors=True) as tmp_dir:
        tmp = pathlib.Path(tmp_dir)
        proj = tmp / "proj"
        shutil.copytree("fixtures/golden-buck-mcu", proj)
        env = dict(os.environ)
        env["VD_DB_DIR"] = str(tmp / "db")

        proc = subprocess.Popen(
            [sys.executable, "packages/vd-daemon/src/daemon.py", str(port)],
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        base = f"http://127.0.0.1:{port}"
        try:
            for _ in range(80):
                try:
                    code, _ = _req(base, "GET", "/api/v1/health")
                    if code == 200:
                        break
                except Exception:
                    time.sleep(0.1)
            else:
                raise TimeoutError("vd-daemon failed to start")

            st_act, _ = _req(base, "POST", "/api/v1/kicad/active-project", {
                "project_dir": str(proj),
                "pcb_path": str(proj / "golden-buck-mcu.kicad_pcb"),
                "sch_path": str(proj / "golden-buck-mcu.kicad_sch"),
                "sync_hwir": True,
            })
            assert st_act == 200

            # 1. Generate firmware & digital twin files
            st_gen, gen = _req(base, "POST", "/api/v1/cosim/generate", {})
            assert st_gen == 200 and gen["ok"] is True
            for rel in (
                "firmware/include/board_pins.h",
                "firmware/include/board_pins.rs",
                "firmware/sbc/board_config.py",
                "firmware/sbc/controller.py",
                "sim/board.repl",
                "sim/wiring.json",
                "sim/stm32_blink_i2c.elf",
            ):
                assert (proj / rel).is_file(), f"Missing generated co-sim artifact: {rel}"

            # 2. Run 4-Case Code-on-Circuit Fault Suite
            st_s, suite = _req(base, "GET", "/api/v1/cosim/suite-4")
            assert st_s == 200
            assert suite["total"] == 4
            assert suite["all_gates_passed"] is True, f"Suite failed: {suite}"

            cases = {c["scenario"]: c["result"] for c in suite["cases"]}
            assert cases["nominal"]["ok"] is True
            assert len(cases["nominal"]["analog_lockstep"]["vout_v"]) > 10
            assert "$var wire" in cases["nominal"]["vcd_text"]

            assert cases["missing_i2c_pullup"]["shortcomings"][0]["category"] == "CIRCUIT_BUG"
            assert cases["swapped_uart"]["shortcomings"][0]["rule_id"] == "COSIM_UART_TX_RX_SWAPPED"
            assert cases["i2c_addr_mismatch"]["shortcomings"][0]["category"] == "INTEGRATION_MISMATCH"

            # 3. Repair i2c_addr_mismatch in firmware (0x76 -> 0x77) AND prove GREEN
            st_fix, fixed = _req(base, "POST", "/api/v1/cosim/apply-fix", {
                "rule_id": "COSIM_I2C_ADDRESS_MISMATCH",
                "fix_kind": "firmware",
            })
            assert st_fix == 200
            assert fixed["result"]["ok"] is True
            assert "0x77" in (proj / "firmware" / "sbc" / "controller.py").read_text(encoding="utf-8")
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
