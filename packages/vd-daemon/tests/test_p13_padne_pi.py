"""Prompt 13 Power Integrity tests: Ring 2 atx/padne 2.5D FEM solver, bottleneck detection, brownout check, repair + Undo."""

from __future__ import annotations

import json
import os
import pathlib
import re
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


def _req(base: str, method: str, path: str, body: dict | None = None, timeout: int = 60) -> tuple[int, dict]:
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


def _skinny_net3_traces(pcb_file: pathlib.Path, width_mm: float = 0.15) -> None:
    """Rewrites net 3 (+3.3V) segment widths to a deliberately skinny value for bottleneck testing."""
    text = pcb_file.read_text(encoding="utf-8")
    pattern = re.compile(
        r"(\(segment\b.*?\(width\s+)([0-9.]+)(\).*?\(net\s+3\b.*?\))",
        re.DOTALL,
    )
    # Match each individual segment block cleanly
    out_parts = []
    pos = 0
    for m in re.finditer(r"\(segment\b(?:[^()]|\([^()]*\)|\(\s*start[^)]*\)|\(\s*end[^)]*\)|\(\s*width[^)]*\)|\(\s*layer[^)]*\)|\(\s*net[^)]*\)|\(\s*uuid[^)]*\))*\)", text):
        blk = m.group(0)
        if "(net 3)" in blk:
            blk = re.sub(r"\(width\s+[0-9.]+\)", f"(width {width_mm:.3f})", blk)
        out_parts.append(text[pos:m.start()])
        out_parts.append(blk)
        pos = m.end()
    out_parts.append(text[pos:])
    pcb_file.write_text("".join(out_parts), encoding="utf-8")


def test_p13_padne_fem_bottleneck_cas_repair_and_lock_guard() -> None:
    port = _free_port()
    with tempfile.TemporaryDirectory(prefix="vd_p13_pi_", ignore_cleanup_errors=True) as tmp_dir:
        tmp = pathlib.Path(tmp_dir)
        proj = tmp / "proj"
        shutil.copytree("fixtures/golden-buck-mcu", proj)
        pcb_file = proj / "golden-buck-mcu.kicad_pcb"
        sch_file = proj / "golden-buck-mcu.kicad_sch"
        _skinny_net3_traces(pcb_file, width_mm=0.15)

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
                "pcb_path": str(pcb_file),
                "sch_path": str(sch_file),
                "sync_hwir": True,
            })
            assert st_act == 200

            # 1. Status verifies Ring 2 quarantine & upstream padne clone
            st_s, stat = _req(base, "GET", "/api/v1/pi/status")
            assert st_s == 200
            assert stat["worker_present"] is True
            assert stat["pcbnew_in_ring1"] is False
            if not stat["upstream_padne_cloned"]:
                pytest.skip("upstream vendor/padne checkout not present on host")
            assert stat["upstream_padne_cloned"] is True

            # 2. Run 2.5D FEM on skinny 0.15 mm +3.3V trace carrying 2.0 A -> catches bottleneck
            st_1, res1 = _req(base, "POST", "/api/v1/pi/solve", {
                "pcb_path": str(pcb_file),
                "net": "+3.3V",
                "load_current_a": 2.0,
                "colormap": "viridis",
            })
            assert st_1 == 200 and res1["ok"] is True
            assert res1["ring1_pcbnew_imported"] is False
            assert res1["cache_hit"] is False
            assert res1["passed"] is False
            wc1 = res1["worst_case"]
            assert wc1["peak_current_density_a_mm2"] > 300.0
            assert wc1["max_ir_drop_mv"] > 40.0
            assert wc1["bottleneck"]["width_mm"] == 0.15
            assert wc1["bottleneck"]["repair_action"] == "widen_trace"
            assert len(res1["heatmap"]["color_stops"]) == 11
            assert len(res1["heatmap"]["grid"]) > 100
            rules = [f["rule_id"] for f in res1["cross_integration"]["p13_findings"]]
            assert "PI_CURRENT_DENSITY_HOTSPOT" in rules

            # 3. Second identical solve hits CAS SHA-256 cache
            st_2, res2 = _req(base, "POST", "/api/v1/pi/solve", {
                "pcb_path": str(pcb_file),
                "net": "+3.3V",
                "load_current_a": 2.0,
                "colormap": "viridis",
            })
            assert st_2 == 200 and res2["cache_hit"] is True
            assert res2["cas_sha256"] == res1["cas_sha256"]

            # 4. Extreme load (10 A on 0.15 mm) triggers brownout (< 3.0 V)
            st_b, res_b = _req(base, "POST", "/api/v1/pi/solve", {
                "pcb_path": str(pcb_file),
                "net": "+3.3V",
                "load_current_a": 10.0,
                "use_cache": False,
            })
            assert st_b == 200 and res_b["worst_case"]["brownout_risk"] is True
            assert res_b["worst_case"]["min_delivered_v"] < 3.0
            assert "PI_BROWNOUT_RISK" in [f["rule_id"] for f in res_b["cross_integration"]["p13_findings"]]

            # 5. Widen bottleneck trace via /api/v1/pi/repair -> IR drop & current density pass
            pcb_before_repair = pcb_file.read_text(encoding="utf-8")
            st_rp, rep = _req(base, "POST", "/api/v1/pi/repair", {
                "pcb_path": str(pcb_file),
                "net": "+3.3V",
                "target_width_mm": 2.0,
                "load_current_a": 2.0,
            })
            assert st_rp == 200 and rep["ok"] is True
            assert rep["widened_segments"] >= 1
            after = rep["solve_after"]
            assert after["passed"] is True
            assert after["worst_case"]["peak_current_density_a_mm2"] <= 35.0
            assert after["worst_case"]["max_ir_drop_mv"] < wc1["max_ir_drop_mv"] * 0.25
            assert after["worst_case"]["brownout_risk"] is False

            # 6. Undo cleanly restores original skinny PCB
            st_u, _ = _req(base, "POST", "/api/v1/undo", {})
            assert st_u == 200
            assert pcb_file.read_text(encoding="utf-8") == pcb_before_repair
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
