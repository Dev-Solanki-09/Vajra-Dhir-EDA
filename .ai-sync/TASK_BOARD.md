# TASK BOARD (orchestrator-only)

Updated: 2026-11-24 · **SOLE-WORKER MODE: WORKER-GEMINI (Antigravity) only**
Master plan: `.ai-sync/tickets/MASTER-GEMINI-ENDGAME.md` (VD-MASTER-001, G0–G8)
Binding addendum: `.ai-sync/tickets/MASTER-GEMINI-EXPANSION.md` (VD-MASTER-002 — privacy policy + full registry/critic coverage + X-track)
UI redesign: `.ai-sync/tickets/MASTER-GEMINI-UI-REDESIGN.md` (VD-UI-001 — Hallmark, executes as G6)

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
| X1 | Constraint mgr + variants + BOM analytics + DFM/DFA/PI | GEMINI | QUEUED (post-G8) |
| X2 | Real-time collab CRDT + project digest + <16ms CrossProbeBus | GEMINI | QUEUED |
| X3 | Sim/field-solver bridges (ngspice-wasm/Xyce/openEMS/Renode/uPlot/Surfer), Ring-2 OCI never fork | GEMINI | QUEUED |
| X4 | Silicon/FPGA LibreLane + MCAD STEP co-design + supply chain + tracespace | GEMINI | QUEUED |
| FINAL | v0.2.0 release packet (human-gated, L128: no Tier-4 claim until 3 bench-verified PCBs) | GEMINI + USER | QUEUED |

**Dispatch prompt (Antigravity, fresh session in D:\project-gemini):**
`Run "git rebase main" first. Read .ai-sync/tickets/T-02c-gemini.md and execute it exactly (narrow: pin toolchain 1.100.0 + truthful handoff §4 — do NOT re-do passing T-02b work). Then read MASTER-GEMINI-ENDGAME.md + MASTER-GEMINI-EXPANSION.md (binding privacy policy) completely. Follow .ai-sync/README.md rules. You are the sole worker. After each phase: commit -s, write the handoff with raw evidence, STOP and signal READY_FOR_REVIEW — do not start the next phase before the orchestrator flips it READY.`

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