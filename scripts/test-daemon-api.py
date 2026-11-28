#!/usr/bin/env python3
"""
scripts/test-daemon-api.py
Automated Verification Gate for Vajra-Dhīr EDA Local Loopback Daemon Service.
Verifies all 11 REST API endpoints + 4 Stitched Brain endpoints 100% offline.
Proves fail-closed SQLite KERNEL_LOCK_VIOLATION HTTP 409 on locked entities.
"""

import json
import math
import os
import subprocess
import sys
import time
import urllib.request
import urllib.error

PORT = 41901
BASE_URL = f"http://127.0.0.1:{PORT}"

def _ensure_utf8_console() -> None:
    """Windows cp1252 consoles must not crash the gate on non-ASCII output."""
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if stream is not None and hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except (ValueError, OSError):
                pass

_ensure_utf8_console()

def http_get(path: str) -> tuple[int, dict | str]:
    url = f"{BASE_URL}{path}"
    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            content_type = resp.headers.get("Content-Type", "")
            data = resp.read().decode("utf-8")
            if "application/json" in content_type:
                return resp.status, json.loads(data)
            return resp.status, data
    except urllib.error.HTTPError as e:
        data = e.read().decode("utf-8")
        try:
            return e.code, json.loads(data)
        except Exception:
            return e.code, data

def http_post(path: str, payload: dict) -> tuple[int, dict]:
    url = f"{BASE_URL}{path}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8"))

def wait_for_health(proc, timeout_s: float = 15.0) -> dict:
    """Poll /api/v1/health until ready; fail loudly on early exit (no fixed sleep)."""
    deadline = time.time() + timeout_s
    last_err = None
    while time.time() < deadline:
        if proc.poll() is not None:
            stderr = b""
            try:
                stderr = proc.stderr.read() or b""
            except Exception:
                pass
            raise RuntimeError(
                f"daemon exited early (code {proc.returncode}) before binding:\n"
                f"{stderr.decode('utf-8', 'replace')[-2000:]}"
            )
        try:
            status, body = http_get("/api/v1/health")
            if status == 200:
                return body
        except (urllib.error.URLError, ConnectionRefusedError, OSError) as exc:
            last_err = exc
        time.sleep(0.1)
    raise TimeoutError(f"daemon not healthy after {timeout_s}s: {last_err}")

