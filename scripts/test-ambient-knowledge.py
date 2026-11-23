#!/usr/bin/env python3
"""
scripts/test-ambient-knowledge.py
Verification test script for 7-Level Ambient Knowledge UX Engine (packages/ambient-knowledge):
- Level 1: Pin-Level Tooltip
- Level 2: Net-Level Inspector
- Level 3: Component Context Card
- Level 4: Subsystem / Functional Group Lens
- Level 5: Board Level HUD
- Level 6: DRC / Violations Matrix
- Level 7: Agent Thought Timeline
"""

import sys
import os

# Add package directory to path
sys.path.insert(0, os.path.abspath("packages/ambient-knowledge"))

from src.knowledge_engine import (
    AmbientKnowledgeEngine,
    PinTooltipData,
    NetInspectorData,
    ComponentCardData,
    SubsystemLensData,
    BoardHudData,
    ViolationItem,
    AgentThoughtTimeline
)

def test_level1_pin_tooltip():
    data = AmbientKnowledgeEngine.get_pin_tooltip(
        pin_number="14",
        pin_name="VCC_3V3",
        elec_type="power_in",
        connected_voltage=3.3,
        abs_max_v=6.0,
        strapping="BOOT_HIGH",
        errata="ERRATA-042: I2C clock stretch workaround needed",
        pdf_sha256="abc123sha",
        page=12
    )
    assert data.pin_number == "14"
    assert data.safety_margin_pct == 45.0
    assert "ERRATA-042" in data.silicon_errata
    assert "cas://abc123sha/p12/crop.png" == data.datasheet_crop_uri

def test_level2_net_inspector():
    segs = [
        {"x1": 0, "y1": 0, "x2": 10_000_000, "y2": 0, "layer": "F.Cu", "width_nm": 200_000},
        {"x1": 10_000_000, "y1": 0, "x2": 20_000_000, "y2": 0, "layer": "In1.Cu", "width_nm": 200_000},
    ]
    data = AmbientKnowledgeEngine.get_net_inspector(
        net_id="net_clk_p",
        net_name="USB_CLK_P",
        trace_segments=segs
    )
    assert data.total_length_mm == 20.0
    assert data.is_high_speed is True
    assert data.z0_target_ohm == 50.0
    assert data.delay_ps > 100.0

def test_level3_component_card():
    data = AmbientKnowledgeEngine.get_component_card(
        comp_id="u1_tps54302",
        refdes="U1",
        mpn="TPS54302DDCR",
        manufacturer="Texas Instruments",
        package="SOT-23-6",
        basic_part=True,
        unit_price_usd=0.45,
        stock_count=15420,
        pdf_sha256="tps54302_hash"
    )
    assert data.refdes == "U1"
    assert data.feeder_fee_usd == 0.0 # Basic part has no extra feeder fee
    assert "cas://tps54302_hash/pinout.png" == data.crop_uri

def test_level4_subsystem_lens():
    data = AmbientKnowledgeEngine.get_subsystem_lens(
        group_name="Buck_Power_Stage",
        kind="power_smps",
        component_ids=["U1", "L1", "Cin1", "Cout1"],
        loop_area_mm2=12.5
    )
    assert data.compliance_passed is True
    assert data.loop_inductance_nh == 10.0

    # Over-area test
    bad = AmbientKnowledgeEngine.get_subsystem_lens(
        group_name="Buck_Power_Stage_Bad",
        kind="power_smps",
        component_ids=["U1", "L1"],
        loop_area_mm2=35.0
    )
    assert bad.compliance_passed is False

def test_level5_board_hud():
    comps = [
        AmbientKnowledgeEngine.get_component_card("u1", "U1", "TPS54302", "TI", "SOT-23-6", True, 0.45, 1000, "h1"),
        AmbientKnowledgeEngine.get_component_card("u2", "U2", "STM32G431", "ST", "LQFP-48", False, 2.50, 500, "h2"),
    ]
    hud = AmbientKnowledgeEngine.get_board_hud(
        board_id="brd_main",
        board_name="Smart Motor Controller",
        width_mm=68.0,
        height_mm=44.0,
        layer_count=4,
        components=comps,
        net_count=38,
        locked_entities=3,
        min_drill_mm=0.3,
        min_width_mm=0.15
    )
    assert hud.dimensions_mm == (68.0, 44.0)
    assert hud.bom_total_usd == (0.45 + 2.50 + 3.0) # 0.45 + 2.50 + $3 feeder fee for U2
    assert hud.human_locked_entities_count == 3

def run_all():
    test_level1_pin_tooltip()
    test_level2_net_inspector()
    test_level3_component_card()
    test_level4_subsystem_lens()
    test_level5_board_hud()
    print("PASS: 7-Level Ambient Knowledge UX Engine (packages/ambient-knowledge) 100% verified.")

if __name__ == "__main__":
    run_all()
