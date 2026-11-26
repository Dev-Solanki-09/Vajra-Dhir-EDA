"""Prompt 14 CadQuery + Gmsh + ElmerFEM tests: parametric enclosure STEP/STL, exact 3D clash DRC, Monaco auto-regen, & 3D Thermal FEM (.vtu)."""

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


def _req(base: str, method: str, path: str, body: dict | None = None, timeout: int = 60) -> tuple[int, dict | str]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    r = urllib.request.Request(
        f"{base}{path}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if data is not None else {},
    )
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            ctype = resp.headers.get("Content-Type", "")
            return resp.status, json.loads(raw) if "application/json" in ctype else raw
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf-8"))


def test_p14_cadquery_enclosure_clash_and_elmer_thermal_fem() -> None:
    port = _free_port()
    with tempfile.TemporaryDirectory(prefix="vd_p14_mcad_", ignore_cleanup_errors=True) as tmp_dir:
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

            # 1. Verify status & Ring 2 isolation
            st_s, stat = _req(base, "GET", "/api/v1/mcad/status")
            assert st_s == 200 and isinstance(stat, dict)
            assert stat["worker_present"] is True
            assert stat["cadquery_cloned"] is True
            assert stat["gmsh_cloned"] is True
            assert stat["elmerfem_cloned"] is True
            assert stat["network_mode"] == "none"

            # 2. Generate default parametric enclosure -> STEP + STL in CAS, clash == 0
            st_e, enc = _req(base, "POST", "/api/v1/mcad/enclosure", {})
            assert st_e == 200 and isinstance(enc, dict) and enc["ok"] is True
            assert enc["clash"]["passed"] is True
            assert enc["clash"]["clash_mm3"] == 0.0
            step_url = enc["step_artifact"]["url"]
            stl_url = enc["stl_artifact"]["url"]
            st_step, step_txt = _req(base, "GET", step_url)
            st_stl, stl_txt = _req(base, "GET", stl_url)
            assert st_step == 200 and "ISO-10303-21;" in str(step_txt)
            assert st_stl == 200 and "solid VajraDhirEnclosure" in str(stl_txt)

            # 3. Edit mcad/enclosure.py (lower LID_HEIGHT_MM = 2.5) -> auto-regen catches J1 6.0mm clash!
            st_rd, rd = _req(base, "GET", "/api/v1/fs/read?path=mcad/enclosure.py")
            assert st_rd == 200 and isinstance(rd, dict)
            orig_py = rd["content"]
            clashing_py = orig_py.replace("LID_HEIGHT_MM = 9.0", "LID_HEIGHT_MM = 2.5")
            st_wr, wr = _req(base, "POST", "/api/v1/fs/write", {
                "path": "mcad/enclosure.py",
                "content": clashing_py,
            })
            assert st_wr == 200 and isinstance(wr, dict)
            clash_info = wr["mcad"]["clash"]
            assert clash_info["passed"] is False
            assert clash_info["clash_mm3"] > 0.0
            assert "J1" in clash_info["clashing_refdes"]

            # 4. Restore LID_HEIGHT_MM = 9.0 -> clash == 0.0
            st_wr2, wr2 = _req(base, "POST", "/api/v1/fs/write", {
                "path": "mcad/enclosure.py",
                "content": orig_py,
            })
            assert st_wr2 == 200 and isinstance(wr2, dict)
            assert wr2["mcad"]["clash"]["passed"] is True
            assert wr2["mcad"]["clash"]["clash_mm3"] == 0.0

            # 5. Run 3D Thermal FEM (Gmsh + ElmerFEM worker) -> valid .vtu + temperature rise + Tj margin
            st_th, th = _req(base, "POST", "/api/v1/thermal/solve", {
                "ambient_temp_c": 25.0,
                "mesh_resolution": "fast_preview",
            })
            assert st_th == 200 and isinstance(th, dict) and th["ok"] is True
            assert th["max_temp_c"] > 25.0
            assert th["peak_junction_temp_c"] > th["max_temp_c"]
            assert len(th["surface_grid"]) == th["grid_cols"] * th["grid_rows"]
            st_vtu, vtu_txt = _req(base, "GET", th["vtu_artifact"]["url"])
            assert st_vtu == 200 and '<VTKFile type="UnstructuredGrid"' in str(vtu_txt)
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
