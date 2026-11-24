# VD-MASTER-002 · Complete Integration, Provenance Privacy & Industrial-Rival Expansion

| Field | Value |
|---|---|
| Revision | 1.0 (2026-11-24) |
| Authority | Orchestrator. Binds WORKER-GEMINI (sole worker). |
| Relationship | ADDENDUM to `MASTER-GEMINI-ENDGAME.md` (VD-MASTER-001, phases G0–G8). Amends G4/G6/G7; adds X-track (X1–X4) AFTER G8. Serial discipline of VD-MASTER-001 is unchanged. |
| Trigger | User ruling 2026-11-24: integrate ALL of `techstack.md` + `techstack-critic.md`; rewrite hard-license features; **keep the reverse-engineering part private**; rival industrial leaders with more features. |

> Read VD-MASTER-001 first. This document does not replace it — it tightens provenance handling, guarantees full registry coverage, and extends the feature ceiling. Every global law of VD-MASTER-001 (units/IDs, fail-closed locks, license firewall, clean-room discipline, verified floors, failing-test-first, offline $0, zero ports, anti-vapor, DCO/no-push, scope discipline, harness ground truth) still binds.

---

## PART A — Provenance Privacy Policy (BINDING, non-waivable limits)

User wants the reverse-engineering effort kept private. Accommodated as **private methodology, truthful public claims** — NOT as concealment of license violations.

### A.1 Two ledgers, one firewall
- **INTERNAL-ONLY (gitignored, never committed, never in README/claims/release docs):** `.ai-sync/private/`
  - `PRIVATE_REGISTRY.json` — full disposition of all 146 `techstack.md` entries + every `techstack-critic.md` directive: `{name, url, license, class, disposition: integrate|rewrite|subprocess|study-only|forbidden, rewrite_target_package, study_notes, fixture_provenance}`.
  - `RE_METHODOLOGY.md` — how each hard-license feature was studied (behavioral observation, published-spec reading, golden-fixture generation), upstream version/date, clean-room separation notes.
  - `docs/REVERSE_ENGINEERED_ENGINES.md` stays gitignored; its honest content migrates into the internal ledger. **It is NEVER un-ignored** (this reverses VD-MASTER-001 G7 step 5).
- **PUBLIC (committed):** `vendor/MANIFEST.json` covers ONLY code actually vendored, linked, or invoked as a subprocess — `{name, url, license, version, date_imported, class: ring1-dep|ring2-subprocess, purpose}`. This is legal attribution, not a study map. **No `rewrite_target`, no study provenance, no quarantine/study-only/forbidden entries in the public manifest.** Forbidden bans and MIT replacements are recorded internally; public docs simply name the native MIT implementation.

### A.2 What public docs say
- Describe the **native MIT implementation** and its conformance to **published standards** (IPC-2152/2221, RS-274X, STEP AP242, KiCad file-format documentation, WireViz YAML schema as a published format). Public spec-source citations to standards bodies are fine.
- NEVER "reverse engineered from <GPL repo>" in public docs. NEVER a false "written from scratch, never referenced <X>". Silence about study process is permitted; falsehood is not.
- `docs/CLAIMS_REGISTER.md` stays public and honest: performance/capability claims with dated evidence, software-only fabrication status (0/3). It claims behavior, not derivation.

### A.3 Hard limits (secrecy does NOT cure these)
1. **Zero GPL/AGPL expression in Ring 1.** Clean-room rewrites derive from published specs + observed behavior, never translation of upstream code. The SPDX/license firewall gate stays green and public.
2. **Golden fixtures are DATA, not expression.** Strip any embedded upstream code/comments from fixtures; keep only input/output facts. Label `spec-derived` where hand-authored.
3. **Attribution preserved** on every vendored permissive dependency (license files, notices). Removing notices to hide provenance is forbidden.
4. **No fabricated evidence or provenance** anywhere (extends F-14/F-19/F-21 discipline).
5. **Quarantine mirrors** (`vendor/quarantine/`, `vendor/ring1-refs/`) stay gitignored, never linked, never imported by the build.

