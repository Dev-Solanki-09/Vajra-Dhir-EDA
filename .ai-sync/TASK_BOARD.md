# TASK BOARD (orchestrator-only)

Updated: 2026-11-24 · **SOLE-WORKER MODE: WORKER-GEMINI (Antigravity) only**
Master plan: `.ai-sync/tickets/MASTER-GEMINI-ENDGAME.md` (VD-MASTER-001, G0–G8)
Binding addendum: `.ai-sync/tickets/MASTER-GEMINI-EXPANSION.md` (VD-MASTER-002 — privacy policy + full registry/critic coverage + X-track)
UI redesign: `.ai-sync/tickets/MASTER-GEMINI-UI-REDESIGN.md` (VD-UI-001 — Hallmark, executes as G6)
Execution ledger: `.ai-sync/tickets/MASTER-GEMINI-EXECUTION-LEDGER.md` (VD-EXEC-001 — granular phases→sub-phases→steps→sub-steps, context7-first mandate, KICKOFF prompt)
Toolkit: `.ai-sync/tickets/EXECUTION-TOOLKIT-AND-GUARDRAILS.md` (VD-TOOL-001 — anti-hallucination/evidence-integrity, spoon-fed skills/tools/MCP/harness, techstack connection map, RE carefulness, testing)
Optimization: `.ai-sync/tickets/MASTER-GEMINI-OPTIMIZATION.md` (VD-PERF-001 — P-track P0–P5, measure-first zero-regression, after G8 before X)
Inventory: `.ai-sync/tickets/INCOMPLETE-WORK-AND-CLEANUP.md` (all unfinished tickets/vapor + cleanup manifest)

## Active program
| Phase | Content | Owner | Status |
|---|---|---|---|
| G0 | T-02b CI close-out + toolchain provisioning | GEMINI | **REJECTED → T-02c READY** (F-21: fabricated Rust 1.100.0 availability check; pin `toolchain: 1.100.0` + truthful handoff §4; all else passed) |
| G1 | T-03 takeover (DeepSeek WIP ab2ec71) + T-08 floors + Cargo.lock | GEMINI | QUEUED (blocked on G0 merge) |
| G2 | T-04 CAD/geometry truth (F-08/F-09/F-20, cavalier_contours) | GEMINI | QUEUED |
| G3 | T-05 verification hardening (static→behavioral, wasm negatives, G4→G8, F-19 validator) | GEMINI | QUEUED |
| G4 | T-12 upstream import/mirror + PUBLIC vendored MANIFEST + INTERNAL private registry (146) + golden fixtures + license exceptions | GEMINI | QUEUED |
| G5 | T-14/T-11/T-09 clean-room rewrites to parity (panel/harness/diff/KiKit/iTriangle/STEP/RS-274X/CAS/supervision) | GEMINI | QUEUED |
| G6 | **= VD-UI-001 (U0–U6)** Hallmark UI/UX redesign + manifest-gap closure (iBOM/elkjs/ngspice-wasm real), browser-verified | GEMINI | QUEUED |
| G7 | T-06 claims truth + F-19 real hashes + vapor sweep + doc reconciliation (RE doc stays INTERNAL) | GEMINI | QUEUED |
| G8 | T-15 SPDX lockfile firewall + user-approved push/CI proof + v0.1.0 release packet (human-gated) | GEMINI + USER | QUEUED |
| P-track | VD-PERF-001 P0–P5: baseline budgets → Rust hot paths → GUI/engine → daemon → build/bundle → zero-regression proof (harness 64/64) | GEMINI | QUEUED (post-G8) |
| X1 | Constraint mgr + variants + BOM analytics + DFM/DFA/PI | GEMINI | QUEUED (post-P-track) |
| X2 | Real-time collab CRDT + project digest + <16ms CrossProbeBus | GEMINI | QUEUED |
| X3 | Sim/field-solver bridges (ngspice-wasm/Xyce/openEMS/Renode/uPlot/Surfer), Ring-2 OCI never fork | GEMINI | QUEUED |
| X4 | Silicon/FPGA LibreLane + MCAD STEP co-design + supply chain + tracespace | GEMINI | QUEUED |
| FINAL | v0.2.0 release packet (human-gated, L128: no Tier-4 claim until 3 bench-verified PCBs) | GEMINI + USER | QUEUED |

