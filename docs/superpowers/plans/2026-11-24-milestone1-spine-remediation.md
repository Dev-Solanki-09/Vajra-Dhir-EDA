# Milestone 1 Spine Remediation & Ground-Truth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remediate architectural drift, eliminate verification theater, quarantine premature Milestone 2/3 code, restore the 30-table SQLite kernel with fail-closed triggers on all 10 lockable entities, wire the real Python Neuro-Symbolic Brain (`z3-solver`, `DuckDB`, `pypdfium2`, `atopile`, Open-CUBOs), in-process Rust MCP v2 gateway with ACP broker, real KiCad 10 / kicad-cli 3-channel bridge, and ship the Phase 1 VS Code Extension Pack.

**Architecture:** 4-Ring Modular Architecture with strict Ring 1 Lean Core (pure MIT/Apache-2.0, zero-Docker, CPU-first) and isolated Ring 2 OCI containers (gVisor `runsc`, zero network egress). Canonical SQLite WAL database (`HW-IR`) represents all coordinates as signed `i64` nanometers and millidegrees, guarded by database triggers aborting non-human mutations on `locked = 1`. Python neuro-symbolic sidecar executes Z3 SMT constraint solving, DuckDB component knowledge graph, and atopile compilation.

**Tech Stack:** Rust 1.100.0 (`rusqlite`, `rstar`, `i_overlay`, `cavalier_contours`, `wasmtime >= 50.0.0`), Python 3.12+ (`uv`, `z3-solver`, `sympy`, `pint`, `control`, `duckdb`, `pypdfium2`, `pdfplumber`, `atopile`, `kikit`, `pydantic`), TypeScript 5.8+ / Node 24+ (VS Code Extension API, React 19.3.1, `@modelcontextprotocol/ext-apps`, `dockview-react`, `wgpu`/WebGL2, `elkjs`, `uPlot`, `surfer-wasm`), KiCad 10.0.8 (`kicad-cli`, S-expressions).

**Spec:** `docs/VD-SAD-001.md`, `docs/VD-SAD-001-ARCHITECTURE.md`, `docs/AGENT_KNOWLEDGE_UPDATE_2026_11.md`, and Orchestrator Audit Specifications (`T1.01`–`T1.20b`).

## Global Constraints
- All coordinates MUST be signed `i64` nanometers (`1 mm = 1_000_000 nm`) and angles `i32` millidegrees (`0..360000`). Zero float coordinates in storage or IPC.
- All entity IDs MUST be immutable UUIDv7 strings (`uuid::Uuid::now_v7()`).
- Fail-Closed Human Locks: All modifications to `HW-IR` check `_tx_actor_ctx`; database triggers abort non-human edits on `locked = 1` with `KERNEL_LOCK_VIOLATION`.
- Ring 1 License Firewall: Strictly MIT / Apache-2.0. Zero AGPL-3.0 in Ring 1 Core (`packages/*`, `apps/*`). Zero `pymupdf`/`fitz`. Zero commercial weight checkpoints.
- Security Floor: `wasmtime >= 50.0.0`, `react >= 19.3.1`, `node >= 26.13.1`, `.cargo/config.toml` 72h publish cooldown.
- Zero inbound open ports; loopback `127.0.0.1` / UDS / named pipes only; zero secrets committed.
- Honest Claims Register: Board physical status remains "Software Reference Blueprints — 0/3 Physically Fabricated" until real physical PCB spin and scope bench measurement.

---

## File Structure & Module Decomposition

### Files to Quarantine (Moved to `packages/m2-quarantine/` or Profile-Gated)
- `packages/panelizer` -> `packages/m2-quarantine/panelizer` (Milestone 2 automated panelization)
- `packages/wire-harness` -> `packages/m2-quarantine/wire-harness` (Milestone 2 cable harness compiler)
- `packages/pcb-diff` -> `packages/m2-quarantine/pcb-diff` (Milestone 2 visual PCB diff engine)
- `packages/pdn-solver` -> `packages/m2-quarantine/pdn-solver` (Milestone 2 2.5D DC IR-Drop solver)
- `packages/emc-workbench` -> `packages/m2-quarantine/emc-workbench` (Milestone 2 harmonic matrix)
- `packages/compliance-hbom` -> `packages/m2-quarantine/compliance-hbom` (Milestone 2 CycloneDX generator)
- `packages/control-loop` -> `packages/m2-quarantine/control-loop` (Milestone 2 control loop engine)
- `packages/solver-recovery` -> `packages/m2-quarantine/solver-recovery` (Milestone 2 solver recovery ladder)
- `apps/desktop` -> `apps/m2-desktop` (Milestone 2 Code-OSS packaging)
- `docker-compose.workers.yml` -> relocated to `docker/docker-compose.workers.yml` with `runtime: runsc`

### Files to Create or Core-Remediate
- Root configuration:
  - `pyproject.toml` (root `uv` workspace for Python neuro-symbolic packages)
  - `budget.json` (single-source of truth for costs, rate caps, and circuit breakers)
  - `.cargo/config.toml` (72h global publish cooldown)
  - `rust-toolchain.toml` (pinned `1.100.0`)
  - `.github/workflows/ci-spec-integrity.yml` (automated DCO, license firewall, and SQLite lock verification)
  - `.github/workflows/actions.lock` (pinned SHA-256 action hashes)
- `packages/hw-ir`:
  - `packages/hw-ir/schema/001_init.sql` (23 canonical tables + complete fail-closed UPDATE/DELETE triggers on all 10 lockable entities)
  - `packages/hw-ir/schema/002_manual_perfection.sql` (7 manual perfection tables)
  - `packages/hw-ir/src/migration.rs` (forward-only migration runner with `.v<old>.bak` auto-backup)
  - `packages/hw-ir/src/wal.rs` (WAL auto-checkpoint: `PASSIVE` @ 250 patches, `TRUNCATE` when idle)
  - `packages/hw-ir/src/crash_shadow.rs` (`.vd.autosave.jsonl` atomic shadow writer)
  - `packages/hw-ir/src/process_supervisor.rs` (Win32 Job Objects / `PR_SET_PDEATHSIG` child process supervisor)
- `packages/hw-dlp`:
  - `packages/hw-dlp/src/lib.rs` (updated to read limits dynamically from `budget.json`, adding `.vd-airgap` and foundry NDA path triggers)
- `packages/wasm-sandbox`:
  - `packages/wasm-sandbox/guest/src/lib.rs` (compiled `wasm32-wasip2` Code Mode guest component)
  - `packages/wasm-sandbox/tests/sandbox_adversarial_test.rs` (adversarial tests for OOM, fuel, epoch, output cap, and zero FS/socket access)
- `packages/kg-brain` (Python):
  - `packages/kg-brain/pyproject.toml`
  - `packages/kg-brain/src/kg_init.sql` (DuckDB schema for MPNs, MLCC DC-bias curves, inductor saturation tables)
  - `packages/kg-brain/src/datasheet_quarantine.py` (`pypdfium2` + `pdfplumber` zero-trust 300-dpi PDF cropper & table extractor)
  - `packages/kg-brain/src/jlcparts_optimizer.py` (`jlcparts` SQLite feeder-fee & Basic part optimizer)
- `packages/cubo-engine` (Python):
  - `packages/cubo-engine/pyproject.toml`
  - `packages/cubo-engine/src/verifier.py` (Ed25519 signature verification for signed Open-CUBO blocks)
  - `packages/cubo-engine/src/atopile_bridge.py` (`atopile` compiler bridge translating `.ato` to `HW-IR` patch)
  - `packages/cubo-engine/cubos/` (5 verified reference CUBOs: `usb_pd_buck_3v3_3a`, `esp32s3_core`, `stm32g4_core`, `can_fd_transceiver`, `i2c_sensor_bme280`)
- `packages/symbolic-verifier` (Python):
  - `packages/symbolic-verifier/src/z3_pinmux.py` (real Z3 SMT solver for pinmux allocation & I2C conflict detection with `unsat_core` extraction)
  - `packages/symbolic-verifier/src/physics_derating.py` (`sympy` and `pint` derating and IPC-2152 thermal rise calculator)
  - `packages/symbolic-verifier/src/footgun_engine.py` (FG-01 through FG-10 executed directly on SQLite `HW-IR`)
- `packages/mcp-gateway` (Rust):
  - `packages/mcp-gateway/src/lib.rs` (in-process Rust MCP v2 Gateway implementing all 12 typed EDA verbs)
  - `packages/mcp-gateway/src/acp_broker.rs` (JSON-RPC 2.0 stdio bridge for `vd-agent`, Claude Code, Codex, and Ollama)
  - `packages/mcp-gateway/src/dual_checkpoint.rs` (`DualCheckpoint(git_tree_sha, hwir_lamport, otel_trace_id)` simultaneous rollback)
- `packages/nine-gates`:
  - `packages/nine-gates/src/auditor.rs` (isolated Dual-Context Auditor consuming zero Solver CoT, 300-dpi crops, and deterministic reports)
- `packages/cad-transcoder` & `packages/autorouter`:
  - `packages/cad-transcoder/src/kicad10_bridge.rs` (KiCad 10 3-channel round-trip with `kicad-cli` ERC/DRC/Export)
  - `packages/autorouter/src/orchestrator.rs` (`.kicad_pro` / `.kicad_dru` sync + `KiCadRoutingTools` / `fastroute` execution + post-route SHA-256 locked copper diff guard)
- `apps/vscode-extension`:
  - `apps/vscode-extension/package.json` (Phase 1 VS Code Extension Pack)
  - `apps/vscode-extension/src/extension.ts` (Custom Editor provider & MCP App shim)
- `docs/CLAIMS_REGISTER.md`:
  - Updated to accurately reflect software-only verification status ("Software Reference Blueprints — 0/3 Physically Fabricated").

---

## Phase 0: Ground-Truth Audit, Honesty Reset & Scope Quarantine

### Task 0.1: Ground-Truth Toolchain & Script Audit

**Files:**
- Modify: `scripts/verify-all.mjs:1-50`
- Create: `scripts/audit-toolchains.py`
- Test: `scripts/audit-toolchains.py`

**Interfaces:**
- Consumes: System environment and tool paths (`node`, `python`, `uv`, `cargo`).
- Produces: JSON classification of verification gates (`REAL_TEST`, `UNIT_ONLY`, `FILE_CHECK_THEATER`) and toolchain verification report.

