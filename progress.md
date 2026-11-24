# PROGRESS — Wave Log (orchestrator-maintained)

## 2026-11-24 · Wave 0 complete · Wave 1 dispatched

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