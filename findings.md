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

### F-13 · Daemon crashes on Windows — VERIFIED ROOT CAUSE (Wave 0)
`packages/vd-daemon/src/daemon.py:1691` prints "Vajra-Dhīr" (U+012B) to a cp1252 console → `UnicodeEncodeError`, process exits code 1 immediately after binding. Reproduced on port 41999. `verify-all.mjs` sets no `PYTHONIOENCODING`. This single bug fails 5 gates (DAEMON/API, GUI/DOCK, SCH/LIB, 3D/LAB, MFG/DIFF) via connection-refused. Fix: reconfigure stdout/stderr to UTF-8 at daemon startup + regression test under cp1252. Owner: T-01.

### F-14 · Gate 8 release report lacks human_signoff_token — VERIFIED (Wave 0)
`designs/board-1-buck-pd/verification_report.json` has NO `human_signoff_token` key; `scripts/test-gate8-release.py:25-26` requires it (≥32 chars). Agents MUST NEVER fabricate a human token. Resolution path: align report + test with fail-closed semantics (signoff explicitly pending; release blocked without token; token validated only when human-issued). Escalate to user if a real token is desired. Owner: T-01.

### F-15 · Host toolchain gaps — VERIFIED (Wave 0)
Node v24.19.0 (policy floor 26.13.1 — deviation, verify upstream availability before any pin change), Python 3.14.7, uv 0.12.5 present; **cargo/rustc and pnpm NOT installed**. Rust gates cannot run locally until a worker provisions the toolchain. Owner: T-01 (pnpm), T-03 (rustup attempt; BLOCKER if unavailable).

### F-16 · Cold-start races in daemon-launching gates — VERIFIED (Wave 0)
`test-v004-mfg-and-harness.py:68` uses fixed `time.sleep(1.2)` (the audit fixed this class elsewhere; these scripts were missed). All daemon-launching gate scripts need readiness polling. Owner: T-01.

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