# TASK PLAN — Vajra-Dhīr EDA Orchestrated Completion Program

| Field | Value |
|---|---|
| Document | `VD-PLAN-001` Rev 1.0 |
| Date | 2026-11-24 |
| Orchestrator | Qoder main session (this agent) — plans, dispatches, audits, merges; writes NO product code |
| Baseline | `main` @ `1c157d4` (verified locally) |
| Inputs | Full analysis of `prompt-and-skills/` (27 files), external audit `vd-github-skill/report.txt`, attached multi-agent wave protocol (adapted) |
| Status | WAVE 1 DISPATCHED — orchestrator does no hands-on work; all execution via worker agents |

---

## 1. Objective & Definition of Done

**Goal:** drive Vajra-Dhīr EDA to a genuinely complete, working Milestone 1 software project — not a certified-looking one.

"Complete" is defined as ALL of the following, each evidence-backed:

1. **Reproducible builds:** `pnpm-lock.yaml`, `Cargo.lock`, `uv.lock` committed; frozen installs succeed from clean checkout.
2. **Real toolchain verification:** `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test --workspace` pass; every maintained TS app/package typechecks, builds, and tests; Python suite passes in a locked environment.
3. **Behavioral gates:** every gate in `scripts/verify-all.mjs` either exercises real behavior or is explicitly reclassified as a static contract check backed by a behavioral test. No gate passes solely on a source-string match.
4. **GitHub CI green:** all required workflows pass on GitHub Actions for the exact final commit SHA (local green is necessary, not sufficient). `startup_failure` root cause established and fixed.
5. **Spec–code parity:** known drift defects (Section 3, F-05..F-09) fixed with failing-test-first discipline.
6. **Honest claims:** `docs/CLAIMS_REGISTER.md` entries match real evidence; software-vs-physical distinction preserved; README status accurate.
7. **M1 feature completeness:** gap audit against `T1.01–T1.20` completed; every gap either implemented or explicitly deferred with rationale in this plan.

**Explicitly OUT of scope for agents (human/factory gates):**
- Physical fabrication & bench measurement of the 3 reference boards (0/3 fabricated — stays declared as software blueprints).
- Gate 8 production release / any tag or GitHub Release without explicit human authorization.
- Any `git push`, PR creation, repo settings change without explicit user approval per action.
- Ring 2–4 scope expansion, new planning rounds, architecture re-litigation (frozen per VD-SAD-001 Rev 2.0).

---

## 2. Ground-Truth Baseline (verified 2026-11-24, this session)

| # | Fact | Evidence |
|---|---|---|
| B-1 | HEAD `1c157d4` applied PART of the external audit fixes (dockview version, tsconfigs, requirements-ci.txt, daemon fix, actions.lock edits) | `git show --stat HEAD` |
| B-2 | **No lockfiles committed**: `pnpm-lock.yaml`, `Cargo.lock`, `uv.lock` all absent | `ls` at HEAD |
| B-3 | Workflows use tag pins (`actions/checkout@v4`, `setup-node@v4`, `dtolnay/rust-toolchain@master` + `toolchain: stable`); `actions.lock` exists but is NOT enforced by any step | read both workflow files |
| B-4 | `ci-spec-integrity.yml` "schema validation" is `json.loads` only — not JSON Schema validation | workflow step 3 |
| B-5 | CI has a cargo clippy/test job but NO Node build/test job, NO Python job; `ci-license-evalops.yml` lacks a `permissions:` block | workflow read |
| B-6 | External audit found 63/64 local gates; failing gate = Signed Open-CUBOs / atopile bridge; never diagnosed | `prompt-and-skills/vd-github-skill/report.txt` |
| B-7 | Both GitHub workflows last observed `startup_failure` with zero jobs (at baseline `88b58bf`); root cause unestablished | `vd-github-skill/references/vajra-dhir-repository-profile.md` |
| B-8 | Rust verification never ran on the audit host (no cargo); local Rust state unknown | report.txt |
| B-9 | Full local harness re-run in progress at plan time (Wave 0) | `node scripts/verify-all.mjs` background run |
| B-10 | Archive status docs contradict each other: overview-4 says "nothing built"; checkpoint says "64/64 certified"; audit says 63/64 + CI broken. Current truth = this baseline, not any archive claim | analysis |

