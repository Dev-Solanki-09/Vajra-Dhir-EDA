# FINDINGS — Root-Cause & Evidence Log

Orchestrator-maintained. Workers append root causes here on BLOCKER (3-failed-fix rule). Never delete entries; supersede with dates.

## 2026-11-24 — Orchestrator baseline audit (pre-Wave-0)

### F-01 · Missing lockfiles (VERIFIED at HEAD 1c157d4)
`pnpm-lock.yaml`, `Cargo.lock`, `uv.lock` absent. External audit (`prompt-and-skills/vd-github-skill/report.txt`) generated a pnpm lockfile locally; it was never committed. Frozen installs impossible → CI cannot be deterministic. Owner: T-01.

### F-02 · Action pins unenforced (VERIFIED)
`.github/workflows/actions.lock` maps tags→SHAs but no workflow step enforces it; workflows use `actions/checkout@v4`, `setup-node@v4`, `dtolnay/rust-toolchain@master` (tag pins). Audit reported two lock SHAs (setup-node, rust-toolchain) that do not exist upstream — lock entries must be re-verified against upstream, not trusted. Owner: T-02.

### F-03 · CI coverage gaps (VERIFIED)
- `ci-spec-integrity.yml` step 3 "Validate JSON Schemas" = `json.loads` only (syntax ≠ schema validation).
- No Node build/test job, no Python job anywhere in CI.
- `ci-license-evalops.yml` has cargo clippy/test but `toolchain: stable` (unpinned) and no `permissions:` block.
Owner: T-02.

### F-04 · Failing gate + GitHub startup_failure (REPORTED, undiagnosed)
- Audit: 63/64 local gates; failure = "Signed Open-CUBOs and Atopile compiler bridge" test. Root cause unknown. Owner: T-01.
- Both GitHub workflows at baseline `88b58bf`: `startup_failure`, zero jobs (runs 45362084138, 45362081793). Audit guess: repo Actions policy (e.g., require full-SHA pinning) — UNCONFIRMED; needs admin/settings access. Owner: Wave 0.2 + user.

### F-05 · Protocol mirror drift (from spec analysis; verify in code at T-03)
TS `HardwarePatchOp` omits `UPSERT_ENTITY` present in Rust enum; `hw_patch` actor enum lacks `import` despite provenance enum including it. Owner: T-03.

### F-06 · Merge driver naming drift
`.gitattributes` references `vd-merge`; package is `hw-merge`. Verify actual registered driver name at T-03. Owner: T-03.

### F-07 · FG-05 range/message mismatch
Footgun message says 900–11000; check enforces [1k, 10k]. Canonical range must be decided from spec intent, then both sides aligned + boundary tests. Owner: T-03.

### F-08 · Via-drop FSM bug
`manualEditorFsm.ts` via-drop dispatches `SET_LOCK` instead of a geometry op. Verify in shipped GUI code (spec artifact may differ from implementation). Owner: T-04.

### F-09 · Annealer & trace-width defects
`CostWeights` omits `w_cong` used in energy formula; trace-width code labeled IPC-2152 uses IPC-2221 constants (k=0.048, exp 0.725). Verify in shipped code. Owner: T-04.

### F-10 · Structural gates advertised as behavioral
`scripts/verify-all.mjs` contains source-string/structure checks counted as "verified gates" (repo profile explicitly warns). Full classification pending Wave 0.3. Owner: T-05.

### F-11 · Stale archive artifacts (reference-only hazard)
- `prompt-and-skills/prompt-2.txt` pins wasmtime 30.0 / React ^19.0.0 — banned by current CVE floor. NEVER execute from it.
- `project-overview-4.txt` §5.2/§8 claims "nothing built, start T1.01" — obsolete; repo has 5 commits / 546+ files.
- `checkpoint_handoff.md` "64/64 100% Certified" is a local harness claim contradicted by external audit (63/64, CI startup_failure). Treat archive status claims as historical, not current.

### F-12 · Claims register evidence gaps (to verify at T-06)
CLM-004/005 cite bench files (`benches/spatial_index.rs`, `tests/boolean_invariants.rs`) — existence unverified. CLM-008/009 board performance claims are software-pipeline results; must stay labeled software-only (0/3 fabricated). CVE claims CLM-002/003 cite advisories without URLs — add primary sources + re-verification dates.

### F-13 · Daemon crashes on Windows — FIXED, MERGED (T-01 @ 5964a8f, 2026-11-24)
`packages/vd-daemon/src/daemon.py:1691` printed "Vajra-Dhīr" (U+012B) to a cp1252 console → `UnicodeEncodeError`, exit 1 after binding; failed 5 gates via connection-refused. Fix: `_ensure_utf8_console()` (hasattr-guarded UTF-8 `errors="replace"` reconfigure); regression gate launches daemon under `PYTHONIOENCODING=cp1252`. Orchestrator fresh harness: 64/64 exit 0. CLOSED.

### F-14 · Board-1 report carried a FORGED human signoff token — CORRECTED & FIXED (T-01)
Original diagnosis ("token missing") was WRONG — it read the dirty F-18 tree. Committed HEAD (`1c157d4`) contained `human_signoff_token: "a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0"` + `signoff_actor: "human:lead_hardware_engineer"` + `all_gates_passed: true`. **Gate 8 was passing on a fabricated human signoff** — a direct violation of the fail-closed invariant, worse than diagnosed. T-01 removed it: `human_signoff.status=PENDING`, `release_authorized=false`, `release_status=NOT_RELEASED_PENDING_HUMAN_SIGNOFF`; `all_gates_passed` renamed `all_software_gates_passed`. Dual-context review confirmed the new gate rejects signed-without-token, short tokens, and contradictory flags, with a self-test. CLOSED (residual issue → F-19).