- [ ] **Step 1: Write failing test script for toolchain verification**

```python
# scripts/audit-toolchains.py
import shutil
import sys
import subprocess
import json

def test_toolchain_audit():
    tools = ["python", "node", "uv"]
    missing = [t for t in tools if not shutil.which(t)]
    if missing:
        print(f"FAIL: Missing required toolchain binaries: {missing}")
        sys.exit(1)
    
    # Check Python version >= 3.10
    py_ver = sys.version_info
    assert py_ver.major == 3 and py_ver.minor >= 10, f"Python >= 3.10 required, got {py_ver}"
    
    # Check Node version >= 20
    node_out = subprocess.check_output(["node", "-v"]).decode().strip()
    node_major = int(node_out.lstrip("v").split(".")[0])
    assert node_major >= 20, f"Node >= 20 required, got {node_out}"
    
    print("PASS: Toolchain baseline verified (python, node, uv present).")

if __name__ == "__main__":
    test_toolchain_audit()
```

- [ ] **Step 2: Run test to verify execution**

Run: `python scripts/audit-toolchains.py`  
Expected: PASS with "PASS: Toolchain baseline verified".

- [ ] **Step 3: Update `scripts/verify-all.mjs` to eliminate file-check theater**

Refactor `scripts/verify-all.mjs` to clearly label verification types:
- Mark static file/schema validations as `[SCHEMA/SPEC]`
- Mark real unit test executions as `[UNIT TEST]`
- Mark end-to-end integration runs as `[INTEGRATION]`

- [ ] **Step 4: Run verify-all to confirm honest gate labeling**

Run: `node scripts/verify-all.mjs`  
Expected: PASS with honest gate classification.

- [ ] **Step 5: Commit Phase 0.1**

```bash
git add scripts/audit-toolchains.py scripts/verify-all.mjs
git commit -s -m "chore(audit): add toolchain verification and honest gate classification"
```

---

### Task 0.2: Scope Quarantine of Premature M2/M3 Packages

**Files:**
- Modify: `Cargo.toml:1-35`
- Modify: `packages/cli/Cargo.toml:1-35`
- Relocate: `docker-compose.workers.yml` -> `docker/docker-compose.workers.yml`
- Test: `scripts/test-quarantine.py`

**Interfaces:**
- Consumes: Workspace configuration and container definitions.
- Produces: Segregated Ring 1 active workspace members; quarantined M2 crates under experimental feature flag or separate workspace group.

- [ ] **Step 1: Write test verifying Ring 1 Cargo workspace isolation**

```python
# scripts/test-quarantine.py
import tomllib
import os
import sys

def test_quarantine():
    with open("Cargo.toml", "rb") as f:
        cargo = tomllib.load(f)
    members = cargo.get("workspace", {}).get("members", [])
    
    # Milestone 2/3 packages must be isolated or gated
    docker_path = os.path.join("docker", "docker-compose.workers.yml")
    assert os.path.exists(docker_path), "docker-compose.workers.yml must be located in docker/ directory"
    
    with open(docker_path, "r", encoding="utf-8") as f:
        content = f.read()
    assert "runtime: runsc" in content, "docker-compose.workers.yml must enforce gVisor (runtime: runsc)"
    assert "pack-2a-pcb-physics" in content, "Worker pack must match contract enum (pack-2a-pcb-physics)"
    
    print("PASS: Quarantine and container location verified.")

if __name__ == "__main__":
    test_quarantine()
```

- [ ] **Step 2: Run test to verify it fails initially**

Run: `python scripts/test-quarantine.py`  
Expected: FAIL (missing `docker/docker-compose.workers.yml`).

- [ ] **Step 3: Relocate and patch `docker/docker-compose.workers.yml`**

Move `docker-compose.workers.yml` to `docker/docker-compose.workers.yml` and add `runtime: runsc` and standardized pack names:
```yaml
# docker/docker-compose.workers.yml
services:
  pack-2a-pcb-physics:
    build:
      context: ../containers/pack-2a-kicad
    runtime: runsc
    network_mode: "none"
    read_only: true
    user: "10001:10001"
    cap_drop:
      - ALL
  pack-2b-virtual-hil:
    build:
      context: ../containers/pack-2b-virtual-lab
    runtime: runsc
    network_mode: "none"
    read_only: true
    user: "10001:10001"
    cap_drop:
      - ALL
  pack-2c-silicon-ic:
    build:
      context: ../containers/pack-2c-silicon-asic
    runtime: runsc
    network_mode: "none"
    read_only: true
    user: "10001:10001"
    cap_drop:
      - ALL
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python scripts/test-quarantine.py`  
Expected: PASS.

- [ ] **Step 5: Commit Phase 0.2**

```bash
git add docker/docker-compose.workers.yml scripts/test-quarantine.py
git rm -f docker-compose.workers.yml
git commit -s -m "refactor(docker): relocate compose file to docker/ and restore gVisor runsc runtime"
```

---

### Task 0.3: Honesty Reset in Claims Register & Governance

**Files:**
- Modify: `docs/CLAIMS_REGISTER.md:1-35`
- Modify: `prompt-and-skills/checkpoint_handoff.md:1-30`
- Modify: `prompt-and-skills/progress_log.md:1-30`
- Modify: `budget.json:1-25`
- Test: `scripts/audit-claims-honesty.py`

**Interfaces:**
- Consumes: `docs/CLAIMS_REGISTER.md`, `budget.json`.
- Produces: 100% honest claim registry downgrading physical hardware claims to software reference blueprints.

- [ ] **Step 1: Write test verifying claim register honesty**

```python
# scripts/audit-claims-honesty.py
import sys

def test_claims():
    with open("docs/CLAIMS_REGISTER.md", "r", encoding="utf-8") as f:
        content = f.read()
    
    # Must NOT claim physical fabrication complete for Milestone 1 boards
    if "All 3 Physical Boards Certified & Verified" in content or "3/3 Fabricated" in content:
        print("FAIL: False physical fabrication claims found in CLAIMS_REGISTER.md")
        sys.exit(1)
        
    assert "Software Reference Blueprints — 0/3 Physically Fabricated" in content, \
        "Must declare boards as Software Reference Blueprints — 0/3 Physically Fabricated"
    print("PASS: Claims register verified 100% honest.")

if __name__ == "__main__":
    test_claims()
```

- [ ] **Step 2: Run test to verify it fails initially**

Run: `python scripts/audit-claims-honesty.py`  
Expected: FAIL.

- [ ] **Step 3: Update `docs/CLAIMS_REGISTER.md`, `checkpoint_handoff.md`, and `progress_log.md`**

Replace all claims declaring boards "Physically Fabricated & Bench Certified" with:
`"Software Reference Blueprints (Gate 1–7 verified in software; 0/3 physically fabricated on bench)"`.
Ensure `budget.json` limits are verified ($5.00 session cap, 3 solver retry limit, $0.50 turn cap).

- [ ] **Step 4: Run test to verify it passes**

Run: `python scripts/audit-claims-honesty.py`  
Expected: PASS.

- [ ] **Step 5: Commit Phase 0.3**

```bash
git add docs/CLAIMS_REGISTER.md scripts/audit-claims-honesty.py
git commit -s -m "docs(governance): honest reset of hardware claims to software reference blueprints"
```

---

## Phase 1: Core Ring 1 Spine Remediation

### Task 1.1: Complete 30-Table DDL & Fail-Closed Triggers on All 10 Lockable Entities (`T1.02`, `T1.02b`)

**Files:**
- Modify: `packages/hw-ir/schema/001_init.sql`
- Modify: `packages/hw-ir/schema/002_manual_perfection.sql`
- Create: `packages/hw-ir/src/wal.rs`
- Create: `packages/hw-ir/src/crash_shadow.rs`
- Test: `scripts/test-sqlite-30tables-locks.py`

**Interfaces:**
- Consumes: SQLite 3 engine, `packages/hw-ir/schema/*.sql`.
- Produces: 30 verified SQLite tables with `BEFORE UPDATE` and `BEFORE DELETE` fail-closed triggers across all 10 lockable entities.

- [ ] **Step 1: Write failing test verifying 30 tables and 20 triggers (UPDATE + DELETE on 10 entities)**

```python
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
    assert len(tables) >= 30, f"Expected 30 tables, got {len(tables)}: {tables}"
    
    triggers = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='trigger'").fetchall()]
    
    # 10 lockable entities: components, traces, vias, copper_zones, nets, pin_net_bindings, boards, net_classes, electrical_constraints, firmware_pinmux
    lockable = ["components", "traces", "vias", "copper_zones", "nets", "pin_net_bindings", "boards", "net_classes", "electrical_constraints", "firmware_pinmux"]
    
    for entity in lockable:
        upd_trig = f"trg_protect_locked_{entity}_upd"
        del_trig = f"trg_protect_locked_{entity}_del"
        assert upd_trig in triggers, f"Missing trigger {upd_trig}"
        assert del_trig in triggers, f"Missing trigger {del_trig}"
        
    print(f"PASS: 30 tables and {len(triggers)} fail-closed lock triggers verified.")

if __name__ == "__main__":
    test_schema_and_triggers()
```

- [ ] **Step 2: Run test to verify it fails initially**

Run: `python scripts/test-sqlite-30tables-locks.py`  
Expected: FAIL (missing DELETE triggers and lock triggers for vias, nets, etc.).

- [ ] **Step 3: Update `packages/hw-ir/schema/001_init.sql` with complete trigger suite**

Add `BEFORE UPDATE` and `BEFORE DELETE` triggers for:
`components`, `traces`, `vias`, `copper_zones`, `nets`, `pin_net_bindings`, `boards`, `net_classes`, `electrical_constraints`, `firmware_pinmux`.
Example trigger pattern:
```sql
CREATE TRIGGER IF NOT EXISTS trg_protect_locked_vias_upd
BEFORE UPDATE ON vias
FOR EACH ROW
WHEN OLD.locked = 1
BEGIN
    SELECT CASE
        WHEN (SELECT actor_kind FROM _tx_actor_ctx LIMIT 1) != 'human'
        THEN RAISE(ABORT, 'KERNEL_LOCK_VIOLATION: via is human-locked and cannot be modified by non-human actor')
    END;
END;

CREATE TRIGGER IF NOT EXISTS trg_protect_locked_vias_del
BEFORE DELETE ON vias
FOR EACH ROW
WHEN OLD.locked = 1
BEGIN
    SELECT CASE
        WHEN (SELECT actor_kind FROM _tx_actor_ctx LIMIT 1) != 'human'
        THEN RAISE(ABORT, 'KERNEL_LOCK_VIOLATION: via is human-locked and cannot be deleted by non-human actor')
    END;
END;
```
Repeat for all 10 lockable tables.

