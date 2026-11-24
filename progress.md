# PROGRESS — Wave Log (orchestrator-maintained)

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