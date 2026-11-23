"""
packages/ambient-knowledge/src/knowledge_engine.py
Vajra-Dhīr EDA — 7-Level Ambient Knowledge UX Engine:
Implements ambient query and analysis lenses:
- Level 1: Pin-Level Tooltip (voltage envelope, strapping pins, silicon errata, 300-dpi local crop citation)
- Level 2: Net-Level Inspector (impedance Z0, length, propagation delay t_prop, IPC-2152 current capacity)
- Level 3: Component Context Card (datasheet crop cas://, stock, pricing, JLCPCB Basic vs Extended fee)
- Level 4: Subsystem / Functional Group Lens (power loop di/dt area, RF matching, decoupling loop)
- Level 5: Board Level HUD (BOM total, thermals, layer stackup, fab surcharge alert)
- Level 6: DRC / Violations Matrix (9-gate status, interactive jump coordinates)
- Level 7: Agent Thought Stream (CoT audit history, Lamport timeline, human lock diff preview)
"""

import math
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

SPEED_OF_LIGHT_MM_PER_PS = 0.299792458

class PinTooltipData(BaseModel):
    pin_number: str
    pin_name: str
    elec_type: str
    abs_max_voltage: str
    operating_voltage: str
    safety_margin_pct: float
    strapping_function: Optional[str] = None
    silicon_errata: Optional[str] = None
    datasheet_crop_uri: str

class NetInspectorData(BaseModel):
    net_id: str
    net_name: str
    is_power: bool
    is_high_speed: bool
    z0_target_ohm: Optional[float]
    total_length_mm: float
    delay_ps: float
    dc_resistance_mohm: float
    max_current_capacity_a: float
    layer_breakdown_mm: Dict[str, float]

class ComponentCardData(BaseModel):
    component_id: str
    refdes: str
    mpn: str
    manufacturer: str
    package: str
    basic_part: bool
    feeder_fee_usd: float
    unit_price_usd: float
    stock_count: int
    datasheet_sha256: str
    crop_uri: str

class SubsystemLensData(BaseModel):
    group_name: str
    subsystem_kind: str
    component_ids: List[str]
    loop_area_mm2: Optional[float]
    loop_inductance_nh: Optional[float]
    compliance_passed: bool
    notes: str

class BoardHudData(BaseModel):
    board_id: str
    board_name: str
    dimensions_mm: tuple[float, float]
    layer_count: int
    component_count: int
    net_count: int
    bom_total_usd: float
    fab_surcharge_alerts: List[str]
    human_locked_entities_count: int

class ViolationItem(BaseModel):
    violation_id: str
    gate_id: str
    rule_code: str
    severity: str
    entity_ids: List[str]
    x_nm: int
    y_nm: int
    layer: str
    message: str

class AgentThoughtTimeline(BaseModel):
    session_id: str
    current_lamport: int
    active_gate: str
    recent_thoughts: List[str]
    last_dual_checkpoint: Dict[str, Any]

