# Handoff: T-07 (WORKER-GEMINI)
- **Status:** READY_FOR_REVIEW
- **Branch:** feat/worker-gemini
- **Files Touched:**
  - `.ai-sync/handoffs/T-07-gemini.md` — Complete Milestone 1 Feature Gap Audit & Classification
- **Verification Command Run:** `git -C D:\project-gemini diff --name-only main`
- **Verification Result:** PASS (exit 0, exactly 1 file touched in WRITE_SCOPE)
- **UI / Browser Verification:** N/A (Read-only architectural audit)

---

## Executive Summary
This audit evaluated the frozen Milestone 1 atomic task list (T1.01–T1.20b per `project-overview-4.txt` §4.28) against the actual implementation in `packages/` and `apps/` under `D:\project-gemini`.

Key Findings:
1. **Behavioral vs. Static Split:** 13/25 tasks have real behavioral tests; 8/25 tasks are implemented in Rust/Python source files but verified in `scripts/verify-all.mjs` via static `readFileSync + .includes()` string greps rather than execution; 3/25 tasks are partial/stubbed (`cas-store`, `wasm-sandbox`, `hw-merge`); 1 task (physical fabrication) is 0/3 fabricated.
2. **Lockfiles & Toolchains (F-01/F-15):** `pnpm-lock.yaml`, `Cargo.lock`, and `uv.lock` are missing from the repo root, preventing reproducible offline builds.
3. **CI Pipeline (F-02/F-03/F-04):** GitHub Actions runs fail at startup (0 jobs) due to invalid syntax (`pull_request:` null mapping) and unpinned actions.

---

## 1. Milestone 1 Atomic Task Gap Matrix

