# TICKET T-07 · Wave 1 · M1 Feature Gap Audit (READ-ONLY)

| Field | Value |
|---|---|
| Owner | WORKER-GEMINI (Antigravity) |
| Worktree | `D:\project-gemini` |
| Branch | `feat/worker-gemini` |
| Status | **READY — EXECUTE NOW** |
| Handoff | `.ai-sync/handoffs/T-07-gemini.md` (the ONLY file you may write) |

## Mission
READ-ONLY audit: compare the frozen Milestone 1 task list against ACTUAL shipped code so the orchestrator can ticket real gaps. **Create/edit/delete NO file except your handoff. No installs, no builds, no state-mutating commands.** Reading, grep/glob, read-only git only.

## Sources of truth for the task list
- `prompt-and-skills/project-overview-4.txt` §4.28 "COMPLETE MILESTONE 1–3 ATOMIC TASK CHECKLIST" (T1.01–T1.20 + T1.02b/T1.12b/T1.15b/T1.17b/T1.20b).
- `prompt-and-skills/prompt-2.txt` §8 (near end, ~line 3168+) — per-task acceptance tests.
- `docs/VD-SAD-001-ARCHITECTURE.md` — context (skim).

## Method
Per task: locate implementing package(s) under `packages/`/`apps/`, inspect real code + tests, classify:
- IMPLEMENTED-BEHAVIORAL · IMPLEMENTED-STATIC-ONLY (gate only greps source) · PARTIAL (list missing sub-features) · STUB/SPEC-ONLY · MISSING.

Special attention: hw-merge git driver registration; wasm-sandbox fuel/epoch/memory NEGATIVE tests; hw-dlp egress proof (netns impossible on Windows — deterministic fixture?); KiCad 3-channel bridge round-trip tests; CAS store + WAL compaction + crash shadow; OS zombie-process supervision; solver recovery ladders behavioral tests; 9-gate FSM negative paths; DualCheckpoint rollback behavior.
Also sample ≥15 gates in `scripts/verify-all.mjs`: real behavior vs `readFileSync`+`includes`-style static checks.

## Output (handoff file)
Markdown gap table: `Task | Package(s) | Classification | Evidence (file:line) | Gap detail | Priority (P0 blocks working project / P1 correctness / P2 polish)` + recommended top-10 next-wave tickets (one-line mission, suggested WRITE_SCOPE, suggested verify command each). Evidence-based; cite paths; if genuinely complete, say so — do not invent gaps. Then commit ONLY the handoff with `git commit -s`.

## Known ground truth (do not re-derive)
Harness at HEAD: 58 PASS / 6 FAIL; failures root-caused in `findings.md` (F-13 daemon Unicode crash, F-14 Gate-8 token, F-16 cold-start races). T-01 (DeepSeek) is fixing those concurrently — your audit is about the OTHER 58 gates' depth and the T1 task coverage.