### A.4 Coverage guarantee (amends G4 acceptance)
- **Internal completeness audit (orchestrator, not public CI):** every one of the 146 registry entries AND every critic directive (Part C matrix) has a disposition in `PRIVATE_REGISTRY.json`; none silently skipped.
- **Public CI gate:** license firewall scans Ring 1 for GPL/AGPL markers + asserts every vendored/linked/subprocess dir has a `vendor/MANIFEST.json` entry. Public CI never reveals the study map.
- G4 acceptance "146 entries in MANIFEST" is REPLACED by: public MANIFEST covers the vendored subset; internal PRIVATE_REGISTRY covers all 146; orchestrator signs the completeness audit.

---

## PART B — Amendments to VD-MASTER-001

- **G4 step 3:** split manifest per Part A.1 (public vendored-subset vs internal full registry). Add `.ai-sync/private/` to `.gitignore`.
- **G4 WRITE_SCOPE:** add `.ai-sync/private/**` (gitignored, local only).
- **G6:** executes as `MASTER-GEMINI-UI-REDESIGN.md` (VD-UI-001, split across **G6A / G6B / G6C / G6D**). G6 acceptance = VD-UI-001 acceptance.
- **G7 step 3:** RE doc stays internal; correct KiKit license (MIT) in the INTERNAL ledger; public spec-source citations only to published standards.
- **G7 step 5:** DELETE the "un-ignore REVERSE_ENGINEERED_ENGINES.md" instruction. Keep it gitignored. README/public docs claim native MIT implementations + measured behavior only.
- **G7 WRITE_SCOPE:** remove `.gitignore (that one line)` for un-ignoring; instead `.gitignore` ensures `.ai-sync/private/` + `.hallmark/` ignored.

---

## PART C — techstack-critic.md directive coverage matrix (all 29)