class AmbientKnowledgeEngine:
    @staticmethod
    def get_pin_tooltip(
        pin_number: str,
        pin_name: str,
        elec_type: str,
        connected_voltage: float,
        abs_max_v: float,
        strapping: Optional[str] = None,
        errata: Optional[str] = None,
        pdf_sha256: str = "default_sha256",
        page: int = 1
    ) -> PinTooltipData:
        margin = max(0.0, (abs_max_v - connected_voltage) / abs_max_v * 100.0) if abs_max_v > 0 else 0.0
        return PinTooltipData(
            pin_number=pin_number,
            pin_name=pin_name,
            elec_type=elec_type,
            abs_max_voltage=f"-0.3V to +{abs_max_v:.1f}V",
            operating_voltage=f"{connected_voltage:.2f}V",
            safety_margin_pct=round(margin, 1),
            strapping_function=strapping,
            silicon_errata=errata,
            datasheet_crop_uri=f"cas://{pdf_sha256}/p{page}/crop.png"
        )

    @staticmethod
    def get_net_inspector(
        net_id: str,
        net_name: str,
        trace_segments: List[Dict[str, Any]],
        copper_thickness_oz: float = 1.0,
        temp_rise_c: float = 10.0,
        er_eff: float = 3.8
    ) -> NetInspectorData:
        total_len_nm = 0
        layer_dist = {}
        total_r_mohm = 0.0

        for seg in trace_segments:
            dx = seg["x2"] - seg["x1"]
            dy = seg["y2"] - seg["y1"]
            seg_len_nm = int(math.hypot(dx, dy))
            total_len_nm += seg_len_nm
            layer = seg.get("layer", "F.Cu")
            layer_dist[layer] = layer_dist.get(layer, 0.0) + (seg_len_nm / 1_000_000.0)

            # Resistance: R = rho * L / A
            width_mm = seg.get("width_nm", 200_000) / 1_000_000.0
            thick_mm = copper_thickness_oz * 0.035
            area_mm2 = width_mm * thick_mm
            seg_len_mm = seg_len_nm / 1_000_000.0
            # Copper rho = 1.68e-5 ohm*mm
            r_seg = (1.68e-5 * seg_len_mm / area_mm2) * 1000.0
            total_r_mohm += r_seg

        total_mm = total_len_nm / 1_000_000.0
        delay_ps = (total_mm * math.sqrt(er_eff)) / SPEED_OF_LIGHT_MM_PER_PS

        # IPC-2152 current capacity estimate: I = k * (dT)^0.44 * A^0.725
        avg_w_mm = 0.20
        area_mils2 = (avg_w_mm / 0.0254) * (copper_thickness_oz * 1.37)
        max_i_a = 0.048 * (temp_rise_c ** 0.44) * (area_mils2 ** 0.725)

        is_pwr = "VCC" in net_name or "GND" in net_name or "3V3" in net_name or "12V" in net_name
        is_hs = "CLK" in net_name or "D_P" in net_name or "D_N" in net_name or "TX" in net_name or "RX" in net_name
        z0 = 50.0 if is_hs else None

        return NetInspectorData(
            net_id=net_id,
            net_name=net_name,
            is_power=is_pwr,
            is_high_speed=is_hs,
            z0_target_ohm=z0,
            total_length_mm=round(total_mm, 3),
            delay_ps=round(delay_ps, 2),
            dc_resistance_mohm=round(total_r_mohm, 2),
            max_current_capacity_a=round(max_i_a, 2),
            layer_breakdown_mm=layer_dist
        )

    @staticmethod
    def get_component_card(
        comp_id: str,
        refdes: str,
        mpn: str,
        manufacturer: str,
        package: str,
        basic_part: bool,
        unit_price_usd: float,
        stock_count: int,
        pdf_sha256: str
    ) -> ComponentCardData:
        fee = 0.0 if basic_part else 3.0
        return ComponentCardData(
            component_id=comp_id,
            refdes=refdes,
            mpn=mpn,
            manufacturer=manufacturer,
            package=package,
            basic_part=basic_part,
            feeder_fee_usd=fee,
            unit_price_usd=unit_price_usd,
            stock_count=stock_count,
            datasheet_sha256=pdf_sha256,
            crop_uri=f"cas://{pdf_sha256}/pinout.png"
        )

    @staticmethod
    def get_subsystem_lens(
        group_name: str,
        kind: str,
        component_ids: List[str],
        loop_area_mm2: Optional[float] = None
    ) -> SubsystemLensData:
        inductance_nh = None
        passed = True
        notes = "Nominal operating envelope."
        if loop_area_mm2 is not None:
            # Approximate loop inductance: ~1 nH per mm^2 for tight planar loop
            inductance_nh = loop_area_mm2 * 0.8
            if loop_area_mm2 > 25.0:
                passed = False
                notes = "High di/dt power loop exceeds recommended 25mm^2 area; risk of radiated EMI."
            else:
                notes = "High di/dt power loop tightly contained (<25mm^2)."

        return SubsystemLensData(
            group_name=group_name,
            subsystem_kind=kind,
            component_ids=component_ids,
            loop_area_mm2=loop_area_mm2,
            loop_inductance_nh=round(inductance_nh, 2) if inductance_nh is not None else None,
            compliance_passed=passed,
            notes=notes
        )

    @staticmethod
    def get_board_hud(
        board_id: str,
        board_name: str,
        width_mm: float,
        height_mm: float,
        layer_count: int,
        components: List[ComponentCardData],
        net_count: int,
        locked_entities: int,
        min_drill_mm: float = 0.3,
        min_width_mm: float = 0.2
    ) -> BoardHudData:
        total_bom = sum(c.unit_price_usd for c in components)
        total_feeder = sum(c.feeder_fee_usd for c in components)
        alerts = []
        if min_drill_mm < 0.20:
            alerts.append("Drill <0.20mm triggers HDI surcharge (+$48)")
        if min_width_mm < 0.10:
            alerts.append("Trace <0.10mm (4 mil) exceeds standard fab tier (+$22)")
        if total_feeder > 9.0:
            alerts.append(f"Extended part feeder fees total ${total_feeder:.2f}; consider consolidating passives")

        return BoardHudData(
            board_id=board_id,
            board_name=board_name,
            dimensions_mm=(width_mm, height_mm),
            layer_count=layer_count,
            component_count=len(components),
            net_count=net_count,
            bom_total_usd=round(total_bom + total_feeder, 2),
            fab_surcharge_alerts=alerts,
            human_locked_entities_count=locked_entities
        )