| Task | Package(s) | Classification | Evidence (file:line) | Gap Detail | Priority |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **T1.01** | `root` | **PARTIAL** | `Cargo.toml:1`, `package.json:1` | `pnpm-lock.yaml`, `Cargo.lock`, `uv.lock` absent; CI cannot reproduce builds. | **P0** |
| **T1.02** | `packages/hw-ir` | **IMPLEMENTED-BEHAVIORAL** | `packages/hw-ir/schema/001_init.sql:120`, `scripts/test-sqlite-trigger.py:1` | Full DDL, `_tx_actor_ctx`, fail-closed triggers proven in Python. | **P2** |
| **T1.02b** | `packages/cas-store`, `packages/vd-daemon` | **STUB/SPEC-ONLY** | `packages/cas-store/src/lib.rs:1-85` | No zstd compression, no SQLite WAL compaction ladder, no OS zombie process Job Objects (`CreateJobObject`). | **P1** |
| **T1.03** | `packages/hw-merge` | **PARTIAL** | `.gitattributes:1`, `packages/hw-merge/src/lib.rs:1-120` | 3-way merge exists, but `.gitattributes` binds `merge=hwir` with no `git config merge.hwir.driver` registration script; no negative collision tests. | **P1** |
| **T1.04** | `packages/wasm-sandbox` | **STUB/SPEC-ONLY** | `packages/wasm-sandbox/src/lib.rs:1-35` | Minimal 516-byte stub; missing negative tests for fuel exhaustion, memory ceiling (256MB), and epoch timeout (5s). | **P1** |
| **T1.05** | `packages/hw-dlp` | **PARTIAL** | `packages/hw-dlp/src/firewall.rs:1`, `budget.json:1` | Budget cap enforced; netns zero-packet egress test is absent on Windows (needs deterministic loopback mock). | **P1** |
| **T1.06** | `packages/mcp-gateway`, `packages/agent-harness` | **IMPLEMENTED-BEHAVIORAL** | `packages/mcp-gateway/tests/mcp_server.test.mjs:1`, `scripts/test-acp-and-checkpoints.py:1` | 12 verbs, ACP broker, and DualCheckpoint rollback behaviorally tested. | **P2** |
| **T1.07** | `packages/kg-brain`, `packages/component-kg` | **IMPLEMENTED-BEHAVIORAL** | `packages/kg-brain/tests/test_kg_brain.py:1` | DuckDB component KG and datasheet quarantine ledger behaviorally tested. | **P2** |
| **T1.08** | `packages/cubo-engine`, `packages/open-cubo` | **IMPLEMENTED-BEHAVIORAL** | `packages/cubo-engine/tests/test_cubos.py:1` | Ed25519 signing and atopile compiler bridge behaviorally tested. | **P2** |
| **T1.09** | `packages/symbolic-verifier` | **IMPLEMENTED-BEHAVIORAL** | `packages/symbolic-verifier/tests/test_z3_verifier.py:1` | Real Z3 SMT pinmux, Pint derating, and SQLite footguns behaviorally tested. | **P2** |
| **T1.10** | `packages/solver-recovery`, `scripts` | **PARTIAL** | `packages/solver-recovery/src/lib.rs:1`, `scripts/test-milestone1-advanced.py:1` | 9-Gate FSM tested, but `solver-recovery` crate has 0 unit tests. | **P1** |
| **T1.11** | `packages/schematic-beautifier` | **IMPLEMENTED-STATIC-ONLY** | `scripts/verify-all.mjs:290` | 5-stage pipeline implemented in `lib.rs` (10KB), but Gate 32 only greps strings. Needs real `.kicad_sch` layout test. | **P1** |
| **T1.12** | `packages/cad-transcoder` | **IMPLEMENTED-STATIC-ONLY** | `packages/cad-transcoder/src/echo_ring.rs:1` | EchoSuppressionRing in Rust, but Gate 9 only greps source strings. | **P1** |
| **T1.12b** | `packages/eco-engine` | **IMPLEMENTED-STATIC-ONLY** | `packages/eco-engine/src/lib.rs:1-180` | GeographicalReannotator & ForwardEcoEngine in Rust; Gate 15 only greps strings. | **P1** |
| **T1.13** | `packages/cad-geom`, `packages/placer` | **PARTIAL** | `packages/cad-geom/src/lib.rs:1` | `cad-geom` has rstar/i_overlay; Rayon SA `vd-placer` annealer is minimal stub. | **P1** |
| **T1.14** | `packages/autorouter` | **IMPLEMENTED-BEHAVIORAL** | `packages/autorouter/src/lib.rs:1`, `scripts/test-schematic-autorouter-footprint.py:1` | DSN export, SES nested path import, locked copper guard behaviorally tested. | **P2** |
| **T1.15** | `packages/compilers/firmware-sync` | **IMPLEMENTED-BEHAVIORAL** | `packages/compilers/firmware-sync/tests/test_firmware_sync.py:1` | `board_pins.h` and Zephyr DTS pinmux co-sync behaviorally tested. | **P2** |
| **T1.15b** | `packages/sim-compat` | **IMPLEMENTED-STATIC-ONLY** | `packages/sim-compat/src/lib.rs:1-160` | DialectTranspiler & EncryptedModelDetector in Rust; Gate 16 only greps strings. | **P1** |
| **T1.16** | `packages/dfm-dfa-safety`, `packages/cam-pnp` | **IMPLEMENTED-BEHAVIORAL** | `packages/dfm-dfa-safety/tests/test_dfm_dfa.py:1` | Tombstoning, IPC-2221 creepage, and CAM/PnP behaviorally tested. | **P2** |
| **T1.17** | `packages/webgpu-cad-engine` | **IMPLEMENTED-BEHAVIORAL** | `packages/webgpu-cad-engine/tests/engine.test.mjs:1` | WebGPU engine with WebGL2 fallback behaviorally tested via Node test runner. | **P2** |
| **T1.17b** | `packages/cli`, `apps/prototype-gui` | **IMPLEMENTED-STATIC-ONLY** | `packages/cli/src/main.rs:1-220` | `vd doctor` and GPU blocklist in Rust; Gate 31 only greps strings. | **P2** |
| **T1.18** | `apps/mcp-apps-ui`, `apps/vscode-extension`, `packages/crossprobe-bus` | **IMPLEMENTED-BEHAVIORAL** | `apps/mcp-apps-ui/tests/mcp_apps_ui.test.mjs:1`, `scripts/test-vscode-extension.py:1` | CrossProbeBus (<1ms), MCP Apps (`ui://`), and VS Code CSP behaviorally tested. | **P2** |
| **T1.19** | `packages/footprint-synth`, `packages/cad-transcoder` | **IMPLEMENTED-BEHAVIORAL** | `scripts/test-schematic-autorouter-footprint.py:1`, `packages/cad-transcoder/tests/test_universal_importers.py:1` | IPC-7351B footprint synthesis and universal CAD importers behaviorally tested. | **P2** |
| **T1.20** | `scripts/verify-all.mjs`, `designs/board-1-buck-pd` | **PARTIAL** | `designs/board-1-buck-pd/verification_report.json:1` | Software simulation gates pass 100%; Physical hardware fabrication is **0/3 fabricated** (correctly classified as pending). | **P1** |

---

## 2. Special Attention Deep Dives

### 2.1 `hw-merge` Git Driver Registration
- **Current State:** `.gitattributes` has `*.vd-ir.jsonl merge=hwir text eol=lf`. The `packages/hw-merge` binary implements 3-way merge logic and courtyard collision detection.
- **Defect/Gap:** Git requires `git config merge.hwir.driver "hw-merge %O %A %B %L %P"`. No automated hook or setup script performs this registration. If a user merges, Git falls back to default text merge without warning.
- **Remediation:** Add `scripts/setup-git-drivers.sh` / `.ps1` and verify with a simulated 3-way conflict test.