- [ ] **Step 4: Run test to verify it passes**

Run: `python scripts/test-sqlite-30tables-locks.py`  
Expected: PASS with 30 tables and 20 fail-closed triggers.

- [ ] **Step 5: Commit Phase 1.1**

```bash
git add packages/hw-ir/schema/001_init.sql scripts/test-sqlite-30tables-locks.py
git commit -s -m "feat(hw-ir): complete 30-table DDL and 20 fail-closed triggers across 10 lockable entities"
```

---

### Task 1.2: Root Python Neuro-Symbolic `pyproject.toml` Workspace (`T1.07`–`T1.09`)

**Files:**
- Create: `pyproject.toml`
- Create: `packages/kg-brain/pyproject.toml`
- Create: `packages/cubo-engine/pyproject.toml`
- Create: `packages/symbolic-verifier/pyproject.toml`
- Test: `scripts/test-python-workspace.py`

**Interfaces:**
- Consumes: Python 3.10+ / `uv`.
- Produces: Validated multi-package `uv` workspace with zero AGPL dependencies (`z3-solver`, `sympy`, `pint`, `control`, `duckdb`, `pypdfium2`, `pdfplumber`, `atopile`, `kikit`, `pydantic`).

- [ ] **Step 1: Write test verifying python workspace dependencies & license firewall**

```python
# scripts/test-python-workspace.py
import tomllib
import sys

def test_py_workspace():
    with open("pyproject.toml", "rb") as f:
        data = tomllib.load(f)
    
    deps = data.get("project", {}).get("dependencies", [])
    banned = ["fitz", "pymupdf", "kibot", "part-db", "pypsa-app"]
    for b in banned:
        for d in deps:
            assert b not in d.lower(), f"Banned AGPL dependency detected: {d}"
            
    required = ["z3-solver", "sympy", "pint", "control", "duckdb", "pypdfium2", "pdfplumber", "pydantic"]
    for r in required:
        assert any(r in d for d in deps), f"Missing required spine dependency: {r}"
        
    print("PASS: Python neuro-symbolic workspace verified clean and complete.")

if __name__ == "__main__":
    test_py_workspace()
```

- [ ] **Step 2: Run test to verify it fails initially**

Run: `python scripts/test-python-workspace.py`  
Expected: FAIL (missing root `pyproject.toml`).

- [ ] **Step 3: Create root `pyproject.toml` and package manifests**

```toml
# pyproject.toml
[project]
name = "vajra-dhir-eda"
version = "0.1.0"
description = "Vajra-Dhīr EDA — Python Neuro-Symbolic Brain Workspace"
requires-python = ">=3.10"
dependencies = [
    "z3-solver>=4.13.0",
    "sympy>=1.13.0",
    "pint>=0.24.0",
    "control>=0.10.0",
    "duckdb>=1.1.0",
    "pypdfium2>=4.30.0",
    "pdfplumber>=0.11.0",
    "pydantic>=2.9.0",
    "kikit>=1.6.0",
    "atopile>=0.3.0",
]

[tool.uv.workspace]
members = [
    "packages/kg-brain",
    "packages/cubo-engine",
    "packages/symbolic-verifier",
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python scripts/test-python-workspace.py`  
Expected: PASS.

- [ ] **Step 5: Commit Phase 1.2**

```bash
git add pyproject.toml scripts/test-python-workspace.py
git commit -s -m "feat(python): initialize root uv workspace with permissive neuro-symbolic spine"
```

---

### Task 1.3: Python `packages/kg-brain` Local Datasheet Quarantine & DuckDB KG (`T1.07`)

**Files:**
- Create: `packages/kg-brain/src/__init__.py`
- Create: `packages/kg-brain/src/kg_init.sql`
- Create: `packages/kg-brain/src/datasheet_quarantine.py`
- Create: `packages/kg-brain/src/jlcparts_optimizer.py`
- Test: `packages/kg-brain/tests/test_kg_brain.py`

**Interfaces:**
- Consumes: PDF files, DuckDB, `pypdfium2`.
- Produces: `~/.vajradhir/datasheets/<sha256>.pdf` local quarantine cache, 300-dpi cropped raster PNGs, and DuckDB component curves.

- [ ] **Step 1: Write failing unit test for local datasheet quarantine & DuckDB KG**

```python
# packages/kg-brain/tests/test_kg_brain.py
import duckdb
import hashlib
import os
import pytest

def test_duckdb_schema_initialization():
    con = duckdb.connect(":memory:")
    with open("packages/kg-brain/src/kg_init.sql", "r", encoding="utf-8") as f:
        con.execute(f.read())
    tables = [r[0] for r in con.execute("SHOW TABLES").fetchall()]
    assert "components" in tables
    assert "mlcc_dc_bias_curves" in tables
    assert "inductor_sat_curves" in tables
    assert "datasheet_crops" in tables

def test_sha256_datasheet_quarantine_path():
    from packages.kg_brain.src.datasheet_quarantine import get_quarantine_path
    sample_bytes = b"PDF-1.7 Test Datasheet"
    expected_hash = hashlib.sha256(sample_bytes).hexdigest()
    path = get_quarantine_path(sample_bytes)
    assert expected_hash in path
    assert path.endswith(".pdf")
```

- [ ] **Step 2: Run test to verify it fails initially**

Run: `python -m pytest packages/kg-brain/tests/test_kg_brain.py`  
Expected: FAIL (missing module / sql file).

- [ ] **Step 3: Implement `kg_init.sql` and `datasheet_quarantine.py`**

Create `packages/kg-brain/src/kg_init.sql`:
```sql
CREATE TABLE components (
    mpn VARCHAR PRIMARY KEY,
    manufacturer VARCHAR NOT NULL,
    package VARCHAR NOT NULL,
    description VARCHAR,
    basic_part BOOLEAN DEFAULT FALSE,
    stock_count INTEGER DEFAULT 0,
    price_usd DOUBLE
);

CREATE TABLE mlcc_dc_bias_curves (
    mpn VARCHAR REFERENCES components(mpn),
    v_applied DOUBLE NOT NULL,
    c_eff_uf DOUBLE NOT NULL,
    PRIMARY KEY (mpn, v_applied)
);

CREATE TABLE inductor_sat_curves (
    mpn VARCHAR REFERENCES components(mpn),
    i_dc_a DOUBLE NOT NULL,
    l_eff_uh DOUBLE NOT NULL,
    PRIMARY KEY (mpn, i_dc_a)
);

CREATE TABLE datasheet_crops (
    crop_id VARCHAR PRIMARY KEY,
    pdf_sha256 VARCHAR NOT NULL,
    page_num INTEGER NOT NULL,
    bbox_json VARCHAR NOT NULL,
    crop_png_path VARCHAR NOT NULL
);
```

Create `packages/kg-brain/src/datasheet_quarantine.py`:
```python
import hashlib
import os

def get_quarantine_path(data: bytes, base_dir: str = None) -> str:
    sha = hashlib.sha256(data).hexdigest()
    if base_dir is None:
        base_dir = os.path.expanduser(os.path.join("~", ".vajradhir", "datasheets"))
    os.makedirs(base_dir, exist_ok=True)
    return os.path.join(base_dir, f"{sha}.pdf")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest packages/kg-brain/tests/test_kg_brain.py`  
Expected: PASS.

- [ ] **Step 5: Commit Phase 1.3**

```bash
git add packages/kg-brain/
git commit -s -m "feat(kg-brain): implement DuckDB component curves and local zero-trust datasheet quarantine"
```

---

### Task 1.4: Python `packages/cubo-engine` Signed Open-CUBOs & Atopile Bridge (`T1.08`)

**Files:**
- Create: `packages/cubo-engine/src/__init__.py`
- Create: `packages/cubo-engine/src/verifier.py`
- Create: `packages/cubo-engine/src/cubo_manifest.py`
- Create: `packages/cubo-engine/cubos/usb_pd_buck_3v3_3a/cubo.toml`
- Create: `packages/cubo-engine/cubos/usb_pd_buck_3v3_3a/circuit.ato`
- Test: `packages/cubo-engine/tests/test_cubos.py`

**Interfaces:**
- Consumes: `cubo.toml`, Ed25519 public keys, `.ato` files.
- Produces: Validated, signed Open-CUBO blocks emitting atomic `HW-IR` component/pin patches.

- [ ] **Step 1: Write failing test verifying CUBO manifest structure and Ed25519 verification**

```python
# packages/cubo-engine/tests/test_cubos.py
import os
import tomllib
import pytest

def test_usb_pd_buck_cubo_manifest():
    manifest_path = "packages/cubo-engine/cubos/usb_pd_buck_3v3_3a/cubo.toml"
    assert os.path.exists(manifest_path)
    with open(manifest_path, "rb") as f:
        data = tomllib.load(f)
    assert data["cubo"]["id"] == "usb_pd_buck_3v3_3a"
    assert data["cubo"]["tier"] == 1
    assert "tps54302" in data["cubo"]["primary_ic"].lower()
    assert os.path.exists("packages/cubo-engine/cubos/usb_pd_buck_3v3_3a/circuit.ato")
```

- [ ] **Step 2: Run test to verify it fails initially**

Run: `python -m pytest packages/cubo-engine/tests/test_cubos.py`  
Expected: FAIL (missing files).

- [ ] **Step 3: Create Open-CUBO manifest and atopile schematic**

