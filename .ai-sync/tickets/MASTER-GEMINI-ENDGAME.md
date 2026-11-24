# MASTER HANDOFF PLAN — GEMINI SOLE-WORKER ENDGAME
## Vajra-Dhīr EDA · VD-MASTER-001 Rev 1.0 · 2026-11-24

**Executor:** WORKER-GEMINI (Antigravity) — the ONLY worker from this point. OpenCode/DeepSeek is retired; its partial T-03 work is preserved for adoption (Phase 0).
**Worktree:** `D:\project-gemini` · branch `feat/worker-gemini` · NEVER write to `D:\Vajra-Dhir-EDA` (main is orchestrator-only) or `D:\project-deepseek` (read-only archive).
**Orchestrator:** audits every phase handoff (scope diff + fresh VERIFY_CMD re-run + dual-context review for security/geometry phases), merges `--no-ff`, rebases your worktree, flips the next phase to READY.
**Read first, every session (Tier-0 SSOT):** `.ai-sync/WORKER_BOOTSTRAP.md` + your active ticket. (Reference docs: `AGENTS.md`, `docs/AGENT_KNOWLEDGE_UPDATE_2026_11.md`, `findings.md`, `task_plan.md` §9.)

---

## 0. GLOBAL LAWS (apply to every phase; violation = auto-reject)

1. **Units/IDs:** all geometry `i64` nanometers (`1 mm = 1_000_000 nm`), angles `i32` millidegrees `0..360000`; entity IDs immutable UUIDv7. NEVER floats for PCB/IC coordinates in SQLite or JSONL.
2. **Human locks fail closed:** every HW-IR write sets `_tx_actor_ctx` in-transaction; non-human actors never mutate `locked=1`. NEVER fabricate a `human_signoff_token` or any evidence hash. Gate 8 release is human-gated forever.
3. **License firewall (Ring 1 = `packages/*`, `apps/*`):** strictly MIT / Apache-2.0 / BSD. Zero AGPL (kibot, konnect, part-db, pypsa-app, openmodelica, pymupdf/fitz), zero GPL linked in Ring 1, zero non-commercial ML checkpoints, zero vendor PDFs committed. GPL tools (KiCad, Xyce, spicelib, gmsh, KLayout, WireViz, kiri…) live ONLY as Ring-2 subprocess/OCI or ignored vendor mirrors — never linked, never committed.
4. **Clean-room discipline for rewrites:** GPL/AGPL mirrors may be downloaded for **behavioral study and golden-fixture generation only**. Rewrites are written from **published specs, file-format docs, standards (IPC/Gerber RS-274X/STEP AP242), and observed I/O behavior** — NEVER line-by-line translation or copy-paste of GPL source. Each rewritten module's handoff must state its spec sources. This is what makes the rewrite MIT-legitimate.
5. **Version floors (verified upstream 2026-11-24 — all exist, no downgrades):** **wasmtime ≥ 51.0.0** (user ruling: replaces `50.0.0` which hits EOL 2026-12-20) · react ≥ 19.3.1 (npm latest; use `<ViewTransition>` & Fragment Refs where helpful) · node ≥ 26.13.1 (LTS "Lithium", nodejs.org/dist 2026-11-10; native `crypto.randomUUIDv7()`, ban `randomUUID()` v4 in entity code) · typescript == 7.0.2 (npm latest; audit programmatic `ts` API tools + cross-OS optional binaries) · Rust 1.100.0 (rustup; native Cargo `min-publish-age` 72h cooldown & unused-dep checks). When importing any upstream project, record its latest release version + date in the vendor manifest; prefer latest stable, never the stale pins in `prompt-and-skills/prompt-2.txt` (wasmtime 30 / React ^19 are BANNED — F-11).
6. **Failing test FIRST** (red output → green output pasted raw in handoff). Never weaken/delete a test to pass. Never fake VERIFY_CMD output. 3 failed fix attempts ⇒ STOP, log root cause in handoff + `findings.md` reference, file BLOCKER, await orchestrator.
7. **Offline $0 tests:** all Ring-1 tests run with zero credentials, zero API cost, zero network. Network IS allowed for tooling provisioning (rustup, pnpm, uv, git mirrors) — but CI test jobs must pass on a clean runner from committed lockfiles + fixtures only.
8. **Zero inbound open ports:** daemon binds 127.0.0.1 only; workers `network_mode: none`; no secrets in Git.
9. **Anti-vapor law:** every technology named in code/labels/CLI/gates/docs must be (a) really integrated + behaviorally tested, (b) truthfully relabeled, or (c) removed. Known vapor labels to eliminate: "iTriangle" (`daemon.py:1339`), "elkjs" (`SchematicCanvas.tsx:169` label-only), "3D STEP" (`cli/main.rs:200` print-only), "WireViz"/"kiri" GUI labels, KiKit declared-but-never-invoked.
10. **DCO:** `git commit -s` on every commit. One phase = one or more clean commits + one handoff `.ai-sync/handoffs/G-XX-gemini.md` with raw evidence. No push to origin — EVER — without explicit user approval relayed by the orchestrator.
11. **Scope discipline:** each phase has a WRITE_SCOPE allowlist. Touch nothing outside it. Missing contract ⇒ BLOCKER handoff, never invent an API/schema/dependency.
12. **Harness ground truth:** at main `e5b2171`+ the full harness is **64/64 exit 0** (orchestrator-verified). Every phase must end with `node scripts/verify-all.mjs` green and zero regressions. If your phase adds gates, the count rises — report the new exact count.

