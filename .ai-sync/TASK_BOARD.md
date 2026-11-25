# TASK BOARD (orchestrator-only)

Updated: 2026-11-24 · **SOLE-WORKER MODE: WORKER-GEMINI (Antigravity) only**
Tier-0 Bootstrap: `.ai-sync/WORKER_BOOTSTRAP.md` (`VD-BOOT-001` — read THIS + active ticket only)
Receipt Gate: `node scripts/verify-handoff.mjs --phase <PHASE> --ticket <TICKET>`
Master plan: `.ai-sync/tickets/MASTER-GEMINI-ENDGAME.md` (`VD-MASTER-001`, G0–G8)
Binding addendum: `.ai-sync/tickets/MASTER-GEMINI-EXPANSION.md` (`VD-MASTER-002` — privacy policy + full registry/critic coverage + X-track)
UI redesign: `.ai-sync/tickets/MASTER-GEMINI-UI-REDESIGN.md` (`VD-UI-001` — Hallmark, executes as G6A–G6D)
Execution ledger: `.ai-sync/tickets/MASTER-GEMINI-EXECUTION-LEDGER.md` (`VD-EXEC-001` — granular phases→sub-phases→steps→sub-steps, context7-first mandate)
Toolkit: `.ai-sync/tickets/EXECUTION-TOOLKIT-AND-GUARDRAILS.md` (`VD-TOOL-001` — anti-hallucination/evidence-integrity, skills/tools/MCP/harness, techstack connection map, RE carefulness, testing)
Optimization: `.ai-sync/tickets/MASTER-GEMINI-OPTIMIZATION.md` (`VD-PERF-001` — P-track P0–P5, measure-first zero-regression, after G8 before X)
Inventory: `.ai-sync/tickets/INCOMPLETE-WORK-AND-CLEANUP.md` (all unfinished tickets/vapor + cleanup manifest)

