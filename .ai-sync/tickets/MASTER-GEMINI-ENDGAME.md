# MASTER HANDOFF PLAN — GEMINI SOLE-WORKER ENDGAME
## Vajra-Dhīr EDA · VD-MASTER-001 Rev 1.0 · 2026-11-24

**Executor:** WORKER-GEMINI (Antigravity) — the ONLY worker from this point. OpenCode/DeepSeek is retired; its partial T-03 work is preserved for adoption (Phase 0).
**Worktree:** `D:\project-gemini` · branch `feat/worker-gemini` · NEVER write to `D:\Vajra-Dhir-EDA` (main is orchestrator-only) or `D:\project-deepseek` (read-only archive).
**Orchestrator:** audits every phase handoff (scope diff + fresh VERIFY_CMD re-run + dual-context review for security/geometry phases), merges `--no-ff`, rebases your worktree, flips the next phase to READY.
**Read first, every session:** `.ai-sync/README.md`, `AGENTS.md`, `docs/AGENT_KNOWLEDGE_UPDATE_2026_11.md`, `findings.md`, `task_plan.md` §9, this file.

---

## 0. GLOBAL LAWS (apply to every phase; violation = auto-reject)

1. **Units/IDs:** all geometry `i64` nanometers (`1 mm = 1_000_000 nm`), angles `i32` millidegrees `0..360000`; entity IDs immutable UUIDv7. NEVER floats for PCB/IC coordinates in SQLite or JSONL.
2. **Human locks fail closed:** every HW-IR write sets `_tx_actor_ctx` in-transaction; non-human actors never mutate `locked=1`. NEVER fabricate a `human_signoff_token` or any evidence hash. Gate 8 release is human-gated forever.
3. **License firewall (Ring 1 = `packages/*`, `apps/*`):** strictly MIT / Apache-2.0 / BSD. Zero AGPL (kibot, konnect, part-db, pypsa-app, openmodelica, pymupdf/fitz), zero GPL linked in Ring 1, zero non-commercial ML checkpoints, zero vendor PDFs committed. GPL tools (KiCad, Xyce, spicelib, gmsh, KLayout, WireViz, kiri…) live ONLY as Ring-2 subprocess/OCI or ignored vendor mirrors — never linked, never committed.
4. **Clean-room discipline for rewrites:** GPL/AGPL mirrors may be downloaded for **behavioral study and golden-fixture generation only**. Rewrites are written from **published specs, file-format docs, standards (IPC/Gerber RS-274X/STEP AP242), and observed I/O behavior** — NEVER line-by-line translation or copy-paste of GPL source. Each rewritten module's handoff must state its spec sources. This is what makes the rewrite MIT-legitimate.
5. **Version floors (verified upstream 2026-11-24 — all exist, no downgrades):** wasmtime ≥ 50.0.0 · react ≥ 19.3.1 (npm latest) · node ≥ 26.13.1 (LTS "Lithium", nodejs.org/dist 2026-11-10) · typescript == 7.0.2 (npm latest) · Rust 1.100.0 (rustup; `.cargo/config.toml` 72h publish cooldown). When importing any upstream project, record its latest release version + date in the vendor manifest; prefer latest stable, never the stale pins in `prompt-and-skills/prompt-2.txt` (wasmtime 30 / React ^19 are BANNED — F-11).
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

**Mission (T-03 remainder, then T-08):**
1. **Adopt WIP:** read-only inspect `D:\project-deepseek` commit `ab2ec71` (4 files: `packages/hw-ir/tests/test_patch_op_parity.py`, `packages/hw-merge/register_merge_driver.py`, `packages/hw-merge/tests/test_merge_driver_registration.py`, `packages/symbolic-verifier/tests/test_footgun_contract.py`). These are failing-test-first artifacts ONLY — production edits were never made. Port them into your worktree (copy, then review critically — they are unaudited), run them RED, then implement:
2. **F-05 patch-op parity:** TS `HardwarePatchOp` mirror must include `UPSERT_ENTITY` (Rust enum is canonical); `hw_patch` actor enum must include `import` (provenance = human|agent|cubo|import|compiler). Parity regression test enumerates BOTH sides, fails on mismatch.
3. **F-06 merge driver:** `.gitattributes` binds `merge=hwir`. Canonical = the crate's actual binary name (verify `packages/hw-merge/Cargo.toml` `[[bin]]`). Ship `register_merge_driver.py` (or .sh/.ps1 pair) that runs `git config merge.hwir.driver "<binary> %O %A %B %L %P"` + `git config merge.hwir.name "..."`; test asserts registration + a simulated 3-way conflict on `.vd-ir.jsonl` resolves semantically (courtyard collision negative test).
4. **F-07 FG-05 range:** footgun message says 900–11000, check enforces [1k,10k]. Decide canonical from spec intent, align message + check, boundary tests at both edges.
5. **T-08 floors:** typescript → exactly `7.0.2` in EVERY package/app manifest (known violation: `apps/desktop/package.json` `^5.8.2`; five apps already at 7.0.2 — verify all). `engines.node >= 26.13.1`. Regenerate `pnpm-lock.yaml` via `pnpm install` (frozen-check after). **Commit `Cargo.lock`** (`cargo generate-lockfile` — missing at root = reproducibility hole). `cargo check --workspace` must pass.
6. Host Node is 24.19.0 (user upgrade pending) — CI pins 26.13.1 regardless; do not downgrade manifests to match the host.