---

## PHASE G0 — State reconciliation & T-02b close-out (start immediately)

**Mission:**
1. Your T-02b commit `a039258` + handoff are awaiting orchestrator audit. Re-read `.ai-sync/tickets/T-02b-gemini.md` acceptance list; self-check every item; if the audit returns defects, fix them first. The startup_failure section must contain raw `gh` evidence OR honest `UNKNOWN` + admin checklist — never a fabricated root cause (the previous "pull_request null" claim was false; bare `pull_request:` is valid YAML).
2. Rebase onto latest main (`git rebase main`) to inherit the master plan + T-04 ticket + ledger.
3. Provision local toolchain if absent: rustup → Rust 1.100.0 (`rustup toolchain install 1.100.0`; if unavailable upstream, install latest stable and RECORD the deviation with `rustup` output — do not silently pin `stable`), pnpm 10.x via corepack, uv (already 0.12.5), Python 3.14.x (already present).
4. Run the full harness fresh; paste tail + exit code.

**WRITE_SCOPE:** `.github/workflows/**`, `scripts/check-actions-lock.mjs`, `schemas/fixtures/**`, `requirements-ci.txt`, `.ai-sync/handoffs/G-00-gemini.md`.
**VERIFY_CMD:** `node scripts/check-actions-lock.mjs` · `actionlint .github/workflows/*.yml` (or recorded unavailability) · `node scripts/verify-all.mjs` · jsonschema negative-fixture rejection traceback.
**Acceptance:** T-02b acceptance fully met; Node job pins 26.13.1 + frozen install + typecheck + build + tests; Python job pins 3.14 + `uv sync --frozen` + pytest; real jsonschema validation with ValidationError-proven negative fixture; Rust pinned or deviation recorded; harness green.

---

## PHASE G1 — Kernel parity takeover (adopt DeepSeek T-03 WIP) + toolchain floors

**Mission (T-03 remainder, then T-08 — per F-22 inventory correction):**
1. **Adopt WIP:** read-only inspect `D:\project-deepseek` commit `ab2ec71` (4 files: `packages/hw-ir/tests/test_patch_op_parity.py`, `packages/hw-merge/register_merge_driver.py`, `packages/hw-merge/tests/test_merge_driver_registration.py`, `packages/symbolic-verifier/tests/test_footgun_contract.py`). Port them into your worktree, run, and verify:
2. **F-05 patch-op parity (adopt regression test only):** `UPSERT_ENTITY` and `import` actor are ALREADY fixed at HEAD (`F-22`). Adopt `test_patch_op_parity.py` to guard against future drift.
3. **F-06 merge driver (GENUINE production work):** `.gitattributes` binds `merge=hwir`. Package in `packages/hw-merge/Cargo.toml` is **`vd-merge`** with binary **`hw-merge`**. Ship `register_merge_driver.py` (sets `git config merge.hwir.driver "hw-merge %O %A %B %L %P"` + `merge.hwir.name`); test asserts registration + simulated 3-way conflict on `.vd-ir.jsonl` resolves semantically (courtyard collision negative test).
4. **F-07 FG-05 range (adopt test + document phantom):** shipped FG-05 is `check_split_plane_crossing(bool)` (no numeric range); `900–11000 / [1k,10k]` was a `prompt-2.txt` spec phantom (`F-22`). Adopt contract test + document in handoff.
5. **T-08 floors + TS 7.0.2 audit:** typescript → exactly `7.0.2` in EVERY package/app manifest (known violation: `apps/desktop/package.json` `^5.8.2`). Audit any dev tool importing `import * as ts from "typescript"` (no stable programmatic API in 7.0.2); preserve cross-OS native optional binaries in `pnpm-lock.yaml` (`win32-x64` + `linux-x64`); use `tsc --noEmit --checkers 2` in CI. `engines.node >= 26.13.1`, `react >= 19.3.1`, native `crypto.randomUUIDv7()`. Regenerate `pnpm-lock.yaml` via `pnpm install --frozen-lockfile`. **Commit `Cargo.lock`** (`cargo generate-lockfile`) + configure Cargo 1.100.0 native `min-publish-age` (72h) and unused-dep checks.
6. Host Node is 24.19.0 (user upgrade pending) — CI pins 26.13.1 regardless; do not downgrade manifests to match the host.

