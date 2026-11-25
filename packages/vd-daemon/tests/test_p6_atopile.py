"""Prompt 6 tests: atopile .ato constraint compiler, Pint unit validation, external_id_map & locked=1 firewall."""

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
    with urllib.request.urlopen(r, timeout=30) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))


def test_atopile_compile_constraints_and_human_lock_preservation() -> None:
    port = _free_port()
    with tempfile.TemporaryDirectory(prefix="vd_p6_ato_", ignore_cleanup_errors=True) as tmp_dir:
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

            # 1) Failing Pint tolerance constraint in .ato -> exact file/line/constraint diagnostic
            bad_ato = (
                'module Buck3V3:\n'
                '    v_in = 12V +/- 10%\n'
                '    r_top = 100kohm +/- 1%\n'
                '    r_bottom = 22.1kohm +/- 1%\n'
                '    assert v_out within 4.8V to 5.2V\n'
            )
            _req(base, "POST", "/api/v1/fs/write", {"path": "elec/src/main.ato", "content": bad_ato})
            st_chk, res_chk = _req(base, "POST", "/api/v1/ato/check", {})
            assert st_chk == 200 and res_chk["success"] is False
            assert res_chk["diagnostics"][0]["line"] == 5
            assert res_chk["diagnostics"][0]["constraint_failure"] == "CONSTRAINT_OUT_OF_BOUNDS"

            # 2) Valid .ato modifying unlocked C1 value AND requesting move on locked U2 -> preserves U2 (KERNEL_LOCK_VIOLATION)!
            good_ato = (
                'module Buck3V3:\n'
                '    component U1 "CH224K"\n'
                '    component U2 "TPS54302"\n'
                '    component C1 "47uF 25V"\n'
                '    component R_DIV "4.7k 1%"\n'
                '    U2.x_mm = 99.0\n'
                '    v_in = 12V +/- 5%\n'
                '    r_top = 100kohm +/- 1%\n'
                '    r_bottom = 38.0kohm +/- 1%\n'
                '    assert v_out within 2.9V to 3.7V\n'
                '    net VBUS_12V: U2.VIN -> C1.1\n'
            )
            _req(base, "POST", "/api/v1/fs/write", {"path": "elec/src/main.ato", "content": good_ato})
            st_bld, res_bld = _req(base, "POST", "/api/v1/ato/build", {})
            assert st_bld == 200 and res_bld["success"] is True, res_bld
            assert "C1" in res_bld["synced_refs"]
            assert "R_DIV" in res_bld["added_refs"]
            assert any(c["error"] == "KERNEL_LOCK_VIOLATION" and c["refdes"] == "U2" for c in res_bld["lock_conflicts"])

            # Verify .kicad_pcb got C1 updated and R_DIV added, while locked U2 never moved to 99.0
            pcb_txt = (proj / "golden-buck-mcu.kicad_pcb").read_text(encoding="utf-8")
            assert '"47uF 25V"' in pcb_txt
            assert '"R_DIV"' in pcb_txt
            assert "99.0" not in pcb_txt

            # Verify graph endpoint binds external_id_map UUIDs for atopile components
            st_g, graph = _req(base, "GET", "/api/v1/ato/graph")
            assert st_g == 200 and any(c["refdes"] == "R_DIV" and c["hwir_uuid"] for c in graph["components"])
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
