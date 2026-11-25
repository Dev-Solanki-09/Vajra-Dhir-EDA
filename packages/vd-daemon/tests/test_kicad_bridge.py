"""
Prompt 1 Verification Suite: KiCad 10 3-Channel Bridge, Round-Trip HW-IR Sync,
Fail-Closed Human Locks (KERNEL_LOCK_VIOLATION), and Live `kicad-cli` Exports.
"""

from __future__ import annotations

import json
import os
import pathlib
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[3]
DAEMON_SRC = ROOT / "packages" / "vd-daemon" / "src"
if str(DAEMON_SRC) not in sys.path:
    sys.path.insert(0, str(DAEMON_SRC))

import kicad_bridge as kb  # noqa: E402
import daemon as vd_daemon  # noqa: E402


GOLDEN_DIR = ROOT / "fixtures" / "golden-buck-mcu"
GOLDEN_SCH = GOLDEN_DIR / "golden-buck-mcu.kicad_sch"
GOLDEN_PCB = GOLDEN_DIR / "golden-buck-mcu.kicad_pcb"


def _open_temp_hwir(tmp_path: pathlib.Path) -> sqlite3.Connection:
    db_path = tmp_path / "test_kicad.vd.db"
    orig_dir = vd_daemon.DB_DIR
    vd_daemon.DB_DIR = tmp_path
    try:
        con = vd_daemon.init_db(db_path)
        vd_daemon.seed_reference_board(con)
        kb.ensure_external_id_map(con)
        return con
    finally:
        vd_daemon.DB_DIR = orig_dir


def test_gpl_firewall_pcbnew_never_imported() -> None:
    assert "pcbnew" not in sys.modules


def test_coordinate_and_angle_zero_drift_roundtrip() -> None:
    for nm in (0, 1, -1, 150_000, 12_345_678, -98_765_432, 60_000_000):
        cur = nm
        for _ in range(10):
            s = kb.nm_to_mm_str(cur)
            cur = kb.mm_to_nm(float(s))
            assert cur == nm
    for mdeg in (0, 500, 45_000, 90_000, 180_000, 270_000, 359_999):
        s = kb.mdeg_to_deg_str(mdeg)
        assert kb.deg_to_mdeg(float(s)) == mdeg


def test_echo_suppression_ring_window() -> None:
    ring = kb.EchoSuppressionRing(window_sec=0.15)
    digest = kb.sha256_text("(kicad_pcb (version 20260101))")
    assert not ring.should_suppress(digest)
    ring.record_write(digest)
    assert ring.should_suppress(digest)
    time.sleep(0.20)
    assert not ring.should_suppress(digest)


def test_roundtrip_hwir_kicad_pcb_preserves_uuids_and_nm(tmp_path: pathlib.Path) -> None:
    con = _open_temp_hwir(tmp_path)
    try:
        pcb_copy = tmp_path / "roundtrip.kicad_pcb"

        # 1. Start from seeded HW-IR -> export .kicad_pcb -> re-import HW-IR
        ring = kb.EchoSuppressionRing(window_sec=5.0)
        res_out1 = kb.sync_hwir_to_kicad_pcb(con, pcb_copy, echo_ring=ring)
        assert res_out1["added_footprints"] >= 12

        # Immediate watcher event with same hash MUST be suppressed by 5s Echo Ring
        suppressed = kb.sync_kicad_pcb_to_hwir(con, pcb_copy, actor_kind="import", echo_ring=ring)
        assert suppressed["suppressed_by_echo_ring"] is True

        before = {
            r[0]: (r[1], r[2], r[3], r[4])
            for r in con.execute("SELECT refdes, id, x_nm, y_nm, rot_mdeg FROM components WHERE deleted = 0").fetchall()
        }
        ext_before = {
            r[0]: r[1]
            for r in con.execute("SELECT hwir_uuid, external_key FROM external_id_map WHERE external_system = 'kicad_pcb'").fetchall()
        }
        assert len(ext_before) >= 20

        # 2. Re-import .kicad_pcb -> HW-IR without echo suppression (must preserve 100% UUIDs & i64 nm)
        res_re = kb.sync_kicad_pcb_to_hwir(con, pcb_copy, actor_kind="import", echo_ring=None)
        assert res_re["suppressed_by_echo_ring"] is False
        assert res_re["updated_components"] == 0
        assert res_re["imported_components"] == 0

        after = {
            r[0]: (r[1], r[2], r[3], r[4])
            for r in con.execute("SELECT refdes, id, x_nm, y_nm, rot_mdeg FROM components WHERE deleted = 0").fetchall()
        }
        ext_after = {
            r[0]: r[1]
            for r in con.execute("SELECT hwir_uuid, external_key FROM external_id_map WHERE external_system = 'kicad_pcb'").fetchall()
        }
        assert before == after
        assert ext_before == ext_after
    finally:
        con.close()