**WRITE_SCOPE:** `packages/hw-ir/**` (tests), `packages/hw-merge/**`, `packages/symbolic-verifier/**` (tests), `package.json` files (TS/engines/supportedArchitectures), `apps/desktop/package.json`, `pnpm-lock.yaml`, `Cargo.lock`, `.cargo/config.toml`, `.gitattributes` (only if needed), `.ai-sync/handoffs/G-01-gemini.md`, `.ai-sync/handoffs/G1-receipt.json`.
**VERIFY_CMD:** `cargo test -p vd-hw-ir -p vd-merge -p vd-symbolic-verifier` · parity/contract/driver tests · `pnpm install --frozen-lockfile` · `cargo check --workspace` · `node scripts/verify-all.mjs`.
**Acceptance:** all RED→GREEN proofs pasted; driver registration test simulates real conflict; TS 7.0.2 everywhere (cross-OS lockfile + programmatic API audited); Cargo.lock committed; harness green.

---

## PHASE G2 — CAD & geometry truth (T-04, ticket already written)

Execute `.ai-sync/tickets/T-04-deepseek.md` EXACTLY (owner transfers to you): F-08 via-drop FSM (`SET_LOCK` → geometry op), F-09a `w_cong` in `CostWeights`, F-09b IPC-2152-vs-2221 (implement real 2152 tables OR truthfully relabel — no third option), F-20 autorouter `Uuid::new_v4()` → v7 + version-nibble test, cavalier_contours activate-with-arc-test OR remove dead dep.
**WRITE_SCOPE / VERIFY_CMD:** per the T-04 ticket; handoff `.ai-sync/handoffs/G-02-gemini.md`.
**Extra:** after fixes, run `cargo test --workspace` once — paste summary. Geometry changes trigger orchestrator dual-context review; keep diffs minimal and spec-cited (IPC-2221 tables, IPC-2152 charts).

---

## PHASE G3 — Verification hardening (T-05): make every gate honest

**Mission:**
1. Convert the static string-grep gates listed in `.ai-sync/handoffs/T-07-gemini.md` §3 (Gates 5,7,8,9,10,11,12,13,15,16,17,18,19,20,21,22,24,25,28,29 sample) into REAL behavioral execution: `cargo test -p <crate>` / `python -m pytest <pkg>` / `node --test <pkg>` invoked from `scripts/verify-all.mjs`, with per-gate category labels `UNIT_TEST` / `INTEGRATION_TEST` / `STRUCTURAL_CHECK` printed honestly. A gate may remain STRUCTURAL only if it genuinely checks a spec artifact (DDL text, threat-model doc) — label it, never count it as behavioral.
2. **wasm-sandbox negative depth:** `packages/wasm-sandbox/tests/sandbox_limits_test.rs` exists — verify it truly proves fuel exhaustion (50M trap), epoch timeout (5s trap), memory ceiling (256 MiB allocation failure). Add missing cases RED-first.
3. **G4→G8 fail-closed negative path:** test proving 1 un-waived DRC clearance error ⇒ Gate 8 REFUSES manufacturing bundle generation.
4. **Gate-8 validator hardening (F-19 notes):** contradiction check must be bidirectional (`RELEASED` + `release_authorized:false` must fail); reject whitespace-only tokens; replace `assert` with explicit `raise` (survives `python -O`).
5. **hw-dlp egress probe:** deterministic loopback-based egress test (Windows-safe): non-whitelisted outbound request dropped, budget cap enforced, zero-packet proof labeled as fixture-based (netns is Linux-only — say so).
6. **solver-recovery unit tests:** `packages/solver-recovery` has 0 tests — simulate non-convergence, prove `gmin_stepping → source_stepping → transient_assist` ladder executes and steps down tolerances.
7. KiCad golden round-trip: `parse(designs/board-1-buck-pd/board.kicad_sch) → ast → serialize()` AST-equivalence test (formatting-normalized), in `packages/cad-transcoder`.

