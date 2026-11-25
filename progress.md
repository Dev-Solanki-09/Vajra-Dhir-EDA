# PROGRESS — Wave Log (orchestrator-maintained)

## 2026-11-25 · G1 AUDITED & MERGED (`APPROVE_WITH_NOTES`) · G2 READY

- **G1 ACCEPTED (`2d64166`..`b13a312`, merged `--no-ff`):**
  - `Cargo.lock` generated and committed (`3198` lines, 311 packages via `cargo metadata --locked`), `packages/cli/Cargo.toml` fixed (`vd-hw-dlp = { package = "vd-dlp", path = "../hw-dlp" }`).
  - Adopted `test_patch_op_parity.py` (F-05, `8 ops / 5 actors / 14 SQL domains` PASS), implemented `register_merge_driver.py` + `test_merge_driver_registration.py` (F-06, `3/3` PASS), adopted & fixed `test_footgun_contract.py` (F-07, `3/3` PASS).
  - Bumped `typescript == 7.0.2` & `engines.node >= 26.13.1` across root + `apps/desktop`, added `"types": ["node"]` to `packages/mcp-gateway/tsconfig.json`, regenerated cross-OS `pnpm-lock.yaml` (`win32-x64` + `linux-x64`), passed `pnpm install --frozen-lockfile`, `tsc --noEmit` (6/6 TS packages), and `pnpm test` (`4/4`).
- **Dual-context review (`APPROVE_WITH_NOTES`):** noted local Windows host lacks MSVC `link.exe` (blocking local `cargo test`/`cargo check` binary linking until run on `ubuntu-24.04` CI or MSVC host), and flagged pre-existing numbering drift in untouched `packages/symbolic-verifier/src/footgun_engine.py`.
- **G2 (`T-04`) READY:** CAD & geometry truth (F-08, F-09a, F-09b, F-20, `cavalier_contours`).

## 2026-11-24 · Step 1 SSOT Upgrade + G0 (T-02b + T-02c) AUDITED & MERGED · G1 READY

- **Orchestrator SSOT Upgrade (`dd4ea87`):** reconciled `.ai-sync/` specs (`G5A/B/C`, `G6A/B/C/D`, `P0–P5`, `X1–X4`), created `.ai-sync/WORKER_BOOTSTRAP.md` (untracked) and `scripts/verify-handoff.mjs` receipt gate, fixed `docs/TECHSTACK.md` + `scripts/import-upstream-stack.sh` license/path traps (`occt-import-js` LGPL worker exception, `KiKit` Ring-2 subprocess, `surfer` EUPL removed, `serde_kicad_sexpr` dropped), recorded user rulings (`wasmtime >= 51.0.0`, `vd studio` v0.1.0 / optional Tauri v2 v0.2.0), archived `stash@{0}` to `.ai-sync/private/archive/stash0-v005-backup.patch` and dropped it.
- **G0 ACCEPTED (`T-02b + T-02c`, `b80fdde`, merged `--no-ff`):** `ci-license-evalops.yml:106` pinned to `toolchain: 1.100.0`; `T-02b-gemini.md` §4 updated truthfully with raw `git ls-remote` output; `node scripts/check-actions-lock.mjs` PASS; `jsonschema` valid/invalid fixtures verified; `G0-receipt.json` generated (`overallPassed: true`).
- **Pre-existing Cargo bug noted during host run:** `node scripts/verify-all.mjs` reported `63 PASS / 1 FAIL` (`scripts/test-cad-perfection.py` failed on `packages/cli/Cargo.toml` requesting `vd-hw-dlp` instead of `vd-dlp`, surfaced now that `rustc`/`cargo` `1.100.0` are installed on the host).
- **G1 READY:** `.ai-sync/tickets/G1-gemini.md` issued (`D:\project-gemini` rebased onto `main`).

## 2026-11-24 · T-01 AUDITED & MERGED — harness ground truth now 64/64 · Wave 2 dispatched

- **T-01 ACCEPTED** (WORKER-DEEPSEEK, commits f4caaf2/adf390e/0e12174, merged --no-ff `5964a8f`). Audit evidence: fresh orchestrator harness run **64/64 exit 0** (baseline was 58/6); `pnpm install --frozen-lockfile` exit 0; scope exactly 13 files, all in WRITE_SCOPE; DCO on all commits; uv conflict raw output provided (atopile bands mutually exclusive ⇒ requires-python >=3.14,<3.15 approved).
- **F-13, F-14, F-16 CLOSED.** F-14 CORRECTED: committed HEAD `1c157d4` carried a FORGED `human_signoff_token` (`a1b2c3d4…`) and Gate 8 passed on it — worse than diagnosed; now fail-closed (PENDING, release_authorized=false) with self-tested rejection paths.
- **Dual-context review: APPROVE_WITH_NOTES** → two new findings: **F-19** fabricated G1–G8 `evidence_hash` values remain in board-1 report (G2 = the forged token bytes; G1 = SHA-256 of empty) + minor Gate-8 validator gaps (one-directional contradiction check) → T-06/T-05; **F-20** autorouter uses `Uuid::new_v4()` — standing UUIDv7 invariant violation → T-04.
- **F-18 RESOLVED to stash:** v0.0.5 main-tree work evacuated to labeled `stash@{0}` (provenance: pre-bus stopped Qoder subagent per timestamp evidence). Not merged, not deleted; daemon.py in it conflicts with T-01 — reconcile before any revival.
- **Both worktrees rebased onto 5964a8f.** Gemini's rejected T-02 commit rebased to 886ca1e (kept as T-02b base).
- **Wave 2 READY:** T-03 (DeepSeek: patch-op parity, merge-driver registration, FG-05) · T-02b (Gemini: real Node 26.13.1 + Python 3.14 CI jobs, real jsonschema validation, honest startup_failure diagnosis). Dispatch prompts on TASK_BOARD.
- Remaining below floor: host Node 24.19.0 (user upgrade), TS 5.9.3 → 7.0.2 (T-08 ticket after T-03).