def test_locked_component_rejects_non_human_sync(tmp_path: pathlib.Path) -> None:
    con = _open_temp_hwir(tmp_path)
    try:
        pcb_copy = tmp_path / "locked_test.kicad_pcb"
        shutil.copy2(GOLDEN_PCB, pcb_copy)
        kb.sync_kicad_pcb_to_hwir(con, pcb_copy, actor_kind="human")

        # J1 starts locked in golden-buck-mcu.kicad_pcb
        row = con.execute("SELECT id, x_nm, locked FROM components WHERE refdes = 'J1'").fetchone()
        assert row is not None and row[2] == 1
        orig_x = row[1]

        # Modify J1 position in external .kicad_pcb and try importing as non-human 'import' actor
        trees = kb.parse_sexpr(pcb_copy.read_text(encoding="utf-8"))
        for fp in kb._find_children(trees[0], "footprint"):
            ref, _ = kb._extract_fp_ref_and_val(fp)
            if ref == "J1":
                at_n = kb._find_child(fp, "at")
                at_n[1] = kb.SStr("14.5") if False else kb.SAtom("14.5")
        pcb_copy.write_text(kb.format_sexpr(trees[0]) + "\n", encoding="utf-8")

        with pytest.raises(sqlite3.IntegrityError, match="KERNEL_LOCK_VIOLATION"):
            kb.sync_kicad_pcb_to_hwir(con, pcb_copy, actor_kind="import")
        con.rollback()
        con.execute("UPDATE _tx_actor_ctx SET actor_kind = 'human', allow_lock_override = 0 WHERE singleton = 1")
        con.commit()

        after_x = con.execute("SELECT x_nm FROM components WHERE refdes = 'J1'").fetchone()[0]
        assert after_x == orig_x
    finally:
        con.close()


def test_live_kicad_cli_exports_via_daemon_rest_api(tmp_path: pathlib.Path) -> None:
    cli = kb.find_kicad_cli()
    if not cli.get("installed"):
        pytest.skip("kicad-cli not installed on host")
    assert cli["meets_v10_floor"] is True

    # Launch vd-daemon on an ephemeral loopback port
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]

    proc = subprocess.Popen(
        [sys.executable, str(DAEMON_SRC / "daemon.py"), str(port)],
        cwd=str(ROOT),
        env={**os.environ, "VD_DB_DIR": str(tmp_path)},
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
        with urllib.request.urlopen(r, timeout=120) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))

    try:
        # Wait for health
        deadline = time.time() + 15
        while time.time() < deadline:
            try:
                st, _ = _req("GET", "/api/v1/health")
                if st == 200:
                    break
            except Exception:
                time.sleep(0.1)
        else:
            raise TimeoutError("vd-daemon failed to bind")

        st, status_res = _req("GET", "/api/v1/kicad/status")
        assert st == 200
        assert status_res["pcbnew_in_process"] is False
        assert status_res["channel_c"]["installed"] is True
        assert status_res["channel_c"]["meets_v10_floor"] is True

        # Sync golden schematic & PCB into HW-IR
        st, sch_sync = _req("POST", "/api/v1/kicad/sync", {"direction": "kicad_sch_to_hwir", "sch_path": str(GOLDEN_SCH)})
        assert st == 200 and sch_sync["symbols_mapped"] >= 10

        st, pcb_sync = _req("POST", "/api/v1/kicad/sync", {"direction": "kicad_pcb_to_hwir", "pcb_path": str(GOLDEN_PCB), "actor_kind": "human"})
        assert st == 200

        # Real KiCad 10 ERC, DRC, Netlist, Gerbers, Drill, IPC-2581, STEP, PDF
        st, erc = _req("POST", "/api/v1/kicad/erc", {"sch_path": str(GOLDEN_SCH)})
        assert st == 200 and erc["success"] is True and erc["error_count"] == 0
        assert pathlib.Path(erc["cas_artifact"]["artifact_path"]).stat().st_size > 0

        st, drc = _req("POST", "/api/v1/kicad/drc", {"pcb_path": str(GOLDEN_PCB)})
        assert st == 200 and drc["success"] is True and drc["error_count"] == 0
        assert pathlib.Path(drc["cas_artifact"]["artifact_path"]).stat().st_size > 0

        st, netl = _req("POST", "/api/v1/kicad/netlist", {"sch_path": str(GOLDEN_SCH)})
        assert st == 200 and netl["component_count"] >= 10 and netl["net_count"] >= 5

        st, gerb = _req("POST", "/api/v1/kicad/export/gerbers", {"pcb_path": str(GOLDEN_PCB)})
        assert st == 200 and gerb["file_count"] >= 5
        for fmeta in gerb["files"]:
            assert pathlib.Path(fmeta["artifact_path"]).stat().st_size > 0

        st, ipc = _req("POST", "/api/v1/kicad/export/ipc2581", {"pcb_path": str(GOLDEN_PCB)})
        assert st == 200 and ipc["cas_artifact"]["size_bytes"] > 100
        assert pathlib.Path(ipc["cas_artifact"]["artifact_path"]).stat().st_size > 100

        st, step = _req("POST", "/api/v1/kicad/export/step", {"pcb_path": str(GOLDEN_PCB), "subst_models": True})
        assert st == 200 and step["cas_artifact"]["size_bytes"] > 100
        assert pathlib.Path(step["cas_artifact"]["artifact_path"]).stat().st_size > 100

        st, pdf = _req("POST", "/api/v1/kicad/export/pdf", {"sch_path": str(GOLDEN_SCH)})
        assert st == 200 and pdf["cas_artifact"]["size_bytes"] > 100
        assert pathlib.Path(pdf["cas_artifact"]["artifact_path"]).stat().st_size > 100
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
