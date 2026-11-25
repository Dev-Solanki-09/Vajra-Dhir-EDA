"""Prompt 7 tests: DuckDB starter catalog (500+ parts), DC-bias/Isat interpolation, airgap guard, & LCSC->KiCad importer."""

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


def test_kg_duckdb_search_curves_airgap_and_lcsc_import() -> None:
    port = _free_port()
    with tempfile.TemporaryDirectory(prefix="vd_p7_kg_", ignore_cleanup_errors=True) as tmp_dir:
        tmp = pathlib.Path(tmp_dir)
        proj = tmp / "proj"
        shutil.copytree("fixtures/golden-buck-mcu", proj)
        env = dict(os.environ)
        env["VD_DB_DIR"] = str(tmp / "db")
        env["NDA_AIRGAPPED"] = "1"

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
                    st, _ = _req(base, "GET", "/api/v1/health")
                    if st == 200:
                        break
                except Exception:
                    time.sleep(0.1)
            else:
                raise TimeoutError("Daemon failed to start")

            st_act, _ = _req(base, "POST", "/api/v1/kicad/active-project", {
                "project_dir": str(proj),
                "pcb_path": str(proj / "golden-buck-mcu.kicad_pcb"),
                "sch_path": str(proj / "golden-buck-mcu.kicad_sch"),
                "sync_hwir": True,
            })
            assert st_act == 200

            # 1) Search 22uF capacitors with v_bias=12V -> returns real MLCC DC-bias derating
            st_s, s_res = _req(base, "GET", "/api/v1/parts/search?q=22uF&v_bias=12.0")
            assert st_s == 200 and s_res["count"] >= 2
            mpns = {r["mpn"]: r for r in s_res["results"]}
            assert "CL21A226MAYNNNE" in mpns and "CL31B226KAHNNNE" in mpns
            assert mpns["CL21A226MAYNNNE"]["c_eff_uf_at_vbias"] < 12.0
            assert mpns["CL31B226KAHNNNE"]["c_eff_uf_at_vbias"] > 15.0

            # 2) Details endpoint includes DC bias curve points
            st_d, d_res = _req(base, "GET", "/api/v1/parts/C45783/details?v_bias=12.0")
            assert st_d == 200 and len(d_res["mlcc_dcbias_curve"]) >= 5
            assert d_res["effective_at_v_bias"]["c_eff_uf"] < 12.0

            # 3) NDA_AIRGAPPED blocks online LCSC fetches cleanly
            st_ag, ag_res = _req(base, "POST", "/api/v1/parts/import-jlcparts", {
                "sqlite_path": "nonexistent.sqlite",
                "online_fetch": True,
            })
            assert st_ag == 403 and ag_res["error"] == "NDA_AIRGAP_VIOLATION"

            # 4) Offline LCSC/MPN KiCad asset importer writes validated .kicad_sym, .kicad_mod, .step & binds .ato + .kicad_pcb
            st_imp, imp_res = _req(base, "POST", "/api/v1/parts/CL31B226KAHNNNE/import-assets", {
                "place": True,
                "x_mm": 46.0,
                "y_mm": 16.0,
                "v_bias": 12.0,
            })
            assert st_imp == 200 and imp_res["imported"] is True
            assert (proj / "sym-lib-table").is_file()
            assert (proj / "fp-lib-table").is_file()
            assert (proj / imp_res["symbol_path"]).is_file()
            assert (proj / imp_res["footprint_path"]).is_file()
            assert (proj / imp_res["step_path"]).is_file()
            placed = imp_res["placed_refdes"]
            assert placed
            assert placed in (proj / "golden-buck-mcu.kicad_pcb").read_text(encoding="utf-8")
            assert "C12891" in (proj / "elec" / "src" / "main.ato").read_text(encoding="utf-8")
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