### F-15 · Host toolchain gaps — UPDATED (2026-11-24)
pnpm 10.6.0 now provisioned (T-01); pnpm-lock.yaml + uv.lock committed and frozen-install verified (exit 0). Node v24.19.0 (floor 26.13.1) and typescript 5.9.3 (floor 7.0.2) remain below floor — upstream availability CONFIRMED (F-17), so this is a manifest/host defect, owner T-08 + user host upgrade. cargo/rustc still absent → T-03 provisions or BLOCKERs.

### F-16 · Cold-start races in daemon-launching gates — FIXED (T-01)
All fixed `time.sleep(1.2)` calls replaced with `/api/v1/health` polling (15s cap, 100ms interval, early-exit detection surfacing daemon stderr; raises on timeout — dual-context verified no silent-pass path). CLOSED.

## Wave 0 results (2026-11-24, host Windows, HEAD 1c157d4)

Full harness `node scripts/verify-all.mjs`: **58 PASS / 6 FAIL, exit 1**. The "64/64 certified" claim is FALSE at HEAD on this host.

| Failed gate | Script | Root cause |
|---|---|---|
| CAM/RELEASE Gate 8 | test-gate8-release.py | F-14 missing token field |
| DAEMON/API | test-daemon-api.py | F-13 daemon Unicode crash |
| GUI/DOCK | test-dockview-and-brain.py | F-13 |
| SCH/LIB | test-schematic-and-library.py | F-13 |
| 3D/LAB | test-v004-cad-and-lab.py | F-13 |
| MFG/DIFF | test-v004-mfg-and-harness.py | F-13 + F-16 |

Note: the audit-host's failing CUBO/atopile gate PASSES here — failure sets are environment-dependent. Gate classification (Wave 0.3) delegated to T-05. GitHub CI state check (0.2) delegated to T-02.

### F-17 · T-02 audit verdict: RETURNED with false claims corrected (2026-11-24)
Gemini's T-02 (commit 6d09fb3, NOT merged) audited. Good: 40-char SHA pins verified authentic via `git ls-remote` (setup-node v4.2.0 = 1d0ff469…, rust-toolchain master = df2a88e9…); `check-actions-lock.mjs` passes fresh (exit 0). Defects:
1. **False startup_failure root cause.** Bare `pull_request:` null is valid GitHub YAML; missing workflow_dispatch and actions.lock contents cannot cause zero-job startup_failure. No gh evidence produced. Corrected in T-02b ticket; T-07 handoff §Exec-Summary repeats the same false claim — this entry is the authoritative correction.
2. **Node 26.13.1 EXISTS** — nodejs.org/dist index: v26.13.1, 2026-11-10, LTS "Lithium", security release. Also **typescript 7.0.2 IS npm latest** and react 19.3.1 is latest (npm view, 2026-11-24). Therefore NO constitutional floor revision is needed; the repo manifests (TS 5.9.3, host Node 24.19.0) are the defect. Gemini's unauthorized downgrade to Node 22 reverted via T-02b. Host Node upgrade to 26.13.1 = user action.
3. Required Node/Python build-test jobs absent; schema step is pseudo-validation (`json.loads` + string asserts, no jsonschema); `toolchain: stable` unpinned without recorded deviation; T-02 executed while QUEUED (process violation).
Remediation: `.ai-sync/tickets/T-02b-gemini.md`. T-07 audit handoff itself ACCEPTED and cherry-picked to main as 1639a03.

### F-18 · Unattributed v0.0.5 work in main checkout — QUARANTINED → STASHED (2026-11-24)
Main working tree carried uncommitted v0.0.5 work (4 GUI components: DftTestpointInspector/FabricationDraftsman/PrintCheckDialog/VariantsManager, `scripts/test-v005-draftsman-and-dft.py`, daemon.py +315 lines, verify-all.mjs classify() refactor, autorouter edits, command-bus additions, report JSON edits, AGENTS.md "Qwen 4 Max" law block). **Attribution:** DeepSeek timestamps (files written 07:25–08:48, before its session) + content match ⇒ pre-bus partial work of a stopped Qoder subagent, superseded. **Action taken:** evacuated to `stash@{0}` ("F-18 quarantine…") so T-01 could merge; nothing deleted. **Merge-order hazard:** the stash's daemon.py +315 lines conflict with T-01's fix — if ever revived, reconcile against `f4caaf2`, never apply blind. Do not merge without user ruling.

### F-19 · Fabricated evidence hashes remain in board-1 verification report — NEW (dual-context audit, 2026-11-24)
`designs/board-1-buck-pd/verification_report.json` gate evidence fields are forged: G2 `evidence_hash` (line ~31) is byte-identical to the removed fake signoff token `a1b2c3d4…cdef0`; G3–G8 hashes are sequential rotations of the same string; G1 is SHA-256 of empty input. Predates T-01 (unchanged in its diff); Gate 8 never validates them. Owner: T-06 (claims truth) — replace with real computed hashes or explicit `null` + PENDING semantics; T-05 — gate should reject known-fabricated hash patterns. Also from the same review: contradiction check in test-gate8-release.py is one-directional and a whitespace-only ≥32-char token would pass — harden in T-05.

### F-20 · Standing UUIDv7 invariant violation in autorouter — NEW (T-01 handoff observation)
`packages/autorouter/src/lib.rs` uses `uuid::Uuid::new_v4()` at committed HEAD, violating AGENTS.md invariant 1 (all entity IDs immutable UUIDv7). Pre-existing. Owner: T-04 (CAD defects) — swap to UUIDv7 (uuid crate `now_v7` feature) + regression test asserting version nibble = 7.