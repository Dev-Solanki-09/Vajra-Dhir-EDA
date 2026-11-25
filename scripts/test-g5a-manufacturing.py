#!/usr/bin/env python3
"""
scripts/test-g5a-manufacturing.py
Behavioral & clean-room cross-language contract verification for Phase G5A:
- Ring-2 KiKit subprocess isolation + deterministic MIT fallback in vd-daemon (zero pcbnew in Ring 1)
- Pure-MIT manufacturing DFM checks in packages/dfm-dfa-safety
- Pure-MIT Rust panelizer .kicad_pcb S-expr exporter + RS-274X + EAGLE XML parser tests
"""

import importlib.util
import json
import os
import sys


def _require(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(msg)


def test_daemon_kikit_ring2_isolation() -> None:
    daemon_path = os.path.join("packages", "vd-daemon", "src", "daemon.py")
    spec = importlib.util.spec_from_file_location("vd_daemon_g5a", daemon_path)
    _require(spec is not None and spec.loader is not None, "Cannot load daemon.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    _require(
        hasattr(mod, "invoke_kikit_ring2_subprocess"),
        "daemon.py missing invoke_kikit_ring2_subprocess Ring-2 boundary helper",
    )
    _require("pcbnew" not in sys.modules, "FORBIDDEN: GPL pcbnew imported into Ring-1 daemon process")

    with open("tests/fixtures/panelizer/spec_panel_2x2.json", "r", encoding="utf-8") as f:
        fixture = json.load(f)

    res = mod.invoke_kikit_ring2_subprocess(
        rows=fixture["panel_matrix"][0],
        cols=fixture["panel_matrix"][1],
        board_w_mm=fixture["board_width_nm"] / 1_000_000.0,
        board_h_mm=fixture["board_height_nm"] / 1_000_000.0,
        spacing_mm=fixture["spacing_x_nm"] / 1_000_000.0,
        rail_mm=fixture["rail_width_nm"] / 1_000_000.0,
        dry_run=True,
    )
    _require(res.get("pcbnew_in_process") is False, "pcbnew_in_process must stay False")
    _require(
        res.get("engine") in ("kikit-ring2-subprocess", "vd-panelizer-mit-fallback"),
        f"Unexpected engine identifier: {res.get('engine')}",
    )
    _require(res["panel_dimensions_mm"]["width"] == 92.0, f"Expected 92.0mm width, got {res['panel_dimensions_mm']}")
    _require(res["panel_dimensions_mm"]["height"] == 72.0, f"Expected 72.0mm height, got {res['panel_dimensions_mm']}")


def test_dfm_panel_and_gerber_checks() -> None:
    dfm_path = os.path.join("packages", "dfm-dfa-safety", "src", "dfm.py")
    spec = importlib.util.spec_from_file_location("vd_dfm_g5a", dfm_path)
    _require(spec is not None and spec.loader is not None, "Cannot load dfm.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    _require(hasattr(mod, "check_panel_and_gerber_dfm"), "dfm.py missing check_panel_and_gerber_dfm")
    ok = mod.check_panel_and_gerber_dfm(rail_width_nm=5_000_000, tooling_hole_edge_nm=2_500_000, copper_to_edge_nm=500_000)
    _require(ok["passed"] is True and len(ok["violations"]) == 0, f"Valid panel failed DFM check: {ok}")

    bad = mod.check_panel_and_gerber_dfm(rail_width_nm=1_500_000, tooling_hole_edge_nm=400_000, copper_to_edge_nm=100_000)
    _require(bad["passed"] is False and len(bad["violations"]) == 3, f"Expected 3 DFM violations, got: {bad}")


def test_rust_clean_room_sources() -> None:
    with open("packages/panelizer/src/panel_layout.rs", "r", encoding="utf-8") as f:
        panel_src = f.read()
    _require("export_kicad10_panel_pcb" in panel_src, "panelizer missing export_kicad10_panel_pcb")
    _require("kicad_pcb" in panel_src, "panelizer missing kicad_pcb S-expr output")

    _require(os.path.isfile("packages/cad-transcoder/src/rs274x.rs"), "Missing clean-room Rust RS-274X parser packages/cad-transcoder/src/rs274x.rs")
    _require(os.path.isfile("packages/cad-transcoder/src/eagle_xml.rs"), "Missing clean-room Rust EAGLE XML importer packages/cad-transcoder/src/eagle_xml.rs")

    with open("packages/cad-transcoder/tests/transcoder_test.rs", "r", encoding="utf-8") as f:
        test_src = f.read()
    _require("use vd_transcoder::" in test_src, "transcoder_test.rs must import crate vd_transcoder cleanly")
    _require("test_rs274x_golden_fixture_round_trip" in test_src, "transcoder_test.rs missing RS-274X golden test")
    _require("test_eagle_xml_import_nanometers" in test_src, "transcoder_test.rs missing EAGLE XML nanometer test")


if __name__ == "__main__":
    test_daemon_kikit_ring2_isolation()
    test_dfm_panel_and_gerber_checks()
    test_rust_clean_room_sources()
    print("PASS: G5A clean-room Rust panelizer/transcoder, Ring-2 KiKit subprocess boundary, and MIT DFM checks verified.")