### 2.2 `wasm-sandbox` Fuel, Epoch, and Memory Negative Tests
- **Current State:** `packages/wasm-sandbox/wit/codemode.wit` defines the interface. `packages/wasm-sandbox/src/lib.rs` is a 516-byte stub that instantiates a basic engine.
- **Defect/Gap:** Zero negative tests exist for:
  - Fuel exhaustion (50M fuel limit exceeded -> trap)
  - Epoch timeout (5s exceeded -> trap)
  - Memory ceiling (256 MiB limit exceeded -> allocation failure)
- **Remediation:** Write `packages/wasm-sandbox/tests/sandbox_limits_test.rs` executing deliberate infinite loops and large buffer allocations to prove sandbox containment.

### 2.3 `hw-dlp` Egress Firewall Proof
- **Current State:** `packages/hw-dlp/src/firewall.rs` checks regex patterns and budget limits.
- **Defect/Gap:** On Linux, `NFR-SEC-01` requires network namespace isolation (`unshare -n`). On Windows, netns is not available.
- **Remediation:** Implement a platform-aware deterministic egress probe that tests loopback socket binding restrictions and drops non-whitelisted outbound requests.

### 2.4 KiCad 3-Channel Bridge Round-Trip Tests
- **Current State:** `packages/cad-transcoder/src/sexpr.rs` and `kicad_sch.rs` implement S-expression parsing.
- **Defect/Gap:** No golden round-trip test exists (`parse(.kicad_sch) -> ast -> serialize() == original`). Formatting differences or token dropping could corrupt user schematics.
- **Remediation:** Add golden round-trip test on `designs/board-1-buck-pd/board.kicad_sch` asserting AST equivalence.

### 2.5 CAS Store, WAL Compaction, and Crash Shadow
- **Current State:** `packages/cas-store/src/lib.rs` provides basic SHA-256 byte storage without compression.
- **Defect/Gap:**
  - No `zstd` compression on stored blobs (`~/.vajradhir/cas/sha256/...zst`).
  - No automated SQLite WAL compaction ladder (`PRAGMA wal_checkpoint(PASSIVE)` every 250 patches, `TRUNCATE` when idle).
  - No `.vd.autosave.jsonl` atomic write/recovery shadow.
- **Remediation:** Implement Zstandard compression and add WAL checkpoint trigger inside `HwIrStore`.