| # | Line | Directive | Disposition |
|---|---|---|---|
| 1 | L3 | Never rewrite C++ solvers / fork legacy CAD; local-first orchestration+verification platform | BINDS X-track: integrate engines behind boundaries, never fork |
| 2 | L5 | Sort every repo Integrate / Study-only / Skip | G4 + PRIVATE_REGISTRY |
| 3 | L9 | KiCad 10.0.8 3-channel bridge (S-expr / NNG IPC / kicad-cli), GPL isolated | G5 + Ring-2 quarantine |
| 4 | L10 | atopile = sole primary Ring-1 compiler | G1/G5; one compiler (L29) |
| 5 | L11 | ngspice/Xyce Tier-0 WASM + Pack-2B; vd-spice-compat transpiler | X3 |
| 6 | L12 | openEMS/ElmerFEM/CalculiX/Palace behind CadQuery→Gmsh + WorkerContract gVisor OCI | X3 |
| 7 | L13 | Silicon/FPGA Pack-2C; LibreLane only (not OpenLane) | X4 |
| 8 | L14 | Renode digital-twin + lockstep ngspice co-sim | X3 |
| 9 | L17-19 | Study-only Horizon/LibrePCB/eSim; never build on GPL | PRIVATE_REGISTRY study-only |
| 10 | L20 | Never expose 300+ MCP tools; 12-verb Harness MCP v2 + defer_loading + Wasmtime Code Mode | BINDS all; vd-frontier-agent-harness |
| 11 | L23,36 | SKiDL optional netlist importer only (M2+) | X4 deferral |
| 12 | L24-26 | Skip electronics-agent-kit/PCB-Flow/OpenLane v1; hard-exclude Konnect | PRIVATE_REGISTRY forbidden/skip |
| 13 | L29 | One HW-IR, one compiler, one PCB oracle | BINDS all |
| 14 | L31 | KiCad 10 IPC PCB-GUI-only; zero schematic IPC until KiCad 11 | G5 bridge constraint |
| 15 | **L32** | 120 FPS pure-MIT manual editing (rstar/i_overlay/iTriangle/cavalier_contours), SQLite human-lock triggers, UUID 3-way hw-merge, pypdfium2 datasheet audit, DFM/DFA/PI, NDA zero-egress | G2 (cad) + U2 (engine) + X1 (DFM) + G1 (merge); measure-or-relabel FPS |
| 16 | L33 | Ring-1 MIT/Apache vs Ring-2 gVisor GPL isolation | firewall + X3 |
| 17 | **L35** | Snapshot symbol/footprint/SPICE/hw.lock digest per project (2030-proof) | X2 |
| 18 | L37 | Stick to frozen VD-SAD-001 Rev 2.0; build T1.01 | SUPERSEDED by VD-MASTER-001 (recorded deviation; repo has 5 commits/546+ files) |
| 19 | L43 | Collapse 146 into 5 tiers; M1 ~26 permissive + 5 CLIs | G4 tiering |
| 20 | L56-64 | 9 Rust crates (rusqlite WAL+locks, rstar 177ns/120FPS, iOverlay i64-nm, iTriangle `i64` integer API, cavalier_contours, wasmtime≥51, ACP, OTel, wgpu WebGPU+WebGL2 60FPS) | G1/G2/G5B + G6B; bench-verify or relabel |
| 21 | **L69-77** | VS Code extension first (no Code-OSS fork until Ph3); React≥19.3.1; ext-apps ui:// PcbCanvas/Schematic/VirtualLab; zustand <16ms CrossProbeBus + BroadcastChannel; elkjs beautifier; ngspice-wasm; uPlot 60FPS/166k/25ms; Surfer WASM; tracespace Gerber | G6A–G6D (VD-UI-001) + X2/X3 (Option B pure-MIT VCD/FST track replaces EUPL Surfer) |
| 22 | L79 | Defer electron/monaco/dockview-react/xyflow/xterm/node-pty/three.js/occt/spacemouse to M2 | **OVERRIDE (user vision + ruling 2026-11-24):** `dockview-react` (MIT `8.9.x`, NEVER `dockview-enterprise`), `three.js`, `occt-import-js` (LGPL-2.1-with-OCCT-exception isolated Web Worker), `monaco`, `xterm`, `node-pty` pulled forward into `apps/workstation` served by `vd studio` (v0.1.0), with optional Tauri v2 shell in v0.2.0. Electron stays deferred. |
| 23 | L84-93 | 10 Python pkgs (atopile, Z3, SymPy+Pint, python-control, DuckDB, pypdfium2+pdfplumber replacing AGPL PyMuPDF, jlcparts, JLC2KiCad_lib, KiKit+2581check, iBOM+PcbDraw) | G5/G6 + X4 |
| 24 | L101-105 | 5 external CLIs never forked (KiCad, KiCadRoutingTools, fastroute, ollama NDA_AIRGAPPED, dev/CI+MCP) | Ring-2 subprocess; ollama for airgap agent (U1) |
| 25 | L115-122 | Study-only 10; kicanvas layer-visibility UX (L117); own ~400-line MIT S-expr parser in cad-transcoder (L120) | U1 layer UX study; G5 parser |
| 26 | **L128** | Zero Tier-4 code until 3 fabricated bench-verified PCBs | BINDS X-track + release: no hardware-verified claims (0/3) |
| 27 | L148-157 | Prune 12 redundant repos (one parser, atopile-only, KiCadRoutingTools+fastroute) | PRIVATE_REGISTRY prune |
| 28 | L163-182 | Day-1 topology VS Code→UDS→vd-daemon→vd-brain-svc; 90-day/3-PCB ship goal | architecture binds; ship goal aspirational, human-gated |
| 29 | **L186** | Reverse-engineer hard-license features difficult to recreate | G5 clean-room rewrites + Part A privacy |

---

## PART D — X-track: industrial-rival feature expansion (v0.2.0, AFTER G8)

Ceiling raise. Respects L3 (orchestration, not solver rewrites), L20 (12-verb MCP), L29 (one HW-IR/compiler/oracle), L128 (no Tier-4 hardware claims). Each phase: RED-first behavioral gate → implementation → offline $0 verification → handoff → STOP for orchestrator dual-context audit. Anti-vapor law binds: every named feature ships with a behavioral gate or is honestly deferred.

### Rival positioning (honest, no fabricated benchmarks)
- **vs Altium/Cadence (closed, cloud, $$$):** offline-first, $0, MIT, git-native semantic 3-way merge (hw-merge), AI agent harness with NDA zero-egress airgap, symbolic Z3 verification.
- **vs KiCad (no AI, no integrated sim lab, no semantic merge):** agent copilot/autonomous dock, Virtual Lab bench, hw-merge, manufacturing center, constraint manager.
- **vs Flux.ai (cloud-only AI autocomplete):** local-first NDA-airgap, full mfg center, symbolic verification, real field-solver bridges, hardware diff/panel/harness studio.
- "More features" = the union of G0–G8 + X1–X4 below, each gated. No claim outruns evidence.

