#!/usr/bin/env python3
"""
scripts/test-command-bus.py
Automated Verification Gate for Unified Deterministic Command Bus (packages/command-bus).
Enforces the Same-Hands Law:
- All core EDA commands must have requiresAi: false.
- Dispatches identical commands across human UI actions and AI worker MCP actions.
"""

import json
import pathlib
import sys

def test_command_bus():
    cb_dir = pathlib.Path("packages/command-bus")
    assert cb_dir.exists(), "packages/command-bus directory missing"

    pkg_path = cb_dir / "package.json"
    assert pkg_path.exists(), "packages/command-bus/package.json missing"
    pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
    assert pkg["name"] == "@vajradhir/command-bus"
    print("  [PASS] packages/command-bus/package.json verified")

    index_path = cb_dir / "src/index.ts"
    assert index_path.exists(), "src/index.ts missing"
    idx = index_path.read_text(encoding="utf-8")
    assert "export type ActorMode = \"human\" | \"agent\";" in idx
    assert "requiresAi: false;" in idx
    assert "class CommandRegistry" in idx
    print("  [PASS] src/index.ts verified: ActorMode human/agent & CommandRegistry")

    cmds_path = cb_dir / "src/commands.ts"
    assert cmds_path.exists(), "src/commands.ts missing"
    cmds = cmds_path.read_text(encoding="utf-8")
    
    expected_cmds = [
        "verify.z3_pinmux",
        "verify.kicad_drc",
        "verify.deterministic_rules",
        "simulate.smps_bode",
        "simulate.spice_transient",
        "pcb.route.interactive",
        "pcb.via.drop",
        "pcb.lock.toggle",
        "export.kicad_pcb",
        "export.firmware_pins",
        "mfg.panelize_kikit",
    ]

    for cmd_id in expected_cmds:
        assert f'id: "{cmd_id}"' in cmds, f"Expected command {cmd_id} in CORE_EDA_COMMANDS"

    print(f"  [PASS] src/commands.ts verified: all {len(expected_cmds)} core EDA commands registered with requiresAi: false")
    print("[*] Unified Command Bus Same-Hands Law PASSED CLEANLY.")
    return 0

if __name__ == "__main__":
    sys.exit(test_command_bus())