## 2026-11-24 · Gemini audit ruled: T-07 MERGED, T-02 REJECTED → T-02b

- **T-07 ACCEPTED**: high-quality evidence-backed gap matrix (13 behavioral / 8 static-only / 3 stub / 1 fab-pending). Cherry-picked d644593 → main `1639a03`. Its startup_failure root-cause sentence is wrong; authoritative correction in findings F-17.
- **T-02 REJECTED** (6d09fb3 stays on worker branch as base): false startup_failure diagnosis (no gh evidence; bare `pull_request:` null is valid), missing required Node/Python build-test jobs, pseudo schema validation, unpinned `stable` Rust, unauthorized Node 26.13.1→22 downgrade, executed while QUEUED. Remediation ticket `.ai-sync/tickets/T-02b-gemini.md` written (QUEUED behind T-01).
- **Version-floor evidence (2026-11-24)**: Node v26.13.1 EXISTS (nodejs.org/dist, 2026-11-10, LTS Lithium); typescript 7.0.2 IS npm latest; react 19.3.1 latest. No AGENTS.md revision needed — repo manifests are the defect. T-08 ticket queued for TS/engines bump; host Node upgrade is a user action.
- **DeepSeek T-01 addendum issued**: requires-python >=3.14,<3.15 APPROVED conditional on raw uv conflict evidence in handoff; Gate-8 fail-closed approach approved (before/after token diff requested); TS/Node bumps out of scope; warning to stay in D:\project-deepseek.
- **F-18 QUARANTINE**: unattributed v0.0.5 work found uncommitted in main checkout (4 new GUI components, test-v005 script, daemon +315 lines, verify-all classify refactor, AGENTS.md "Qwen 4 Max" law block). Left untouched; user to identify author. Not merged, not discarded.
- Next: DeepSeek finishes T-01 → orchestrator audits (fresh 64-gate run + frozen installs + dual-context for daemon/report changes) → merge --no-ff → rebase both worktrees → flip T-03 (DeepSeek) and T-02b (Gemini) to READY.

## 2026-11-24 · Worker layer switched to EXTERNAL agents (user directive)

- Stopped my 3 Qoder workers (T-01/T-03/T-07 mid-flight; their `.qoder/worktrees/agent-*` worktrees hold superseded partial work — cleanup pending, do not merge).
- Built `.ai-sync/` bus (README rules, ARCHITECTURE pointer, TASK_BOARD, 4 tickets, handoffs/) — committed to main `e2a0dbc` with DCO.
- Created worker worktrees: `D:\project-deepseek` (feat/worker-deepseek, OpenCode) · `D:\project-gemini` (feat/worker-gemini, Antigravity).
- **READY tickets:** T-01 → DeepSeek · T-07 (read-only gap audit) → Gemini. **QUEUED:** T-03 (DeepSeek, after T-01) · T-02 (Gemini, after T-01).
- Dispatch is file-bus based: both external agents are GUI apps; user pastes the one-line ticket prompt into each IDE session (see TASK_BOARD.md). Orchestrator monitors handoffs + branch commits, audits, merges.

## 2026-11-24 · Wave 0 complete · Wave 1 first dispatched (superseded by external switch)

**Baseline:** `main` @ `1c157d4`. Harness ground truth: **58 PASS / 6 FAIL** (see findings.md F-13..F-16). "64/64 certified" claim disproven on this host.

**Dispatched (parallel, isolated worktrees):**
| Ticket | Worker | Branch | Mission | Status |
|---|---|---|---|---|
| T-01 | worker-t01 | feat/t01 (worktree) | Daemon Unicode crash fix, readiness polling, Gate-8 fail-closed alignment, pnpm/uv lockfiles | RUNNING |
| T-03 | worker-t03 | feat/t03 (worktree) | Patch-op parity, merge-driver naming, FG-05 range; Rust toolchain provisioning | RUNNING |
| T-07 | worker-t07 | read-only | M1 gap audit T1.01–T1.20 vs shipped code | RUNNING |

**Queued:** T-02 (CI repair, after T-01) · T-04 (CAD defects, after T-03) · T-05 (behavioral gates) · T-06 (claims truth) · Wave 6+ (from T-07 gaps) · FINAL (human-gated release).

**Decisions pending user:**
1. Gate 8: worker aligns test/report to fail-closed (signoff PENDING). A real release later requires a human-issued token — agents never fabricate one.
2. Toolchain policy vs reality: host Node 24.19.0 < floor 26.13.1; cargo absent; Rust 1.100.0 upstream existence unverified. Workers verify and report deviations; no silent downgrades.
3. GitHub push/PR for CI verification (T-02) will need explicit approval when reached.

**Audit queue:** on each worker completion → scope check (`git diff --name-only`), fresh VERIFY_CMD, dual-context review for T-03/T-04 (kernel/geometry), then `--no-ff` merge + board update.