**WRITE_SCOPE:** `packages/hw-ir/**` (tests + TS mirror location), `packages/hw-merge/**`, `packages/symbolic-verifier/**` (FG-05), `package.json` files (TS/engines only), `apps/desktop/package.json`, `pnpm-lock.yaml`, `Cargo.lock`, `.gitattributes` (only if name fix needed), `.ai-sync/handoffs/G-01-gemini.md`.
**VERIFY_CMD:** `cargo test -p vd-hw-ir -p vd-hw-merge -p vd-symbolic-verifier` (or exact crate names) · parity test · `pnpm install --frozen-lockfile` · `cargo check --workspace` · `node scripts/verify-all.mjs`.
**Acceptance:** all RED→GREEN proofs pasted; driver registration test simulates real conflict; TS 7.0.2 everywhere (`grep -r '"typescript"' --include=package.json` output pasted); Cargo.lock committed; harness green.

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
3. Write **`vendor/MANIFEST.json`** (this IS committed): per project `{name, url, license, version, date_imported, class: ring1-dep|study-only|quarantine-gpl|forbidden, purpose, rewrite_target_package|null}`. Forbidden set (KiBot, Konnect, Part-DB, pypsa-app, OpenModelica, PyMuPDF) = DO NOT DOWNLOAD AT ALL; manifest records the ban + MIT replacement (KiKit+kicad-cli+PcbDraw / custom 3-channel bridge / InvenTree / PyPSA / external opt-in plugin / pypdfium2+pdfplumber).
4. For each hard-license rewrite target, generate **golden fixtures from upstream behavior** where installable via subprocess (Ring-2 pattern): e.g. KiKit panelize a sample board → capture `.kicad_pcb` output as fixture; WireViz compile a sample YAML → capture SVG/BOM as fixture; kiri diff two revisions → capture expected layer changes. Fixtures are DATA (committed under `tests/fixtures/`), not GPL code. Where a tool cannot be installed offline-safely, use published format specs + hand-authored fixtures and label them `spec-derived`.
5. License gray zones — WORKING DEFAULT = Option A (orchestrator recommendation, user may override): elkjs (EPL-2.0) stays as unmodified npm dep under a documented exception register `docs/LICENSE_EXCEPTIONS.md` (name, license, version, justification: file-level copyleft, unmodified, no linking into distributed binaries beyond npm bundling); surfer (EUPL-1.2) DEFERRED — not downloaded, not integrated. If user rules Option B, replace elkjs with MIT dagre/d3-hierarchy in Phase G6 instead.

**WRITE_SCOPE:** `scripts/import-upstream-stack.sh`, `.gitignore` (mirror dirs only), `vendor/MANIFEST.json`, `docs/LICENSE_EXCEPTIONS.md`, `tests/fixtures/**` (new fixture dirs per package), `.ai-sync/handoffs/G-04-gemini.md`.
**VERIFY_CMD:** `bash scripts/import-upstream-stack.sh --dry-run` (full listing pasted) · `git status --short` proving mirrors untracked · `git check-ignore vendor/ring1-refs vendor/quarantine` · manifest JSON validity · fixture generation commands + outputs.
**Acceptance:** every registry project classified in MANIFEST (146 entries, none silently skipped); zero forbidden downloads; zero GPL source committed; fixtures exist for all Phase-G5 rewrite targets; handoff lists import failures honestly (network-blocked repos = recorded, not faked).

---

## PHASE G5 — Clean-room rewrites to product parity (T-14 + interop, the heart of "ultra-finished")