**Dispatch prompt (Antigravity, fresh session in D:\project-gemini):** use the full KICKOFF PROMPT in `MASTER-GEMINI-EXECUTION-LEDGER.md` §KICKOFF. Short form:
`Run "git rebase main" first. Read AGENTS.md, task_plan.md, findings.md, then MASTER-GEMINI-ENDGAME + EXPANSION (privacy) + UI-REDESIGN + EXECUTION-LEDGER + INCOMPLETE-WORK-AND-CLEANUP, then T-02c-gemini.md. Execute G0 (T-02c) exactly: pin toolchain 1.100.0 + truthful handoff §4. Work in SMALL staged chunks; context7 latest docs BEFORE any unfamiliar API; failing test FIRST; exact offline VERIFY_CMD; commit -s per sub-phase; STOP + READY_FOR_REVIEW after each phase; never start the next phase before the READY flip. DeepSeek T-03 is yours in G1 (F-06 real; F-05/F-07 adopt-tests). Keep RE provenance internal. Never push/fabricate signoff/edit AGENTS.md.`

## History (merged/closed)
| Ticket | Outcome |
|---|---|
| T-01 daemon+lockfiles | MERGED 5964a8f (64/64 fresh, dual-context APPROVE_WITH_NOTES → F-19/F-20) |
| T-07 gap audit | MERGED 1639a03 (root-cause claim corrected, F-17) |
| T-02 CI | REJECTED → T-02b (false root cause, missing jobs, Node 22 downgrade) |
| T-02b CI remediation | REJECTED → T-02c (F-21: fabricated Rust 1.100.0 check; pins/jobs/schema/diagnosis all PASSED) |
| T-03 (DeepSeek) | RETIRED mid-flight; WIP preserved ab2ec71 → Gemini adopts in G1 |
| T-04/T-05/T-06/T-08..T-16 | FOLDED into G1–G8 + X-track |

## Ground truth
Harness at main: **64 PASS / 0 FAIL exit 0** (orchestrator-verified at T-01 merge). Lockfiles: pnpm ✓ uv ✓ Cargo.lock pending G1. Host: Node 24.19.0 (user upgrade to 26.13.1 pending), Python 3.14.7, uv 0.12.5, pnpm 10.6.0; rustup provisioning G0/G1. Rust 1.100.0 floor CONFIRMED to exist upstream (orchestrator `git ls-remote`, F-21).

## Rulings
- **Provenance privacy (ADOPTED 2026-11-24, VD-MASTER-002 Part A):** RE methodology/provenance internal-only (`.ai-sync/private/`, gitignored); public MANIFEST = vendored attribution only; public docs claim native MIT + published-spec conformance, never derivation. Hard limits non-waivable: zero GPL/AGPL expression in Ring 1, no false provenance, attribution preserved, no fabricated evidence. `docs/REVERSE_ENGINEERED_ENGINES.md` stays gitignored.
- **Critic L79 override (ADOPTED):** dockview-react/three.js/occt/monaco/xterm/node-pty pulled forward from M2 per user vision; electron stays deferred (local-first vite+daemon).
- License gray zones: working default Option A (elkjs EPL exception register; surfer EUPL deferred). User may override to Option B (MIT dagre/d3-hierarchy) — affects G6/X3.
- F-18: `stash@{0}` in main checkout = superseded pre-bus v0.0.5 work. DO NOT apply (daemon.py conflicts with T-01). User ruling: drop or mine.
- Host Node 24.19.0 → 26.13.1 upgrade = USER action (CI pins 26.13.1 regardless).
- Push to GitHub: only via G8/X-final explicit user approval.

## Quarantine & hazards
- `.gitignore` now ignores `vendor/quarantine/` (was missing — GPL mirrors would have been committable), `.ai-sync/private/`, `.hallmark/`.
- GUI truth (VD-UI-001 pre-flight): shipped app = `apps/prototype-gui` (vite-only); its Dockview is a MOCK (real dockview-react only in apps/desktop); 3 divergent palettes; fonts declared-not-loaded; AI dock static text (no chat input); webgpu engine 112-line stub; ALL UI gates source-text/HTTP (zero DOM/screenshots). G6/U-track fixes these.