# VD-EXEC-001 · Granular Execution Ledger — phases → sub-phases → steps → sub-steps

| Field | Value |
|---|---|
| Revision | 1.0 (2026-11-24) |
| Authority | Orchestrator. Binds WORKER-GEMINI (sole worker, Antigravity, `D:\project-gemini`). |
| Refines | VD-MASTER-001 (G0–G8), VD-MASTER-002 (privacy + X-track), VD-UI-001 (G6=U0–U6). This ledger is the SMALL-CHUNK execution layer. |
| Companion | `INCOMPLETE-WORK-AND-CLEANUP.md` (full inventory of unfinished work + files). |
| Toolkit (BINDING) | `EXECUTION-TOOLKIT-AND-GUARDRAILS.md` (VD-TOOL-001) — anti-hallucination protocol, spoon-fed skills/tools/MCP/harness per domain, techstack connection map, RE carefulness, testing ways. Applies to EVERY sub-step below. |
| Optimization | `MASTER-GEMINI-OPTIMIZATION.md` (VD-PERF-001) — P-track (P0–P5) after G8, measure-first, zero-regression. |

## GLOBAL EXECUTION LAWS (every sub-step)
1. **context7 FIRST.** Before touching any unfamiliar API/library, consult `context7` for the CURRENT docs (record lib + version + doc date in the step log). If context7 unavailable, fetch latest official docs via web and record the URL+date. Never code from memory against a stale API. Load the routed `vd-*` skill (AGENTS.md routing table) for the domain.
2. **RED → GREEN → REFACTOR.** Write the failing deterministic test FIRST, paste its failure, then implement, then paste green. No production edit without a preceding red test.
3. **Small chunks.** One sub-step = one focused, independently verifiable change. Commit `-s` at each sub-phase boundary (squash sub-steps into one clean commit per sub-phase). Never batch unrelated changes.
4. **Offline $0, zero credentials, 127.0.0.1/UDS only.** Paste exact VERIFY_CMD output. Never fabricate output (F-14/F-19/F-21 discipline).
5. **WRITE_SCOPE per sub-phase.** No edits outside it. No AGENTS.md edits. No `daemon.py` edits outside G5 supervision scope (T-01 merged/locked).
6. **3 failed fixes ⇒ STOP**, log root cause in `findings.md`, file BLOCKER handoff, await ruling.
7. **Privacy (VD-MASTER-002 Part A):** RE provenance internal-only; public claims native MIT + published-spec conformance.
8. **Anti-vapor:** every named tech real+tested, truthfully relabeled, or removed.
9. **STOP-for-review at each PHASE end** (handoff + READY_FOR_REVIEW). Sub-phases commit incrementally; do not start the next PHASE before the orchestrator READY flip.
10. **Floors:** wasmtime≥50, react≥19.3.1, node≥26.13.1, typescript==7.0.2, Rust 1.100.0 (all confirmed to exist upstream). i64 nm / i32 millidegrees / UUIDv7. Fail-closed human locks.

---

## G0 · CI close-out (T-02c) — SMALL
**G0.1 · Rust pin**
- step 1: `git ls-remote --tags https://github.com/rust-lang/rust "1.100*"` → paste raw (1.100.0 present).
- step 2: edit `.github/workflows/ci-license-evalops.yml` `cargo-workspace-tests`: `toolchain: stable` → `toolchain: 1.100.0`.
- sub-step: `grep -n "toolchain:" .github/workflows/ci-license-evalops.yml` shows 1.100.0.
**G0.2 · Truthful handoff**
- step 1: replace T-02b handoff §4 fabricated claim with the raw ls-remote output + "pinned 1.100.0, no deviation".
**G0.3 · Verify + commit**
- `node scripts/check-actions-lock.mjs` (exit 0) · commit -s · STOP READY_FOR_REVIEW.
- SCOPE: `ci-license-evalops.yml`, `.ai-sync/handoffs/T-02b-gemini.md`. Do NOT re-do passing T-02b work.

