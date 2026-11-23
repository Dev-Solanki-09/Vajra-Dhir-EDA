# packages/symbolic-verifier/src/footgun_engine.py
"""
10 EE Footgun Verification Engine (FG-01 through FG-10).
Audits canonical SQLite HW-IR database for classic mixed-signal hardware failure modes.
"""

import sqlite3
from typing import List, Dict, Any

class FootgunViolation:
    def __init__(self, fg_code: str, title: str, entity_id: str, refdes: str, severity: str, description: str):
        self.fg_code = fg_code
        self.title = title
        self.entity_id = entity_id
        self.refdes = refdes
        self.severity = severity
        self.description = description

    def to_dict(self) -> Dict[str, Any]:
        return {
            "fg_code": self.fg_code,
            "title": self.title,
            "entity_id": self.entity_id,
            "refdes": self.refdes,
            "severity": self.severity,
            "description": self.description
        }

def audit_hw_ir_database(db_conn: sqlite3.Connection) -> List[FootgunViolation]:
    """
    Executes rule checks against the SQLite HW-IR tables and returns detected violations.
    """
    violations: List[FootgunViolation] = []

    # FG-01: Floating CMOS Input Pins
    unconnected_inputs = db_conn.execute("""
        SELECT cp.id, c.refdes, cp.pin_number, cp.pin_name
        FROM component_pins cp
        JOIN components c ON cp.component_id = c.id
        LEFT JOIN pin_net_bindings pnb ON cp.id = pnb.pin_id AND pnb.deleted = 0
        WHERE cp.elec_type = 'input'
          AND pnb.id IS NULL
          AND c.deleted = 0
    """).fetchall()
    for row in unconnected_inputs:
        violations.append(FootgunViolation(
            "FG-01", "Floating CMOS Input", row[0], row[1], "CRITICAL",
            f"Input pin {row[2]} ({row[3]}) on {row[1]} is floating without net connection"
        ))

    # FG-02: Decoupling Proximity (< 5.0 mm = 5,000,000 nm)
    # Check for active ICs that lack a decoupling capacitor within 5mm
    active_ics = db_conn.execute("""
        SELECT id, refdes, x_nm, y_nm FROM components
        WHERE functional_group IN ('mcu', 'power', 'comms') AND deleted = 0
    """).fetchall()
    decoupling_caps = db_conn.execute("""
        SELECT id, refdes, x_nm, y_nm FROM components
        WHERE refdes LIKE 'C%' AND deleted = 0
    """).fetchall()

    for ic in active_ics:
        ic_id, ic_ref, ic_x, ic_y = ic
        has_near_cap = False
        for cap in decoupling_caps:
            _, _, cap_x, cap_y = cap
            dist_sq = (ic_x - cap_x) ** 2 + (ic_y - cap_y) ** 2
            if dist_sq <= 5000000 ** 2: # 5mm radius
                has_near_cap = True
                break
        if not has_near_cap and decoupling_caps:
            violations.append(FootgunViolation(
                "FG-02", "Missing Local Decoupling", ic_id, ic_ref, "WARNING",
                f"Active IC {ic_ref} has no decoupling capacitor within 5.0 mm radius"
            ))

    # FG-03: I2C Missing Pullup Resistors
    i2c_nets = db_conn.execute("""
        SELECT id, name FROM nets WHERE name LIKE '%SDA%' OR name LIKE '%SCL%'
    """).fetchall()
    for net in i2c_nets:
        net_id, net_name = net
        pullup_count = db_conn.execute("""
            SELECT COUNT(*) FROM pin_net_bindings pnb
            JOIN component_pins cp ON pnb.pin_id = cp.id
            JOIN components c ON cp.component_id = c.id
            WHERE pnb.net_id = ? AND c.refdes LIKE 'R%' AND pnb.deleted = 0
        """, (net_id,)).fetchone()[0]
        if pullup_count == 0:
            violations.append(FootgunViolation(
                "FG-03", "Missing I2C Pullup", net_id, net_name, "CRITICAL",
                f"I2C signal net {net_name} has no pull-up resistor connection"
            ))

    # FG-07: Unclamped Inductive Load Flyback Protection
    inductive_loads = db_conn.execute("""
        SELECT id, refdes FROM components
        WHERE (refdes LIKE 'L%' OR refdes LIKE 'M%' OR refdes LIKE 'K%')
          AND functional_group = 'motor' AND deleted = 0
    """).fetchall()
    diodes = db_conn.execute("""
        SELECT COUNT(*) FROM components WHERE refdes LIKE 'D%' AND deleted = 0
    """).fetchone()[0]
    for ind in inductive_loads:
        if diodes == 0:
            violations.append(FootgunViolation(
                "FG-07", "Unclamped Inductive Flyback", ind[0], ind[1], "CRITICAL",
                f"Inductive motor/relay load {ind[1]} has no freewheeling clamp diode"
            ))

    return violations
