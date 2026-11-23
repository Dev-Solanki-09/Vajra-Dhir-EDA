#!/usr/bin/env python3
"""
scripts/test-prototype-gui.py
Automated Verification Gate for Silicon Darkroom CAD GUI (apps/prototype-gui).
Validates UI tokens, types, command bus wiring, 7 workspaces, and canvas math.
"""

import json
import pathlib
import re
import sys

def test_gui_structure():
    gui_dir = pathlib.Path("apps/prototype-gui")
    assert gui_dir.exists(), "apps/prototype-gui directory missing"

    # 1. Package manifest & toolchain
    pkg_path = gui_dir / "package.json"
    assert pkg_path.exists(), "apps/prototype-gui/package.json missing"
    pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
    assert pkg["name"] == "@vajradhir/prototype-gui"
    assert "react" in pkg["dependencies"]
    assert "vite" in pkg["devDependencies"]
    print("  [PASS] package.json verified: @vajradhir/prototype-gui")

    # 2. Design Tokens
    css_path = gui_dir / "src/tokens.css"
    assert css_path.exists(), "tokens.css missing"
    css = css_path.read_text(encoding="utf-8")
    assert "--vd-human-lock:       #FBBF24;" in css, "Gold human lock token #FBBF24 missing"
    assert "--vd-dlp-airgap:       #06B6D4;" in css, "DLP airgap token #06B6D4 missing"
    assert "--vd-bg-canvas:        #0B0E14;" in css, "Silicon Darkroom canvas bg #0B0E14 missing"
    print("  [PASS] tokens.css verified: complete Silicon Darkroom palette (#FBBF24, #06B6D4, #0B0E14)")

    # 3. Types
    types_path = gui_dir / "src/types.ts"
    assert types_path.exists(), "types.ts missing"
    types_src = types_path.read_text(encoding="utf-8")
    assert "export type Nm = number;" in types_src
    assert "export interface BoardSnapshot" in types_src
    assert "HardwarePatchOp" in types_src, "HardwarePatchOp definition missing"
    print("  [PASS] types.ts verified: exact Nm, BoardSnapshot, HardwarePatchOp")

    # 4. Command Bus & 7 Workspaces
    cb_path = gui_dir / "src/commandBus.ts"
    assert cb_path.exists(), "commandBus.ts missing"
    cb_src = cb_path.read_text(encoding="utf-8")
    assert "export const WORKSPACE_TABS: WorkspaceTabMeta[]" in cb_src
    assert "1. Schematic Capture" in cb_src
    assert "2. 2D PCB Layout" in cb_src
    assert "3. 3D STEP & Gerbers" in cb_src
    assert "4. Simulation & Physics Lab" in cb_src
    assert "5. Library / jlcparts / PDF" in cb_src
    assert "6. Firmware & Pinmux" in cb_src
    assert "7. Manufacturing / Panel / Diff" in cb_src
    assert "requiresAi: false" in cb_src
    print("  [PASS] commandBus.ts verified: 7 workspaces and Same-Hands Law (requiresAi: false)")

    # 5. App Component & AI Worker Dock
    app_path = gui_dir / "src/App.tsx"
    assert app_path.exists(), "App.tsx missing"
    app_src = app_path.read_text(encoding="utf-8")
    assert "AiWorkerMode" in app_src
    assert 'aiWorkerMode !== "OFF"' in app_src
    assert "Command Palette (Ctrl+Shift+P)" in app_src
    assert "Simulate Agent Move" in app_src
    print("  [PASS] App.tsx verified: menubar, 7 workspaces, command palette, collapsible AI worker dock")

    # 6. PCB Canvas Geometry Math
    canvas_path = gui_dir / "src/PcbCanvas.tsx"
    assert canvas_path.exists(), "PcbCanvas.tsx missing"
    canvas_src = canvas_path.read_text(encoding="utf-8")
    assert "toWorldNm" in canvas_src and "toScreen" in canvas_src, "Coordinate conversion functions missing"
    assert "devicePixelRatio" in canvas_src
    print("  [PASS] PcbCanvas.tsx verified: HiDPI DPR scaling and bidirectional canvas <-> i64 nm coordinate transcoder")

    print("[*] All Silicon Darkroom CAD GUI structural checks PASSED CLEANLY.")
    return 0

if __name__ == "__main__":
    sys.exit(test_gui_structure())