**WRITE_SCOPE:** `scripts/verify-all.mjs`, `packages/wasm-sandbox/**`, `packages/solver-recovery/**`, `packages/hw-dlp/**` (tests), `packages/cad-transcoder/**` (round-trip test), `scripts/test-gate8-release.py`, `scripts/test-milestone1-advanced.py`, `.ai-sync/handoffs/G-03-gemini.md`.
**VERIFY_CMD:** `node scripts/verify-all.mjs` (paste FULL output — every gate line + new total) · `cargo test -p vd-wasm-sandbox -p vd-solver-recovery` · pytest suites touched.
**Acceptance:** zero string-grep gates masquerading as behavioral; every conversion has RED→GREEN proof; harness total reported exactly; dual-context review will follow (security-critical).

---

## PHASE G4 — Upstream import & mirror program (T-12 + registry execution)

**Mission: import/download ALL relevant registry projects, license-classified.**
1. Reconcile `scripts/import-upstream-stack.sh` with `prompt-and-skills/techstack.md` (script drifted: missing mkdir/.gitignore bootstrap block, missing Misc entries, duplicate atopile). Fix script; add `--dry-run` mode listing every clone URL + target dir + license class WITHOUT network.
2. Execute imports into **gitignored** mirrors (never committed): permissive Ring-1 refs → `vendor/ring1-refs/<name>` (`git clone --depth 1` latest stable tag; record version+date); study-only refs → same pattern; GPL/AGPL hard-license projects → `vendor/quarantine/<name>` (KiCad source, WireViz, kiri/KiCad-Diff, KiBot, Xyce, spicelib, gmsh, KLayout, Magic/xschem/netgen, freerouting, openEMS…). Quarantine dirs: never linked, never imported by build, never committed.
3. **Two ledgers (VD-MASTER-002 Part A, binding).** PUBLIC committed `vendor/MANIFEST.json` covers ONLY code actually vendored/linked/subprocess-invoked: `{name, url, license, version, date_imported, class: ring1-dep|ring2-subprocess, purpose}` — legal attribution, NO `rewrite_target`, NO study/quarantine/forbidden entries. INTERNAL-ONLY gitignored `.ai-sync/private/PRIVATE_REGISTRY.json` carries the full 146 disposition `{class: integrate|rewrite|subprocess|study-only|forbidden, rewrite_target_package, study_notes, fixture_provenance}` + `RE_METHODOLOGY.md`. Forbidden set (KiBot, Konnect, Part-DB, pypsa-app, OpenModelica, PyMuPDF) = DO NOT DOWNLOAD AT ALL; bans + MIT replacements recorded INTERNALLY (KiKit+kicad-cli+PcbDraw / custom 3-channel bridge / InvenTree / PyPSA / external opt-in / pypdfium2+pdfplumber). Public docs name the native MIT implementation, never the derivation.
4. For each hard-license rewrite target, generate **golden fixtures from upstream behavior** where installable via subprocess (Ring-2 pattern): e.g. KiKit panelize a sample board → capture `.kicad_pcb` output as fixture; WireViz compile a sample YAML → capture SVG/BOM as fixture; kiri diff two revisions → capture expected layer changes. Fixtures are DATA (committed under `tests/fixtures/`), not GPL code. Where a tool cannot be installed offline-safely, use published format specs + hand-authored fixtures and label them `spec-derived`.
5. License gray zones & exceptions: Option A for `elkjs` (`EPL-2.0`, unmodified npm dep) and `occt-import-js` (`LGPL-2.1-with-OCCT-exception`, unmodified runtime WASM Web Worker — NOT MIT!) documented in `docs/LICENSE_EXCEPTIONS.md`. Option B (pure-MIT VCD/FST digital track on `uPlot`/Canvas) replaces EUPL-1.2 `surfer` in X3 (never downloaded in Ring 1). `serde_kicad_sexpr` dropped (own pure-MIT KiCad 10 S-expr parser in `packages/cad-transcoder`). `horizon` (GPL-3.0) quarantined to `vendor/quarantine/` (study-only); `reuse-tool` CI-CLI-only.

