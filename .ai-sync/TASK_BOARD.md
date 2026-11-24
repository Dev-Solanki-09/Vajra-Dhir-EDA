# TASK BOARD (orchestrator-only)

Updated: 2026-11-24 · Wave 1 · Baseline main @ 1c157d4 (+ orchestration bootstrap commit)

| Ticket | Wave | Owner | Worktree / Branch | Status | Depends on |
|---|---|---|---|---|---|
| T-01 daemon+lockfiles | 1 | WORKER-DEEPSEEK (OpenCode) | D:\project-deepseek · feat/worker-deepseek | **READY** | — |
| T-07 M1 gap audit (read-only) | 1 | WORKER-GEMINI (Antigravity) | D:\project-gemini · feat/worker-gemini | **READY** | — |
| T-03 kernel parity | 1→2 | WORKER-DEEPSEEK (OpenCode) | same | QUEUED | T-01 merged + rebase |
| T-02 CI repair | 2 | WORKER-GEMINI (Antigravity) | same | QUEUED | T-01 merged + rebase |
| T-04 CAD defects | 2 | WORKER-DEEPSEEK | same | QUEUED (ticket pending) | T-03 merged |
| T-05 behavioral gates | 3 | TBD | — | QUEUED (ticket pending) | T-03, T-04 |
| T-06 claims truth | 4 | WORKER-GEMINI | same | QUEUED (ticket pending) | T-02, T-05 |
| Wave 6+ gap tickets | 6+ | TBD | — | AWAIT T-07 output | T-07 |
| FINAL release packet | final | ORCHESTRATOR + HUMAN | main | BLOCKED (human gate) | all |

## Worker dispatch instructions
- **OpenCode (DeepSeek):** open project `D:\project-deepseek`, fresh session, prompt: `Read .ai-sync/tickets/T-01-deepseek.md and execute it exactly. Follow .ai-sync/README.md rules.`
- **Antigravity (Gemini):** open project `D:\project-gemini`, fresh session, prompt: `Read .ai-sync/tickets/T-07-gemini.md and execute it exactly. Follow .ai-sync/README.md rules.`
- After each handoff: orchestrator audits (scope diff + fresh VERIFY_CMD + dual-context review where required), merges --no-ff, rebases worktree, flips next QUEUED ticket to READY here.

## Ground truth
Harness at HEAD: **58 PASS / 6 FAIL** (findings.md F-13..F-16). Host: Node 24.19.0, Python 3.14.7, uv 0.12.5; cargo/pnpm absent (workers provision). No push to GitHub without explicit user approval.