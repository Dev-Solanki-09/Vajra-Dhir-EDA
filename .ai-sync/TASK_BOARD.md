# TASK BOARD (orchestrator-only)

Updated: 2026-11-24 (post T-01 merge) · Wave 2 · Baseline main @ 5964a8f (T-01 merged; harness 64/64 exit 0, orchestrator-verified)

| Ticket | Wave | Owner | Worktree / Branch | Status | Depends on |
|---|---|---|---|---|---|
| T-01 daemon+lockfiles | 1 | WORKER-DEEPSEEK (OpenCode) | D:\project-deepseek · feat/worker-deepseek | **MERGED** (5964a8f; audit: fresh 64/64 + frozen install exit 0 + dual-context APPROVE_WITH_NOTES → F-19/F-20) | — |
| T-07 M1 gap audit (read-only) | 1 | WORKER-GEMINI (Antigravity) | D:\project-gemini · feat/worker-gemini | **MERGED** (cherry-pick 1639a03; root-cause claim corrected by findings F-17) | — |
| T-02 CI repair | 2 | WORKER-GEMINI | same | **REJECTED → T-02b** (false root cause, missing Node/Python jobs, pseudo schema validation, unauthorized Node 22 downgrade) | — |
| T-02b CI remediation | 2 | WORKER-GEMINI (Antigravity) | same (rebased; keep your `[T-02]` commit as base — identify by message, hashes renumber on rebase) | **READY** | — |
| T-03 kernel parity | 2 | WORKER-DEEPSEEK (OpenCode) | same (rebased onto 4924b57) | **READY** | — |
| T-04 CAD defects | 2→3 | WORKER-DEEPSEEK | same | QUEUED (ticket pending; ADD F-20 UUIDv7 fix in autorouter) | T-03 merged |
| T-05 behavioral gates | 3 | TBD | — | QUEUED (ticket pending; seeds: T-07 §3 static-gate list + F-19 gate hardening) | T-03, T-04 |
| T-06 claims truth | 4 | WORKER-GEMINI | same | QUEUED (ticket pending; ADD F-19 fabricated evidence hashes) | T-02b, T-05 |
| T-08 toolchain floors | 3 | WORKER-DEEPSEEK | same | QUEUED (ticket pending): TS 5.9.3→7.0.2 (npm latest, verified), engines node>=26.13.1; host Node upgrade = USER | T-03 merged |
| Wave 6+ gap tickets | 6+ | TBD | — | SEED LIST from T-07 §4: wasm-sandbox impl+negative tests, hw-merge driver registration, cas-store zstd/WAL/zombie supervision, solver-recovery tests, KiCad golden round-trip, hw-dlp egress probe, G4→G8 negative path, static→behavioral conversions | T-03/T-05 |
| FINAL release packet | final | ORCHESTRATOR + HUMAN | main | BLOCKED (human gate) | all |

## Quarantine notice (findings F-18) — RESOLVED TO STASH
The unattributed v0.0.5 main-tree work was evacuated to `stash@{0}` (labeled) so T-01 could merge. Provenance: pre-bus partial work of a stopped Qoder subagent (timestamp evidence in T-01 handoff §5). Do NOT merge; if revived, reconcile daemon.py against f4caaf2 first. Workers: never write to `D:\Vajra-Dhir-EDA`.

## Dispatch prompts (Wave 2 — both READY now)
- **OpenCode (DeepSeek):** open project `D:\project-deepseek`, fresh session, prompt: `Run "git rebase main" first. Then read .ai-sync/tickets/T-03-deepseek.md and execute it exactly. Follow .ai-sync/README.md rules. T-01 is merged; harness ground truth at main is 64/64.`
- **Antigravity (Gemini):** open project `D:\project-gemini`, fresh session, prompt: `Run "git rebase main" first. Then read .ai-sync/tickets/T-02b-gemini.md and execute it exactly. Follow .ai-sync/README.md rules. Your T-02 was audited and RETURNED — keep your old [T-02] commit as base and fix every audit finding in the ticket. pnpm-lock.yaml and uv.lock now exist on main.`
- After each handoff: orchestrator audits (scope diff + fresh VERIFY_CMD + dual-context review where required), merges --no-ff, rebases worktrees, flips next QUEUED ticket to READY here.

## Ground truth
Harness at main 5964a8f: **64 PASS / 0 FAIL, exit 0** (orchestrator-run fresh in worker worktree post-rebase; F-13/F-14/F-16 closed). Host: Node 24.19.0 (floor 26.13.1 — user upgrade pending), Python 3.14.7, uv 0.12.5, pnpm 10.6.0; cargo/rustc still absent (T-03 provisions or BLOCKERs). No push to GitHub without explicit user approval.