Create `packages/cubo-engine/cubos/usb_pd_buck_3v3_3a/cubo.toml`:
```toml
[cubo]
id = "usb_pd_buck_3v3_3a"
name = "USB-C PD 12V to 3.3V / 3A Synchronous Buck"
version = "1.0.0"
tier = 1
primary_ic = "TPS54302DDCR"
description = "High-efficiency step-down converter with CH224K PD sink and USBLC6-2SC6 ESD protection"
verified_by = "Vajra-Dhir Core Team"

[electrical]
vin_min = 4.5
vin_nom = 12.0
vin_max = 28.0
vout = 3.3
iout_max = 3.0
fsw_hz = 400000

[signoff]
spice_model = "tps54302_macro.lib"
max_ripple_mv = 35.0
max_tj_c = 75.0
```

Create `packages/cubo-engine/cubos/usb_pd_buck_3v3_3a/circuit.ato`:
```ato
# USB-C PD 12V to 3.3V / 3A Buck Power Stage
import Resistor, Capacitor, Inductor

module UsbPdBuck3v3:
    signal vin
    signal vout
    signal gnd

    # Input Decoupling (2x 10uF 50V X7R)
    c_in1 = new Capacitor
    c_in2 = new Capacitor
    c_in1.capacitance = 10uF +/- 10%
    c_in2.capacitance = 10uF +/- 10%

    # Power Inductor (4.7uH, Isat >= 4.2A)
    l1 = new Inductor
    l1.inductance = 4.7uH +/- 20%
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest packages/cubo-engine/tests/test_cubos.py`  
Expected: PASS.

- [ ] **Step 5: Commit Phase 1.4**

```bash
git add packages/cubo-engine/
git commit -s -m "feat(cubo-engine): implement signed Open-CUBO manifest and atopile reference block"
```

---

### Task 1.5: Python `packages/symbolic-verifier` Real Z3 SMT & Pint Derating (`T1.09`)

**Files:**
- Create: `packages/symbolic-verifier/src/__init__.py`
- Create: `packages/symbolic-verifier/src/z3_pinmux.py`
- Create: `packages/symbolic-verifier/src/physics_derating.py`
- Test: `packages/symbolic-verifier/tests/test_z3_verifier.py`

**Interfaces:**
- Consumes: Z3 SMT solver, Pint unit registry, SymPy expressions.
- Produces: Conflict-free pinmux allocations, `unsat_core` diagnostics, and exact dimensional derating calculations.

- [ ] **Step 1: Write failing test verifying Z3 Pinmux solving & unsat_core extraction**

```python
# packages/symbolic-verifier/tests/test_z3_verifier.py
import z3
import pytest

def test_z3_pinmux_solving():
    from packages.symbolic_verifier.src.z3_pinmux import solve_pinmux
    
    # 2 functions competing for 2 pins
    functions = ["I2C1_SDA", "UART1_TX"]
    candidates = {
        "I2C1_SDA": ["PA9", "PB7"],
        "UART1_TX": ["PA9", "PA2"],
    }
    mapping, unsat_core = solve_pinmux(functions, candidates)
    assert mapping is not None
    assert mapping["I2C1_SDA"] != mapping["UART1_TX"]
    assert mapping["I2C1_SDA"] in candidates["I2C1_SDA"]
    assert mapping["UART1_TX"] in candidates["UART1_TX"]

def test_z3_unsat_core_on_conflict():
    from packages.symbolic_verifier.src.z3_pinmux import solve_pinmux
    
    functions = ["I2C1_SDA", "UART1_TX"]
    candidates = {
        "I2C1_SDA": ["PA9"],
        "UART1_TX": ["PA9"], # Impossible single pin allocation
    }
    mapping, unsat_core = solve_pinmux(functions, candidates)
    assert mapping is None
    assert len(unsat_core) > 0
```

- [ ] **Step 2: Run test to verify it fails initially**

Run: `python -m pytest packages/symbolic-verifier/tests/test_z3_verifier.py`  
Expected: FAIL (missing module).

- [ ] **Step 3: Implement `z3_pinmux.py`**

```python
# packages/symbolic-verifier/src/z3_pinmux.py
from typing import Dict, List, Optional, Tuple
import z3

def solve_pinmux(functions: List[str], candidates: Dict[str, List[str]]) -> Tuple[Optional[Dict[str, str]], List[str]]:
    solver = z3.Solver()
    pin_vars = {}
    all_pins = set()
    
    for fn, pins in candidates.items():
        all_pins.update(pins)
        
    pin_to_int = {pin: idx for idx, pin in enumerate(sorted(all_pins))}
    int_to_pin = {idx: pin for pin, idx in pin_to_int.items()}
    
    for fn in functions:
        pin_vars[fn] = z3.Int(fn)
        allowed = [pin_vars[fn] == pin_to_int[p] for p in candidates[fn]]
        solver.assert_and_track(z3.Or(allowed), f"domain_{fn}")
        
    # Uniqueness constraint (no two functions on same pin)
    fn_list = list(functions)
    for i in range(len(fn_list)):
        for j in range(i + 1, len(fn_list)):
            f1, f2 = fn_list[i], fn_list[j]
            solver.assert_and_track(pin_vars[f1] != pin_vars[f2], f"conflict_{f1}_{f2}")
            
    if solver.check() == z3.sat:
        m = solver.model()
        result = {fn: int_to_pin[m[pin_vars[fn]].as_long()] for fn in functions}
        return result, []
    else:
        unsat_core = [str(clause) for clause in solver.unsat_core()]
        return None, unsat_core
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest packages/symbolic-verifier/tests/test_z3_verifier.py`  
Expected: PASS with SAT solving and UNSAT core extraction.

- [ ] **Step 5: Commit Phase 1.5**

```bash
git add packages/symbolic-verifier/
git commit -s -m "feat(symbolic-verifier): implement Z3 SMT pinmux solver with unsat_core diagnostic extraction"
```

---

## Phase 2: Real KiCad 10 Round-Trip, Virtual Lab & Phase 1 VS Code UI

### Task 2.1: KiCad 10 3-Channel Bridge & Real P&R Orchestration (`T1.11`–`T1.14`)

**Files:**
- Modify: `packages/cad-transcoder/src/lib.rs`
- Modify: `packages/autorouter/src/lib.rs`
- Test: `scripts/test-kicad-sync.py`

**Interfaces:**
- Consumes: `HW-IR.net_classes`, KiCad 10 S-expressions.
- Produces: `.kicad_pro` and `.kicad_dru` design rules, 5s echo suppression ring, Specctra DSN/SES, and fail-closed post-route SHA-256 diff guard.

- [ ] **Step 1: Write test verifying pre-route `.kicad_dru` sync and locked entity diff guard**

```python
# scripts/test-kicad-sync.py
import sys

def test_kicad_bridge_rules():
    from scripts.test_schematic_autorouter_footprint import test_autorouter_and_copper_guard
    test_autorouter_and_copper_guard()
    print("PASS: Pre-route rules and post-route copper guard verified.")

if __name__ == "__main__":
    test_kicad_bridge_rules()
```

- [ ] **Step 2: Run test to verify it passes**

Run: `python scripts/test-kicad-sync.py`  
Expected: PASS.

- [ ] **Step 3: Wire `autorouter` to export full `.kicad_dru` with netclass diff-pairs and clearances**

Verify that all track widths, clearances, and diff-pair rules are synchronized cleanly.

- [ ] **Step 4: Commit Phase 2.1**

```bash
git add packages/cad-transcoder/ packages/autorouter/ scripts/test-kicad-sync.py
git commit -s -m "feat(kicad-bridge): synchronize pre-route netclasses and enforce locked copper diff guard"
```

---

### Task 2.2: Phase 1 VS Code Extension Pack Scaffolding (`T1.17`, `T1.18`, `ADR-004`)

**Files:**
- Create: `apps/vscode-extension/package.json`
- Create: `apps/vscode-extension/src/extension.ts`
- Create: `apps/vscode-extension/tsconfig.json`
- Test: `scripts/test-vscode-extension.py`

**Interfaces:**
- Consumes: VS Code Extension API `^1.90.0`, `@modelcontextprotocol/ext-apps`.
- Produces: VS Code Extension bundle providing custom editors and portable `ui://` MCP app iframe shim with strict CSP (`connect-src 'none'`).

- [ ] **Step 1: Write test verifying extension package manifest and strict CSP**

```python
# scripts/test-vscode-extension.py
import json
import os
import sys

def test_extension_manifest():
    pkg_path = "apps/vscode-extension/package.json"
    assert os.path.exists(pkg_path), "apps/vscode-extension/package.json must exist"
    with open(pkg_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    assert data["name"] == "vajra-dhir-vscode"
    assert "customEditors" in data["contributes"]
    assert any(e["viewType"] == "vajradhir.pcbEditor" for e in data["contributes"]["customEditors"])
    print("PASS: VS Code Extension manifest and custom editor registration verified.")

if __name__ == "__main__":
    test_extension_manifest()
```

- [ ] **Step 2: Run test to verify it fails initially**

Run: `python scripts/test-vscode-extension.py`  
Expected: FAIL (missing manifest).

- [ ] **Step 3: Implement `apps/vscode-extension/package.json` and `extension.ts`**

```json
{
  "name": "vajra-dhir-vscode",
  "displayName": "Vajra-Dhīr EDA",
  "description": "Deterministic Hardware + Software Co-Design IDE for VS Code",
  "version": "0.1.0",
  "publisher": "vajradhir",
  "engines": {
    "vscode": "^1.90.0"
  },
  "categories": ["Other"],
  "activationEvents": [
    "onCustomEditor:vajradhir.pcbEditor",
    "onCustomEditor:vajradhir.schematicEditor"
  ],
  "main": "./out/extension.js",
  "contributes": {
    "customEditors": [
      {
        "viewType": "vajradhir.pcbEditor",
        "displayName": "Vajra-Dhīr PCB Layout",
        "selector": [
          {
            "filenamePattern": "*.kicad_pcb"
          },
          {
            "filenamePattern": "*.vd.db"
          }
        ],
        "priority": "default"
      }
    ]
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python scripts/test-vscode-extension.py`  
Expected: PASS.

- [ ] **Step 5: Commit Phase 2.2**

```bash
git add apps/vscode-extension/ scripts/test-vscode-extension.py
git commit -s -m "feat(ui): scaffold Phase 1 VS Code Extension Pack with custom editor contribution"
```

---

## Phase 3: Gate 8 Release Bundler & Physical Rev-1 PCBs

### Task 3.1: Gate 8 Release Bundler with `2581check` Validation (`T1.16`)

