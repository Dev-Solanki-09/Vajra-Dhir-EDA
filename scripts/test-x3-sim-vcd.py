#!/usr/bin/env python3
"""
scripts/test-x3-sim-vcd.py
Behavioral & Negative Gate for X3:
- Pure-MIT IEEE-1364 VCD parser (replacing EUPL-1.2 surfer)
- 166k-point uPlot/waveform data ingestion benchmark (<25 ms)
- Renode + ngspice lockstep co-sim endpoint & Ring-2 OCI field-solver zero-egress (403 on bridge)
"""

import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DAEMON_ENTRY = ROOT / "packages" / "vd-daemon" / "src" / "daemon.py"

SAMPLE_VCD = """$date
  Nov 25 2026
$end
$timescale 1ns $end
$scope module top $end
$var wire 1 ! clk $end
$var wire 1 " pgood $end
$var wire 4 # state $end
$upscope $end
$enddefinitions $end
#0
$dumpvars
0!
0"
b0000 #
$end
#10
1!
b0001 #
#20
0!
1"
b0011 #
#30
1!
b0111 #
"""


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _post_json(url: str, payload: dict) -> tuple[int, dict]:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        return err.code, json.loads(err.read().decode("utf-8"))


def test_pure_mit_vcd_parser_and_166k_budget() -> None:
    parser_ts = ROOT / "apps" / "workstation" / "src" / "engines" / "vcdParser.ts"
    assert parser_ts.exists(), "Missing pure-MIT vcdParser.ts"

    # Compile & run via Node TypeScript strip / built chunk check via tsc --noEmit already validated,
    # and run a standalone pure ESM test against built/transpiled vcdParser.mjs helper.
    node_script = """
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { parseVcd, downsampleMinMax } from './packages/sim-compat/dist_vcd/vcdParser.mjs';

const sample = fs.readFileSync(0, 'utf8');
const parsed = parseVcd(sample);
if (parsed.timescaleNs !== 1) throw new Error('bad timescale');
if (parsed.signals.length !== 3) throw new Error('expected 3 signals');
const pgood = parsed.signals.find((s) => s.name === 'pgood');
const state = parsed.signals.find((s) => s.name === 'state');
if (!pgood || pgood.values[1] !== 1 || pgood.timesNs[1] !== 20) throw new Error('pgood transition failed');
if (!state || state.values[3] !== 7) throw new Error('multi-bit binary parse failed: ' + JSON.stringify(state));

// Benchmark 166,000 points step ingestion + min-max decimation budget (<25ms, critic L75)
const n = 166000;
const x = new Float64Array(n);
const y = new Float64Array(n);
for (let i = 0; i < n; i++) { x[i] = i * 0.01; y[i] = Math.sin(i * 0.05) * 3.3; }
const t0 = performance.now();
const dec = downsampleMinMax(x, y, 1600);
const elapsed = performance.now() - t0;
if (dec.x.length === 0 || dec.x.length > 3204) throw new Error('bad decimation length');
if (elapsed >= 25.0) throw new Error('166k downsample exceeded 25ms: ' + elapsed);
console.log(JSON.stringify({ signals: parsed.signals.length, pts: n, decimated: dec.x.length, elapsed_ms: Number(elapsed.toFixed(3)) }));
"""
    # Transpile vcdParser.ts on-the-fly with installed typescript compiler? Or run via node --experimental-strip-types!
    # Node 24 supports native TypeScript stripping! Check cleanly:
    node_script_ts = node_script.replace(
        "'./packages/sim-compat/dist_vcd/vcdParser.mjs'",
        "'./apps/workstation/src/engines/vcdParser.ts'",
    )
    proc = subprocess.run(
        ["node", "--input-type=module", "-e", node_script_ts],
        cwd=str(ROOT),
        input=SAMPLE_VCD,
        capture_output=True,
        text=True,
        check=True,
    )
    info = json.loads(proc.stdout.strip().splitlines()[-1])
    assert info["elapsed_ms"] < 25.0, f"VCD/uPlot 166k perf budget exceeded: {info}"


def test_x3_cosim_and_ring2_zero_egress() -> None:
    port = _free_port()
    base = f"http://127.0.0.1:{port}"
    env = dict(os.environ)
    env["PYTHONUTF8"] = "1"
    env["VD_LLM_PROVIDER"] = "deterministic_offline"

    proc = subprocess.Popen(
        [sys.executable, str(DAEMON_ENTRY), str(port)],
        cwd=str(ROOT),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    try:
        ready = False
        for _ in range(40):
            try:
                with urllib.request.urlopen(f"{base}/api/v1/health", timeout=2) as r:
                    if r.status == 200:
                        ready = True
                        break
            except Exception:
                time.sleep(0.1)
        assert ready, "vd-daemon failed to boot for X3 gate"

        # 1. Renode <-> ngspice lockstep co-simulation step
        status, cosim = _post_json(f"{base}/api/v1/sim/cosim-step", {
            "quantum_ns": 1000,
            "vbus_mv": 12000,
            "target_vout_mv": 3300,
            "steps": 5,
        })
        assert status == 200 and len(cosim["trace"]) == 5, f"Co-sim failed: {cosim}"
        assert cosim["engine"] == "renode-ngspice-lockstep"

        # 2. Ring-2 zero-egress field solver (network_mode='none' PASS, 'bridge' 403 FAIL-CLOSED)
        valid_digest = "sha256:" + ("a" * 64)
        status, ok_field = _post_json(f"{base}/api/v1/sim/field-solve", {
            "solver": "openems",
            "pack_id": "pack-2b",
            "network_mode": "none",
            "image_digest_sha256": valid_digest,
            "fmax_ghz": 5.0,
        })
        assert status == 200 and ok_field["status"] == "converged", f"Field solve failed: {ok_field}"

        status, blocked = _post_json(f"{base}/api/v1/sim/field-solve", {
            "solver": "palace",
            "pack_id": "pack-2b",
            "network_mode": "bridge",
            "image_digest_sha256": valid_digest,
            "fmax_ghz": 10.0,
        })
        assert status == 403 and blocked["error"] == "RING2_EGRESS_BLOCKED", f"Expected 403 block: {status} {blocked}"
    finally:
        proc.terminate()
        proc.wait(timeout=5)


def main() -> None:
    test_pure_mit_vcd_parser_and_166k_budget()
    test_x3_cosim_and_ring2_zero_egress()
    print("X3_SIM_COSIM_VCD_MIT_OK")


if __name__ == "__main__":
    main()
