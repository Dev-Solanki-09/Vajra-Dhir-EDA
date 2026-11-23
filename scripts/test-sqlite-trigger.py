import json
import pathlib
import re
import sqlite3
import sys

print("[*] Running SQLite Kernel Lock & 3-Board Verification...")

con = sqlite3.connect(":memory:")
for ddl in sorted(pathlib.Path("packages/hw-ir/schema").glob("*.sql")):
    con.executescript(ddl.read_text(encoding="utf-8"))

# Seed base project
con.execute(
    "INSERT INTO projects VALUES ('p1','test','pcb','PRIVATE_CLOUD_OK','L3_GATE_COPILOT','G1_SPEC_LOCK','jlcpcb_4l_7628',20.0,0,50,'{}',1,'2026-11-23T00:00:00Z','2026-11-23T00:00:00Z')"
)

# 1. Base test: synthetic component
con.execute(
    "INSERT INTO boards VALUES ('b1','p1','main','rigid_pcb','[[0,0],[50000000,0],[50000000,50000000],[0,50000000]]',1600000,4,'human',0,NULL,1,0)"
)
con.execute(
    "INSERT INTO components(id,board_id,refdes,value_str,package_name,footprint_ref,symbol_ref,provenance,locked,lock_owner) VALUES ('c1','b1','U1','TPS54302','SOT-23-6','FP','SYM','human',1,'engineer')"
)

con.execute("UPDATE _tx_actor_ctx SET actor_kind='agent', allow_lock_override=0 WHERE singleton=1")

try:
    con.execute("UPDATE components SET x_nm = 5000000 WHERE id = 'c1'")
    print("ERROR: Agent mutated human-locked component!")
    sys.exit(1)
except sqlite3.IntegrityError as e:
    assert "KERNEL_LOCK_VIOLATION" in str(e), str(e)
    print(f"  [PASS] Base synthetic trigger check blocked agent mutation -> {e}")

# 2. Test Board 3 real hardware lines and human lock enforcement
board3_path = pathlib.Path("designs/board-3-stm32g4-motor/board.vd-ir.jsonl")
assert board3_path.exists(), "designs/board-3-stm32g4-motor/board.vd-ir.jsonl missing"

con.execute(
    "INSERT INTO boards VALUES ('018f6c33-7b40-7003-a000-000000000001','p1','VD-BRD-003','rigid_pcb','[[0,0],[60000000,0],[60000000,40000000],[0,40000000]]',1600000,4,'human',0,NULL,1,0)"
)

# Insert Board 3 components into SQLite
with open(board3_path, "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        obj = json.loads(line)
        if obj["type"] == "Component":
            d = obj["data"]
            prov = d.get("provenance", "cubo").lower()
            if prov == "manual":
                prov = "human"
            con.execute(
                """
                INSERT INTO components(id, board_id, refdes, value_str, package_name, footprint_ref, symbol_ref, x_nm, y_nm, rot_mdeg, side, provenance, locked)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    d["id"],
                    d["board_id"],
                    d["refdes"],
                    d["value_str"],
                    d["package_name"],
                    d["footprint_ref"],
                    "SYM_" + d["refdes"],
                    d["x_nm"],
                    d["y_nm"],
                    d["rot_mdeg"],
                    d["side"],
                    prov,
                    1 if d.get("locked", False) else 0,
                ),
            )

# Verify Agent CANNOT mutate locked DRV8833 (U3) on Board 3
con.execute("UPDATE _tx_actor_ctx SET actor_kind='agent', allow_lock_override=0 WHERE singleton=1")
try:
    con.execute("UPDATE components SET x_nm = 45000000 WHERE refdes = 'U3'")
    print("ERROR: Agent mutated Board 3 locked DRV8833 (U3)!")
    sys.exit(1)
except sqlite3.IntegrityError as e:
    assert "KERNEL_LOCK_VIOLATION" in str(e), str(e)
    print(f"  [PASS] Board 3 DRV8833 (U3, locked=1) mutation blocked: {e}")

# Verify Agent CAN mutate unlocked STM32G4 (U1 on Board 3)
con.execute("UPDATE components SET x_nm = 25500000 WHERE board_id = '018f6c33-7b40-7003-a000-000000000001' AND refdes = 'U1'")
row = con.execute("SELECT x_nm FROM components WHERE board_id = '018f6c33-7b40-7003-a000-000000000001' AND refdes = 'U1'").fetchone()
assert row[0] == 25500000, "Failed to update unlocked U1"
print("  [PASS] Board 3 STM32G4 (U1, locked=0) successfully mutated by agent.")

# Verify Human Actor CAN mutate locked DRV8833 (U3) when authorized
con.execute("UPDATE _tx_actor_ctx SET actor_kind='human', allow_lock_override=1 WHERE singleton=1")
con.execute("UPDATE components SET x_nm = 42500000 WHERE board_id = '018f6c33-7b40-7003-a000-000000000001' AND refdes = 'U3'")
row = con.execute("SELECT x_nm FROM components WHERE board_id = '018f6c33-7b40-7003-a000-000000000001' AND refdes = 'U3'").fetchone()
assert row[0] == 42500000, "Human failed to update locked U3"
print("  [PASS] Board 3 DRV8833 (U3) successfully mutated by authorized human actor.")

# 3. Verify All 3 Boards for Invariant Rules
uuid_v7_regex = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
for board_dir in [
    "designs/board-1-buck-pd",
    "designs/board-2-esp32s3-node",
    "designs/board-3-stm32g4-motor",
]:
    jsonl_file = pathlib.Path(board_dir) / "board.vd-ir.jsonl"
    assert jsonl_file.exists(), f"Missing {jsonl_file}"
    entity_count = 0
    with open(jsonl_file, "r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            entity_count += 1
            d = obj["data"]
            # Check ID is UUIDv7
            assert uuid_v7_regex.match(d["id"]), f"Invalid UUIDv7 at {jsonl_file}:{line_num}: {d['id']}"
            # Check integer geometry (no floats)
            for k, v in d.items():
                if k.endswith("_nm") or k.endswith("_mdeg"):
                    if isinstance(v, list):
                        for pt in v:
                            assert all(isinstance(coord, int) for coord in pt), (
                                f"Float in polygon at {jsonl_file}:{line_num}: {pt}"
                            )
                    else:
                        assert isinstance(v, int), f"Float in {k} at {jsonl_file}:{line_num}: {v}"
    print(f"  [PASS] {board_dir}: {entity_count} entities verified (100% i64 nm & UUIDv7).")

print("[*] All Human Lock & Board Invariant Checks PASSED CLEANLY.")