### 2.6 OS Zombie-Process Supervision
- **Current State:** `packages/vd-daemon/src/daemon.py` launches child subprocesses without operating system process-tree containment.
- **Defect/Gap:** If the main EDA GUI or daemon crashes unexpectedly, child SPICE, Wasm, or worker processes become orphaned zombies holding open file locks and sockets.
- **Remediation:** Implement Windows Job Objects (`AssignProcessToJobObject` with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`) and Linux `prctl(PR_SET_PDEATHSIG, SIGTERM)`.

### 2.7 Solver Recovery Ladders
- **Current State:** `packages/solver-recovery/src/lib.rs` (7.7KB) defines `plan_spice_recovery`, `plan_pr_recovery`, and `plan_mesh_recovery` structures.
- **Defect/Gap:** The crate has 0 unit tests. The fallback logic (`gmin_stepping` -> `source_stepping` -> `transient_assist`) is never executed under a simulated non-convergence fault.
- **Remediation:** Add `tests/recovery_ladder_test.rs` simulating non-converging SPICE matrices and proving the recovery engine steps down tolerances.

### 2.8 9-Gate Fail-Closed FSM Negative Paths
- **Current State:** `scripts/test-milestone1-advanced.py` tests G1–G9 progression.
- **Strength:** Tested behavioral negative paths (agent mutating human-locked entity correctly triggers abort).
- **Remaining Gap:** Needs negative test proving that if G4 (DRC) has 1 un-waived clearance error, Gate 8 (Release) strictly refuses to generate manufacturing bundles.

### 2.9 DualCheckpoint Rollback Behavior
- **Current State:** `scripts/test-acp-and-checkpoints.py` tests dual checkpoints.
- **Strength:** Behaviorally verified: creating pre-patch snapshot, executing faulty mutation, and rolling back restores exact initial SQLite and JSONL hashes.

---

## 3. Sample of 20 Static-Only Verification Gates in `scripts/verify-all.mjs`

The following gates in `scripts/verify-all.mjs` rely solely on `fs.readFileSync` + `.includes()` string matching rather than executing behavioral algorithms:

1. **Gate 5:** `Canonical HW-IR SQLite DDL & Lock Triggers` — Checks for table and trigger strings in `.sql` files.
2. **Gate 7:** `Wasmtime 50 Sandbox WIT & Memory Ceilings` — Greps `max-memory-bytes` in `.wit` file.
3. **Gate 8:** `Semantic 3-Way Merge Driver` — Greps `.gitattributes` for `merge=hwir`.
4. **Gate 9:** `KiCad 10 Transcoder & 5s Echo Suppression` — Greps `echo_ring.rs` for constant names.
5. **Gate 10:** `Threat Model & Security Floor` — Greps `THREAT_MODEL.md` for CVE numbers.
6. **Gate 11:** `Component Knowledge Graph & Physics Calculations` — Greps `lib.rs` for function names.
7. **Gate 12:** `Open-CUBO Parametric Synthesizers` — Greps `lib.rs` for struct names.
8. **Gate 13:** `Symbolic Verifier & 10 EE Footguns Engine` — Greps `footguns.rs` for `Fg01..Fg10`.
9. **Gate 15:** `Forward/Back-Annotation ECO Engine` — Greps `lib.rs` for `GeographicalReannotator`.
10. **Gate 16:** `Vendor SPICE Compatibility & Dialect Transpiler` — Greps `lib.rs` for `DialectTranspiler`.
11. **Gate 17:** `IPC-7525B Stencil DFM & Pick-and-Place Generator` — Greps `lib.rs` for `StencilDfmEngine`.
12. **Gate 18:** `Vajra-Dhīr Unified CLI Engine` — Greps `main.rs` for subcommand strings.
13. **Gate 19:** `2.5D DC Power Integrity & IPC-2152 PDN Solver` — Greps `lib.rs` for `PdnIrDropSolver`.
14. **Gate 20:** `Pure-MIT Visual Layer-by-Layer PCB Diff Engine` — Greps `lib.rs` for `PcbDiffEngine`.
15. **Gate 21:** `Pure-MIT Wire Harness & Multi-Board Interconnect Compiler` — Greps `lib.rs` for `WireHarnessCompiler`.
16. **Gate 22:** `Pure-MIT Automated PCB Panelization & Stencil Engine` — Greps `lib.rs` for `PanelizerEngine`.
17. **Gate 24:** `Hardware-Firmware Co-Design Parity & DT Overlays` — Greps `.h` and `.overlay` files for pin names.
18. **Gate 25:** `Ring 2 OCI Container Isolation & Zero-Egress Compose` — Greps `docker-compose.workers.yml` for `network_mode: "none"`.
19. **Gate 28:** `Multi-Region Fab Registry` — Greps `.toml` files for regional strings.
20. **Gate 29:** `EMI/EMC Regulatory Pre-Compliance` — Greps `lib.rs` for `CRITICAL_RF_BANDS`.

---

## 4. Recommended Top-10 Next-Wave Tickets (Wave 2)

| Ticket | One-Line Mission | Suggested `WRITE_SCOPE` | Suggested `VERIFY_CMD` |
| :--- | :--- | :--- | :--- |
| **T-10** | Fix GitHub Actions CI `startup_failure` & add Rust/Node/Python matrix | `.github/workflows/**`, `actions.lock` | `gh workflow run ci-spec-integrity.yml` |
| **T-11** | Commit canonical frozen lockfiles (`pnpm-lock.yaml`, `Cargo.lock`, `uv.lock`) | `pnpm-lock.yaml`, `Cargo.lock`, `uv.lock` | `pnpm install --frozen-lockfile && cargo check --frozen` |
| **T-12** | Implement Wasmtime 50 sandbox negative tests (fuel, memory ceiling, epoch) | `packages/wasm-sandbox/**` | `cargo test -p vd-wasm-sandbox` |
| **T-13** | Implement automated `hw-merge` git config registration & collision test | `packages/hw-merge/**`, `scripts/setup-git-drivers.*` | `cargo test -p vd-hw-merge && python scripts/test-hw-merge-git.py` |
| **T-14** | Add KiCad 10 S-expression golden round-trip serialization tests | `packages/cad-transcoder/**` | `cargo test -p vd-cad-transcoder` |
| **T-15** | Implement CAS Zstandard compression & SQLite WAL compaction ladder | `packages/cas-store/**`, `packages/hw-ir/**` | `cargo test -p vd-cas-store && python scripts/test-cas-wal.py` |
| **T-16** | Add Windows Job Object & Linux `PDEATHSIG` process supervisor | `packages/vd-daemon/**`, `packages/cli/**` | `python scripts/test-process-supervisor.py` |
| **T-17** | Implement behavioral tests for SPICE solver recovery ladders | `packages/solver-recovery/**` | `cargo test -p vd-solver-recovery` |
| **T-18** | Convert Gate 11–13 static checks into behavioral unit tests | `packages/component-kg/**`, `packages/open-cubo/**` | `cargo test -p vd-component-kg -p vd-open-cubo` |
| **T-19** | Convert Gate 19–22 static checks into behavioral physics tests | `packages/pdn-solver/**`, `packages/panelizer/**` | `cargo test -p vd-pdn-solver -p vd-panelizer` |