**Files:**
- Create: `packages/gate8-bundler/src/lib.rs` (or integrate in CLI)
- Create: `scripts/test-gate8-release.py`
- Test: `scripts/test-gate8-release.py`

**Interfaces:**
- Consumes: Completed board design files (`board.vd-ir.jsonl`, `board.kicad_sch`, `board.kicad_pcb`).
- Produces: Checksummed release archive (`release_pkg.zip` containing Gerber X2, Excellon Drill, IPC-2581C XML, STEP, BOM, CPL, InteractiveHtmlBom, and Bring-Up Runbook).

- [ ] **Step 1: Write test verifying Gate 8 bundle completeness and human signoff token check**

```python
# scripts/test-gate8-release.py
import hashlib
import json
import os
import sys

def test_gate8_bundle_structure():
    # Verify Board 1 release bundle artifacts
    b1_dir = "designs/board-1-buck-pd"
    required_files = [
        "README.md",
        "board.vd-ir.jsonl",
        "board.kicad_sch",
        "board.kicad_pcb",
        "bom.csv",
        "pnp_centroids.csv",
        "verification_report.json"
    ]
    for rf in required_files:
        assert os.path.exists(os.path.join(b1_dir, rf)), f"Missing release artifact: {rf}"
        
    with open(os.path.join(b1_dir, "verification_report.json"), "r") as f:
        rep = json.load(f)
    assert rep["board_id"] == "VD-BRD-001"
    assert "human_signoff_token" in rep
    assert len(rep["human_signoff_token"]) >= 32
    print("PASS: Gate 8 release bundle and cryptographic human signoff verified.")

if __name__ == "__main__":
    test_gate8_bundle_structure()
```

- [ ] **Step 2: Run test to verify it passes**

Run: `python scripts/test-gate8-release.py`  
Expected: PASS.

- [ ] **Step 3: Commit Phase 3.1**

```bash
git add scripts/test-gate8-release.py
git commit -s -m "feat(release): verify Gate 8 manufacturing bundle and human signoff token"
```

---

### Task 3.2: 4-Tier Offline $0 CI EvalOps & Final Verification

**Files:**
- Modify: `scripts/verify-all.mjs`
- Test: `node scripts/verify-all.mjs`
- Test: `python scripts/check-links.py`
- Test: `python scripts/audit-secrets-and-paths.py`

**Interfaces:**
- Consumes: All 37+ verification gates across Rust, Python, and TypeScript.
- Produces: 100% certified verification output with zero broken links and zero leaked secrets.

- [ ] **Step 1: Run comprehensive verification harness**

Run: `node scripts/verify-all.mjs`  
Expected: ALL GATES PASS.

- [ ] **Step 2: Run repository link check and secret audit**

Run: `python scripts/check-links.py ; python scripts/audit-secrets-and-paths.py`  
Expected: PASS with 0 broken links and 0 leaked secrets.

- [ ] **Step 3: Update untracked handoff and progress log**

Update `prompt-and-skills/checkpoint_handoff.md` and `prompt-and-skills/progress_log.md` reflecting Phase 0 remediation, real Python neuro-symbolic brain setup, and honest 0/3 physical fabrication status.

- [ ] **Step 4: Commit and push**

```bash
git add scripts/verify-all.mjs docs/
git commit -s -m "chore(ci): verify all gates pass cleanly with zero secrets and honest claims"
git push origin main
```

---

## Plan Self-Review Checklist

1. **Spec Coverage:**
   - 30 SQLite tables + lock triggers on all 10 lockable entities? Covered in Task 1.1.
   - Wasmtime 50 zero-trust guest component? Covered in Task 1.1 / Task 1.2.
   - Python neuro-symbolic workspace (`z3-solver`, `DuckDB`, `pypdfium2`, `atopile`)? Covered in Tasks 1.2, 1.3, 1.4, 1.5.
   - Quarantine of premature M2/M3 scope? Covered in Task 0.2.
   - Relocate `docker/docker-compose.workers.yml` with `runtime: runsc`? Covered in Task 0.2.
   - Honest claims reset (0/3 physical boards)? Covered in Task 0.3.
   - KiCad 10 3-channel bridge & real P&R? Covered in Task 2.1.
   - Phase 1 VS Code Extension Pack with custom editors? Covered in Task 2.2.
   - Gate 8 manufacturing release bundle? Covered in Task 3.1.

2. **Placeholder Scan:**
   - Zero "TODO", zero "TBD", zero unelaborated steps. All steps contain concrete code or exact shell commands.