## G1 · Kernel parity + floors + Cargo.lock (DeepSeek T-03 takeover)
> Inventory correction: F-05 ALREADY fixed at HEAD; F-07 range is PHANTOM. Only F-06 is genuine undone work. Adopt DeepSeek's 3 tests + 1 production script from `D:\project-deepseek` @ ab2ec71.
**G1.1 · Toolchain provisioning**
- step 1: install rustup via https://win.rustup.rs; `rustup toolchain install 1.100.0`; `rustc --version` paste.
- step 2: `cargo generate-lockfile` → commit `Cargo.lock`. sub-step: `cargo metadata --format-version 1` resolves.
- BLOCKER if cargo cannot install: complete TS/Python sides, report cargo BLOCKED with exact errors (never fake).
**G1.2 · F-05 parity regression (adopt only)**
- step 1: port `packages/hw-ir/tests/test_patch_op_parity.py` from DS. context7: none (stdlib).
- step 2: run → expect GREEN (UPSERT_ENTITY already in `ts/types.ts:121` + `model.rs:185`; `import` actor present). Paste. If RED, real drift exists → fix mirror RED-first.
**G1.3 · F-06 merge-driver registration (GENUINE)**
- step 1: RED — port `packages/hw-merge/tests/test_merge_driver_registration.py` from DS; run, paste failure (no `merge.hwir.driver` config in main).
- step 2: port `packages/hw-merge/register_merge_driver.py` (new production tooling) from DS; verify it sets `merge.hwir.driver = "hw-merge %O %A %B %L %P"`.
- step 3: run registration; `git config --get merge.hwir.driver` paste. sub-step: simulated 3-way conflict test GREEN.
- step 4: assert `.gitattributes:4 merge=hwir` matches crate `[[bin]] name="hw-merge"` (`packages/hw-merge/Cargo.toml:9`); package name `vd-merge` (:2) is fine — driver id = binary name. Add naming-parity test.
**G1.4 · F-07 footgun contract (adopt + document phantom)**
- step 1: port `packages/symbolic-verifier/tests/test_footgun_contract.py`; run GREEN (FG-05 = `check_split_plane_crossing(bool)`, `footguns.rs:186-193`, NO numeric limit).
- step 2: document in handoff: the 900–11000 / [1000,10000] range was a `prompt-2.txt` spec phantom, absent from shipped code; FG-04 decoupling already consistent (2_000_000 nm / "2.00 mm"). No range change needed.
**G1.5 · T-08 version floors**
- step 1: RED — grep `apps/desktop/package.json` typescript ^5.8.2 (violation). sub-step: repo-wide grep for typescript/react/node pins below floor.
- step 2: bump typescript==7.0.2 everywhere, react≥19.3.1; `moduleResolution: bundler|nodenext`. context7: typescript 7.0.2 + react 19.3.1 release notes.
- step 3: `pnpm install --frozen-lockfile` regenerate + commit lockfile; `pnpm -r exec tsc --noEmit` green.
**G1 handoff** `.ai-sync/handoffs/G-01-gemini.md` · SCOPE: hw-ir/hw-merge/symbolic-verifier tests+registration, schemas (patch-op/actor only), Cargo.lock, package.json/pnpm-lock, .gitattributes. Dual-context audit before merge.

## G2 · CAD/geometry truth (T-04)
**G2.1 · F-20 UUIDv7** — RED: test asserting autorouter ID version nibble==7 (currently `Uuid::new_v4()` `packages/autorouter/src/lib.rs`). GREEN: swap to `uuid` `now_v7` feature. context7: uuid crate v7 API.
**G2.2 · F-08 via-drop FSM** — RED: via-drop dispatches geometry op not `SET_LOCK` (verify shipped GUI `toolMode`/PcbCanvas route state; spec `manualEditorFsm.ts` may differ). GREEN: correct dispatch + regression.
**G2.3 · F-09a w_cong** — RED: `CostWeights` energy uses `w_cong` but struct omits it. GREEN: add field + test.
**G2.4 · F-09b IPC-2152 vs 2221** — RED: trace-width labeled IPC-2152 uses IPC-2221 constants (k=0.048, exp 0.725). Decision: implement real IPC-2152 OR relabel IPC-2221 honestly. context7: IPC-2152/2221 published formulas. GREEN: chosen path + boundary test.
**G2.5 · cavalier_contours** — activate in cad-geom offset path with behavior test OR remove dead dep + every claim. Default: activate.
**G2 handoff** G-02 · SCOPE: autorouter, cad-geom, GUI editor FSM, symbolic-verifier. Dual-context audit.