**WRITE_SCOPE:** `scripts/import-upstream-stack.sh`, `.gitignore` (mirror dirs only), `vendor/MANIFEST.json`, `docs/LICENSE_EXCEPTIONS.md`, `tests/fixtures/**` (new fixture dirs per package), `.ai-sync/handoffs/G-04-gemini.md`.
**VERIFY_CMD:** `bash scripts/import-upstream-stack.sh --dry-run` (full listing pasted) · `git status --short` proving mirrors untracked · `git check-ignore vendor/ring1-refs vendor/quarantine` · manifest JSON validity · fixture generation commands + outputs.
**Acceptance:** every registry project classified in MANIFEST (146 entries, none silently skipped); zero forbidden downloads; zero GPL source committed; fixtures exist for all Phase-G5 rewrite targets; handoff lists import failures honestly (network-blocked repos = recorded, not faked).

---

## PHASE G5 (Split: G5A → G5B → G5C) — Clean-room rewrites to parity, durability & `vd studio`

Spec-based MIT rewrites, validated against G4 golden fixtures. Each sub-phase fits 1 clean session (`RED-first → implement → verify-handoff → commit -s → STOP`).

### G5A · Manufacturing, Transcoder & Ring-2 KiKit
1. **panelizer (`vd-panelizer`) → real `.kicad_pcb` panel:** 2×2 matrix output, parse-back test via `packages/cad-transcoder` sexpr parser, `i64` nm mouse-bites/rails/fiducials/tooling-holes, KiKit golden-fixture comparison (tolerance-labeled).
2. **KiKit invoked as Ring-2 subprocess ONLY:** daemon `/api/v1/panel/generate` invokes `kikit panelize ...` as an isolated **Ring-2 subprocess** via KiCad environment (NEVER import GPL `pcbnew` in-process in Ring-1 `vd-daemon`!), with automatic fallback to pure-MIT Rust `vd-panelizer`; offline boundary test proves invocation.
3. **KiBot-style MIT checks:** DRC/DFM bundle validation riding `kicad-cli` subprocess (Ring-2) + own MIT checks in `dfm-dfa-safety`; never import KiBot.
4. **RS-274X parser/plotter + EAGLE/KiCad import:** real RS-274X plotter/parser in `packages/cad-transcoder` (D01/D02/D03, G-codes, X2 attributes) with golden round-trip; KiCad 10 native 3-channel bridge + EAGLE 6.x+ XML import via `kicad-cli` Ring-2.

### G5B · Harness, Diff, `i_triangle` (`i64`) & LGPL-Isolated STEP Worker
1. **wire-harness (`vd-wire-harness`) → WireViz parity:** YAML import/export compatible with WireViz schema (spec-derived), SVG harness diagram renderer, wiring-table BOM + cut-list CSV vs G4 fixture.
2. **pcb-diff (`vd-pcb-diff`) → kiri parity:** layer-by-layer SVG renderer (F.Cu/B.Cu/silk/mask), moved/added/removed detection from HW-IR revisions vs G4 fixture.
3. **`i_triangle` (`MIT OR Apache-2.0`) `i64` integer API:** integrate `i_triangle::int::*` (native `i64` coordinate API, ZERO float conversion) into `packages/cad-geom` copper-pour path with behavioral test; eliminate `daemon.py:1339` hardcoded `mesh_triangles_count: 348` vapor.
4. **STEP AP242 import via isolated LGPL WASM Web Worker:** `occt-import-js` (**LGPL-2.1-with-OCCT-exception**, NOT MIT) loaded ONLY as an unmodified runtime Web Worker documented in `docs/LICENSE_EXCEPTIONS.md`, replacing `cli/main.rs:200` print-only STEP vapor. (STEP export honestly deferred if out of scope.)

