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
    
    # 10 lockable entities
    lockable = [
        "components", "traces", "vias", "copper_zones", "nets",
        "pin_net_bindings", "boards", "net_classes", "electrical_constraints", "firmware_pinmux"
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
    
    # Set non-human actor
    conn.execute("UPDATE _tx_actor_ctx SET actor_kind = 'agent', allow_lock_override = 0 WHERE singleton = 1")
    
    # Attempt mutation by agent on locked component -> MUST FAIL
    try:
        conn.execute("UPDATE components SET x_nm = 1000000 WHERE id = '018e0000-0000-7000-8000-000000000003'")
        print("FAIL: Agent was able to mutate locked component!")
        sys.exit(1)
    except sqlite3.DatabaseError as e:
        assert "KERNEL_LOCK_VIOLATION" in str(e), f"Unexpected error message: {e}"
        
    # Attempt deletion by agent on locked component -> MUST FAIL
    try:
        conn.execute("DELETE FROM components WHERE id = '018e0000-0000-7000-8000-000000000003'")
        print("FAIL: Agent was able to delete locked component!")
        sys.exit(1)
    except sqlite3.DatabaseError as e:
        assert "KERNEL_LOCK_VIOLATION" in str(e), f"Unexpected error message: {e}"
        
    # Attempt mutation on locked board by agent -> MUST FAIL
    try:
        conn.execute("UPDATE boards SET name = 'mutated' WHERE id = '018e0000-0000-7000-8000-000000000002'")
        print("FAIL: Agent was able to mutate locked board!")
        sys.exit(1)
    except sqlite3.DatabaseError as e:
        assert "KERNEL_LOCK_VIOLATION" in str(e), f"Unexpected error message: {e}"
        
    # Set human actor
    conn.execute("UPDATE _tx_actor_ctx SET actor_kind = 'human' WHERE singleton = 1")
    conn.execute("UPDATE components SET x_nm = 2000000 WHERE id = '018e0000-0000-7000-8000-000000000003'")
    row = conn.execute("SELECT x_nm FROM components WHERE id = '018e0000-0000-7000-8000-000000000003'").fetchone()
    assert row[0] == 2000000, f"Expected 2000000, got {row[0]}"
    
    print(f"PASS: 30 tables, all 20 fail-closed triggers, and functional lock enforcement verified.")

if __name__ == "__main__":
    test_schema_and_triggers()