## G3 · Verification hardening (T-05)
**G3.1 · Gate classification** — enumerate every `scripts/verify-all.mjs` gate; tag structural(source-string) vs behavioral. RED-first convert top structural gates to behavioral (start: GUI gates → DOM in G6; daemon gates → real HTTP already).
**G3.2 · `vd doctor` fake-pass (NEW vapor)** — RED: `cli/main.rs:431-439` all-hardcoded `[PASS]`. GREEN: real preflight (check daemon health, toolchain versions vs floor, lockfiles) with honest FAIL paths. Also fix canned C2P2B `cli/main.rs:238-241`.
**G3.3 · wasm negatives** — fuel exhaustion / epoch interrupt / memory OOB tests for wasmtime≥50 sandbox; each must FAIL-closed.
**G3.4 · G4→G8 fail-closed** — RED: 1 un-waived DRC clearance error ⇒ Gate 8 REFUSES mfg bundle. GREEN.
**G3.5 · Gate-8 validator (F-19)** — bidirectional contradiction check; reject whitespace-only ≥32-char token; reject known fabricated hash patterns (`a1b2c3d4…` rotations, SHA-256-of-empty); raise-not-assert. Self-test.
**G3.6 · hw-dlp egress probe** — loopback-only egress negative test (zero outbound).
**G3.7 · solver recovery ladder** — Z3/SymPy timeout/recovery tests.
**G3 handoff** G-03 · SCOPE: scripts/, cli, nine-gates, mcp-gateway/worker-sdk tests, gate8. Dual-context audit.

## G4 · Upstream import + two ledgers (T-12, privacy-bound)
**G4.1 · script reconcile** — fix `scripts/import-upstream-stack.sh` (missing mkdir/.gitignore bootstrap, missing Misc, dup atopile); add `--dry-run` (no network). VERIFY: dry-run full listing.
**G4.2 · clone mirrors** — permissive→`vendor/ring1-refs/`, GPL→`vendor/quarantine/` (both gitignored). Forbidden set NEVER downloaded. VERIFY: `git check-ignore` both; `git status` clean of mirrors.
**G4.3 · PUBLIC manifest** — `vendor/MANIFEST.json` = vendored/linked/subprocess subset only (attribution). VERIFY: JSON valid + firewall covers every vendored dir.
**G4.4 · INTERNAL registry** — `.ai-sync/private/PRIVATE_REGISTRY.json` (gitignored) full 146 disposition + `RE_METHODOLOGY.md`. Orchestrator completeness audit (not public CI).
**G4.5 · golden fixtures** — generate from upstream behavior via subprocess where installable (KiKit panel, WireViz SVG/BOM, kiri diff); else spec-derived hand-authored, labeled. Fixtures = DATA, strip upstream code/comments.
**G4.6 · license exceptions** — `docs/LICENSE_EXCEPTIONS.md` Option A (elkjs EPL unmodified npm dep; surfer EUPL deferred). User may override Option B.
**G4 handoff** G-04 · SCOPE: import script, .gitignore, vendor/MANIFEST.json, .ai-sync/private/, tests/fixtures/, docs/LICENSE_EXCEPTIONS.md.