### G5C · Durability, Transactional Undo/Redo, Supervision & `vd studio`
1. **CAS zstd + SQLite WAL ladder + autosave recovery (T-09):** zstd blob compression (`~/.vajradhir/cas/sha256/…zst`), WAL checkpoint ladder (`PASSIVE` every 250 patches, `TRUNCATE` idle), `.vd.autosave.jsonl` atomic shadow + recovery test.
2. **Transactional HW-IR Undo/Redo stack (`Ctrl+Z`/`Ctrl+Shift+Z`):** every HW-IR mutation records an inverse `PatchSet` in a bounded command-history table/stack while still failing closed on `locked=1`.
3. **Orphan-safe child supervision:** Windows Job Objects (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`) + Linux `PR_SET_PDEATHSIG` in `vd-daemon` child supervision with orphan-kill test.
4. **`vd studio` launcher + static UI route:** add static-asset serving in `vd-daemon` (serves compiled `apps/workstation/dist` on `127.0.0.1:41900` with strict CSP) + `vd studio [project_path]` in `packages/cli` (zero Node dev server needed at runtime!).

**WRITE_SCOPE (per slice G5A/G5B/G5C):** `packages/panelizer/**`, `packages/wire-harness/**`, `packages/pcb-diff/**`, `packages/cad-geom/**`, `packages/cad-transcoder/**`, `packages/cas-store/**`, `packages/hw-ir/**` (WAL ladder + Undo/Redo history), `packages/vd-daemon/**` (supervision + Ring-2 panel endpoint + static route + kill vapor), `packages/cli/**` (`vd studio` + STEP vapor fix), `packages/dfm-dfa-safety/**` (checks only), `tests/fixtures/**`, `.ai-sync/handoffs/G-05*-gemini.md`, `.ai-sync/handoffs/G5*-receipt.json`.
**VERIFY_CMD:** `cargo test -p vd-panelizer -p vd-wire-harness -p vd-pcb-diff -p vd-cad-transcoder -p vd-cas-store -p vd-cad-geom` · pytest daemon/panel/supervision/undo tests · `node scripts/verify-all.mjs`.
**Acceptance:** each rewrite has spec-source list + golden-fixture green proof; Ring-1 SPDX scan clean (`occt-import-js` isolated worker only, `kikit` Ring-2 subprocess only, `i_triangle` `i64` integer API); transactional Undo/Redo + `vd studio` verified; harness green.

---

## PHASE G6 (Split: G6A → G6B → G6C → G6D) — `apps/workstation` & VD-UI-001 (browser-verified)

> **Executes as `.ai-sync/tickets/MASTER-GEMINI-UI-REDESIGN.md` (VD-UI-001, phases U0–U6): Hallmark `redesign` full depth, app scope, brand kept. Split into 4 single-session slices so context never collapses.**

- **G6A (U0+U1 Shell):** Consolidate `apps/prototype-gui` + `apps/desktop` → canonical **`apps/workstation`**; unified Silicon Darkroom `tokens.css` + `base.css`; self-hosted Inter/JetBrains Mono `woff2`; root `design.md`; real **`dockview-react` 8.9.x (MIT ONLY — `dockview-enterprise` FORBIDDEN)**; VS Code/Blender/Adobe shell; Project Lifecycle/Templates (`Blank 2-Layer`, `Buck PD`, `MCU Devboard`), Dirty-State indicator, Crash-Recovery banner, Per-Panel React Error Boundaries, `?`/`F1` shortcut overlay.
- **G6B (U2 Real Canvas Engine):** Real instanced WebGPU / WebGL2 PCB renderer + Canvas2D fallback in `packages/webgpu-cad-engine` + Geometry Web Worker; real **`elkjs`** (`EPL-2.0` exception) schematic auto-layout; **`zustand`** `CrossProbeBus` `<16 ms` measured; live measured `rAF` FPS meter (never hardcoded).
- **G6C (U1-Agent + U3 Workspaces & Calculators):** Additive **`packages/vd-daemon/src/agent_routes.py`** (leaving T-01 locked core routes untouched!) implementing SSE `POST /api/v1/agent/chat` (`thought_delta`, `tool_call`, `proposal_card`, `done`/`error`), `POST /api/v1/agent/proposals/{id}/accept|reject` with fail-closed `locked=1`, and providers `VD_LLM_PROVIDER=deterministic_offline` ($0 CI) + `ollama` (`127.0.0.1:11434`, `NDA_AIRGAPPED`). Recompose all 7 workspaces (loading/empty/error/full 4 states), built-in quick calculators (Trace Width, Via Current, Diff Impedance, MLCC Derating, Phase Margin), real G5 outputs, **`InteractiveHtmlBom` (`iBOM`)**, **`PcbDraw`**, **`uPlot`** scope (replacing stub).
- **G6D (U4–U6 Behavioral Verification & Polish):** Playwright behavioral gates + **5 Golden E2E User Journeys** against cold-booted `vd studio` (1. Zero-to-Schematic+elkjs+Ctrl+Z; 2. Interactive PCB+via-drop+Fail-Closed Human Lock+Agent; 3. Cross-Probed Virtual Lab `<16 ms`+uPlot; 4. Mfg+pcb-diff SVG+2×2 Panelizer+iBOM+Gate-8 Negative; 5. Crash Recovery+hw-merge); Hallmark `sloplint --render --kept` Floor 0 FAIL; `.hallmark/compare.html`; WCAG AA contrast & keyboard walkthrough; finish review.

**WRITE_SCOPE:** `apps/workstation/**`, `apps/prototype-gui/**` & `apps/desktop/**` (consolidation/shims only), `packages/ui-core/**`, `packages/webgpu-cad-engine/**`, `packages/crossprobe-bus/**`, `packages/schematic-beautifier/**`, `packages/command-bus/**`, `packages/vd-daemon/src/agent_routes.py` (additive only in G6C), `design.md`, UI gate scripts, `package.json`/`pnpm-lock.yaml`, `vendor/MANIFEST.json`, `.ai-sync/handoffs/G-06*-gemini.md`, `.ai-sync/handoffs/G6*-receipt.json`.
**VERIFY_CMD:** `pnpm install --frozen-lockfile` · `pnpm -r exec tsc --noEmit --checkers 2` · `node --test` UI packages · Playwright 5 Golden Journeys · `sloplint --render --kept` · `node scripts/verify-all.mjs`.
**Acceptance:** single `apps/workstation` served by `vd studio`; real dockview-react MIT, real SSE agent chat, real GPU/Canvas2D engine, `elkjs`/`iBOM`/`PcbDraw`/`uPlot` real; zero vapor labels; Hallmark Floor 0 FAIL; 5 Golden Journeys green.

---

## PHASE G7 — Claims truth & documentation reconciliation (T-06 + F-19)

1. **F-19:** replace fabricated G1–G8 `evidence_hash` values in `designs/board-1-buck-pd/verification_report.json` with REAL computed SHA-256 hashes of artifact bytes or explicit `null` + `PENDING` semantics; extend Gate-8 test to reject fabricated patterns.
2. **Vapor sweep repo-wide:** confirm zero remaining label-only tech names or hardcoded outputs (`daemon.py:1339`, `cli/main.rs:200`, `vd doctor`, `WebGpuCanvas.tsx:25`).
3. **Internal RE ledger (`VD-MASTER-002` Part A, binding):** keep `docs/REVERSE_ENGINEERED_ENGINES.md` strictly **gitignored** (do NOT `git add` or un-ignore!). Migrate corrected notes (fixing `KiKit` = MIT and `IPC-2221` vs `IPC-2152`) into gitignored `.ai-sync/private/RE_METHODOLOGY.md`. Public docs claim native MIT implementations + conformance to published standards only.
4. **`docs/CLAIMS_REGISTER.md`:** every CLM re-verified with fresh evidence + date; CLM-008/009 stay software-only (0/3 boards fabricated — state plainly); CVE claims get primary-source URLs; add new claims for G5/G6 capabilities with evidence paths.
5. **`README.md` + `docs/CHECKPOINT_PROGRESS.md`:** fix dead link `docs/VD-SAD-001-ARCHITECTURE.md` → `docs/VD-SAD-001.md`; reconcile stale `37/37` vs `31-Gate`, `3 Physical Boards Certified`, `120 FPS WebGPU`, and `vd doctor` claims to measured reality (`0/3 Physically Fabricated`).

**WRITE_SCOPE:** `designs/board-1-buck-pd/verification_report.json`, `scripts/test-gate8-release.py`, `docs/CLAIMS_REGISTER.md`, `docs/CHECKPOINT_PROGRESS.md`, `README.md`, `.ai-sync/handoffs/G-07-gemini.md`, `.ai-sync/handoffs/G7-receipt.json` (plus gitignored `.ai-sync/private/RE_METHODOLOGY.md`). **NEVER stage `docs/REVERSE_ENGINEERED_ENGINES.md` or remove it from `.gitignore`.**
**VERIFY_CMD:** `python scripts/test-gate8-release.py` · `python scripts/audit-claims-honesty.py` · `python scripts/check-links.py` · `node scripts/verify-all.mjs` · grep vapor sweep.
**Acceptance:** zero fabricated evidence anywhere; zero dead links; every public claim has dated evidence; RE doc stays gitignored; dual-context review will follow.

---

## PHASE G8 — CI green proof + release packet (FINAL, human-gated)

1. **SPDX lockfile firewall (T-15):** extend `scripts/check-spdx-firewall.mjs` to scan `pnpm-lock.yaml`, `uv.lock`, `Cargo.lock` against AGPL/GPL/EUPL deny-list + exception register; injected-AGPL fixture must exit 1; wire into CI workflow.
2. **Push approval request:** orchestrator asks the user ONCE for approval to push main + open the CI proof. ONLY after explicit approval: push, `gh run watch`, paste run URLs + green conclusions into handoff. If startup_failure persists: honest UNKNOWN + exact admin checklist for the user (Actions enabled? permissions? billing?). NEVER claim green without a run URL.
3. **Release evidence packet** (`docs/RELEASE_PACKET_v0.1.0.md`): fresh full-harness output (exact count), all lockfiles frozen-install proofs, cargo/pytest/node test totals, CI run URLs, license firewall scan, claims register, known-deferrals list, fabrication status 0/3, `human_signoff: PENDING`. The user alone issues the signoff token; the packet makes the ask easy.
4. Tag/release ONLY on explicit user instruction.

**WRITE_SCOPE:** `scripts/check-spdx-firewall.mjs`, `.github/workflows/**`, `docs/RELEASE_PACKET_v0.1.0.md`, `.ai-sync/handoffs/G-08-gemini.md`.
**VERIFY_CMD:** `node scripts/check-spdx-firewall.mjs` (clean exit 0 + injected fixture exit 1) · `gh run view <id>` output · full harness.
**Acceptance:** CI green with URLs OR honest blocker + admin checklist; packet complete; NO fabricated signoff; NO unapproved push.

---

## Sequencing & audit cadence
G0 → G1 → G2 → G3 → G4 → G5A → G5B → G5C → G6A → G6B → G6C → G6D → G7 → G8 (v0.1.0 packet) → P0→P1→P2→P3→P4→P5 (VD-PERF-001 zero-regression optimization) → X1 → X2 → X3 → X4 (v0.2.0 packet). Strictly serial (sole worker). **`MASTER-GEMINI-EXPANSION.md` (VD-MASTER-002) is a BINDING addendum: Part A Provenance Privacy Policy amends G4/G7 (internal-only RE provenance; public MANIFEST = vendored attribution only); Part D adds the X-track. `EXECUTION-TOOLKIT-AND-GUARDRAILS.md` (VD-TOOL-001) binds EVERY sub-step (anti-hallucination/evidence-integrity + skills/tools/MCP/harness + RE carefulness + testing).** After EACH phase: run `node scripts/verify-handoff.mjs --phase <PHASE> --ticket <TICKET>`, commit -s, write handoff referencing receipt, STOP and signal READY_FOR_REVIEW. Orchestrator audits (fresh re-runs; dual-context for G1/G2/G3/G5*/G7), merges --no-ff, rebases your worktree, flips next phase READY on `.ai-sync/TASK_BOARD.md`. Do not start the next phase before the READY flip. BLOCKER at any point ⇒ stop, handoff, await ruling. **G0 status: T-02b REJECTED (F-21 fabricated Rust check) → T-02c narrow remediation READY; merge T-02b+T-02c only after re-audit.**

## Current-state anchors (2026-11-24)
- main: harness 64/64 exit 0; T-01 merged (5964a8f); ledger + anti-vapor law in task_plan.md §9; .ai-sync un-ignored.
- Your branch: T-02b committed a039258 + handoff (audit pending at plan-write time).
- DeepSeek WIP preserved: `D:\project-deepseek` commit `ab2ec71` (read-only; 4 test/script files, no production edits).
- F-18 stash@{0} in main checkout: superseded v0.0.5 partial work — DO NOT apply (daemon.py conflicts with T-01); user ruling pending.
- Open findings driving phases: F-05/F-06/F-07 (G1), F-08/F-09/F-20 (G2), F-10 (G3), F-19 (G3/G7), registry gaps (G4/G5/G6), doc truth (G7).