## Active program
| Phase | Content | Owner | Status |
|---|---|---|---|
| G0 | T-02c Rust `1.100.0` pin + truthful handoff §4 + `verify-handoff.mjs` receipt | GEMINI | **MERGED** (`T-02b + T-02c` `b80fdde` merged `--no-ff`) |
| G1 | T-03 takeover (`vd-merge`/bin `hw-merge` F-06; F-05/F-07 adopt-tests) + `Cargo.lock` + Rust `1.100.0` `min-publish-age` + TS `7.0.2` cross-OS/API audit | GEMINI | **MERGED** (`b13a312` merged `--no-ff`, dual-context `APPROVE_WITH_NOTES`) |
| G2 | T-04 CAD/geometry truth (F-08/F-09/F-20 UUIDv7, `w_cong`, IPC-2152 vs 2221, `cavalier_contours`) | GEMINI | **READY** (ticket `.ai-sync/tickets/G2-gemini.md` / `T-04-deepseek.md`) |
| G3 | T-05 verification hardening (explicit `STRUCTURAL_CHECK` / `GUI_DEFERRED_TO_G6D` labels, real `vd doctor`, Wasmtime `>= 51.0.0` negatives, G4→G8 fail-closed, F-19 validator, `hw-dlp`, solver-recovery) | GEMINI | QUEUED |
| G4 | T-12 fixed `import-upstream-stack.sh --dry-run` + PUBLIC vendored `MANIFEST.json` + INTERNAL `.ai-sync/private/PRIVATE_REGISTRY.json` (146) + golden fixtures + `docs/LICENSE_EXCEPTIONS.md` | GEMINI | QUEUED |
| G5A | Manufacturing & Transcoder: MIT `vd-panelizer` (`.kicad_pcb` 2×2) + Ring-2 subprocess `KiKit` + KiBot-style MIT DFM via `kicad-cli` + RS-274X + EAGLE/KiCad import | GEMINI | QUEUED |
| G5B | Visual, Harness & 3D: `wire-harness` (YAML→SVG/BOM) + `pcb-diff` (layer SVG) + `i_triangle` MIT/Apache `i64` integer API + `occt-import-js` LGPL-2.1-OCCT-exception isolated WASM Web Worker | GEMINI | QUEUED |
| G5C | Durability & App Shell: `cas-store` zstd + SQLite WAL ladder + `.vd.autosave.jsonl` crash recovery + **transactional Undo/Redo (`Ctrl+Z`/`Ctrl+Shift+Z`)** + Job Objects/`PR_SET_PDEATHSIG` + **`vd studio` launcher** | GEMINI | QUEUED |
| G6A | **= VD-UI-001 (U0+U1 Shell)** consolidate `apps/prototype-gui` + `apps/desktop` → `apps/workstation`, unified Silicon Darkroom tokens, self-hosted fonts, `design.md`, real `dockview-react` 8.9.x (MIT only), Project Templates, Crash-Recovery banner, Per-Panel Error Boundaries | GEMINI | QUEUED |
| G6B | **= VD-UI-001 (U2 Engine)** real instanced WebGPU/WebGL2 + Canvas2D fallback + real `elkjs` schematic auto-layout + `zustand` CrossProbeBus `<16 ms` + measured rAF FPS meter | GEMINI | QUEUED |
| G6C | **= VD-UI-001 (U1-Agent+U3 Workspaces)** additive `packages/vd-daemon/src/agent_routes.py` SSE streaming + proposal diff cards + `deterministic_offline` & `ollama` providers + fail-closed locks + all 7 workspaces (4 states) + built-in calculators + `iBOM` + `PcbDraw` + `uPlot` | GEMINI | QUEUED |
| G6D | **= VD-UI-001 (U4–U6 Proof)** Playwright behavioral gates + **5 Golden E2E Journeys** + Hallmark `sloplint --render --kept` Floor 0 FAIL + `.hallmark/compare.html` + WCAG AA + Finish Review | GEMINI | QUEUED |
| G7 | T-06 claims truth + F-19 real SHA-256 hashes + vapor sweep + `README.md` / `CHECKPOINT_PROGRESS.md` / `CLAIMS_REGISTER.md` reconciliation (RE doc stays INTERNAL) | GEMINI | QUEUED |
| G8 | T-15 `check-spdx-firewall.mjs` across `pnpm-lock.yaml` / `uv.lock` / `Cargo.lock` + user-approved push/CI proof + `docs/RELEASE_PACKET_v0.1.0.md` (`human_signoff: PENDING`) | GEMINI + USER | QUEUED |
| P-track | VD-PERF-001 P0–P5: baseline budgets → Rust hot paths → GPU/Workers/React 19 → daemon → build/bundle → zero-regression proof (harness green) | GEMINI | QUEUED (post-G8) |
| X1 | Constraint mgr + variants + `InvenTree`/`jlcparts` BOM analytics + DFM/DFA/PI scorecards | GEMINI | QUEUED (post-P-track) |
| X2 | Real-time CRDT collab + project digest `hw.lock` + `<16 ms` CrossProbeBus | GEMINI | QUEUED |
| X3 | `ngspice-wasm` + Xyce Pack-2B + `openEMS`/`Palace`/`ElmerFEM`/`CalculiX` gVisor OCI + `Renode` co-sim + pure-MIT VCD/FST waveform track (`uPlot`/Canvas, replacing EUPL `surfer`) | GEMINI | QUEUED |
| X4 | Silicon/FPGA `LibreLane` Pack-2C + MCAD STEP 3D clearance DRC + `JLC2KiCad_lib` + `tracespace` Gerber + optional SKiDL | GEMINI | QUEUED |
| FINAL | v0.2.0 release packet (human-gated, L128: no Tier-4 claim until 3 bench-verified PCBs) | GEMINI + USER | QUEUED |

**Dispatch prompt (Antigravity, fresh session in `D:\project-gemini`):**
```text
You are WORKER-GEMINI, sole worker on Vajra-Dhir EDA in D:\project-gemini (branch feat/worker-gemini).
1. Run `git rebase main`.
2. Read ONLY these 2 files completely:
   - `D:\Vajra-Dhir-EDA\.ai-sync\WORKER_BOOTSTRAP.md` (read-only Tier-0 binding rulebook; `.ai-sync` is kept git-untracked on main; backed by VD-TOOL-001 & VD-PERF-001)
   - `D:\Vajra-Dhir-EDA\.ai-sync\tickets\G1-gemini.md` (your active G1 ticket — sole source of WRITE_SCOPE and VERIFY_CMD)
3. Execute G1 (G1.1–G1.5) in sequential RED→GREEN sub-phases with `git commit -s` per sub-phase.
4. Run `node scripts/verify-handoff.mjs --phase G1 --ticket D:\Vajra-Dhir-EDA\.ai-sync\tickets\G1-gemini.md` and confirm exit 0 + receipt JSON written.
5. Write `.ai-sync/handoffs/G-01-gemini.md` referencing the receipt, signal `READY_FOR_REVIEW`, and STOP.
   Do NOT push. Do NOT start G2 until the orchestrator merges G1 and flips G2 to READY on `.ai-sync/TASK_BOARD.md`.
```

