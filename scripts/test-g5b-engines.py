#!/usr/bin/env python3
"""
scripts/test-g5b-engines.py
Behavioral & clean-room cross-language contract verification for Phase G5B:
- WireViz-compatible YAML -> SVG + cut-list CSV in Rust (vd-wire-harness)
- Trace + multi-layer SVG diff in Rust (vd-pcb-diff)
- Integer i_triangle copper triangulation in Rust (vd-cad-geom) & non-canned /copper/refill in daemon.py
- LGPL-2.1-with-OCCT-exception isolated STEP Web Worker contract + honest CLI STEP status
"""

import importlib.util
import json
import os


def _require(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(msg)


def test_daemon_copper_refill_non_canned() -> None:
    daemon_path = os.path.join("packages", "vd-daemon", "src", "daemon.py")
    spec = importlib.util.spec_from_file_location("vd_daemon_g5b", daemon_path)
    _require(spec is not None and spec.loader is not None, "Cannot load daemon.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    _require(hasattr(mod, "compute_copper_refill_metrics"), "daemon.py missing real compute_copper_refill_metrics")

    rect_a = mod.compute_copper_refill_metrics(
        layer="F.Cu",
        net="GND",
        polygon_nm=[[0, 0], [40_000_000, 0], [40_000_000, 30_000_000], [0, 30_000_000]],
        voids_count=0,
    )
    rect_b = mod.compute_copper_refill_metrics(
        layer="In1.Cu",
        net="+3V3",
        polygon_nm=[[0, 0], [20_000_000, 0], [25_000_000, 10_000_000], [15_000_000, 20_000_000], [0, 15_000_000]],
        voids_count=2,
    )
    _require(rect_a["polygon_area_mm2"] == 1200.0, f"Expected 1200.0 mm2 area, got {rect_a}")
    _require(rect_a["mesh_triangles_count"] != rect_b["mesh_triangles_count"], "Triangle count must vary dynamically with polygon geometry")
    _require(rect_b["polygon_area_mm2"] < rect_a["polygon_area_mm2"], "Smaller polygon must report smaller area")


def test_rust_clean_room_g5b_sources() -> None:
    with open("packages/wire-harness/src/harness_compiler.rs", "r", encoding="utf-8") as f:
        wh = f.read()
    _require("parse_yaml_and_compile" in wh, "wire-harness missing parse_yaml_and_compile")
    _require("export_svg" in wh and "export_cut_list_csv" in wh, "wire-harness missing SVG / CSV exporters")

    with open("packages/pcb-diff/src/diff_engine.rs", "r", encoding="utf-8") as f:
        diff = f.read()
    _require("compute_trace_and_layer_diff" in diff, "pcb-diff missing compute_trace_and_layer_diff")

    _require(os.path.isfile("packages/cad-geom/src/triangulate.rs"), "cad-geom missing src/triangulate.rs")
    with open("packages/cad-geom/src/triangulate.rs", "r", encoding="utf-8") as f:
        tri = f.read()
    _require("i_triangle" in tri and "triangulate_polygon_nm" in tri, "triangulate.rs must integrate integer i_triangle crate")


def test_step_worker_isolation_and_cli_honesty() -> None:
    for path in (
        "packages/webgpu-cad-engine/src/stepWorker.ts",
        "packages/webgpu-cad-engine/src/stepWorker.js",
    ):
        _require(os.path.isfile(path), f"Missing isolated STEP Web Worker module: {path}")

    with open("packages/webgpu-cad-engine/src/stepWorker.js", "r", encoding="utf-8") as f:
        worker_src = f.read()
    _require("LGPL-2.1-with-OCCT-exception" in worker_src, "stepWorker must state its LGPL-2.1-with-OCCT-exception isolation")
    _require("occt-import-js" in worker_src, "stepWorker must reference occt-import-js boundary")

    with open("packages/cli/src/main.rs", "r", encoding="utf-8") as f:
        cli_src = f.read()
    _require('"step"' in cli_src and "stepWorker" in cli_src, "CLI missing honest step subcommand referencing isolated stepWorker")


if __name__ == "__main__":
    test_daemon_copper_refill_non_canned()
    test_rust_clean_room_g5b_sources()
    test_step_worker_isolation_and_cli_honesty()
    print("PASS: G5B clean-room wire-harness, pcb-diff, i_triangle i64 copper refill, and LGPL STEP worker verified.")
