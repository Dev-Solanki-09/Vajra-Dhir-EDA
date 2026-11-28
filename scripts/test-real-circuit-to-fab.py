#!/usr/bin/env python3
"""
Phase 6 Suite 2: Real Circuit -> Simulation -> Constraint/DRC -> Co-Sim -> Fab Pack -> Dossier E2E Verification.
Verifies Phase 3 Semantic Hub eliminates stubs across PDN, SPICE arbitrary topology, Co-Sim MCU target,
Open-CUBO/Starter-Parts/SBC libraries, SYNC_PLAN_BLOCKS, and 7-Layer closed-loop self-repair + Gate-8 hold.
"""

from __future__ import annotations

import json
import os
import pathlib
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
DAEMON_SCRIPT = ROOT / "packages" / "vd-daemon" / "src" / "daemon.py"


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _req(base: str, method: str, path: str, body=None, timeout: int = 30):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"} if body is not None else {}
    req = urllib.request.Request(f"{base}{path}", data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8"))


def main() -> None:
    port = _free_port()
    base = f"http://127.0.0.1:{port}"
    with tempfile.TemporaryDirectory(prefix="vd_circuit_fab_", ignore_cleanup_errors=True) as tmp_dir:
        tmp = pathlib.Path(tmp_dir)
        proj_dir = tmp / "proj"
        proj_dir.mkdir(parents=True)
        for f in (ROOT / "fixtures" / "golden-buck-mcu").glob("*"):
            if f.is_file():
                (proj_dir / f.name).write_bytes(f.read_bytes())

        env = os.environ.copy()
        env["VD_DB_DIR"] = str(tmp / "db")
        env["VD_DATA_DIR"] = str(tmp / "runtime")
        env["VD_OFFLINE"] = "1"

        proc = subprocess.Popen(
            [sys.executable, str(DAEMON_SCRIPT), "--port", str(port), "--project-dir", str(proj_dir)],
            cwd=str(ROOT),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        try:
            for _ in range(40):
                try:
                    c, _ = _req(base, "GET", "/api/health", timeout=2)
                    if c == 200:
                        break
                except Exception:
                    time.sleep(0.25)

            # 1. Library endpoints (Starter parts, Open-CUBO, SBC modules)
            c, sp = _req(base, "GET", "/api/v1/libraries/starter-parts?limit=25")
            assert c == 200 and len(sp.get("parts") or []) > 0
            c, cb = _req(base, "GET", "/api/v1/libraries/cubos")
            assert c == 200 and len(cb.get("cubos") or []) >= 5
            c, sbc = _req(base, "GET", "/api/v1/libraries/sbc-modules")
            assert c == 200 and len(sbc.get("modules") or []) >= 3
            print("[1/5] Companion library endpoints (Starter Parts, Open-CUBO, SBCs) verified!")

            # 2. SYNC_PLAN_BLOCKS atomic TX into HW-IR
            c, tx = _req(base, "POST", "/api/v1/tx/commit", {
                "origin_pane_id": "test-plan",
                "actor_kind": "human",
                "summary": "Sync Plan block to HW-IR",
                "ops": [{
                    "op": "SYNC_PLAN_BLOCKS",
                    "blocks": [{"id": "blk_sense", "name": "BME280_I2C", "role": "sensor", "memberRefdes": ["U9"], "x": 42, "y": 24}],
                    "buses": [{"name": "I2C_SDA", "protocol": "i2c", "railVoltageV": 3.3}],
                }],
            })
            assert c == 200 and tx.get("applied") and "U9" in (tx.get("changed_entities") or []), f"SYNC_PLAN_BLOCKS failed: {tx}"
            print(f"[2/5] SYNC_PLAN_BLOCKS materialized U9 & I2C_SDA cleanly at rev #{tx.get('rev_id')}!")

            # 3. Live 2.5D PDN IR-drop solver (real board grid from HW-IR, not static stub)
            c, pdn = _req(base, "POST", "/api/v1/pdn/solve", {"net": "+3V3_OUT", "current_a": 2.5})
            assert c == 200 and "max_ir_drop_mv" in pdn and pdn.get("engine") == "vd-pdn-2.5d-hwir" and len(pdn.get("heatmap_points") or []) >= 20, f"PDN failed: {pdn}"
            print(f"[3/5] Live PDN solver ({pdn['engine']}) computed max_ir_drop_mv={pdn['max_ir_drop_mv']} mV across {len(pdn['heatmap_points'])} heatmap nodes!")

            # 4. SPICE simulation & Co-Sim dynamic target
            c, spice = _req(base, "POST", "/api/v1/sim/run", {"mode": "tran"})
            assert c == 200 and spice.get("metrics"), f"SPICE failed: {spice}"
            c, cosim = _req(base, "POST", "/api/v1/cosim/generate", {})
            assert c == 200 and cosim.get("wiring", {}).get("mcu"), f"Co-Sim failed: {cosim}"
            print(f"[4/5] SPICE ({spice.get('engine')}) & Co-Sim target ({cosim['wiring']['mcu']}) verified!")

            # 5. Autonomous 7-Layer Closed Loop + Gate-8 fail-closed hold
            c, pol = _req(base, "POST", "/api/v1/agent/policy", {"mode": "AUTONOMOUS", "tier": "NDA_AIRGAPPED"})
            assert c == 200
            c, auto = _req(base, "POST", "/api/v1/agent/autonomous", {"mode": "AUTONOMOUS", "backend": "deterministic_offline"}, timeout=120)
            assert c == 200 and auto.get("success") is True, f"Autonomous loop failed: {auto}"
            layers = {x["layer"]: x["status"] for x in (auto.get("layers") or [])}
            assert len(layers) == 7 and layers.get("L7") == "HOLD_GATE8", f"Missing L1..L7 or Gate-8 hold: {layers}"
            assert auto.get("halted_at_gate8_human_signoff") is True
            assert auto.get("release_authorized") is False
            assert auto["fab_bundle"]["fabrication_status"] == "NOT_FABRICATED_0_OF_3"

            # Gate-8 refuses release without explicit human confirmation
            c_gate, gate_deny = _req(base, "POST", "/api/v1/mcp", {
                "jsonrpc": "2.0", "id": 9, "method": "tools/call",
                "params": {"name": "hw_signoff", "arguments": {"actor": "agent", "human_confirmed": False}},
            })
            assert gate_deny["result"]["isError"] is True
            print("[5/5] 7-Layer Closed-Loop Autonomous Engine & Gate-8 fail-closed guard verified!")
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()

    print("PASSED: test-real-circuit-to-fab.py")


if __name__ == "__main__":
    main()