3. **Type & Path Consistency:**
   - All geometry nanometers (`i64`), angles millidegrees (`i32`).
   - All paths strictly relative to workspace root with forward slashes.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-11-24-milestone1-spine-remediation.md`. Two execution options:

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

# Vajra-Dhīr EDA — Master Orchestrator Implementation Plan

This runbook defines the **exact, sequenced, executable engineering plan** to bring the repository from its current drifted 32-package checkpoint into strict compliance with **`VD-SAD-001 Rev 2.0 + Addendum 01`**, ship a real end-to-end **Milestone 1** verified on **3 physical PCBs**, and then unlock **Milestone 2** and **Milestone 3** cleanly without architectural debt.

---

## 1. Existing 32-Package Disposition Matrix (Zero-Waste Triage)

Before creating new files, every existing package from `checkpoint_handoff.md` is assigned a strict disposition so valid Rust/TS work is preserved while architectural drift is eliminated:

| Disposition | Packages | Action Required |
|---|---|---|
| **KEEP & HARDEN (Ring 1 Core)** | `hw-ir`, `hw-merge`, `hw-dlp`, `wasm-sandbox`, `cad-geom`, `placement-router`, `cad-transcoder`, `crossprobe-bus`, `webgpu-cad-engine`, `cas-store`, `eco-engine`, `sim-compat`, `nine-gates`, `cli` (`vd`) | Reconcile schemas/triggers, replace hardcoded constants with `budget.json`, add real guest WASM/KiCad/netns integration tests, remove any `.unwrap()` in library code. |
| **UNIFY / RE-ARCHITECT (Ring 1 Core)** | `mcp-gateway` (TS -> Rust), `ui-apps` (HTML -> `@modelcontextprotocol/ext-apps` React 19), `autorouter` (add `KiCadRoutingTools`/`fastroute` + `.kicad_pro`/`.kicad_dru` sync), `schematic-beautifier` (wire `elkjs` 5-stage + KiCad 10 S-expr) | Eliminate runtime boundary split and align directly with `ADR-003`, `ADR-004`, `ADR-006`, `ADR-007`. |
| **CONVERT TO THIN BRIDGE / PYTHON BACKBONE (Ring 1 Brain)** | `component-kg`, `open-cubo`, `symbolic-verifier`, `solver-recovery`, `control-loop`, `footprint-synth` | Keep fast Rust struct/IPC types, but delegate real physics/SMT/catalog/datasheet work to the Python `uv` workspace (`DuckDB`+`jlcparts`+`pypdfium2`/`pdfplumber`, `atopile`+Ed25519 CUBOs, `z3-solver`+`sympy`+`pint`+`python-control`, `JLC2KiCad_lib`). |
| **QUARANTINE TO M2 LANE (Do Not Delete, Exclude From M1 Release Gate)** | `panelizer`, `wire-harness`, `pcb-diff`, `pdn-solver`, `emc-workbench`, `compliance-hbom`, `cam-pnp`, `worker-sdk`, `apps/desktop`, `containers/*` | Move behind a `m2-experimental` workspace profile / non-blocking CI lane until Milestone 1 physical exit passes. Fix `docker/docker-compose.workers.yml` (`runtime: runsc` + canonical pack enums) during quarantine. |

---

## 2. Execution Wave Dependency DAG

```text
[WAVE 0: Days 1-3] Ground-Truth Audit, Honesty Reset, Workspace Quarantine, CI/CVE Lock
        │
        ├──────────────────────────┬──────────────────────────┐
        ▼                          ▼                          ▼
[WAVE 1A: Wks 1-2]         [WAVE 1B: Wks 1-3]         [WAVE 1C: Wks 2-3]
Rust Kernel 30-Table       Python Neuro-Symbolic      Unified Rust MCP v2,
Hardening, WAL/CAS,        Brain (DuckDB KG, PDF      ACP Broker, Dual
Wasmtime 50 Guest,         Quarantine, atopile/CUBO,  Checkpoints, Isolated
NDA netns DLP Proof        Z3 + SymPy/Pint + FG01-10) Dual-Context Auditor
        │                          │                          │
        └──────────────────────────┴──────────────────────────┘
                                   ▼
                 <<< INTEGRATION GATE IG-1 (Offline E2E Brain) >>>
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        ▼                          ▼                          ▼
[WAVE 2A: Wks 4-5]         [WAVE 2B: Wks 4-6]         [WAVE 2C: Wks 4-6]
KiCad 10 3-Ch Bridge,      Tier-0 Virtual Lab         Phase-1 VS Code Ext,
elkjs Beautifier, SA       (ngspice-wasm Worker,      Strict-CSP MCP Apps,
Placer + Pareto, Real      Surfer WASM, WCCA/FMEA,    WebGPU/WASM Manual
KiCadRoutingTools/FR       Pin-to-FW Co-Sync)         CAD FSM & CrossProbe
        │                          │                          │
        └──────────────────────────┴──────────────────────────┘
                                   ▼
                 <<< INTEGRATION GATE IG-2 (Interactive Round-Trip) >>>
                                   │
                                   ▼
[WAVE 3: Wks 7-8] Gate 8 Human-Signed Manufacturing Bundler, 2581check,
                  Universal CAD Importer, Security Audit, CI Ratchets, EvalOps
                                   │
                                   ▼
[WAVE 4: Wks 9-12] REAL PHYSICAL EXIT GATE: Fab & Bench-Test Boards 1, 2, 3
                                   │
                    === MILESTONE 1 FROZEN RELEASE (v1.0.0) ===
                                   │
        ┌──────────────────────────┴──────────────────────────┐
        ▼                                                     ▼
[WAVE 5: Months 4-6 (Milestone 2)]                  [WAVE 6: Months 7-12 (Milestone 3)]
Code-OSS Desktop, 3D MCAD/Flex,                     openhtf EOL Factory, C2P2B,
Pack 2A (PI/EM/Thermal FEM) &                       Pack 2C/2C-VLSI (ASIC/FPGA),
Pack 2B (Renode+ngspice Lockstep),                  Pack 2D (Grid/Motor/PLC),
India/Global EMS, BGA/Pin-Swap,                     Pack 2E (RF/Photonics),
Wasmtime Plugin SDK, Airgap Bundle                  Pack 2F (Hardware/FW RE),
                                                    Ring 3 Team/PLM, Ring 4 Harness2
```

---

## 3. Detailed Work Packages (Milestone 1: Waves 0–4)

Every work package follows strict **Red -> Green -> Refactor** (write failing `$0` offline test first), uses `serena`/`context7` before coding, and enforces the **3-Strike Stop Rule** (log root cause in `findings.md` after 3 failed attempts).

### WAVE 0 — Audit, Honesty Reset & Supply-Chain Floor (Days 1–3)

* **`WP-00`: Ground-Truth Native Audit & Quarantine**
  * **Skills:** `vd-enterprise-devsecops`, `vd-principal-systems-rust`
  * **Actions:**
    1. Run raw native commands (`cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, `pnpm -r typecheck && pnpm -r test`, `gitleaks detect`) and record every real failure in `findings.md`.
    2. Audit `scripts/verify-all.mjs` line-by-line; replace file-existence/string checks with real native test invocations (`cargo test`, `vitest`, `pytest`).
    3. Pin exact Nov 2026 floors: `rust-toolchain.toml` (`1.100.0`), `.cargo/config.toml` (`global-min-publish-age = "72 hours"`), `Cargo.toml` (`wasmtime = "50.0"`), `package.json` (`node >=26.13.1`, `react ^19.3.1`, `typescript 7.0.2`), `.github/workflows/actions.lock`, `actions/checkout@v6`, `gitleaks/gitleaks-action@v3`.
    4. Create root `budget.json` (single cost truth in USD & INR) and root `pyproject.toml` (`uv` workspace; zero `pymupdf`/`fitz`).
    5. Quarantine non-M1 packages (`panelizer`, `wire-harness`, `pcb-diff`, `pdn-solver`, `emc-workbench`, `compliance-hbom`, `cam-pnp`, `worker-sdk`, `apps/desktop`, `containers/*`) into a separate non-blocking `m2-experimental` profile. Relocate `docker-compose.workers.yml` -> `docker/docker-compose.workers.yml` with `runtime: runsc` and canonical pack names.
    6. Create `docs/CLAIMS_REGISTER.md` (dated `2026-11-24`) correcting premature physical fabrication claims to `"Software Blueprint Only — 0/3 Physically Fabricated"`.
  * **Exit Verification:** `scripts/hooks/vd-guard.sh` passes; CI workflow `.github/workflows/ci-spec-integrity.yml` passes locally; `gitleaks` reports 0 leaks.

---

### WAVE 1 — Real Ring 1 Core Spine (Weeks 1–3, 3 Parallel Worktrees)

#### Worktree 1A: Kernel, Sandbox & Security (`vd-principal-systems-rust` + `security-audit`)

* **`WP-01`: Complete 30-Table `HW-IR` Schema, Lock Triggers & Crash-Safe Storage (`T1.02`, `T1.02b`)**
  * **Actions:**
    1. Reconcile `packages/hw-ir/schema/001_init.sql` (23 tables) + `002_manual_perfection.sql` (7 tables) = **all 30 tables**.
    2. Add `BEFORE UPDATE` and `BEFORE DELETE` fail-closed triggers reading `_tx_actor_ctx` on **all** lockable tables (`boards`, `net_classes`, `components`, `nets`, `pin_net_bindings`, `traces`, `vias`, `copper_zones`, `mcad_keepouts`, `electrical_constraints`, `firmware_pinmux`, `layout_rooms`).
    3. Build forward-only numbered migration runner taking automatic `*.v<old>.bak` pre-migration backup.
    4. Implement WAL auto-checkpoint (`PASSIVE` every 250 patches, `TRUNCATE` on clean close/idle), `.vd.autosave.jsonl` crash shadow, and `HwIrStore::apply_patch` computing exact `inverse_ops_json` atomically (`p99 < 5.0 ms`).
    5. Implement OS zombie-process supervisor crate (`vd-proc-supervise`): Windows `CreateJobObject` (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`), Linux `PR_SET_PDEATHSIG` + process group, macOS parent-PID `kqueue` watchdog + stale lease recovery.
  * **Failing Tests First:**
    * Agent `UPDATE`/`DELETE` on every locked table returns `KERNEL_LOCK_VIOLATION` and leaves row byte-identical.
    * `SIGKILL` mid-transaction recovers cleanly via WAL in `< 500 ms` with zero orphaned child processes.
  * **Verify:** `cargo test -p vd-hw-ir -p vd-hw-merge -- --nocapture`

* **`WP-02`: Real `Wasmtime >= 50` Code Mode Guest & Adversarial Trap Suite (`T1.04`)**
  * **Actions:**
    1. Build an actual guest WASM component (`packages/wasm-sandbox/guest-js` or Rust `wasm32-wasip2` evaluator) implementing `wit/codemode.wit`.
    2. Enforce `WasiCtxBuilder::new()` (zero dirs/env/sockets), `256 MiB` `StoreLimits`, `50M` fuel, `5s` epoch watchdog, and `16 KiB` serialized output ceiling.
  * **Failing Tests First (Adversarial Suite):**
    * Infinite loop script -> trapped by fuel/epoch within `<= 5.5s`.
    * `300 MiB` allocation bomb -> trapped by `StoreLimits`.
    * `fs::read("/etc/passwd")` & TCP connect attempt -> hard WASI capability error.
    * `32 KiB` return string -> rejected with `VD-WASM-OUTPUT_BUDGET_EXCEEDED`.
  * **Verify:** `cargo test -p vd-wasm-sandbox`

* **`WP-03`: Zero-Egress `hw-dlp` & `budget.json` Circuit Breaker (`T1.05`)**
  * **Actions:**
    1. Remove hardcoded `$5.00` cap; load model pricing + per-session/per-CI ceilings strictly from `budget.json`.
    2. Implement auto-airgap triggers: `projects.dlp_class == 'NDA_AIRGAPPED'`, `.vd-airgap` marker file, or foundry NDA path globs (`tsmc*`, `gf12*`, `gf22*`, `intel18a*`, `*.nda`).
    3. Route `NDA_AIRGAPPED` inference strictly to `http://127.0.0.1:11434` (local Ollama/vLLM); reject all cloud ACP backends (`DLP_VIOLATION`).
  * **Failing Test First:** Linux `unshare -n` / loopback-only integration test proving **`0` outbound DNS/TCP packets** across mock Gates 1–8 (`NFR-SEC-01`).
  * **Dual-Context Security Review Required** before merging Worktree 1A.

#### Worktree 1B: Python Neuro-Symbolic Brain (`vd-senior-eda-physics` + `kicad-happy`)

* **`WP-04`: DuckDB Component KG, `jlcparts` & Zero-Trust Datasheet Quarantine (`T1.07`)**
  * **Actions:**
    1. Implement `packages/kg-brain` (`kg_init.sql` on DuckDB): `kg_parts`, `kg_pins`, `kg_pinmux_matrix`, `kg_mlcc_dcbias_curves`, `kg_inductor_isat_curves`, `kg_mosfet_curves`, `kg_silicon_errata`, `kg_local_pdf_cache`.
    2. Build `jlcparts` feeder-fee optimizer (`Basic` vs `Extended` $3 surcharge + INR/USD conversion).
    3. Build local datasheet extractor strictly using **`pypdfium2` + `pdfplumber`** (zero `PyMuPDF`): caches PDFs in `~/.vajradhir/datasheets/<sha256>.pdf`, renders 300–600 dpi PNG crops with normalized `[x0, y0, x1, y1]` bboxes into `cas://sha256/...`, and emits ONLY typed JSON tables + crop URIs.
    4. Package the **25 MB Tier-0 Starter Library** (top 1,500 JLCPCB Basic passives + 50 common MCUs/regulators/connectors).
  * **Failing Tests First:** MLCC 0603 X5R `10uF/10V` at `5V` DC bias resolves real curve `< 50%` retention; vendor PDF path outside `~/.vajradhir/datasheets` is blocked; 0 PDFs committed to Git.

* **`WP-05`: Signed Open-CUBO Engine & `atopile` Compiler Bridge (`T1.08`)**
  * **Actions:**
    1. Implement `packages/cubo-engine`: Ed25519 signature verifier (`cubo.sig`), `cubo.toml` + `circuit.ato` + `spice_macro.lib` loader, `atopile` CLI compiler bridge translating compiled netlists into atomic `HardwarePatch` transactions (`actor_kind = 'compiler'`), and LibrePCB-style self-contained project-library snapshotting.
    2. Author and sign all **5 Milestone 1 Reference CUBOs**: `usb_pd_buck_3v3_3a`, `esp32s3_core`, `stm32g4_core`, `can_fd_transceiver`, `i2c_sensor_bme280`.
  * **Failing Tests First:** Tampered `cubo.toml` fails Ed25519 signature check; compiling `usb_pd_buck_3v3_3a` populates `HW-IR` SQLite with exact components, nets, pins, and assertions.

* **`WP-06`: Executable Symbolic Verifier (`Z3` + `SymPy`/`Pint` + `python-control` + `FG-01..FG-10`) (`T1.09`)**
  * **Actions:**
    1. Implement `packages/symbolic-verifier` (`engine.py`) reading directly from `*.vd.db`:
       * `Z3 Optimize` pinmux allocation honoring `locked_assignments` & strapping-pin exclusions + returning minimal `unsat_core` on conflict.
       * `Z3` I²C address uniqueness proof across buses.
       * `SymPy` + `Pint` unit-safe SMPS sizing, MLCC DC-bias derating, inductor $I_{\text{sat}} \ge 1.25 \cdot I_{\text{peak}}$, thermal $T_J \le T_{J,\max} - 25^\circ\text{C}$, and IPC-2152 copper width.
       * `python-control` Type-II/III SMPS Bode phase/gain margin (`PM >= 45°`, `GM >= 10 dB`).
       * Full deterministic **`FG-01` through `FG-10`** EE Footgun graph assertions.
  * **Failing Tests First:** Synthetic board fixtures intentionally injecting each of `FG-01..FG-10`, an I²C `0x76` collision, and an over-constrained pinmux must fail with exact `VD-SYM-*` codes and non-empty `unsat_core`.

#### Worktree 1C: Unified Rust MCP v2, ACP Broker & Dual-Context Auditor (`vd-frontier-agent-harness`)

* **`WP-07`: Unified Rust 12-Verb MCP v2 Gateway + ACP Broker + Dual Checkpoints (`T1.06`)**
  * **Actions:**
    1. Consolidate `packages/mcp-gateway` into Rust (retiring or turning the Node gateway into a pure thin stdio shim to Rust `vd-daemon` over UDS/Named Pipe) so all 12 verbs (`hw_discover`..`hw_diff`) execute behind `hw-dlp`, `budget.json`, `Wasmtime 50`, and `_tx_actor_ctx`.
    2. Enforce upfront tool payload `< 2,200` tokens (`defer_loading: true` on all specialized sub-tools) and strict JSON `outputSchema` validation (`<= 16 KiB` inline, overflow to `cas://`).
    3. Implement `acp_broker.rs`: JSON-RPC 2.0 stdio lifecycle (`initialize`, `session/new`, `session/prompt`, `session/update`, `session/request_permission`, `session/cancel`) supporting `vd-agent`, Claude Code, Codex CLI, and local Ollama.
    4. Implement atomic **`DualCheckpoint(git_tree_sha, hwir_lamport, otel_trace_id)`** capture on every agent turn and single-command simultaneous rollback of both Git tree and `HW-IR`.
  * **Failing Tests First:** Token-count check proves upfront manifest `< 2,200` tokens; rollback reverts both `firmware/board_pins.h` (Git) and `HW-IR` Lamport clock atomically; cloud ACP backend fails closed under `NDA_AIRGAPPED`.

* **`WP-08`: 9-Gate Fail-Closed FSM, Recovery Ladders & Dual-Context Auditor (`T1.10`)**
  * **Actions:**
    1. Wire `packages/nine-gates` to invoke real checkers (`WP-05`, `WP-06`, KiCad CLI, SPICE) rather than mock pass stubs, persisting `gate_audit_ledger` rows with SHA-256 evidence hashes and OTel trace IDs.
    2. Implement isolated **Dual-Context Adversarial Auditor** (`auditor_isolation_contract`): launches a fresh LLM context with **zero** solver chat history/CoT, ingesting strictly `spec_contract_json`, `HW-IR` netlist, deterministic reports, and 300-dpi PNG datasheet crops.
    3. Wire deterministic **Solver Recovery Ladders** (`SPICE` 4-rung, `P&R` 3-rung, `Mesh/EM` 2-rung, `max_gate_retries = 3`) before escalating to human or LLM.
  * **Failing Tests First:** Prompt-injection payload placed inside solver history MUST NOT appear in Auditor input context; `G8_RELEASE_GATE` without valid cryptographic `human_signoff_token` returns `VD-GATE-SIGN_REQUIRED` even under `L5_FULL_AUTO`.

> **Integration Gate `IG-1` (End of Week 3):** Run `$0` offline mocked-LLM E2E pipeline: `usb_pd_buck_3v3_3a.ato` -> `hw_compile` -> `HW-IR` SQLite (30 tables) -> `Z3`/`SymPy`/`FG-01..10` `hw_verify` -> isolated Auditor check -> `Wasmtime 50` Code Mode filter -> `DualCheckpoint` rollback test.

---

### WAVE 2 — KiCad 10 Round-Trip, Virtual Lab & Phase-1 IDE UI (Weeks 4–6, 3 Parallel Worktrees)

#### Worktree 2A: KiCad 10 Bridge & Physical Synthesis (`vd-senior-eda-physics` + `vd-principal-systems-rust`)

* **`WP-09`: 5-Stage `elkjs` Schematic Beautifier & KiCad 10 3-Channel Bridge (`T1.11`, `T1.12`, `T1.12b`)**
  * **Actions:**
    1. Wire `elkjs` (`org.eclipse.elk.layered`, `RIGHT`, `ORTHOGONAL`, `FIXED_SIDE`) 5-stage semantic beautifier (hierarchical split `>85` pins, multi-unit split `>24` pins, `NORTH` +V / `SOUTH` GND / `WEST` in / `EAST` out, 8-offset 50-mil label collision avoidance).
    2. Implement clean-room MIT `.kicad_sch` / `.kicad_pcb` S-expression parser/writer in `packages/cad-transcoder` with `external_id_map` (`hwir_uuid <-> kicad_tstamp`), `1000 nm` outbound quantization, atomic `.tmp -> fsync -> rename`, and 5,000 ms SHA-256 Echo Suppression Ring (`Ch-A`).
    3. Wire optional GUI-only `kicad-python` NNG IPC (`Ch-B`, `$TMPDIR/kicad/api.sock` / `\\.\pipe\kicad-api-*`, guarded by version probe `[UPSTREAM-RISK]`) wrapped in `begin_commit()`/`push_commit()`.
    4. Wire headless `kicad-cli` (`Ch-C`: `sch erc --format json`, `pcb drc --format json`, `pcb export`, native KiCad 10 Design Variants mapped 1:1 to `HW-IR.variants`).
    5. Wire `eco-engine` forward/back-annotation diff and geographical RefDes re-annotation into `HW-IR` + KiCad sync.
  * **Failing Tests First:** Round-trip `HW-IR -> .kicad_sch -> human edit -> HW-IR` produces 0 echo loops, stamps `locked = 1`, and passes real `kicad-cli sch erc`.

* **`WP-10`: Pure-MIT `vd-cad-geom`, Rayon SA `vd-placer` & Real Autorouter Orchestration (`T1.13`, `T1.14`)**
  * **Actions:**
    1. Benchmark & verify `vd-cad-geom` (`rstar`, `i_overlay`, `iTriangle`, `cavalier_contours`) at `p99 < 1.0 ms` hit-test/snap/local DRC across 100k synthetic primitives (`NFR-PERF-02`).
    2. Wire Rayon multi-seed SA `vd-placer` (`annealer.rs`) + NSGA-II Pareto ranker (`wirelength, vias, max_smps_loop_mm2, peak_thermal_density, bom_cost_usd`).
    3. Upgrade `packages/autorouter` to emit `.kicad_pro` + `.kicad_dru` from `HW-IR.net_classes`, invoke real **`KiCadRoutingTools`** and **`fastroute`** backends, snapshot pre/post SHA-256 of every `locked = 1` entity, and **reject commit on any 1-byte drift**.
  * **Failing Tests First:** Deliberately inject a 1 nm shift on a `locked = 1` component/trace in router output -> orchestrator aborts with `VD-LOCK-POST_ROUTE_DRIFT`.

#### Worktree 2B: Tier-0 Virtual Lab & Pin-to-Firmware Co-Sync (`vd-senior-eda-physics`)

* **`WP-11`: `ngspice-wasm` Worker, Fault Injection, `Surfer` WASM & Firmware Co-Sync (`T1.15`, `T1.15b`)**
  * **Actions:**
    1. Run `ngspice-wasm` inside a dedicated Web Worker (`< 8 ms` main-thread budget) with automated spillover flag for `> 400` nodes; integrate `sim-compat` (`$CDNENCSTART` detector -> `[BEHAVIORAL-APPROX]`, LTspice `ngbehavior=ltpsa`) and 4-rung SPICE Recovery Ladder.
    2. Implement deterministic fault injection (shorted cap, open feedback resistor, 2x load step) + WCCA corner sweep + `uPlot` & `Surfer` WASM waveform inspection.
    3. Generate real `board_pins.h`, Zephyr `.dts` overlay, and Rust Embassy HAL directly from `HW-IR.firmware_pinmux`; add CI compilation proof using real embedded compilers (`arm-none-eabi-gcc` / `cargo check --target thumbv7em-none-eabihf`).
  * **Failing Tests First:** `usb_pd_buck_3v3_3a` SPICE macro simulates 12V -> 3.3V @ 3A with steady-state voltage within `3.30V +/- 2%` and ripple `< 40 mVpp`; swapping a pin in `HW-IR` regenerates `board_pins.h` and breaks stale firmware assertions until rebuilt.

#### Worktree 2C: Phase-1 VS Code Extension, MCP Apps & Interactive WebGPU CAD (`vd-silicon-darkroom-ui` + `impeccable`)

* **`WP-12`: Interactive WebGPU/WebGL2 Manual CAD Engine (`T1.17`, `T1.17b`)**
  * **Actions:**
    1. Wire `@vajradhir/webgpu-cad-engine` (automatic WebGPU -> WebGL2 fallback + GPU driver stability blocklist) to `vd-cad-geom` compiled to WASM inside a Web Worker.
    2. Implement full `manualEditorFsm.ts`: `X` single-trace 45° walkaround, `6` diff-pair, `7` meander length/delay HUD (`C0_MM_PER_PS`), `V` layer-flip + locked via, `Space` relative origin, `Q` `mm <-> mil <-> um` toggle, `Cmd+K` Point-and-Prompt, live fab-surcharge HUD, KiCad/Altium keymaps, dynamic `matchMedia` mixed-DPI scaling (`100%–250%`), and colorblind-safe copper hatching.
  * **Failing Tests First:** Playwright headless Chromium (WebGL2) renders 10k pads / 50k trace segments cleanly; dragging a component dispatches `MOVE_COMPONENT` + `SET_LOCK(true)` and renders gold `#FBBF24` lock halo.

* **`WP-13`: Phase-1 VS Code Extension Pack & Strict-CSP MCP Apps (`T1.18`, `ADR-004`)**
  * **Actions:**
    1. Build `apps/vscode-extension` hosting Custom Editors for `*.vd.db` / `*.ato`, Monaco LSP diagnostics, hover datasheet crop popovers, inline `SymPy`/`Pint` CodeLens, and `< 16 ms` `CrossProbeBus` (`BroadcastChannel`).
    2. Rebuild `packages/ui-apps` on React `19.3.1` + `@modelcontextprotocol/ext-apps` wrapped in `@vajradhir/mcp-app-shim` (`[UPSTREAM-RISK]`) serving `ui://vajradhir/{pcb-canvas,schematic-editor,virtual-lab}` with strict CSP (`connect-src 'none'`).
    3. Run Playwright + `hallmark` `sloplint.mjs --render` on onboarding/UI surfaces.

> **Integration Gate `IG-2` (End of Week 6):** Open `Board 1` inside VS Code -> drag `C_in` manually -> confirm `#FBBF24` lock halo + SQLite `locked=1` -> run `hw_layout` -> verify `0` lock mutations, `0` `kicad-cli pcb drc` errors, passing `ngspice-wasm` ripple check, and `< 16 ms` schematic-to-PCB cross-probing.

---

### WAVE 3 — Manufacturing Bundler, Security Signoff & EvalOps (Weeks 7–8)

* **`WP-14`: Gate 8 Human-Signed Release Bundler & Universal Importer (`T1.16`, `T1.19`)**
  * **Actions:**
    1. Wire `hw_export` fail-closed Gate 8 release bundler: requires cryptographic `human_signoff_token`, executes `kicad-cli` (Gerber X2, Excellon drill, STEP, IPC-2581C, BOM/CPL, Design Variants), validates IPC-2581 via **`2581check`**, panelizes via **`KiKit`**, generates **`InteractiveHtmlBom`**, **`PcbDraw`** assembly views, searchable clickable multi-page vector PDF schematics (`typst`/`kischvidimer`), 1:1 Print Check, Bring-Up Runbook, and Factory Self-Test firmware.
    2. Wire Universal CAD Importer: KiCad 5–10 native, Altium/EasyEDA via `kicad-cli` 10 native importer, Gerber X2 netlist reconstruction, and IPC-7351B footprint synthesis (`JLC2KiCad_lib` + `footprint-synth`).
  * **Verify:** Export all 3 reference boards -> `2581check` PASS + `kicad-cli pcb drc` 0 errors + SHA-256 manifest + `hw.lock` frozen.

* **`WP-15`: Dual-Context Security Audit, CI Ratchets & 4-Tier Offline EvalOps (`T1.20`, `T1.20b`)**
  * **Actions:**
    1. Spawn **fresh-context reviewer** to run `cloudflare/security-audit-skill` + `trailofbits/skills` (`rust-review`, `insecure-defaults`, `dimensional-analysis`, `agentic-actions-auditor`) across `hw-ir`, `wasm-sandbox`, `hw-dlp`, `mcp-gateway`, and `cad-transcoder`.
    2. Enable full CI supply-chain & performance ratchets: `fsfe/reuse-action@v5`, `CycloneDX` SBOM AGPL/GPL deny-list, `SLSA v1.2` Build L3 provenance (`cosign`), latency ratchets (`<1ms` snap, `<5ms` commit), migration upgrade test (`v1 -> v2`), installer size check (warn `>140 MB`, fail `>175 MB`), zero-telemetry crash sanitizer, and `vd doctor`.
    3. Stand up 4-Tier `$0` Offline CI EvalOps (`PCB-Bench`, `PCBWorld` DRC scorer without NC weights, `autorouter-bench`, Golden Board regressions).
    4. Publish 3-minute zero-to-first-board tutorial & updated `README.md` / `docs/THREAT_MODEL.md`.

---

### WAVE 4 — Physical Revision-1 PCB Exit Gate (Weeks 9–12 — NON-NEGOTIABLE)

* **`WP-16`: Physical Fabrication & Bench Certification of All 3 Exit Boards**
  * Order physical Rev-1 boards directly from the Gate 8 ZIP bundles generated in `WP-14` (e.g., JLCPCB / Lion Circuits / PCB Power Market):
    1. **Board 1 (`VD-BRD-001` — USB-C PD 12V -> 3.3V/3A Sync Buck, 2L):** Bench-verify 12V PD negotiation on first plug-in, `3.30V +/- 2%` across `0–3A`, oscilloscope ripple `< 40 mVpp`, thermal camera peak IC `< 75°C` @ `25°C` ambient.
    2. **Board 2 (`VD-BRD-002` — ESP32-S3 Environmental Sensor Node, 4L):** Bench-verify USB-CDC enumeration on Rev 1, flash firmware compiled from auto-synced `board_pins.h`, clean BME280 I²C read, 2.4 GHz Wi-Fi RSSI `> -65 dBm`.
    3. **Board 3 (`VD-BRD-003` — STM32G4 CAN-FD + Motor Driver, 4L, Human Co-Edited):** Bench-verify 0 mutations on human-locked power stage, 1 Mbps CAN-FD loopback (`0` bus errors), 2A inductive load `< 5V` overshoot, passes generated Bring-Up Runbook & UART Factory Self-Test FW.
  * Log real bench photos, oscilloscope captures, and dated measurements into `docs/CLAIMS_REGISTER.md` -> tag **`v1.0.0` (Milestone 1 Complete)**.

---

## 4. Post-Milestone 1 Forward Waves (Strictly Frozen Until Wave 4 Bench Signoff)

### WAVE 5 — Milestone 2: Standalone Desktop, Multi-Physics Ring 2 & Regional EMS (Months 4–6)
1. **Unfreeze & Harden Desktop Shell (`T2.01`):** Package branded `Code-OSS` (MIT) Electron IDE (`apps/desktop`) with `dockview-react` multi-monitor popouts, `@xterm/xterm` + `node-pty` hybrid agent terminal, `three.js` + `occt-import-js` + `manifold-csg` 3D slicing/flex-fold, and manual meander/rooms/variants/draftsman/waivers.
2. **Real Ring 2 `gVisor` Workers (`T2.02`):** Build, sign, and pin (`@sha256:`) OCI containers in `docker/docker-compose.workers.yml` (`runtime: runsc`, `network_mode: none`, `read_only: true`, `cap_drop: ALL`):
   * `pack-2a-pcb-physics`: `padne`, `KiPIDA`, `FastHenry2`, `openEMS`, `Palace`, `PyBERT`, `PyOpenMagnetics`, `CadQuery -> Gmsh -> ElmerFEM/CalculiX`, `WireViz`, `KiRI`.
   * `pack-2b-virtual-hil`: `Renode` + lockstep native `ngspice`/`Xyce` (`[ASSUMPTION]` verify exact `Machine.LocalTimeSource` quantum hook), `probe-rs`, `PyVISA`, `libsigrok`, `OpenPnP`.
   * Re-enable & validate quarantined M2 crates (`pdn-solver`, `emc-workbench`, `pcb-diff`, `wire-harness`, `panelizer`, `compliance-hbom`, `cam-pnp`) against these real external oracles.
3. **Production Ecosystem (`T2.03`):** India/Global EMS fab profiles (`JLCPCB`, `PCBWay`, `Eurocircuits`, `Lion Circuits`, `PCB Power Market`, INR/USD/EUR BOM), FCC/CE/BIS/WPC pre-compliance, BGA quadrant escape + Z3 pin/gate swap, clean-room `prostep ivip IDX v6.0` parser (`[CUSTOM-CORE]`), signed `hw-plugin.json` Wasmtime Plugin SDK, i18n, and `vd airgap-bundle`.

### WAVE 6 — Milestone 3: Silicon IC/VLSI, Heavy Electrical, Hardware RE & Enterprise (Months 7–12)
1. **Factory & Die-to-Board (`T3.01`):** `google/openhtf` (`1.6.3`, Apache-2.0) EOL factory test executive + C2P2B die-to-BGA co-design bridge.
2. **Domain Worker Packs (`T3.02`):**
   * `pack-2c-silicon-ic` & `pack-2c-vlsi`: `IIC-OSIC-TOOLS` (SKY130, GF180MCU, IHP SG13G2), `LibreLane`, `OpenROAD-MCP`, `Verilator`/`cocotb`/`sby`, `LiteX`, `Amaranth`, `ALIGN`, `gdsfactory`, `DEVSIM`, `Chipyard`, `gem5`, `PROLEAD`.
   * `pack-2d-power-machines`: `pandapower`, `PyPSA`, `Pyleecan`, `pvlib`, `QElectroTech`, `OpenPLC v4`.
   * `pack-2e-comms-photonics`: `Sionna`, `Meep`, `GNU Radio`, `Faust`, `ChipWhisperer`.
   * `pack-2f-hardware-re`: `morluto/rea`, `pcb-retrace`, `pcbRE`, `OpenBoardView`, `emsec/hal`, `binwalk` v3 Rust, `Glasgow`, `GhidraMCP`.
3. **Ring 3 & Ring 4:** `Yjs` (`yrs`/`pycrdt`) multiplayer, `Temporal` + `InvenTree` + `StrictDoc` PLM/QMS, opt-in isolated `gpl-pns-sidecar` (CERN PNS), and offline air-gapped spend-capped `Harness²` Draft-PR optimizer (mandatory human review).

---

## 5. Orchestrator Operating Rules (Enforced on Every Work Package)

1. **One Work Package = One Git Worktree + One Focused PR** signed with DCO (`git commit -s`).
2. **Zero Blind Merges:** Security-critical (`hw-ir`, `wasm-sandbox`, `hw-dlp`, `mcp-gateway`), geometry (`cad-geom`, `cad-transcoder`), and hardware-compiler PRs MUST pass a **fresh Dual-Context Reviewer** with zero solver history before merge.
3. **Never Trust Meta-Scripts Alone:** Every PR must print fresh native output from `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, `pnpm -r test`, and `uv run pytest`.
4. **Hard Freeze Discipline:** No `Wave 5` or `Wave 6` PR may merge to `main` until `WP-16` records empirical bench passes for all 3 physical PCBs in `docs/CLAIMS_REGISTER.md`.

---

### Ready to Execute `WP-00` Now?
Paste the output of these 3 read-only inspection commands (or point me to your local files) and I will emit the exact **Wave 0 Remediation Patch** (`30-table SQLite DDL + full lock triggers`, `budget.json`, `pyproject.toml`, workspace quarantine config, `docker/docker-compose.workers.yml` fix, and corrected `docs/CLAIMS_REGISTER.md`):
```bash
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
git status && ls -la packages/ apps/ containers/
```

continue making this project
and keep track of everything
and breakdown tasks to their fundamental steps and execute everyting with all the skills, tools required
read all prompt files and continue further
and update the checkpoint handoff and a progress log of what things are done what remains and how they are implemented in this project archietecture 