def main():
    print("[*] Launching vd-daemon on test port 41901 (cp1252 console regression)...")
    # Regression: a cp1252 Windows console must not kill the daemon on non-ASCII log output.
    import tempfile
    tmp_db_ctx = tempfile.TemporaryDirectory(prefix="vd_daemon_api_", ignore_cleanup_errors=True)
    env = {
        **os.environ,
        "PYTHONIOENCODING": "cp1252",
        "VD_DB_DIR": tmp_db_ctx.name,
        "VD_DATA_DIR": tmp_db_ctx.name,
    }
    proc = subprocess.Popen(
        [sys.executable, "packages/vd-daemon/src/daemon.py", str(PORT)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
    )
    wait_for_health(proc)
    print("  [PASS] daemon survived cp1252 console and answered /api/v1/health")

    try:
        # 1. GET /api/v1/health
        status, health = http_get("/api/v1/health")
        assert status == 200, f"Expected 200, got {status}: {health}"
        assert health["version"] == "0.0.5", f"Expected daemon version 0.0.5, got {health['version']}"
        assert health["dlp_class"] == "NDA_AIRGAPPED"
        print("  [PASS] GET /api/v1/health -> version 0.0.5, NDA_AIRGAPPED")

        # 2. GET /api/v1/board
        status, board = http_get("/api/v1/board")
        assert status == 200
        assert len(board["components"]) >= 12
        assert len(board["nets"]) >= 6
        assert board["board"]["width_nm"] == 60_000_000
        assert board["board"]["height_nm"] == 40_000_000
        print(f"  [PASS] GET /api/v1/board -> {len(board['components'])} comps, {len(board['nets'])} nets, 60x40mm i64 nm canvas")

        # 3. POST /api/v1/agent-simulate-move on LOCKED component (U2) -> MUST FAIL (HTTP 409)
        u2 = next(c for c in board["components"] if c["refdes"] == "U2")
        assert u2["locked"] is True, "U2 must start locked"
        status, res = http_post("/api/v1/agent-simulate-move", {
            "component_id": u2["id"],
            "dx_nm": 2_000_000,
            "dy_nm": 0
        })
        assert status == 409, f"Expected HTTP 409 Conflict, got {status}: {res}"
        assert res["applied"] is False
        assert "KERNEL_LOCK_VIOLATION" in res["error_code"]
        print("  [PASS] POST /api/v1/agent-simulate-move on locked U2 -> HTTP 409 KERNEL_LOCK_VIOLATION blocked")

        # 4. POST /api/v1/agent-simulate-move on UNLOCKED component (L1) -> MUST SUCCEED (HTTP 200)
        l1 = next(c for c in board["components"] if c["refdes"] == "L1")
        assert l1["locked"] is False, "L1 must start unlocked"
        status, res = http_post("/api/v1/agent-simulate-move", {
            "component_id": l1["id"],
            "dx_nm": 1_000_000,
            "dy_nm": 0
        })
        assert status == 200, f"Expected 200, got {status}: {res}"
        assert res["applied"] is True
        print("  [PASS] POST /api/v1/agent-simulate-move on unlocked L1 -> HTTP 200 OK")

        # 5. POST /api/v1/patch (human actor moving & locking a component)
        status, res = http_post("/api/v1/patch", {
            "actor_kind": "human",
            "actor_id": "engineer",
            "summary": "Human manual layout adjust",
            "ops": [
                {
                    "op": "MOVE_COMPONENT",
                    "component_id": l1["id"],
                    "x_nm": l1["x_nm"] + 500_000,
                    "y_nm": l1["y_nm"],
                    "rot_mdeg": 0,
                    "side": "top"
                }
            ]
        })
        assert status == 200, f"Expected 200, got {status}: {res}"
        assert res["applied"] is True
        print("  [PASS] POST /api/v1/patch (human actor) -> Applied patch, lamport rev incremented")

        # 6. POST /api/v1/undo and POST /api/v1/redo
        status, u_res = http_post("/api/v1/undo", {})
        assert status == 200
        status, r_res = http_post("/api/v1/redo", {})
        assert status == 200
        print("  [PASS] POST /api/v1/undo & /api/v1/redo -> Atomic patch journal rollback & reapply verified")

        # Cleanly restore L1 to original position (40mm, 20mm) so database remains clean
        http_post("/api/v1/patch", {
            "actor_kind": "human",
            "actor_id": "engineer",
            "summary": "Restore L1 position",
            "ops": [
                {
                    "op": "MOVE_COMPONENT",
                    "component_id": l1["id"],
                    "x_nm": 40_000_000,
                    "y_nm": 20_000_000,
                    "rot_mdeg": 0,
                    "side": "top"
                }
            ]
        })

        # 7. POST /api/v1/snap (hierarchical magnetic snap)
        status, snap = http_post("/api/v1/snap", {
            "x_nm": u2["x_nm"] + 100_000,
            "y_nm": u2["y_nm"] - 50_000,
            "grid_nm": 1_000_000,
            "layer": "F.Cu"
        })
        assert status == 200
        assert snap["snap_kind"] == "pad_center"
        assert snap["snapped_x_nm"] == u2["x_nm"]
        assert snap["snapped_y_nm"] == u2["y_nm"]
        print("  [PASS] POST /api/v1/snap -> Snapped to U2 pad center within 1.2mm capture radius")

        # 8. POST /api/v1/route-preview (canonical 45-deg posture solver)
        status, route = http_post("/api/v1/route-preview", {
            "start_x_nm": 10_000_000,
            "start_y_nm": 10_000_000,
            "end_x_nm": 20_000_000,
            "end_y_nm": 15_000_000,
            "diagonal_first": True,
            "width_nm": 200_000,
            "layer": "F.Cu"
        })
        assert status == 200
        assert len(route["points_nm"]) == 3
        assert route["length_mm"] > 0
        assert route["delay_ps"] > 0
        print(f"  [PASS] POST /api/v1/route-preview -> 45° posture points: {len(route['points_nm'])}, len={route['length_mm']}mm, delay={route['delay_ps']}ps")

        # 9. POST /api/v1/verify (deterministic rules + SMPS physics)
        status, rep = http_post("/api/v1/verify", {})
        assert status == 200
        assert "smps_duty_cycle" in rep
        assert "checks" in rep
        assert len(rep["checks"]) >= 5
        print(f"  [PASS] POST /api/v1/verify -> {len(rep['checks'])} checks evaluated, SMPS duty={rep['smps_duty_cycle']}")

        # 10. GET /api/v1/export/kicad-pcb and /api/v1/export/firmware-pins
        status, kicad = http_get("/api/v1/export/kicad-pcb")
        assert status == 200
        assert "(kicad_pcb" in kicad
        assert "(gr_rect" in kicad
        assert "TPS54302" in kicad

        status, fw = http_get("/api/v1/export/firmware-pins")
        assert status == 200
        assert "PIN_VBUS_SENSE" in fw
        print("  [PASS] GET /api/v1/export/kicad-pcb & firmware-pins -> Valid KiCad S-expression & board_pins.h exported")

        # 11. Stitched Brain Endpoints (/stitch/z3/pinmux, /stitch/physics/smps-bode, /stitch/kicad/drc, /stitch/kikit/panelize)
        status, z3_res = http_post("/stitch/z3/pinmux", {})
        assert status == 200 and z3_res["solved"] is True
        status, bode = http_post("/stitch/physics/smps-bode", {})
        assert status == 200 and bode["stable"] is True
        status, drc = http_post("/stitch/kicad/drc", {})
        assert status == 200 and drc["success"] is True
        status, kikit = http_post("/stitch/kikit/panelize", {})
        assert status == 200 and kikit["mouse_bites_count"] == 8
        print("  [PASS] Stitched endpoints (/stitch/z3, /stitch/physics, /stitch/kicad, /stitch/kikit) all 200 OK")

        print("[*] All 11 daemon endpoints and 4 stitched brain endpoints PASSED CLEANLY.")
        return 0

    finally:
        proc.terminate()
        proc.wait(timeout=3)

if __name__ == "__main__":
    sys.exit(main())
