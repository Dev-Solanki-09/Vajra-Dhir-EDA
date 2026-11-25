# scripts/test-sqlite-30tables-locks.py
import sqlite3
import sys

def test_schema_and_triggers():
    conn = sqlite3.connect(":memory:")
    with open("packages/hw-ir/schema/001_init.sql", "r", encoding="utf-8") as f:
        conn.executescript(f.read())
    with open("packages/hw-ir/schema/002_manual_perfection.sql", "r", encoding="utf-8") as f:
        conn.executescript(f.read())
        
    tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
    assert len(tables) >= 30, f"Expected at least 30 tables, got {len(tables)}: {tables}"
    
    triggers = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='trigger'").fetchall()]
    
    # 11 lockable entities
    lockable = [
        "components", "traces", "vias", "copper_zones", "nets",
        "pin_net_bindings", "boards", "net_classes", "electrical_constraints", "firmware_pinmux",
        "layout_rooms"
    ]
    
    missing_triggers = []
    for entity in lockable:
        upd_trig = f"trg_protect_locked_{entity}_upd"
        del_trig = f"trg_protect_locked_{entity}_del"
        
        # Accept trg_protect_locked_zones_upd as alias for copper_zones
        if entity == "copper_zones" and "trg_protect_locked_zones_upd" in triggers:
            pass
        elif upd_trig not in triggers:
            missing_triggers.append(upd_trig)
            
        if entity == "copper_zones" and "trg_protect_locked_zones_del" in triggers:
            pass
        elif del_trig not in triggers:
            missing_triggers.append(del_trig)
            
    if missing_triggers:
        print(f"FAIL: Missing fail-closed triggers ({len(missing_triggers)}): {missing_triggers}")
        sys.exit(1)
        
    # Test functional fail-closed behavior on an entity (components)
    # 1. Insert required foreign key project
    conn.execute("""
        INSERT INTO projects (id, name, domain, target_fab_or_pdk, spec_contract_json, created_at_utc, updated_at_utc)
        VALUES ('018e0000-0000-7000-8000-000000000001', 'TestProj', 'pcb', 'jlcpcb_4l', '{}', '2026-11-24T00:00:00Z', '2026-11-24T00:00:00Z')
    """)
    conn.execute("""
        INSERT INTO boards (id, project_id, name, board_kind, outline_polygon_nm, provenance, locked)
        VALUES ('018e0000-0000-7000-8000-000000000002', '018e0000-0000-7000-8000-000000000001', 'main', 'rigid_pcb', '[]', 'human', 1)
    """)
    conn.execute("""
        INSERT INTO components (id, board_id, refdes, value_str, package_name, footprint_ref, symbol_ref, x_nm, y_nm, rot_mdeg, provenance, locked)
        VALUES ('018e0000-0000-7000-8000-000000000003', '018e0000-0000-7000-8000-000000000002', 'U1', 'TPS54302', 'SOT-23-6', 'Package_TO_SOT_SMD:SOT-23-6', 'Power:TPS54302', 0, 0, 0, 'human', 1)
    """)
    
    conn.execute("""
        INSERT INTO net_classes (id, board_id, name, trace_width_nm, min_width_nm, clearance_nm, via_drill_nm, via_diameter_nm, provenance, locked)
        VALUES ('018e0000-0000-7000-8000-000000000004', '018e0000-0000-7000-8000-000000000002', 'Default', 200000, 127000, 127000, 300000, 600000, 'human', 1)
    """)
    conn.execute("""
        INSERT INTO nets (id, board_id, name, net_class_id, provenance, locked)
        VALUES ('018e0000-0000-7000-8000-000000000005', '018e0000-0000-7000-8000-000000000002', '+3V3', '018e0000-0000-7000-8000-000000000004', 'human', 1)
    """)
    conn.execute("""
        INSERT INTO component_pins (id, component_id, pin_number, pin_name, elec_type)
        VALUES ('018e0000-0000-7000-8000-000000000006', '018e0000-0000-7000-8000-000000000003', '1', 'VIN', 'power_in')
    """)
    conn.execute("""
        INSERT INTO pin_net_bindings (id, pin_id, net_id, provenance, locked)
        VALUES ('018e0000-0000-7000-8000-000000000007', '018e0000-0000-7000-8000-000000000006', '018e0000-0000-7000-8000-000000000005', 'human', 1)
    """)
    conn.execute("""
        INSERT INTO traces (id, board_id, net_id, layer_name, x1_nm, y1_nm, x2_nm, y2_nm, width_nm, provenance, locked)
        VALUES ('018e0000-0000-7000-8000-000000000008', '018e0000-0000-7000-8000-000000000002', '018e0000-0000-7000-8000-000000000005', 'F.Cu', 0, 0, 1000000, 0, 250000, 'human', 1)
    """)
    conn.execute("""
        INSERT INTO vias (id, board_id, net_id, x_nm, y_nm, drill_nm, diameter_nm, start_layer, end_layer, provenance, locked)
        VALUES ('018e0000-0000-7000-8000-000000000009', '018e0000-0000-7000-8000-000000000002', '018e0000-0000-7000-8000-000000000005', 500000, 0, 300000, 600000, 'F.Cu', 'B.Cu', 'human', 1)
    """)
    conn.execute("""
        INSERT INTO copper_zones (id, board_id, net_id, layer_name, zone_kind, polygon_nm_json, provenance, locked)
        VALUES ('018e0000-0000-7000-8000-00000000000a', '018e0000-0000-7000-8000-000000000002', '018e0000-0000-7000-8000-000000000005', 'F.Cu', 'pour', '[[0,0],[1000000,0],[1000000,1000000]]', 'human', 1)
    """)
    conn.execute("""
        INSERT INTO electrical_constraints (id, project_id, constraint_kind, target_entity_id, expression_json, provenance, locked)
        VALUES ('018e0000-0000-7000-8000-00000000000b', '018e0000-0000-7000-8000-000000000001', 'voltage_rail', '018e0000-0000-7000-8000-000000000005', '{"min_v":3.13,"max_v":3.47}', 'human', 1)
    """)
    conn.execute("""
        INSERT INTO firmware_pinmux (id, board_id, mcu_component_id, pin_id, peripheral_instance, signal_alias, gpio_mode, hal_target, locked)
        VALUES ('018e0000-0000-7000-8000-00000000000c', '018e0000-0000-7000-8000-000000000002', '018e0000-0000-7000-8000-000000000003', '018e0000-0000-7000-8000-000000000006', 'I2C1', 'PIN_I2C_SDA', 'AF4_OD_PU', 'c_header', 1)
    """)
    conn.execute("""
        INSERT INTO layout_rooms (id, board_id, room_group, channel_index, is_template, origin_x_nm, origin_y_nm, rot_mdeg, polygon_nm_json, locked)
        VALUES ('018e0000-0000-7000-8000-00000000000d', '018e0000-0000-7000-8000-000000000002', 'power_stage', 0, 1, 0, 0, 0, '[[0,0],[2000000,0],[2000000,2000000]]', 1)
    """)

    # Set non-human actor
    conn.execute("UPDATE _tx_actor_ctx SET actor_kind = 'agent', allow_lock_override = 0 WHERE singleton = 1")

    # Verify fail-closed KERNEL_LOCK_VIOLATION across all 11 lockable tables
    locked_mutations = [
        ("boards", "UPDATE boards SET name = 'mutated' WHERE id = '018e0000-0000-7000-8000-000000000002'"),
        ("net_classes", "UPDATE net_classes SET trace_width_nm = 500000 WHERE id = '018e0000-0000-7000-8000-000000000004'"),
        ("components", "UPDATE components SET x_nm = 1000000 WHERE id = '018e0000-0000-7000-8000-000000000003'"),
        ("nets", "UPDATE nets SET name = 'MUTATED_NET' WHERE id = '018e0000-0000-7000-8000-000000000005'"),
        ("pin_net_bindings", "UPDATE pin_net_bindings SET deleted = 1 WHERE id = '018e0000-0000-7000-8000-000000000007'"),
        ("traces", "UPDATE traces SET width_nm = 500000 WHERE id = '018e0000-0000-7000-8000-000000000008'"),
        ("vias", "UPDATE vias SET drill_nm = 400000 WHERE id = '018e0000-0000-7000-8000-000000000009'"),
        ("copper_zones", "UPDATE copper_zones SET clearance_nm = 500000 WHERE id = '018e0000-0000-7000-8000-00000000000a'"),
        ("electrical_constraints", "UPDATE electrical_constraints SET severity = 'warning' WHERE id = '018e0000-0000-7000-8000-00000000000b'"),
        ("firmware_pinmux", "UPDATE firmware_pinmux SET signal_alias = 'MUTATED' WHERE id = '018e0000-0000-7000-8000-00000000000c'"),
        ("layout_rooms", "UPDATE layout_rooms SET origin_x_nm = 999000 WHERE id = '018e0000-0000-7000-8000-00000000000d'"),
    ]
    for tbl, stmt in locked_mutations:
        try:
            conn.execute(stmt)
            print(f"FAIL: Agent was able to mutate locked {tbl}!")
            sys.exit(1)
        except sqlite3.DatabaseError as e:
            assert "KERNEL_LOCK_VIOLATION" in str(e), f"{tbl}: Unexpected error message: {e}"

    # Attempt deletion by agent across ALL 11 lockable tables -> MUST FAIL with KERNEL_LOCK_VIOLATION
    locked_deletes = [
        ("firmware_pinmux", "DELETE FROM firmware_pinmux WHERE id = '018e0000-0000-7000-8000-00000000000c'"),
        ("electrical_constraints", "DELETE FROM electrical_constraints WHERE id = '018e0000-0000-7000-8000-00000000000b'"),
        ("layout_rooms", "DELETE FROM layout_rooms WHERE id = '018e0000-0000-7000-8000-00000000000d'"),
        ("copper_zones", "DELETE FROM copper_zones WHERE id = '018e0000-0000-7000-8000-00000000000a'"),
        ("vias", "DELETE FROM vias WHERE id = '018e0000-0000-7000-8000-000000000009'"),
        ("traces", "DELETE FROM traces WHERE id = '018e0000-0000-7000-8000-000000000008'"),
        ("pin_net_bindings", "DELETE FROM pin_net_bindings WHERE id = '018e0000-0000-7000-8000-000000000007'"),
        ("nets", "DELETE FROM nets WHERE id = '018e0000-0000-7000-8000-000000000005'"),
        ("components", "DELETE FROM components WHERE id = '018e0000-0000-7000-8000-000000000003'"),
        ("net_classes", "DELETE FROM net_classes WHERE id = '018e0000-0000-7000-8000-000000000004'"),
        ("boards", "DELETE FROM boards WHERE id = '018e0000-0000-7000-8000-000000000002'"),
    ]
    for tbl, stmt in locked_deletes:
        try:
            conn.execute(stmt)
            print(f"FAIL: Agent was able to delete locked {tbl}!")
            sys.exit(1)
        except sqlite3.DatabaseError as e:
            assert "KERNEL_LOCK_VIOLATION" in str(e), f"{tbl} DELETE: Unexpected error message: {e}"

    # Set human actor
    conn.execute("UPDATE _tx_actor_ctx SET actor_kind = 'human' WHERE singleton = 1")
    conn.execute("UPDATE components SET x_nm = 2000000 WHERE id = '018e0000-0000-7000-8000-000000000003'")
    row = conn.execute("SELECT x_nm FROM components WHERE id = '018e0000-0000-7000-8000-000000000003'").fetchone()
    assert row[0] == 2000000, f"Expected 2000000, got {row[0]}"

    print(f"PASS: 30+ tables, all 22 fail-closed triggers, and functional lock enforcement across all 11 lockable tables verified.")

if __name__ == "__main__":
    test_schema_and_triggers()