## History (merged/closed)
| Ticket | Outcome |
|---|---|
| T-01 daemon+lockfiles | MERGED 5964a8f (64/64 fresh, dual-context APPROVE_WITH_NOTES → F-19/F-20) |
| T-07 gap audit | MERGED 1639a03 (root-cause claim corrected, F-17) |
| T-02 CI | REJECTED → T-02b (false root cause, missing jobs, Node 22 downgrade) |
| T-02b CI remediation | MERGED (with T-02c `b80fdde`) |
| T-02c Rust 1.100.0 pin | MERGED (G0 `--no-ff`, receipt `G0-receipt.json`) |
| T-03 (DeepSeek) | RETIRED mid-flight; WIP ab2ec71 adopted + merged in G1 |
| G1 (T-03+T-08) | MERGED (`b13a312` `--no-ff`, dual-context `APPROVE_WITH_NOTES`, receipt `G1-receipt.json`) |
| T-04/T-05/T-06/T-08..T-16 | FOLDED into G1–G8 + P-track + X-track |

## Ground truth
Harness at main: **64 PASS / 0 FAIL exit 0** (orchestrator-verified at T-01 merge). Lockfiles: pnpm ✓ uv ✓ Cargo.lock pending G1. Host: Node 24.19.0 (user upgrade to 26.13.1 LTS pending), Python 3.14.7, uv 0.12.5, pnpm 10.6.0; rustup provisioning G0/G1. Rust `1.100.0` floor CONFIRMED to exist upstream (orchestrator `git ls-remote`, F-21).

## Rulings (User + Orchestrator, 2026-11-24)
- **Wasmtime track (USER RULING):** **`>= 51.0.0`** (monthly rolling train, replacing EOL-imminent `50.0.0` which reaches EOL 2026-12-20).
- **Workstation packaging (USER RULING):** **`vd studio`** (`vd-daemon` serving `apps/workstation` static `dist/` on `127.0.0.1:41900`) for **v0.1.0**, with an optional **Tauri v2** native desktop shell in **v0.2.0**.
- **F-18 `stash@{0}` (USER RULING):** Archived to gitignored `.ai-sync/private/archive/stash0-v005-backup.patch` and dropped from `git stash list`.
- **Provenance privacy (`VD-MASTER-002` Part A):** RE methodology/provenance internal-only (`.ai-sync/private/`, gitignored); public `vendor/MANIFEST.json` = vendored/linked/subprocess attribution only; public docs claim native MIT + published-spec conformance, never derivation. `docs/REVERSE_ENGINEERED_ENGINES.md` stays gitignored.
- **Critic L79 override (ADOPTED):** `dockview-react` (MIT `8.9.x`, NEVER `dockview-enterprise`), `three.js`, `occt-import-js`, `monaco-editor`, `xterm.js`, `node-pty` pulled forward; Electron stays deferred.
- **License exceptions & replacements:** Option A for `elkjs` (`EPL-2.0`, unmodified npm dep) and `occt-import-js` (`LGPL-2.1-with-OCCT-exception`, unmodified runtime WASM Web Worker) in `docs/LICENSE_EXCEPTIONS.md`; Option B pure-MIT VCD/FST track on `uPlot`/Canvas replacing EUPL-1.2 `surfer` in X3; `serde_kicad_sexpr` dropped (own pure-MIT KiCad 10 S-expr parser in `cad-transcoder`); `KiKit` invoked strictly as Ring-2 subprocess (fallback to MIT `vd-panelizer`).
- **Host Node `24.19.0` → `26.13.1` LTS upgrade:** USER action (`fnm`/official installer; CI pins `26.13.1` regardless).
- **Push to GitHub:** only via G8/X-final explicit user approval.

## Quarantine & hazards
- `.gitignore` ignores `vendor/ring1-refs/`, `vendor/quarantine/`, `workers/sources/`, `plugins/sources/`, `evalops/sources/`, `tools/local-mcps/`, `.ai-sync/private/`, `.hallmark/`, `docs/REVERSE_ENGINEERED_ENGINES.md`.
- GUI truth (`VD-UI-001` pre-flight): shipped app = `apps/prototype-gui` (vite-only); its Dockview is a MOCK (`dockview-react` only in `apps/desktop`); 3 divergent palettes; fonts declared-not-loaded; AI dock static text; `webgpu-cad-engine` 112-line stub; ALL UI gates source-text/HTTP. G5C/G6A–G6D consolidate into `apps/workstation` served by `vd studio` and fix all defects.
