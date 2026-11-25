"""Prompt 9 daemon REST API tests for /api/v1/ee/audit endpoints."""

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
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf-8"))


def test_ee_audit_workspace_benchmark8_and_apply_fix() -> None:
    port = _free_port()
    with tempfile.TemporaryDirectory(prefix="vd_p9_api_", ignore_cleanup_errors=True) as tmp_dir:
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
                    pass
                time.sleep(0.1)
            else:
                raise TimeoutError("Daemon failed to start")

            code_act, _ = _req(base, "POST", "/api/v1/kicad/active-project", {
                "project_dir": str(proj),
                "pcb_path": str(proj / "golden-buck-mcu.kicad_pcb"),
                "sch_path": str(proj / "golden-buck-mcu.kicad_sch"),
                "sync_hwir": True,
            })
            assert code_act == 200

            # 1. Workspace audit returns active board analysis + 45-pt Bode curve
            code, ws = _req(base, "GET", "/api/v1/ee/audit")
            assert code == 200
            assert "audit" in ws
            assert len(ws["audit"]["bode"]["freqs_hz"]) == 45
            assert ws["audit"]["bode"]["phase_margin_deg"] >= 45.0

            # 2. Benchmark-8 endpoint returns 8/8 caught and 8/8 repaired GREEN
            code, bm = _req(base, "GET", "/api/v1/ee/audit/benchmark-8")
            assert code == 200
            assert bm["total"] == 8
            assert bm["caught"] == 8
            assert bm["repaired_green"] == 8

            # 3. Custom broken POST + apply-fix roundtrip turns GREEN
            broken_spec = {
                "inductors": [{"refdes": "L1", "i_peak_a": 2.9, "i_sat_a": 2.15}],
            }
            code, r_bad = _req(base, "POST", "/api/v1/ee/audit", {"spec": broken_spec})
            assert code == 200
            assert r_bad["audit"]["passed"] is False
            finding = next(f for f in r_bad["audit"]["findings"] if f["rule_id"] == "INDUCTOR_ISAT_SATURATION")

            code, r_fix = _req(
                base,
                "POST",
                "/api/v1/ee/audit/apply-fix",
                {"spec": broken_spec, "finding": finding},
            )
            assert code == 200
            assert r_fix["audit"]["passed"] is True
            assert r_fix["audit"]["error_count"] == 0
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
