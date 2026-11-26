"""Prompt 12 Autorouter tests: KiCadRoutingTools Rust grid_router, SHA-256 locked-trace guard, DRC 0 errors, and Undo."""

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

import pytest


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _req(base: str, method: str, path: str, body: dict | None = None, timeout: int = 300) -> tuple[int, dict]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    r = urllib.request.Request(
        f"{base}{path}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if data is not None else {},
    )
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf-8"))


def test_p12_lock_preserving_autoroute_drc_and_undo() -> None:
    port = _free_port()
    with tempfile.TemporaryDirectory(prefix="vd_p12_route_", ignore_cleanup_errors=True) as tmp_dir:
        tmp = pathlib.Path(tmp_dir)
        proj = tmp / "proj"
        shutil.copytree("fixtures/golden-buck-mcu", proj)
        pcb_file = proj / "golden-buck-mcu.kicad_pcb"
        sch_file = proj / "golden-buck-mcu.kicad_sch"

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
                    code, _ = _req(base, "GET", "/api/v1/health", timeout=10)
                    if code == 200:
                        break
                except Exception:
                    time.sleep(0.1)
            else:
                raise TimeoutError("vd-daemon failed to start")

            st_act, _ = _req(base, "POST", "/api/v1/kicad/active-project", {
                "project_dir": str(proj),
                "pcb_path": str(pcb_file),
                "sch_path": str(sch_file),
                "sync_hwir": True,
            })
            assert st_act == 200

            # 1. Verify KiCadRoutingTools status
            st_rs, r_stat = _req(base, "GET", "/api/v1/route/status")
            assert st_rs == 200
            if not r_stat["engine"]["installed"]:
                pytest.skip("KiCadRoutingTools engine not installed on host")
            assert r_stat["engine"]["installed"] is True

            # 2. Lock 1 critical hand-routed trace segment
            st_lk, lk_res = _req(base, "POST", "/api/v1/route/lock-trace", {"locked": True})
            assert st_lk == 200 and lk_res["ok"] is True
            locked_sha_before = lk_res["sha256"]

            # 3. Preview Ghost Route on unlocked nets (does not mutate live board)
            pcb_before = pcb_file.read_text(encoding="utf-8")
            st_pv, pv_res = _req(base, "POST", "/api/v1/route/auto", {
                "reroute_unlocked": True,
                "preview_only": True,
                "run_drc": False,
            })
            assert st_pv == 200 and pv_res["ok"] is True
            assert pv_res["locked_traces_verified"] >= 1
            assert pcb_file.read_text(encoding="utf-8") == pcb_before

            # 4. Run real KiCadRoutingTools autoroute + real KiCad 10 DRC
            st_ar, ar_res = _req(base, "POST", "/api/v1/route/auto", {
                "reroute_unlocked": True,
                "preview_only": False,
                "run_drc": True,
            })
            assert st_ar == 200 and ar_res["ok"] is True
            assert ar_res["locked_traces_verified"] >= 1
            assert locked_sha_before in ar_res["locked_snapshot_hashes"].values()
            assert ar_res["drc"]["passed"] is True
            assert ar_res["drc"]["error_count"] == 0

            # 5. Undo reverts autoroute pass + Cancel endpoint responds cleanly
            st_u, _ = _req(base, "POST", "/api/v1/undo", {})
            assert st_u == 200
            assert pcb_file.read_text(encoding="utf-8") == pcb_before
            st_c, c_res = _req(base, "POST", "/api/v1/route/cancel", {})
            assert st_c == 200 and c_res["ok"] is True
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
