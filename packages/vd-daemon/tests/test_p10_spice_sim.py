"""Prompt 10 SPICE simulation integration tests: native ngspice.dll, 5 modes, CAS caching, Ring 2 spicelib, and P9 ripple guard."""

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


def test_p10_5mode_spice_cas_montecarlo_and_undersized_cap_p9() -> None:
    port = _free_port()
    with tempfile.TemporaryDirectory(prefix="vd_p10_sim_", ignore_cleanup_errors=True) as tmp_dir:
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

            # 0. Status check
            st, s = _req(base, "GET", "/api/v1/sim/status")
            assert st == 200
            assert s["ngspice_native"]["installed"] is True
            assert s["spicelib_ring2_worker"] is True

            # 1. Transient (22uF nominal) + CAS SHA-256 Cache Hit
            st1, r_tran = _req(base, "POST", "/api/v1/sim/run", {"mode": "tran", "c_out_uf": 22.0})
            assert st1 == 200 and r_tran["ok"] is True
            assert r_tran["cas_cached"] is False
            assert len(r_tran["vectors"]["vout_3v3"]) > 20
            assert (proj / "sim" / "board.cir").is_file()

            st1b, r_cached = _req(base, "POST", "/api/v1/sim/run", {"mode": "tran", "c_out_uf": 22.0})
            assert st1b == 200 and r_cached["cas_cached"] is True
            assert r_cached["sha256"] == r_tran["sha256"]

            # 2. Inject under-sized output capacitor (0.47uF) -> P10 ripple + P9 flag
            st_bad, r_bad = _req(base, "POST", "/api/v1/sim/run", {"mode": "tran", "c_out_uf": 0.47})
            assert st_bad == 200 and r_bad["ok"] is True
            assert r_bad["metrics"]["ripple_mv_pp"] > 100.0, f"Expected high ripple on 0.47uF cap: {r_bad['metrics']}"
            p9_rules = {f["rule_id"] for f in r_bad["p9_stress_findings"]}
            assert "SPICE_EXCESSIVE_RAIL_RIPPLE" in p9_rules
            assert "MLCC_DC_BIAS_DERATING" in p9_rules

            # 3. AC sweep + OP bias + Fault Injection (short_circuit) + Ring 2 Monte-Carlo
            st_op, r_op = _req(base, "POST", "/api/v1/sim/run", {"mode": "op"})
            assert st_op == 200 and r_op["ok"] is True and "vout_3v3" in r_op["dc_nodes"]

            st_ac, r_ac = _req(base, "POST", "/api/v1/sim/run", {"mode": "ac"})
            assert st_ac == 200 and r_ac["ok"] is True and "mag_db" in r_ac["vectors"]["vout_3v3"]

            st_flt, r_flt = _req(base, "POST", "/api/v1/sim/run", {"mode": "fault", "fault_type": "short_circuit"})
            assert st_flt == 200 and r_flt["ok"] is True and r_flt["metrics"]["mean_v"] < 0.8

            st_mc, r_mc = _req(base, "POST", "/api/v1/sim/run", {"mode": "montecarlo", "tol_pct": 10.0})
            assert st_mc == 200 and r_mc["ok"] is True
            assert r_mc["montecarlo"]["runs_executed"] == 5
            assert r_mc["montecarlo"]["ring_isolation"] == "ring2-subprocess-gpl3-quarantine"
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
