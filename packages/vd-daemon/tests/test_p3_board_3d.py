#!/usr/bin/env python3
"""Prompt 3 unit & HTTP integration tests for 3D board-mesh, STEP resolution, and 0.000mm coordinate parity."""

import json
import math
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

sys.path.insert(0, str(pathlib.Path("packages/vd-daemon/src").resolve()))
from board_3d import build_board_3d_payload, kicad_local_to_world_mm  # noqa: E402


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def test_kicad_to_3d_coordinate_handedness_zero_offset() -> None:
    """Verify 0.000 mm placement/rotation parity between 2D KiCad Y-down and 3D (X_3d=X_kc, Z_3d=Y_kc)."""
    # Footprint at (25.0, 15.0) rotated 90 deg CCW in KiCad Y-down screen space:
    # Local pad (+2.0, 0.0) -> rotates UP (-Y_kicad) -> (25.0, 13.0)
    wx, wy = kicad_local_to_world_mm(25.0, 15.0, 90.0, 2.0, 0.0)
    assert math.isclose(wx, 25.0, abs_tol=1e-6), f"wx={wx}"
    assert math.isclose(wy, 13.0, abs_tol=1e-6), f"wy={wy}"

    # Three.js right-handed rotation.y = +90 deg on (lx=2, lz=0):
    # x' = cos(t)*lx + sin(t)*lz = 0, z' = -sin(t)*lx + cos(t)*lz = -2 -> world (25.0, 13.0)
    theta = math.radians(90.0)
    x3 = 25.0 + math.cos(theta) * 2.0 + math.sin(theta) * 0.0
    z3 = 15.0 + (-math.sin(theta) * 2.0 + math.cos(theta) * 0.0)
    assert math.isclose(x3, wx, abs_tol=1e-9)
    assert math.isclose(z3, wy, abs_tol=1e-9)

    # Diagonal local pad (1.5, -0.75) at 45 deg
    wx2, wy2 = kicad_local_to_world_mm(40.0, 30.0, 45.0, 1.5, -0.75)
    t2 = math.radians(45.0)
    x3_2 = 40.0 + math.cos(t2) * 1.5 + math.sin(t2) * (-0.75)
    z3_2 = 30.0 + (-math.sin(t2) * 1.5 + math.cos(t2) * (-0.75))
    assert math.isclose(x3_2, wx2, abs_tol=1e-6)
    assert math.isclose(z3_2, wy2, abs_tol=1e-6)


def test_build_board_3d_payload_golden_buck() -> None:
    pcb_path = pathlib.Path("fixtures/golden-buck-mcu/golden-buck-mcu.kicad_pcb")
    payload = build_board_3d_payload(pcb_path.read_text(encoding="utf-8"), pcb_path=pcb_path)
    assert payload["board"]["width_mm"] == 60.0
    assert payload["board"]["height_mm"] == 40.0
    assert len(payload["components"]) >= 10
    assert len(payload["pads"]) >= 20
    assert payload["step_models_resolved"] >= 5, f"Expected KiCad 10 3D STEP models resolved: {payload}"


def test_daemon_3d_endpoints_and_step_streaming() -> None:
    port = _free_port()
    with tempfile.TemporaryDirectory(prefix="vd_p3_test_") as tmp_dir:
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
                    with urllib.request.urlopen(f"{base}/api/v1/health", timeout=2) as r:
                        if r.status == 200:
                            break
                except Exception:
                    time.sleep(0.1)
            else:
                raise TimeoutError("Daemon failed to start")

            with urllib.request.urlopen(f"{base}/api/v1/3d/board-mesh", timeout=15) as r:
                assert r.status == 200
                mesh_data = json.loads(r.read().decode("utf-8"))

            step_comps = [c for c in mesh_data["components"] if c.get("step_url")]
            assert len(step_comps) >= 5, f"Expected resolved STEP URLs: {mesh_data['components']}"

            first_step_url = step_comps[0]["step_url"]
            with urllib.request.urlopen(f"{base}{first_step_url}", timeout=15) as r:
                assert r.status == 200
                step_bytes = r.read()
            assert b"ISO-10303-21;" in step_bytes[:256], "Expected valid STEP AP214/AP242 header"

            # Path traversal / invalid SHA rejection
            try:
                urllib.request.urlopen(f"{base}/api/v1/3d/step/not-a-valid-sha", timeout=5)
                raise AssertionError("Expected HTTP 404 on invalid STEP SHA")
            except urllib.error.HTTPError as e:
                assert e.code == 404
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
