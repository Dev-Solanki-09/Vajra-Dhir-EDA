# TASK BOARD (orchestrator-only)

Updated: 2026-11-24 · **SOLE-WORKER MODE: WORKER-GEMINI (Antigravity) only** · Master plan: `.ai-sync/tickets/MASTER-GEMINI-ENDGAME.md` (phases G0–G8, ultra-detailed, supersedes individual ticket dispatch)

## Active program
| Phase | Content (old ticket IDs folded in) | Owner | Status |
|---|---|---|---|
| G0 | T-02b close-out + toolchain provisioning | GEMINI | **READY** (a039258 + handoff committed; orchestrator audit pending) |
| G1 | T-03 takeover (DeepSeek WIP ab2ec71) + T-08 floors + Cargo.lock | GEMINI | QUEUED |
| G2 | T-04 CAD/geometry truth | GEMINI | QUEUED |
| G3 | T-05 verification hardening (static→behavioral, wasm negatives, G4→G8, F-19 validator) | GEMINI | QUEUED |
| G4 | T-12 upstream import/mirror program + vendor MANIFEST + golden fixtures + license exceptions | GEMINI | QUEUED |
| G5 | T-14/T-11/T-09 clean-room rewrites to parity (panel/harness/diff/KiKit/iTriangle/STEP/RS-274X/CAS/supervision) | GEMINI | QUEUED |
| G6 | T-16/T-10 manifest gaps + UI ultra-polish, browser-verified (iBOM/elkjs/ngspice-wasm real) | GEMINI | QUEUED |
| G7 | T-06 claims truth + F-19 real hashes + vapor sweep + doc reconciliation | GEMINI | QUEUED |
| G8 | T-15 SPDX lockfile firewall + user-approved push/CI proof + FINAL release packet (human-gated) | GEMINI + USER | QUEUED |

**Dispatch prompt (Antigravity, fresh session in D:\project-gemini):**
`Run "git rebase main" first. Then read .ai-sync/tickets/MASTER-GEMINI-ENDGAME.md completely and execute PHASE G0 exactly. Follow .ai-sync/README.md rules. You are the sole worker. After each phase: commit -s, write the phase handoff with raw evidence, STOP and signal READY_FOR_REVIEW — do not start the next phase before the orchestrator flips it READY.`

## History (merged/closed)
| Ticket | Outcome |
|---|---|
| T-01 daemon+lockfiles | MERGED 5964a8f (64/64 fresh, dual-context APPROVE_WITH_NOTES → F-19/F-20) |
| T-07 gap audit | MERGED 1639a03 (root-cause claim corrected, F-17) |
| T-02 CI | REJECTED → T-02b (false root cause, missing jobs, Node 22 downgrade) |
| T-02b CI remediation | Committed a039258 + handoff on worker branch — audit pending (G0) |
| T-03 (DeepSeek) | RETIRED mid-flight; WIP preserved ab2ec71 on feat/worker-deepseek → Gemini adopts in G1 |
| T-04/T-05/T-06/T-08..T-16 | FOLDED into master plan phases G1–G8 |

## Ground truth
Harness at main: **64 PASS / 0 FAIL exit 0** (orchestrator-verified at T-01 merge). Lockfiles: pnpm ✓ uv ✓ Cargo.lock pending G1. Host: Node 24.19.0 (user upgrade to 26.13.1 pending), Python 3.14.7, uv 0.12.5, pnpm 10.6.0; rustup provisioning in G0/G1.

## Quarantine & rulings pending
- F-18: `stash@{0}` in main checkout = superseded pre-bus v0.0.5 partial work. DO NOT apply (daemon.py conflicts with T-01). User ruling: drop or mine.
- License gray zones (task_plan §9.5): working default Option A (elkjs EPL exception register, surfer deferred); user may override to Option B (MIT replacements) — affects G4/G6.
- Host Node 24.19.0 → 26.13.1 upgrade = USER action (CI pins 26.13.1 regardless).
- Push to GitHub: only via G8 explicit user approval.
