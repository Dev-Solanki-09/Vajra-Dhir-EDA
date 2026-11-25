#!/usr/bin/env python3
"""
scripts/test-x4-silicon-mcad.py
Behavioral & Negative Gate for X4:
- LibreLane Pack-2C Silicon/FPGA Bridge (forbids legacy OpenLane + requires network_mode='none')
- Integer i64 nm 3D STEP/MCAD bounding-box clearance DRC (positive + interference negative)
- Pure-MIT RS-274X tracespace-compatible Gerber SVG renderer + SKiDL optional netlist importer
- Offline JLC supply-chain catalog search & STEP AP242 worker contract
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

SAMPLE_GERBER = """%FSLAX46Y46*%
%MOMM*%
%ADD10C,0.2500*%
G01*
X10000000Y10000000D02*
X25000000Y10000000D01*
X25000000Y20000000D03*
M02*
"""


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _get_json(url: str) -> tuple[int, dict]:
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        return err.code, json.loads(err.read().decode("utf-8"))


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


def test_x4_static_and_gerber_preview() -> None:
    cargo_toml = (ROOT / "Cargo.toml").read_text(encoding="utf-8")
    assert "packages/silicon-pack" in cargo_toml, "Missing packages/silicon-pack in Cargo.toml"
    sp_toml = (ROOT / "packages" / "silicon-pack" / "Cargo.toml").read_text(encoding="utf-8")
    assert 'license = "MIT OR Apache-2.0"' in sp_toml or "license.workspace = true" in sp_toml
    assert (ROOT / "packages" / "cad-geom" / "src" / "mcad_clearance.rs").exists()
    assert (ROOT / "packages" / "cad-transcoder" / "src" / "skidl_netlist.rs").exists()

    node_script = """
import fs from 'node:fs';
import { renderGerberPreviewSvg } from './apps/workstation/src/engines/gerberPreview.ts';
const gbr = fs.readFileSync(0, 'utf8');
const svg = renderGerberPreviewSvg(gbr, 'F.Cu');
if (!svg.includes('<svg') || !svg.includes('<line') || !svg.includes('<circle')) {
  throw new Error('Expected SVG tracks + pad flashes: ' + svg);
}
"""
    subprocess.run(
        ["node", "--input-type=module", "-e", node_script],
        cwd=str(ROOT),
        input=SAMPLE_GERBER,
        capture_output=True,
        text=True,
        check=True,
    )


def test_x4_daemon_mcad_silicon_and_supply_chain() -> None:
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
        assert ready, "vd-daemon failed to boot for X4 gate"

        # 1. Integer i64 nm 3D STEP/MCAD clearance DRC (PASS + collision FAIL)
        st, drc_ok = _post_json(f"{base}/api/v1/mcad/clearance-drc", {
            "min_clearance_nm": 500_000,
            "pcb_boxes": [{"id": "L1", "min": [10_000_000, 10_000_000, 1_600_000], "max": [14_000_000, 14_000_000, 3_600_000]}],
            "enclosure_walls": [{"id": "TOP_LID", "min": [0, 0, 5_000_000], "max": [50_000_000, 50_000_000, 6_000_000]}],
        })
        assert st == 200 and drc_ok["passed"] is True, f"Expected 3D clearance PASS: {drc_ok}"

        st, drc_hit = _post_json(f"{base}/api/v1/mcad/clearance-drc", {
            "min_clearance_nm": 500_000,
            "pcb_boxes": [{"id": "J1_USB", "min": [10_000_000, 10_000_000, 1_600_000], "max": [19_000_000, 18_000_000, 4_800_000]}],
            "enclosure_walls": [{"id": "TOP_LID", "min": [0, 0, 4_500_000], "max": [50_000_000, 50_000_000, 6_000_000]}],
        })
        assert st == 200 and drc_hit["passed"] is False, f"Expected 3D interference violation: {drc_hit}"
        assert drc_hit["violations"][0]["kind"] == "MCAD_3D_INTERFERENCE", f"Wrong kind: {drc_hit}"

        # 2. LibreLane Pack-2C Silicon/FPGA Contract (OpenLane rejected 400, egress rejected 403)
        digest = "sha256:" + ("b" * 64)
        st, lib_ok = _post_json(f"{base}/api/v1/silicon/librelane-pack", {
            "flow": "librelane",
            "pdk": "sky130A",
            "network_mode": "none",
            "image_digest_sha256": digest,
        })
        assert st == 200 and lib_ok["flow"] == "librelane" and len(lib_ok["c2p2b_balls"]) >= 2, f"LibreLane fail: {lib_ok}"

        st, bad_flow = _post_json(f"{base}/api/v1/silicon/librelane-pack", {
            "flow": "openlane",
            "pdk": "sky130A",
            "network_mode": "none",
            "image_digest_sha256": digest,
        })
        assert st == 400 and bad_flow["error"] == "LEGACY_OPENLANE_FORBIDDEN", f"OpenLane must be blocked: {st} {bad_flow}"

        st, omitted_flow = _post_json(f"{base}/api/v1/silicon/librelane-pack", {
            "pdk": "sky130A",
            "network_mode": "none",
            "image_digest_sha256": digest,
        })
        assert st == 400 and omitted_flow["error"] == "LEGACY_OPENLANE_FORBIDDEN", f"Omitted flow must fail closed: {st} {omitted_flow}"

        st, bad_net = _post_json(f"{base}/api/v1/silicon/librelane-pack", {
            "flow": "librelane",
            "pdk": "sky130A",
            "network_mode": "bridge",
            "image_digest_sha256": digest,
        })
        assert st == 403 and bad_net["error"] == "RING2_EGRESS_BLOCKED", f"Bridge must be blocked: {st} {bad_net}"

        # 3. Supply-chain offline lookup
        st, sc = _get_json(f"{base}/api/v1/components/search?q=TPS54302")
        assert st == 200 and len(sc.get("results", [])) >= 1, f"Supply-chain fixture lookup failed: {sc}"
    finally:
        proc.terminate()
        proc.wait(timeout=5)


def main() -> None:
    test_x4_static_and_gerber_preview()
    test_x4_daemon_mcad_silicon_and_supply_chain()
    print("X4_SILICON_MCAD_SUPPLY_OK")


if __name__ == "__main__":
    main()