### X1 · Constraint-driven design + variants + BOM analytics + DFM/DFA/PI
- Net-class/diff-pair/length-tuning constraint manager (make the Python `test-cad-perfection` checks real in `cad-geom` Rust + UI panel). Design variants (mounting options). BOM risk/stock via InvenTree + jlcparts (Ring-1 permissive). DFM/DFA/PI scorecards (critic L32) riding `dfm-dfa-safety`.
- WRITE_SCOPE: `packages/constraint-mgr/**` (new), `packages/bom-analytics/**` (new), `packages/cad-geom/**`, `packages/dfm-dfa-safety/**`, GUI panels, tests.
- VERIFY: cargo test new crates · offline BOM fixtures · behavioral GUI gate · harness.

### X2 · Real-time collaboration + project digest + CrossProbeBus
- CRDT (yjs/automerge, MIT) on HW-IR projections; presence + human-lock awareness fail-closed across peers (agent/peer never mutates locked=1). zustand CrossProbeBus <16ms + BroadcastChannel (critic L72, measured). Project digest snapshot symbol/footprint/SPICE/hw.lock (critic L35, 2030-proof).
- WRITE_SCOPE: `packages/crossprobe-bus/**`, `packages/collab/**` (new), `packages/hw-ir/**` (projection only), GUI presence, tests.
- VERIFY: <16ms measured budget gate · multi-peer lock negative test · digest round-trip · harness.

### X3 · Simulation & field-solver bridges (Ring-2 OCI, NEVER fork)
- ngspice-wasm Tier-0 in-browser SPICE (critic L74) + Xyce Pack-2B worker; vd-spice-compat transpiler. openEMS/ElmerFEM/CalculiX/Palace behind CadQuery→Gmsh + WorkerContract gVisor OCI (L12). Renode digital-twin + lockstep ngspice co-sim (L14). uPlot scope 60FPS/166k pts/25ms (L75, measured). **Option B pure-MIT digital VCD/FST waveform track** rendered on `uPlot`/Canvas (replaces EUPL-1.2 `surfer` so zero EUPL risk enters Ring 1). Virtual Lab becomes a real instrument bench (transient/AC/noise + field-solver heatmap overlays).
- WRITE_SCOPE: `packages/vd-spice-compat/**`, `packages/worker-sdk/**`, `apps/**` sim lab, Ring-2 OCI configs (gitignored quarantine), tests.
- VERIFY: wasm fuel/epoch/memory negatives · co-sim lockstep fixture · uPlot perf gate · zero-egress probe · harness.

### X4 · Silicon/FPGA pack + MCAD co-design + supply chain
- LibreLane Pack-2C (L13, not OpenLane). STEP AP242 MCAD co-design + 3D clearance DRC (occt-import-js, G5 feed). jlcparts/JLC2KiCad_lib supply-chain (L84-93). tracespace Gerber preview (L77). SKiDL optional netlist importer (L23, deferrable).
- WRITE_SCOPE: `packages/silicon-pack/**` (new), `packages/cad-transcoder/**`, `apps/**` 3D/mfg, tests.
- VERIFY: STEP round-trip golden · clearance DRC negative · supply-chain offline fixture · harness.

### X-track exit (v0.2.0, human-gated)
After X4 audit: orchestrator compiles `docs/RELEASE_PACKET_v0.2.0.md` (fresh harness, all gates, license firewall, claims register, 0/3 fabrication, `human_signoff: PENDING`). Push/tag/release ONLY on explicit user approval. L128 binds: no Tier-4 hardware-verified claim until 3 bench-verified PCBs exist.

---

## Sequencing
G0 → G1 → G2 → G3 → G4 → G5A → G5B → G5C → G6A → G6B → G6C → G6D → G7 → G8 (v0.1.0 packet) → P0→P1→P2→P3→P4→P5 (VD-PERF-001 zero-regression optimization) → X1 → X2 → X3 → X4 (v0.2.0 packet). Strictly serial, sole worker, STOP-for-review after each. Privacy policy (Part A) binds every phase from G4 onward.