## G5 · Clean-room rewrites to parity (T-14/T-11/T-09) — each RED-first vs G4 fixtures
**G5.1 panelizer** → real `.kicad_pcb` panel (2×2), parse-back via cad-transcoder sexpr, i64 nm geometry, KiKit fixture compare (tolerance-labeled).
**G5.2 wire-harness** → WireViz-schema YAML import/export (spec-derived), SVG renderer, BOM+cut-list CSV.
**G5.3 pcb-diff** → kiri-parity layer SVG (F.Cu/B.Cu/silk/mask), moved/added/removed detection from HW-IR revisions, feeds GUI GIT_DIFF.
**G5.4 KiBot-style checks** → DRC/DFM bundle via kicad-cli subprocess + own MIT dfm-dfa-safety; never import KiBot code.
**G5.5 KiKit real invoke** → daemon `/api/v1/panel/generate` calls real kikit API (MIT) w/ own-panelizer fallback; mock-boundary offline test proves invocation (kill CLI-preview-string vapor).
**G5.6 iTriangle** → integrate `i_triangle` crate into cad-geom copper-pour w/ behavior test OR remove every claim (daemon.py:1339, commandBus.ts:252). Default integrate.
**G5.7 STEP AP242 + RS-274X** → occt-import-js STEP import (replace cli/main.rs:200 print-only vapor); real RS-274X plotter/parser in cad-transcoder (D01/D02/D03, G-codes, X2) round-trip golden. Export deferred honestly if out of reach.
**G5.8 CAS zstd/WAL** → zstd blob compression, WAL ladder (PASSIVE/250 patches, TRUNCATE idle), `.vd.autosave.jsonl` atomic shadow + recovery test.
**G5.9 supervision** → Windows Job Objects (KILL_ON_JOB_CLOSE) + Linux PR_SET_PDEATHSIG in vd-daemon child supervision, orphan-kill test.
**G5 handoff** G-05 · SCOPE: panelizer/wire-harness/pcb-diff/cad-geom/cad-transcoder/cas-store/hw-ir(WAL)/vd-daemon(supervision+panel+vapor)/dfm-dfa-safety, fixtures. Dual-context audit.

## G6 · UI/UX redesign = VD-UI-001 (U0–U6) — see that doc for sub-steps
U0 design-system lock (Hallmark scaffold, unify palettes, load fonts, design.md, sloplint --before) → U1 hybrid shell (VS Code/Blender/Adobe/sim-lab/real agent chat/Flux-Protoflow canvas, real dockview-react) → U2 real wgpu engine + measured FPS → U3 per-workspace recomposition (7, four states) → U4 behavioral DOM/browser gates + sloplint --kept Floor 0 → U5 accessibility AA + finish review → U6 acceptance/handoff. context7: dockview-react, wgpu, elkjs, uPlot, Playwright latest APIs. iBOM/ngspice-wasm/elkjs real-or-deferred. SCOPE per VD-UI-001.

## G7 · Claims truth (T-06 + F-19)
**G7.1 F-19 real hashes** — replace fabricated evidence_hash in board-1 verification_report.json with SHA-256 of actual artifact bytes or null+PENDING.
**G7.2 vapor sweep** — grep-driven: iTriangle (real per G5 or relabel), cli "3D STEP", vd doctor (fixed G3.2), WebGpuCanvas.tsx:25 mock, canned outputs. Checklist in handoff.
**G7.3 RE doc INTERNAL** — correct KiKit=MIT in internal ledger; RE doc stays gitignored; public spec-citations to published standards only.
**G7.4 CLAIMS_REGISTER** — every CLM re-verified + dated; CLM-008/009 software-only (0/3 fabricated); CVE primary-source URLs; new G5/G6 claims w/ evidence.
**G7.5 README + CHECKPOINT_PROGRESS reconcile** — measured reality (gate counts, CI, 0/3 fabrication). Fix stale "37/37 / 3 Physical Boards Certified".
**G7 handoff** G-07 · SCOPE: verification_report.json, gate8 test, docs/CLAIMS_REGISTER.md, docs/CHECKPOINT_PROGRESS.md, README.md, internal ledger. Dual-context audit.

## G8 · SPDX firewall + push + v0.1.0 packet (human-gated)
**G8.1** extend `check-spdx-firewall.mjs` to scan pnpm/uv/Cargo lockfiles vs deny-list+exceptions; injected-AGPL fixture exit 1; wire CI.
**G8.2** orchestrator asks user ONCE for push approval; only then push + `gh run watch` + paste run URLs/green. startup_failure persists ⇒ honest UNKNOWN + admin checklist. NEVER claim green without URL.
**G8.3** `docs/RELEASE_PACKET_v0.1.0.md`: fresh harness count, frozen-install proofs, test totals, CI URLs, firewall scan, claims, deferrals, 0/3 fabrication, human_signoff PENDING.
**G8.4** tag/release ONLY on explicit user instruction.