---

## 3. Findings Backlog (drives tickets; full detail in `findings.md`)

- **F-01** Missing lockfiles → non-reproducible installs (B-2).
- **F-02** Unenforced/fictional action pins; tag-based workflows (B-3).
- **F-03** CI coverage gaps: no Node/Python jobs, json.loads-only schema check, missing permissions (B-4, B-5).
- **F-04** Failing CUBO/atopile gate undiagnosed (B-6); GitHub `startup_failure` unexplained (B-7).
- **F-05** TS `HardwarePatchOp` omits `UPSERT_ENTITY` present in Rust; `hw_patch` actor enum lacks `import`.
- **F-06** Merge driver naming drift: `vd-merge` in `.gitattributes` vs `hw-merge` package.
- **F-07** FG-05 footgun: message says 900–11000, check enforces [1k, 10k].
- **F-08** Manual editor FSM: via-drop dispatches `SET_LOCK` instead of a geometry op.
- **F-09** Annealer `CostWeights` omits `w_cong` used in the energy formula; trace-width code labeled IPC-2152 uses IPC-2221 constants.
- **F-10** Structural-only verification gates advertised as behavioral proof; claims register entries need evidence re-audit (incl. software-only board claims CLM-008/009).
- **F-11** Stale archive artifacts: prompt-2 pins wasmtime 30 / React ^19 (banned by current floor); overview-4 §8 "next step" is obsolete. Reference-only; must never be executed from.

---

## 4. Orchestration Protocol (adapted from attached wave protocol)

