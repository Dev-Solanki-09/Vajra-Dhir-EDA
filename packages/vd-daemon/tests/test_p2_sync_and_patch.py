#!/usr/bin/env python3
"""Integration tests for Prompt 2 P1<->P2 KiCad file sync, patch persistence, and Echo Ring."""

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


def test_p2_kicad_sync_and_patch_persistence() -> None:
    port = _free_port()
    with tempfile.TemporaryDirectory(prefix="vd_p2_test_") as tmp_dir:
        tmp = pathlib.Path(tmp_dir)
        proj_dir = tmp / "proj"
        shutil.copytree("fixtures/golden-buck-mcu", proj_dir)
        db_dir = tmp / "db"
        env = dict(os.environ)
        env["VD_DB_DIR"] = str(db_dir)

        proc = subprocess.Popen(
            [sys.executable, "-m", "packages.vd-daemon.src.daemon", str(port)]
            if False
            else [sys.executable, "packages/vd-daemon/src/daemon.py", str(port)],
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        base = f"http://127.0.0.1:{port}"

        def _req(method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
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
            except urllib.error.HTTPError as e:
                return e.code, json.loads(e.read().decode("utf-8"))

        try:
            for _ in range(100):
                try:
                    st, _ = _req("GET", "/api/v1/health")
                    if st == 200:
                        break
                except Exception:
                    time.sleep(0.1)
            else:
                raise TimeoutError("Daemon failed to start")

            # 1. Activate temp copy of golden-buck-mcu & fetch files
            pcb_file = proj_dir / "golden-buck-mcu.kicad_pcb"
            sch_file = proj_dir / "golden-buck-mcu.kicad_sch"
            st, active = _req("POST", "/api/v1/kicad/active-project", {
                "project_dir": str(proj_dir),
                "pcb_path": str(pcb_file),
                "sch_path": str(sch_file),
                "sync_hwir": True,
            })
            assert st == 200
            assert "(kicad_pcb" in active["kicad_pcb"]
            assert "(kicad_sch" in active["kicad_sch"]

            # 2. Agent mutation of human-locked J1 must fail closed with KERNEL_LOCK_VIOLATION (409)
            st_lock, lock_err = _req("POST", "/api/v1/patch", {
                "actor_kind": "agent",
                "actor_id": "test-agent",
                "summary": "Attempt agent move of locked J1",
                "ops": [{"op": "MOVE_COMPONENT", "component_id": "J1", "x_nm": 9_000_000, "y_nm": 20_000_000}],
            })
            assert st_lock == 409 and lock_err["error_code"] == "KERNEL_LOCK_VIOLATION", f"Expected 409 lock violation: {lock_err}"

            # 3. Human drag of unlocked C1 -> updates HW-IR + writes through to .kicad_pcb + adds trace & via
            st_move, move_res = _req("POST", "/api/v1/patch", {
                "actor_kind": "human",
                "actor_id": "human-ui",
                "summary": "Drag C1 and add stitching via",
                "ops": [
                    {"op": "MOVE_COMPONENT", "component_id": "C1", "x_nm": 15_500_000, "y_nm": 18_250_000, "rot_mdeg": 90000},
                    {"op": "ADD_TRACE_SEGMENT", "net_name": "+3.3V", "layer_name": "F.Cu", "x1_nm": 15_500_000, "y1_nm": 18_250_000, "x2_nm": 17_500_000, "y2_nm": 20_250_000, "width_nm": 250000},
                    {"op": "ADD_VIA", "net_name": "GND", "x_nm": 17_500_000, "y_nm": 20_250_000, "diameter_nm": 600000, "drill_nm": 300000},
                ],
            })
            assert st_move == 200 and move_res["applied"] is True, move_res
            updated_pcb = pcb_file.read_text(encoding="utf-8")
            assert "(at 15.5 18.25 90)" in updated_pcb, "C1 move not persisted to .kicad_pcb"

            # 4. Internal write is suppressed by 5s Echo Ring (external_changed == False)
            st_ev1, ev1 = _req("GET", "/api/v1/kicad/events")
            assert st_ev1 == 200 and ev1["external_changed"] is False

            # 5. External edit on .kicad_pcb outside 5s echo ring (modified property value) triggers external_changed == True
            modified = updated_pcb.replace('"10uF 25V"', '"10uF 35V"', 1)
            pcb_file.write_text(modified, encoding="utf-8")
            st_ev2, ev2 = _req("GET", "/api/v1/kicad/events")
            assert st_ev2 == 200 and ev2["external_changed"] is True, f"Expected external_changed=True: {ev2}"
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
