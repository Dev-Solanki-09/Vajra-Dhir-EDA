import pathlib
import sqlite3
import sys

con = sqlite3.connect(":memory:")
for ddl in sorted(pathlib.Path("packages/hw-ir/schema").glob("*.sql")):
    con.executescript(ddl.read_text(encoding="utf-8"))

# Seed a human-locked component and prove an agent UPDATE fails closed
con.execute(
    "INSERT INTO projects VALUES ('p1','test','pcb','PRIVATE_CLOUD_OK','L3_GATE_COPILOT','G1_SPEC_LOCK','jlcpcb_4l_7628',20.0,0,50,'{}',1,'2026-11-23T00:00:00Z','2026-11-23T00:00:00Z')"
)
con.execute(
    "INSERT INTO boards VALUES ('b1','p1','main','rigid_pcb','[[0,0],[50000000,0],[50000000,50000000],[0,50000000]]',1600000,4,'human',0,NULL,1,0)"
)
con.execute(
    "INSERT INTO components(id,board_id,refdes,value_str,package_name,footprint_ref,symbol_ref,provenance,locked,lock_owner) VALUES ('c1','b1','U1','TPS54302','SOT-23-6','FP','SYM','human',1,'engineer')"
)
con.execute(
    "UPDATE _tx_actor_ctx SET actor_kind='agent', allow_lock_override=0 WHERE singleton=1"
)

try:
    con.execute("UPDATE components SET x_nm = 5000000 WHERE id = 'c1'")
    print("ERROR: Agent mutated human-locked component!")
    sys.exit(1)
except sqlite3.IntegrityError as e:
    assert "KERNEL_LOCK_VIOLATION" in str(e), str(e)
    print(f"PASS: Kernel lock trigger blocked agent mutation -> {e}")
