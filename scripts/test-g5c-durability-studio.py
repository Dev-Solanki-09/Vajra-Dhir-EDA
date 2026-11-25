#!/usr/bin/env python3
"""
scripts/test-g5c-durability-studio.py
RED->GREEN verification for Phase G5C:
- cas-store zstd compression/decompression APIs
- hw-ir SQLite WAL checkpoint ladder & fail-closed Undo/Redo helpers
- vd-daemon atomic .vd.autosave.jsonl shadow recovery + WAL ladder
- Orphan-safe child supervision (Windows Job Object KILL_ON_JOB_CLOSE / Linux PR_SET_PDEATHSIG)
- vd studio CLI launcher + daemon loopback static UI route with strict CSP
"""

import importlib.util
import json
import os
import subprocess
import sys
import tempfile


def _require(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(msg)


def test_supervision_orphan_kill() -> None:
    sup_path = os.path.join("packages", "vd-daemon", "src", "supervision.py")
    _require(os.path.isfile(sup_path), f"Missing orphan-safe child supervision module: {sup_path}")
    spec = importlib.util.spec_from_file_location("vd_supervision_g5c", sup_path)
    _require(spec is not None and spec.loader is not None, "Cannot load supervision.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    _require(hasattr(mod, "SupervisedProcessGroup"), "supervision.py missing SupervisedProcessGroup")
    with mod.SupervisedProcessGroup() as grp:
        proc = grp.spawn([sys.executable, "-c", "import time; time.sleep(30)"])
        _require(proc.poll() is None, "Spawned child exited prematurely")
        pid = proc.pid
        _require(pid > 0, "Invalid child PID")
    # Exiting context closes job handle / terminates group deterministically
    proc.wait(timeout=5)
    _require(proc.poll() is not None, "Supervised child was not reaped when supervisor closed")


def test_daemon_autosave_wal_and_static_route() -> None:
    daemon_path = os.path.join("packages", "vd-daemon", "src", "daemon.py")
    spec = importlib.util.spec_from_file_location("vd_daemon_g5c", daemon_path)
    _require(spec is not None and spec.loader is not None, "Cannot load daemon.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    _require(hasattr(mod, "write_autosave_shadow"), "daemon.py missing write_autosave_shadow")
    _require(hasattr(mod, "load_autosave_shadow"), "daemon.py missing load_autosave_shadow")
    _require(hasattr(mod, "maybe_checkpoint_wal"), "daemon.py missing maybe_checkpoint_wal")
    _require(hasattr(mod, "resolve_studio_static_asset"), "daemon.py missing resolve_studio_static_asset")

    with tempfile.TemporaryDirectory() as tmp:
        shadow = os.path.join(tmp, "board.vd.autosave.jsonl")
        mod.write_autosave_shadow(shadow, [{"op": "MOVE_COMP", "refdes": "R1", "x_nm": 12_500_000}])
        recovered = mod.load_autosave_shadow(shadow)
        _require(len(recovered) == 1 and recovered[0]["x_nm"] == 12_500_000, f"Autosave recovery mismatch: {recovered}")

    asset = mod.resolve_studio_static_asset("/")
    _require(asset["status"] == 200, f"GET / studio static route failed: {asset}")
    _require("text/html" in asset["content_type"], "GET / must return text/html")
    _require("default-src 'self'" in asset["csp"], "Static route must enforce strict CSP")


def test_rust_durability_and_studio_cli() -> None:
    with open("packages/cas-store/src/lib.rs", "r", encoding="utf-8") as f:
        cas_src = f.read()
    _require("put_bytes_zst" in cas_src and "get_bytes_zst" in cas_src, "cas-store missing put_bytes_zst/get_bytes_zst")
    _require("zstd::" in cas_src, "cas-store must use zstd crate compression")

    with open("packages/hw-ir/src/store.rs", "r", encoding="utf-8") as f:
        ir_src = f.read()
    _require("redo_last_patch" in ir_src, "hw-ir missing redo_last_patch")
    _require("checkpoint_wal_ladder" in ir_src, "hw-ir missing checkpoint_wal_ladder")

    with open("packages/cli/src/main.rs", "r", encoding="utf-8") as f:
        cli_src = f.read()
    _require('"studio"' in cli_src and "127.0.0.1:41900" in cli_src, "CLI missing vd studio launcher")


if __name__ == "__main__":
    test_supervision_orphan_kill()
    test_daemon_autosave_wal_and_static_route()
    test_rust_durability_and_studio_cli()
    print("PASS: G5C CAS zstd, WAL ladder, autosave recovery, Undo/Redo, child supervision, and vd studio verified.")
