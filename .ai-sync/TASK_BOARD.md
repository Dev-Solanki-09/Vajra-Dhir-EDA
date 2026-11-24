# TASK BOARD (orchestrator-only)

Updated: 2026-11-24 (post Gemini audit) · Wave 1 · Baseline main @ 1639a03 (T-07 merged)

| Ticket | Wave | Owner | Worktree / Branch | Status | Depends on |
|---|---|---|---|---|---|
| T-01 daemon+lockfiles | 1 | WORKER-DEEPSEEK (OpenCode) | D:\project-deepseek · feat/worker-deepseek | **READY** (addendum: requires-python >=3.14,<3.15 APPROVED conditional on uv evidence) | — |
| T-07 M1 gap audit (read-only) | 1 | WORKER-GEMINI (Antigravity) | D:\project-gemini · feat/worker-gemini | **MERGED** (cherry-pick 1639a03; root-cause claim corrected by findings F-17) | — |
| T-02 CI repair | 2 | WORKER-GEMINI | same | **REJECTED → T-02b** (false root cause, missing Node/Python jobs, pseudo schema validation, unauthorized Node 22 downgrade) | — |
| T-02b CI remediation | 2 | WORKER-GEMINI (Antigravity) | same (build on 6d09fb3) | QUEUED | T-01 merged + rebase |
| T-03 kernel parity | 1→2 | WORKER-DEEPSEEK (OpenCode) | same | QUEUED | T-01 merged + rebase |
| T-04 CAD defects | 2 | WORKER-DEEPSEEK | same | QUEUED (ticket pending) | T-03 merged |
| T-05 behavioral gates | 3 | TBD | — | QUEUED (ticket pending; seed from T-07 §3 static-gate list) | T-03, T-04 |
| T-06 claims truth | 4 | WORKER-GEMINI | same | QUEUED (ticket pending) | T-02b, T-05 |
| T-08 toolchain floors | 2 | WORKER-DEEPSEEK | same | QUEUED (ticket pending): TS 5.9.3→7.0.2 (npm latest, verified), engines node>=26.13.1; host Node upgrade = USER | T-01 merged |
| Wave 6+ gap tickets | 6+ | TBD | — | SEED LIST from T-07 §4: wasm-sandbox impl+negative tests, hw-merge driver registration, cas-store zstd/WAL/zombie supervision, solver-recovery tests, KiCad golden round-trip, hw-dlp egress probe, G4→G8 negative path, static→behavioral conversions | T-03/T-05 |
| FINAL release packet | final | ORCHESTRATOR + HUMAN | main | BLOCKED (human gate) | all |

## Quarantine notice (findings F-18)
Unattributed v0.0.5 changes sit UNCOMMITTED in the main checkout (GUI components, daemon +315 lines, verify-all refactor, AGENTS.md law block). Do not merge, do not discard. User to identify the author. Workers: never write to `D:\Vajra-Dhir-EDA`.

## Worker dispatch instructions
- **OpenCode (DeepSeek):** open project `D:\project-deepseek`, fresh session, prompt: `Read .ai-sync/tickets/T-01-deepseek.md and execute it exactly. Follow .ai-sync/README.md rules.`
- **Antigravity (Gemini):** open project `D:\project-gemini`, fresh session, prompt: `Read .ai-sync/tickets/T-07-gemini.md and execute it exactly. Follow .ai-sync/README.md rules.`
- After each handoff: orchestrator audits (scope diff + fresh VERIFY_CMD + dual-context review where required), merges --no-ff, rebases worktree, flips next QUEUED ticket to READY here.

## Ground truth
Harness at HEAD: **58 PASS / 6 FAIL** (findings.md F-13..F-16). Host: Node 24.19.0, Python 3.14.7, uv 0.12.5; cargo/pnpm absent (workers provision). No push to GitHub without explicit user approval.