Spec-based MIT rewrites, validated against G4 golden fixtures. Each module: RED-first parity test → implementation → fixture-green.
1. **panelizer → real KiCad output:** emit valid `.kicad_pcb` panel (2×2 wizard path) — parse-back test with `packages/cad-transcoder` sexpr parser proving structural validity; mouse-bites/rails/fiducials/tooling-holes geometry in i64 nm; KiKit fixture comparison (tolerance-labeled, not byte-identical).
2. **wire-harness → WireViz parity:** YAML import/export compatible with WireViz schema (spec-derived), SVG harness diagram renderer, wiring-table BOM + cut-list CSV. Golden: G4 WireViz fixture.
3. **pcb-diff → kiri parity:** layer-by-layer SVG renderer (F.Cu/B.Cu/silk/mask), moved/added/removed component detection from HW-IR revisions, visual diff output consumable by the GUI `GIT_DIFF` tab. Golden: G4 kiri fixture.
4. **KiBot-style manufacturing checks (AGPL → MIT):** DRC/DFM bundle validation riding `kicad-cli` subprocess (Ring-2) + own MIT checks already in `dfm-dfa-safety`; never import KiBot code.
5. **KiKit actually invoked:** daemon `/api/v1/panel/generate` path calls the real `kikit` Python API (MIT dep already in pyproject) with fallback to own panelizer; test proves invocation (mock kikit CLI boundary offline) — kill the CLI-preview-string vapor.
6. **iTriangle:** integrate the real crate (`i_triangle` — constrained Delaunay triangulation, MIT/ISC per registry) into `cad-geom` copper-pour path with behavior test, OR remove every "iTriangle" claim (daemon.py:1339). Default: integrate.
7. **STEP AP242 + RS-274X:** `occt-import-js` (permissive) for STEP import in the 3D viewer path (replaces the "3D STEP" print-only vapor); minimal real RS-274X plotter/parser in `cad-transcoder` (aperture macros D01/D02/D03, G-codes, X2 attributes) with round-trip golden test. If full STEP export is out of reach this phase: import-only + honest label, export deferred to manifest.
8. **hw-merge collision negatives** (if G1 left gaps) + **CAS zstd/WAL/autosave/Job-Objects (T-09)** fold here as sub-stages G5.8/G5.9: zstd blob compression (`~/.vajradhir/cas/sha256/…zst`), WAL checkpoint ladder (PASSIVE every 250 patches, TRUNCATE idle), `.vd.autosave.jsonl` atomic shadow + recovery test, Windows Job Objects (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`) + Linux `PR_SET_PDEATHSIG` in `vd-daemon` child supervision with orphan-kill test.

**WRITE_SCOPE:** `packages/panelizer/**`, `packages/wire-harness/**`, `packages/pcb-diff/**`, `packages/cad-geom/**`, `packages/cad-transcoder/**`, `packages/cas-store/**`, `packages/hw-ir/**` (WAL ladder), `packages/vd-daemon/**` (supervision + panel endpoint + vapor label), `packages/dfm-dfa-safety/**` (checks only), `tests/fixtures/**`, `.ai-sync/handoffs/G-05-gemini.md`.
**VERIFY_CMD:** `cargo test -p vd-panelizer -p vd-wire-harness -p vd-pcb-diff -p vd-cad-transcoder -p vd-cas-store` · pytest daemon/panel tests · `node scripts/verify-all.mjs` · fixture-diff outputs pasted.
**Acceptance:** each rewrite has spec-source list + golden-fixture green proof; GUI diff/panel/harness tabs render REAL output (browser verification in G6); no GPL code in any Ring-1 file (SPDX scan green); harness green with new gates counted.

---

## PHASE G6 — Manifest-gap closure + UI ultra-polish (T-16 + T-10) — browser-verified

1. **Registry deps integrate-or-defer:** for each missing mandated dep (wgpu, manifold, three.js, monaco, xterm.js, zustand, xyflow, uPlot, typst, ngspice-wasm, InteractiveHtmlBom, PcbDraw, jlcparts, JLC2KiCad_lib, 2581check, kicad-python): EITHER wire real usage + test (priority: **InteractiveHtmlBom → real iBOM generator behind the ASSEMBLY_BOM tab** (MIT, no rewrite needed); **ngspice-wasm → real in-browser SPICE** for the Virtual Lab; **elkjs → real schematic auto-layout** in beautifier/SchematicCanvas per Option A) OR record deferral in `vendor/MANIFEST.json` with reason. No silent skips.
2. **GUI feature sweep (you have browser tools — USE them):** launch the workstation, exercise EVERY workspace/tab: CAD canvas (pan/zoom/via-drop now correct), schematic capture + elkjs layout, library center, 3D viewer (STEP import real), Virtual Lab (scope/PDN heatmap), Manufacturing Center (panelizer wizard renders G5 output, GIT_DIFF renders pcb-diff SVGs, WIRE_HARNESS renders SVG+BOM, ASSEMBLY_BOM renders iBOM), Dockview multi-pane drag/dock/float, command bus palette, MCP Apps panels. Screenshot evidence per feature in handoff. Fix every broken interaction found (scope: GUI files + commandBus wiring).
3. **Polish pass:** loading/empty/error states, keyboard navigation, contrast (Silicon Darkroom standards), <16ms CrossProbeBus budget re-measured, no console errors, no dead buttons. Remove ALL remaining vapor labels GUI-side.
4. **TS floor re-check** after any manifest edits (7.0.2 exact everywhere; frozen lockfile regenerated + committed).

**WRITE_SCOPE:** `apps/**`, `packages/ui-core/**`, `packages/webgpu-cad-engine/**`, `packages/crossprobe-bus/**`, `packages/schematic-beautifier/**`, `packages/command-bus/**`, `package.json`/`pnpm-lock.yaml` (new deps only), `vendor/MANIFEST.json` (deferrals), `.ai-sync/handoffs/G-06-gemini.md`.
**VERIFY_CMD:** `pnpm install --frozen-lockfile` · `pnpm -r exec tsc --noEmit` (or repo typecheck) · `node --test` UI packages · `node scripts/verify-all.mjs` · browser session logs + screenshots.
**Acceptance:** every GUI feature demonstrably works (screenshots + console-clean logs); iBOM/elkjs/STEP real or honestly deferred; zero vapor labels; harness green.

---

## PHASE G7 — Claims truth & documentation reconciliation (T-06 + F-19)

1. **F-19:** replace fabricated G1–G8 `evidence_hash` values in `designs/board-1-buck-pd/verification_report.json` with REAL computed hashes (SHA-256 of the actual artifact bytes each gate verifies) or explicit `null` + PENDING semantics; extend Gate-8 test to reject the known fabricated patterns (`a1b2c3d4…` rotations, SHA-256-of-empty).
2. **Vapor sweep repo-wide:** daemon.py:1339 iTriangle claim (now real per G5 or relabeled), cli "3D STEP" (now real import or relabeled), any remaining label-only tech names — grep-driven checklist in handoff.
3. **`docs/REVERSE_ENGINEERED_ENGINES.md`:** correct KiKit license (MIT, not GPL-3), replace "22/22 string-gates" claims with real cargo-test counts from G3/G5, add spec-source citations per rewrite, date-stamp everything.
4. **`docs/CLAIMS_REGISTER.md`:** every CLM re-verified with fresh evidence + date; CLM-008/009 stay software-only (0/3 boards fabricated — state plainly); CVE claims get primary-source URLs; add new claims for G5/G6 capabilities with evidence paths.
5. **README + docs/CHECKPOINT_PROGRESS.md:** reconcile status claims to measured reality (gate counts, CI status, fabrication status). Un-ignore `docs/REVERSE_ENGINEERED_ENGINES.md` in `.gitignore` (it must be a tracked, honest document).

**WRITE_SCOPE:** `designs/board-1-buck-pd/verification_report.json`, `scripts/test-gate8-release.py`, `docs/REVERSE_ENGINEERED_ENGINES.md`, `docs/CLAIMS_REGISTER.md`, `docs/CHECKPOINT_PROGRESS.md`, `README.md`, `.gitignore` (that one line), `.ai-sync/handoffs/G-07-gemini.md`.
**VERIFY_CMD:** `python scripts/test-gate8-release.py` · hash-recomputation script output · `node scripts/verify-all.mjs` · grep sweep results.
**Acceptance:** zero fabricated evidence anywhere; every public claim has dated evidence; dual-context review will follow.

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
G0 → G1 → G2 → G3 → G4 → G5 → G6 → G7 → G8. Strictly serial (sole worker). After EACH phase: commit -s, write handoff with raw evidence, STOP and signal READY_FOR_REVIEW. Orchestrator audits (fresh re-runs; dual-context for G1/G2/G3/G5/G7), merges --no-ff, rebases your worktree, flips next phase READY on `.ai-sync/TASK_BOARD.md`. Do not start the next phase before the READY flip. BLOCKER at any point ⇒ stop, handoff, await ruling.

## Current-state anchors (2026-11-24)
- main: harness 64/64 exit 0; T-01 merged (5964a8f); ledger + anti-vapor law in task_plan.md §9; .ai-sync un-ignored.
- Your branch: T-02b committed a039258 + handoff (audit pending at plan-write time).
- DeepSeek WIP preserved: `D:\project-deepseek` commit `ab2ec71` (read-only; 4 test/script files, no production edits).
- F-18 stash@{0} in main checkout: superseded v0.0.5 partial work — DO NOT apply (daemon.py conflicts with T-01); user ruling pending.
- Open findings driving phases: F-05/F-06/F-07 (G1), F-08/F-09/F-20 (G2), F-10 (G3), F-19 (G3/G7), registry gaps (G4/G5/G6), doc truth (G7).