### 4.1 Roles
- **Orchestrator (me, main branch):** owns this plan, `findings.md`, `progress.md`, `.ai-sync/` bus; dispatches tickets; audits diffs; merges; reports progress. Never writes product code, never runs tests hands-on. Never pushes to remote without user approval.
- **Workers (EXTERNAL, per user directive):** WORKER-DEEPSEEK = OpenCode desktop in `D:\project-deepseek` on `feat/worker-deepseek` (backend/logic/tests); WORKER-GEMINI = Antigravity IDE in `D:\project-gemini` on `feat/worker-gemini` (UI/adapters/security/browser verification + read-only research). Coordination via `.ai-sync/` tickets/handoffs (committed to main so worktrees inherit). Fresh session per ticket. My own Qoder subagents are used ONLY for independent dual-context audits (oversight), never for execution.
- **Auditor:** for any geometry / security / hardware-compiler ticket, a **fresh zero-history reviewer subagent** (dual-context rule, AGENTS.md #6) reviews the diff before merge. The orchestrator's own audit does not replace it.

### 4.2 Ticket schema (every dispatch carries all fields)
- `ID`, `Wave`, `Owner`, `Branch`, `Worktree path`
- `WRITE_SCOPE` — explicit allowlist of paths the worker may touch. Anything else = automatic reject.
- `READ_ONLY_CONTEXT` — files to read but never edit (AGENTS.md, docs/AGENT_KNOWLEDGE_UPDATE_2026_11.md, schemas outside scope, other packages).
- `CONTRACT` — the invariants: i64 nm / i32 mdeg / UUIDv7; `_tx_actor_ctx` + fail-closed locks; Ring 1 license firewall + CVE floor; failing test FIRST; 100% offline $0 tests; zero `.unwrap()` in Ring 1 libs; no invented APIs; no completion claim without raw verify output.
- `ACCEPTANCE_CRITERIA` — falsifiable, per ticket below.
- `VERIFY_CMD` — exact commands; must exit 0; raw output pasted into the handoff.
- `HANDOFF` — `.ai-sync/handoffs/<ID>.md`: what changed, why, verify output, known gaps.

### 4.3 Wave loop
1. **MODE A (plan):** orchestrator finalizes tickets for the wave, checks scope disjointness, creates tracking tasks.
2. **Dispatch:** parallel workers in worktrees (independent tickets only; dependent tickets sequenced or rebased).
3. **MODE B (audit):** per worker — `git diff --name-only main..branch` vs WRITE_SCOPE (out-of-scope ⇒ reject & re-dispatch); run VERIFY_CMD fresh in the worktree; dual-context review where required; inspect handoff.
4. **Merge:** `--no-ff` into local `main` only after audit passes; update `progress.md` + task board; rebase remaining worktrees.
5. **BLOCKER:** any ticket failing 3 fix attempts ⇒ STOP that ticket, revert its worktree changes, record root cause in `findings.md`, escalate to user with options. Never weaken a test to get green.

### 4.4 Hard safety rules
- Workers never edit: `AGENTS.md`, `.ai-sync/` system files, `task_plan.md`, root manifests outside their scope, `.github/` unless the ticket owns it.
- No remote mutations (push/PR/release/settings) without explicit per-action user approval.
- NDA/DLP: no ticket may touch `NDA_AIRGAPPED` classified paths; cloud-model workers get PUBLIC_OPEN scope only.
- Version pins: verify upstream availability before changing any toolchain/CVE pin; record source + date in CLAIMS_REGISTER (do not invent future versions; do not blindly copy archive pins either).

---

## 5. Waves & Tickets

### WAVE 0 — Ground Truth — COMPLETE (results in findings.md: 58/64, F-13..F-16)
Remaining 0.2 (GitHub CI state) folded into T-02; 0.3 (gate classification) folded into T-05.

### Dispatch order (toolchain-aware)
1. **Now:** T-01 (Python/Node env + daemon fixes + pnpm lockfile) ∥ T-03 (kernel parity; provisions Rust toolchain) ∥ T-07 (read-only M1 gap audit).
2. **After T-01 merges:** T-02 (CI repair, needs lockfiles). **After T-03 merges:** T-04 (CAD defects, reuses Rust toolchain).
3. Then T-05 → T-06 → Wave 6+ gap tickets → Final human-gated release.

### WAVE 1 — Reproducibility & CI Repair (parallel, disjoint scopes)
**T-01 · Backend worker · `feat/t01-reproducibility`**
- WRITE_SCOPE: `packages/vd-daemon/**`, `scripts/test-daemon-api.py`, `scripts/test-dockview-and-brain.py`, `scripts/test-schematic-and-library.py`, `scripts/test-v004-cad-and-lab.py`, `scripts/test-v004-mfg-and-harness.py`, `scripts/test-gate8-release.py`, `designs/board-1-buck-pd/verification_report.json`, root `pnpm-lock.yaml` (new), `requirements-ci.txt`, `pyproject.toml`, `packages/cubo-engine/**` (only if needed).
- Mission (updated with Wave-0 verified root causes): (a) fix F-13 daemon Windows Unicode crash (UTF-8 stdout/stderr reconfiguration) with failing-test-first regression under cp1252; (b) fix F-16 cold-start races — readiness polling in all 5 daemon-launching gate scripts; (c) fix F-14 Gate 8 fail-closed alignment — NEVER fabricate a human token; report must declare signoff pending, test must prove release is blocked without a token; (d) provision pnpm and generate/commit `pnpm-lock.yaml` via real install; (e) re-run full harness.
- ACCEPTANCE: all 6 currently-failing gates pass for the right reasons; zero regressions (58 prior passes intact); frozen pnpm install succeeds; Gate 8 semantics remain fail-closed.
- VERIFY_CMD: `node scripts/verify-all.mjs` (full, raw output in handoff) + `pnpm install --frozen-lockfile`.
- Port ownership: T-01 owns daemon test ports during Wave 1; T-03 must not run daemon-dependent gates concurrently.

**T-02 · CI worker · `feat/t02-ci-repair`** (rebase on T-01 before merge)
- WRITE_SCOPE: `.github/workflows/**`, `.github/workflows/actions.lock`, new `scripts/check-actions-lock.mjs` (lock enforcement), `scripts/audit-toolchains.py` (only if pin verification requires).
- Mission: (a) rewrite both workflows: full 40-char SHA pins with version comments, minimal `permissions: contents: read`, concurrency, `workflow_dispatch`; (b) add real jobs: Rust fmt/clippy/test (pinned toolchain), Node frozen-install/typecheck/build/test per maintained app, Python locked-install + suite; (c) replace json.loads step with real JSON Schema validation + negative fixtures; (d) add actions.lock enforcement step; (e) apply Wave-0 diagnosis for `startup_failure`.
- ACCEPTANCE: actionlint clean; lock checker catches a deliberately wrong SHA (negative test); workflows define stable required-check names; PR run on GitHub reaches job execution (needs user approval to push branch/PR).
- VERIFY_CMD: `actionlint .github/workflows/*.yml && node scripts/check-actions-lock.mjs` + GitHub run URL for exact SHA.
- Dependency: T-01 lockfiles must be merged first (frozen-install jobs need them).

### WAVE 2 — Spec–Code Parity & Defect Fixes (parallel, disjoint)
**T-03 · Kernel worker · `feat/t03-protocol-parity`**
- WRITE_SCOPE: `packages/hw-ir/**` (TS types + Rust model), `packages/hw-merge/**`, `.gitattributes`, `packages/symbolic-verifier/**` (FG-05 only), `schemas/**` (patch-op schema only).
- Mission: fix F-05 (UPSERT_ENTITY parity + `import` actor), F-06 (merge driver name consistency), F-07 (FG-05 message/range agreement — decide canonical range from spec, fix whichever side is wrong, test both bounds).
- CONTRACT extras: failing test first for each defect; lock-trigger negative tests must keep passing; i64/UUIDv7 untouched.
- VERIFY_CMD: `cargo test -p vd-ir -p vd-merge && node scripts/verify-all.mjs` (targeted gates) + TS typecheck.
- Audit: dual-context reviewer REQUIRED (kernel/merge).

**T-04 · CAD worker · `feat/t04-cad-defects`**
- WRITE_SCOPE: `packages/cad-geom/**`, `apps/prototype-gui/src/**` (FSM file only), `packages/placement-router/**`, trace-width module (locate in Wave 0; likely `pdn-solver` or `dfm-dfa-safety`).
- Mission: fix F-08 (via-drop must emit geometry op, lock only via explicit lock command), F-09 (`w_cong` in CostWeights + wire through; correct IPC-2152 vs IPC-2221 constants/labeling with unit-checked math via Pint/SymPy, never LLM prose).
- VERIFY_CMD: `cargo test -p vd-cad-geom -p vd-placer && node scripts/verify-all.mjs` (CAD gates) + GUI build.
- Audit: dual-context reviewer REQUIRED (geometry).

### WAVE 3 — Behavioral Test Hardening
**T-05 · Verification worker · `feat/t05-behavioral-gates`**
- WRITE_SCOPE: `scripts/verify-all.mjs`, `scripts/test-*.py`, `scripts/test-*.mjs`, package-level test dirs, `schemas/` fixtures.
- Mission: using Wave-0 classification, convert every static-only gate to behavioral proof or explicitly reclassify + back with a behavioral test; real JSON Schema validator with ≥20 valid/invalid fixtures (audit had this locally — port it); negative lock-trigger cases across all 11 lockable entities; schema drift test asserting TS/Rust patch-op parity (prevents F-05 regression).
- ACCEPTANCE: gate count may change; every gate labeled `[BEHAVIORAL]` or `[STATIC-CONTRACT + backing test]`; zero regressions; harness still 100% offline $0.
- VERIFY_CMD: `node scripts/verify-all.mjs` full pass + spot-run of 3 converted gates in isolation.

### WAVE 4 — Claims & Documentation Reconciliation
**T-06 · Docs worker · `feat/t06-honest-claims`**
- WRITE_SCOPE: `docs/CLAIMS_REGISTER.md`, `README.md`, `docs/CHECKPOINT_PROGRESS.md`, `progress.md`, new `docs/GATE_CLASSIFICATION.md`.
- Mission: audit every CLM entry against real evidence paths (flag CLM-004/005 bench claims if benches don't exist; label CLM-008/009 software-only); reconcile README status with Wave 1–3 outcomes; record GitHub CI evidence (run URLs + SHA); add verification dates for any re-verified toolchain pins. No hype adjectives; implemented/experimental/planned labeled distinctly.
- VERIFY_CMD: `python scripts/audit-claims-honesty.py && python scripts/check-links.py`.
- Constraint: runs AFTER Waves 1–3 merge so it reports final truth.

### WAVE 5 — M1 Feature Gap Audit → Implementation Waves
**T-07 · Research agent (read-only, no worktree)**
- Mission: audit actual code vs `T1.01–T1.20` (+ b-tasks) acceptance criteria from the frozen spec; produce a gap table: `task | claimed | actual evidence | gap | priority | suggested ticket`. Include: hw-merge driver registration, wasm sandbox fuel/epoch negative tests, DLP egress proof (netns test impossible on Windows → deterministic fixture alternative), KiCad bridge round-trip (fixture-based if KiCad absent), CAS/WAL compaction, zombie-process supervision.
- Output: Wave 6+ ticket backlog appended to this plan; user approves scope before dispatch.

### WAVE 6+ — Gap Implementation (tickets defined after T-07)
Same protocol; each gap gets a scoped ticket, failing test first, dual-context audit where geometry/security/compiler.

### FINAL WAVE — Release Readiness (human-gated)
- All gates green locally AND on GitHub for the exact SHA; lockfiles frozen; claims honest; progress.md complete.
- Orchestrator presents evidence packet → **user decides** tag/release. Agents never auto-release (Gate 8 invariant).

---

## 6. Dependencies & Ordering

```
Wave 0 (now) ──► T-01 ──► T-02 (needs lockfiles) ──► GitHub PR verification (user-approved push)
            ├──► T-03 ∥ T-04 (parallel, after Wave 0; independent of T-01/02)
            └──► T-05 (after T-03/T-04 merge, so parity tests cover fixes)
                      └──► T-06 (after 1–3) ──► T-07 gap audit ──► Wave 6+ ──► Final (human)
```

## 7. Tracking & Reporting

- **Live board:** Qoder task system (one task per ticket; status pending → in_progress → completed only after fresh VERIFY_CMD output inspected).
- **Durable record:** this file (plan/scope changes), `findings.md` (root causes, blockers), `progress.md` (wave log: dispatched/merged/rejected, SHAs, gate counts, CI run URLs).
- **User reporting:** short update at each wave boundary — dispatched tickets, audit results, merges, blockers needing decisions. No silent long runs.
- **Handoffs:** `.ai-sync/handoffs/<ID>.md` per ticket (created at first dispatch; workers write only their own handoff).

## 8. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Toolchain pins (Rust 1.100 / Node 26.13.1 / TS 7.0.2) unavailable on host or upstream | Wave 0.4 checks availability; verify upstream before pin changes; BLOCKER → user decision, never silent downgrade |
| atopile/z3 Python deps need network | Offline-first: use cached wheels/uv; if impossible, document blocker, keep gate red honestly |
| `startup_failure` is a repo-admin settings issue | Orchestrator cannot see Settings; escalate to user with exact checklist (Actions policy, SHA-pinning requirement, runner access) |
| Workers drift out of scope | MODE B `git diff --name-only` allowlist check; auto-reject |
| Harness gates masked by structural checks | Wave 3 reclassification; claims audit Wave 4 |
| Windows vs Linux CI differences (netns, pipes, paths) | Fixture-based deterministic substitutes labeled as such; physical/Linux-only proofs deferred honestly |
## 9. Tech-Stack Integration Ledger & Endgame Program (2026-11-24)

### 9.1 Ledger (full scan of `prompt-and-skills`, 24 files / ~845 KB, cross-checked against manifests + source + tests)
- **INTEGRATED with evidence (25+):** SQLite WAL + lock triggers, UUIDv7 (hw-ir store; autorouter violation = F-20), rstar/i_overlay, wasmtime 50 (runner + sandbox_limits_test), Z3/SymPy/Pint, DuckDB KG, atopile bridge, Ed25519, KiCad 10 sexpr, Specctra DSN/SES, SPICE dialect transpiler, IPC-7351B synth, IPC-2221 creepage, DFM/DFA/DFT, PnP/stencil, Zephyr DTS co-sync, MCP 12 verbs/ACP/checkpoints, CrossProbeBus, WebGPU→WebGL2, Dockview/React 19.3.1, PDN IR-drop, EMC bands, fab registry, OCI compose (declared), budget.json enforcement.
- **PARTIAL:** cavalier_contours (dead dep), Gerber X2 (attr reconstructor only, no RS-274X plotter), wasm-sandbox negative depth (unverified), iBOM (GUI label only), panelization (own engine tested; `kikit` declared never invoked), Rayon SA (missing w_cong = F-09), hw-merge (F-06, in T-03), CI jobs (T-02b), TS floor (5 apps at 7.0.2; **apps/desktop ^5.8.2 violates**), Cargo.lock absent at root.
- **MISSING:** iTriangle, STEP AP242 parser/exporter, kiri git-diff, WireViz interop, elkjs (label only), zstd CAS + WAL ladder + autosave shadow.
- **BANNED-list check: CLEAN** — no AGPL/NC libs in any manifest; SPDX firewall script enforces.
- **Vapor labels in shipped code (anti-vapor law targets):** "iTriangle" (daemon.py:1339), "elkjs" (SchematicCanvas.tsx:169), "3D STEP" (cli/main.rs:200), "WireViz"/"kiri" (GUI labels).

### 9.2 Anti-vapor law (all Waves 3–6 tickets)
Every technology named in code/labels/CLI/gates/docs must be (a) really integrated + behaviorally tested, (b) truthfully relabeled, or (c) removed. No exceptions; T-06 audits the sweep.

### 9.3 Endgame sequence (live view on .ai-sync/TASK_BOARD.md)
Wave 2: T-03 (kernel parity) ∥ T-02b (CI remediation). Wave 3: T-04 (CAD defects) → T-08 (floors + Cargo.lock) ∥ T-05 (behavioral gates) ∥ T-15 (SPDX lockfile firewall, after T-02b). Wave 4: T-09 (CAS/supervision) ∥ T-10 (UI honesty/elkjs/iBOM) ∥ T-16 (manifest gaps). Wave 5: T-11 (tool interop: KiKit/WireViz/STEP/RS-274X/iTriangle/DLP/solver-recovery) ∥ T-12 (vendor-mirror bootstrap) → T-06 (claims truth + F-19 real hashes + vapor sweep + doc reconciliation). Wave 6: T-14 (rewrite depth-to-parity: panel/harness/diff renderers). FINAL: release evidence packet; CI-green proof requires one user-approved push; physical fabrication (0/3 boards) stays out of scope and honestly labeled.

### 9.4 Definition of ultra-finished (exit criteria, all evidence-backed)
1. Harness 64+/64 with T-05 behavioral reclassification — every gate either executes real code or is labeled STRUCTURAL.
2. GitHub Actions green on a user-approved push (T-02b jobs: license firewall, cargo, Node 26.13.1 frozen build/test, Python 3.14 uv/pytest).
3. All lockfiles committed and frozen-installable: pnpm ✓, uv ✓, Cargo.lock (T-08).
4. Zero fabricated evidence: Gate-8 fail-closed ✓, F-19 real hashes (T-06), no vapor labels (T-06 sweep).
5. All AGENTS.md invariants enforced by tests: UUIDv7 everywhere (T-04), TS/Node/Rust floors (T-08), human-lock fail-closed ✓.
6. CLAIMS_REGISTER reconciled; software-only claims labeled; 0/3 fabrication stated plainly.
7. Release packet assembled for human signoff — token issued ONLY by the user.

### 9.5 Upstream registry & reverse-engineering program (techstack.md, 146 repos — audited 2026-11-24)
- **Strategies per registry:** Ring 1 direct deps (permissive only) · git-ref study-only · Ring 2 subprocess/OCI-quarantined GPL (KiCad 10 GPL-3 via 3-channel bridge, Xyce/XDM, spicelib, gmsh, KLayout, Magic/xschem/netgen, freerouting…) · clean-room MIT rewrites REQUIRED for GPL tools used in-process (WireViz→wire-harness, kiri/KiCad-Diff→pcb-diff, KiKit→panelizer, AGPL KiBot→KiKit+kicad-cli+PcbDraw) · FORBIDDEN (PyMuPDF, KiBot, Konnect, Part-DB→InvenTree, pypsa-app→PyPSA, OpenModelica external opt-in only, NC checkpoints).
- **Current state:** 4 clean-room rewrite crates exist and are tested (pdn-solver, pcb-diff, wire-harness, panelizer) but their gates are string-greps (→T-05) and their depth is below parity (→T-14). Registry-mandated deps missing from manifests: iTriangle, manifold, wgpu, three.js, monaco, xterm, occt-import-js, ngspice-wasm, InteractiveHtmlBom, PcbDraw, jlcparts, JLC2KiCad_lib, kicad-python (→T-16, integrate-or-defer honestly). `scripts/import-upstream-stack.sh` never run; script drifted from techstack.md copy (→T-12). REVERSE_ENGINEERED_ENGINES.md mislabels KiKit as GPL-3 (it is MIT) (→T-06). No AGPL/GPL contamination in current manifests — verified.
- **License gray zones needing USER ruling:** elkjs (EPL-2.0) and surfer (EUPL-1.2) are mandated by the registry but violate the literal MIT/Apache/BSD Ring-1 invariant. Option A: documented exception register (EPL/EUPL are file-level copyleft; safe as unmodified deps) implemented by T-15. Option B: replace with MIT alternatives (e.g. dagre/d3-hierarchy layout; drop surfer). Orchestrator recommendation: Option A for elkjs (unmodified npm dep, exception register + SPDX annotation), defer surfer (not needed until waveform work). serde_kicad_sexpr (Apache/LGPL dual) stays avoided per critic.
- **New tickets:** T-12 vendor-mirror bootstrap & import-script reconciliation (DeepSeek, W5) · T-14 rewrite depth-to-parity: panelizer→real `.kicad_pcb` panel output, wire-harness→SVG diagram + wiring-table BOM, pcb-diff→layer SVG renderer (DeepSeek, W6, after T-11) · T-15 SPDX lockfile firewall: scan pnpm/uv/Cargo locks with AGPL/GPL/EUPL deny-list + exception register + negative fixture (Gemini, W3 after T-02b) · T-16 manifest-gap closure: iTriangle/wgpu/manifold wired or deferral-registered, elkjs into beautifier pipeline per T-10 (DeepSeek, W4). T-13 (doc truth) folded into T-06.
