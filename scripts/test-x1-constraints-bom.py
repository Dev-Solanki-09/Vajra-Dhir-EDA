#!/usr/bin/env python3
"""
scripts/test-x1-constraints-bom.py
Behavioral & Contract Gate for X1:
- Constraint-driven design (netclass rules, diff-pair skew, length-tuning delay bounds)
- Assembly variants (DNP filtering + MPN substitution)
- BOM risk/stock/Basic-vs-Extended feeder analytics
- DFM / DFA / PI scorecard over live vd-daemon endpoints
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
DFM_SRC = ROOT / "packages" / "dfm-dfa-safety" / "src"


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


def test_x1_workspace_crates_and_scorecard_module() -> None:
    cargo_toml = (ROOT / "Cargo.toml").read_text(encoding="utf-8")
    for member in ("packages/constraint-mgr", "packages/bom-analytics"):
        assert member in cargo_toml, f"Missing workspace member {member} in Cargo.toml"
        crate_toml = ROOT / member / "Cargo.toml"
        assert crate_toml.exists(), f"Missing {crate_toml}"
        txt = crate_toml.read_text(encoding="utf-8")
        assert 'license = "MIT OR Apache-2.0"' in txt or "license.workspace = true" in txt, (
            f"SPDX license missing in {crate_toml}"
        )

    sys.path.insert(0, str(DFM_SRC))
    from scorecard import compute_dfm_dfa_pi_scorecard  # noqa: E402

    clean = compute_dfm_dfa_pi_scorecard(
        trace_segments=[{"net_name": "USB_D+", "corner_angle_deg": 135.0}],
        pad_spacings=[{"pad_a": "U1.1", "pad_b": "U1.2", "gap_nm": 150_000}],
        components=[],
        tombstone_checks=[],
        max_ir_drop_mv=14.2,
        pdn_target_z_mohm=25.0,
        pdn_actual_z_mohm=18.5,
    )
    assert clean["overall_score"] >= 90 and clean["grade"] == "A", f"Unexpected clean score: {clean}"

    failing = compute_dfm_dfa_pi_scorecard(
        trace_segments=[{"net_name": "ACID_NET", "corner_angle_deg": 42.0}],
        pad_spacings=[{"pad_a": "U1.3", "pad_b": "U1.4", "gap_nm": 45_000}],
        components=[
            {"refdes": "R1", "x_nm": 10_000_000, "y_nm": 10_000_000, "rot_mdeg": 0, "w_nm": 2_000_000, "h_nm": 1_250_000, "side": "top"},
            {"refdes": "R2", "x_nm": 10_700_000, "y_nm": 10_000_000, "rot_mdeg": 0, "w_nm": 2_000_000, "h_nm": 1_250_000, "side": "top"},
        ],
        tombstone_checks=[{
            "pad1_trace_width_nm": 250_000,
            "pad2_trace_width_nm": 250_000,
            "pad1_is_plane_connected": True,
            "pad2_is_plane_connected": False,
            "pad1_has_thermal_relief": False,
            "pad2_has_thermal_relief": False,
        }],
        max_ir_drop_mv=145.0,
        pdn_target_z_mohm=20.0,
        pdn_actual_z_mohm=48.0,
    )
    assert failing["overall_score"] < 70, f"Faulty board scored too high: {failing}"
    assert failing["blocking_count"] >= 4, f"Expected blocking violations: {failing}"


def test_x1_daemon_endpoints() -> None:
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
        assert ready, "vd-daemon failed to start for X1 gate"

        # 1. Constraints evaluation: pass + violation negative
        status, c_ok = _post_json(f"{base}/api/v1/constraints/evaluate", {
            "netclasses": [{
                "name": "USB_HS_DIFF",
                "min_width_nm": 150_000,
                "min_clearance_nm": 150_000,
                "max_skew_nm": 250_000,
                "min_length_nm": 20_000_000,
                "max_length_nm": 50_000_000,
            }],
            "nets": [{
                "name": "USB_D",
                "netclass": "USB_HS_DIFF",
                "width_nm": 180_000,
                "clearance_nm": 180_000,
                "p_length_nm": 32_100_000,
                "n_length_nm": 32_020_000,
                "er_eff": 3.8,
            }],
        })
        assert status == 200 and c_ok["passed"] is True, f"Expected constraint pass: {c_ok}"

        status, c_fail = _post_json(f"{base}/api/v1/constraints/evaluate", {
            "netclasses": [{
                "name": "DDR4_DQ",
                "min_width_nm": 120_000,
                "min_clearance_nm": 125_000,
                "max_skew_nm": 100_000,
                "min_length_nm": 25_000_000,
                "max_length_nm": 40_000_000,
            }],
            "nets": [{
                "name": "DQ0",
                "netclass": "DDR4_DQ",
                "width_nm": 100_000,
                "clearance_nm": 125_000,
                "p_length_nm": 30_000_000,
                "n_length_nm": 30_850_000,
                "er_eff": 4.1,
            }],
        })
        assert status == 200 and c_fail["passed"] is False, f"Expected constraint violation: {c_fail}"
        rules = {v["rule"] for v in c_fail["violations"]}
        assert "MIN_TRACE_WIDTH" in rules and "DIFF_PAIR_MAX_SKEW" in rules, f"Missing expected violation rules: {rules}"

        # 2. Assembly variant & BOM analytics (DNP filter, Extended feeder fees, stock/lifecycle risk)
        status, bom = _post_json(f"{base}/api/v1/bom/analyze", {
            "board_count": 5,
            "variant": {
                "name": "PROTO_NO_CAN",
                "dnp_refdes": ["U9"],
                "overrides": {"R5": "RC0603FR-074K7L"},
            },
            "items": [
                {
                    "refdes": "U1", "mpn": "CH224K", "package": "ESSOP-10",
                    "feeder_fee_type": "Basic", "stock_qty": 1200, "unit_price_usd": 0.45,
                    "lifecycle": "Active", "qty": 1, "alternate_mpns": ["TPS25750"],
                },
                {
                    "refdes": "U2", "mpn": "TPS54302DDCR", "package": "SOT-23-6",
                    "feeder_fee_type": "Extended", "stock_qty": 4, "unit_price_usd": 1.10,
                    "lifecycle": "Active", "qty": 2, "alternate_mpns": [],
                },
                {
                    "refdes": "U9", "mpn": "TJA1051T/3", "package": "SOIC-8",
                    "feeder_fee_type": "Extended", "stock_qty": 0, "unit_price_usd": 0.90,
                    "lifecycle": "Obsolete", "qty": 1, "alternate_mpns": [],
                },
            ],
        })
        assert status == 200, f"BOM endpoint HTTP {status}: {bom}"
        assert bom["variant_name"] == "PROTO_NO_CAN"
        assert bom["active_line_count"] == 2 and bom["dnp_excluded_count"] == 1, f"Unexpected counts: {bom}"
        # Extended fee applies only once (U9 was DNP excluded!) => $3.00 feeder fee
        assert abs(bom["extended_feeder_fees_usd"] - 3.0) < 1e-6, f"Feeder fee mismatch: {bom}"
        # U2 has qty 2 * 5 boards = 10 needed, stock 4 -> LOW_STOCK; U9 excluded so no Obsolete failure!
        assert any(r["refdes"] == "U2" and r["kind"] == "LOW_STOCK" for r in bom["risks"]), f"Missing U2 stock risk: {bom}"
        assert not any(r["refdes"] == "U9" for r in bom["risks"]), f"DNP part U9 should not trigger risk: {bom}"

        # 3. Live DFM/DFA/PI scorecard endpoint
        status, sc = _post_json(f"{base}/api/v1/dfm/scorecard", {
            "trace_segments": [{"net_name": "SW_NODE", "corner_angle_deg": 65.0}],
            "pad_spacings": [{"pad_a": "U2.1", "pad_b": "U2.2", "gap_nm": 120_000}],
            "components": [
                {"refdes": "C1", "x_nm": 10_000_000, "y_nm": 10_000_000, "rot_mdeg": 0, "w_nm": 2_000_000, "h_nm": 1_250_000, "side": "top"},
                {"refdes": "C2", "x_nm": 10_800_000, "y_nm": 10_000_000, "rot_mdeg": 0, "w_nm": 2_000_000, "h_nm": 1_250_000, "side": "top"},
            ],
            "max_ir_drop_mv": 18.0,
            "pdn_target_z_mohm": 30.0,
            "pdn_actual_z_mohm": 22.0,
        })
        assert status == 200, f"Scorecard HTTP {status}: {sc}"
        assert sc["dfm_score"] < 100 and sc["dfa_score"] < 100, f"Expected DFM/DFA deductions: {sc}"
        assert sc["pi_score"] == 100, f"Expected clean PI score: {sc}"
    finally:
        proc.terminate()
        proc.wait(timeout=5)


def main() -> None:
    test_x1_workspace_crates_and_scorecard_module()
    test_x1_daemon_endpoints()
    print("X1_CONSTRAINTS_BOM_SCORECARD_OK")


if __name__ == "__main__":
    main()