## X-track (v0.2.0, post-G8) — granular in VD-MASTER-002 Part D; each sub-phase RED-first
**X1** constraint-mgr (net-class/diff-pair/length-tuning real in Rust) · variants · BOM analytics (InvenTree/jlcparts) · DFM/DFA/PI scorecards.
**X2** collab CRDT (yjs/automerge) on HW-IR projections · presence+lock fail-closed · <16ms CrossProbeBus measured · project digest hw.lock.
**X3** ngspice-wasm Tier-0 · Xyce Pack-2B · vd-spice-compat · openEMS/ElmerFEM/CalculiX/Palace CadQuery→Gmsh WorkerContract gVisor · Renode lockstep co-sim · uPlot 60FPS/166k/25ms · Surfer (Option A/B).
**X4** LibreLane Pack-2C · MCAD STEP co-design + clearance DRC · jlcparts/JLC2KiCad_lib supply chain · tracespace Gerber · SKiDL optional importer.
Each: WRITE_SCOPE + offline VERIFY + handoff + STOP. v0.2.0 packet human-gated; L128 no Tier-4 claim until 3 bench-verified PCBs.

---

## KICKOFF PROMPT (paste into a fresh Antigravity session in D:\project-gemini)
```
You are WORKER-GEMINI, sole worker on Vajra-Dhir EDA. Work carefully in SMALL, perfectly-planned, incremental, sequential, staged chunks.

1. Run `git rebase main` first.
2. Read COMPLETELY, in order: .ai-sync/README.md, AGENTS.md, task_plan.md, findings.md,
   .ai-sync/tickets/MASTER-GEMINI-ENDGAME.md (VD-MASTER-001),
   .ai-sync/tickets/MASTER-GEMINI-EXPANSION.md (VD-MASTER-002, binding privacy policy),
   .ai-sync/tickets/MASTER-GEMINI-UI-REDESIGN.md (VD-UI-001),
   .ai-sync/tickets/EXECUTION-TOOLKIT-AND-GUARDRAILS.md (VD-TOOL-001 — binding every sub-step),
   .ai-sync/tickets/MASTER-GEMINI-EXECUTION-LEDGER.md (VD-EXEC-001, your step-by-step),
   .ai-sync/tickets/MASTER-GEMINI-OPTIMIZATION.md (VD-PERF-001, P-track after G8),
   .ai-sync/tickets/INCOMPLETE-WORK-AND-CLEANUP.md (what is unfinished),
   .ai-sync/tickets/T-02c-gemini.md (your FIRST task).
3. Execute G0 (T-02c) EXACTLY: pin toolchain 1.100.0 + truthful handoff §4. Nothing else.
4. For EVERY sub-step: consult context7 for the latest docs of any unfamiliar API BEFORE coding
   (record lib+version+date); load the routed vd-* skill; write the failing test FIRST (paste red),
   implement, paste green; run the exact VERIFY_CMD offline ($0, zero credentials, 127.0.0.1 only);
   stay inside WRITE_SCOPE; commit -s per sub-phase.
5. DeepSeek's unfinished T-03 is YOURS (G1): adopt its 3 tests + register_merge_driver.py from
   D:\project-deepseek @ ab2ec71. F-05/F-07 are already-fixed/phantom — adopt tests + document; F-06 is the real work.
6. Keep all reverse-engineering provenance INTERNAL (.ai-sync/private/, gitignored). Public docs claim
   native MIT + published-spec conformance only. Zero GPL expression in Ring 1. No fabricated evidence.
7. After EACH phase: write the handoff with raw evidence, STOP, signal READY_FOR_REVIEW.
   Do NOT start the next phase before the orchestrator flips it READY on .ai-sync/TASK_BOARD.md.
8. Never push, never fabricate a human signoff, never edit AGENTS.md. 3 failed fixes ⇒ STOP + BLOCKER handoff.

Begin with G0 now.
```