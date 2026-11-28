# Changelog

All notable changes to Vajra-Dhīr EDA will be documented in this file.
The format is based on Keep a Changelog.

## [Unreleased]

## [0.0.5] - 2026-11-28

### Added
- **Universal Semantic Hub & Live Circuit Feedback (`sync_propagator.py`, `Schematic2DPanel.tsx`, `Pcb2DPanel.tsx`, `Workspaces.tsx`):** Added `SYNC_PLAN_BLOCKS` deterministic HW-IR net/component materialization, Live Net Spotlight (`sch-wire-*`), Circuit X-Ray voltage/wattage rings (`sch-xray-*`), `spiceOverlay.xrayEnabled` PCB overlay wiring, and live `sim_lab` `uPlot` scope bindings.
- **Canva + Affinity Silicon Darkroom Workstation (`StudioDrawerRail.tsx`, `BespokeStudioWindows.tsx`, `WorkstationShell.tsx`, `usePolishStore.ts`):** Overhauled workstation ergonomics with a `48px` vertical rail (`parts | blocks | modules | outliner | files | plugins`) + `272px` collapsible drawer, 6 Affinity Personas (`Plan | Schematic | PCB | 3D | Lab & Sim | Make`), 9 on-demand floating studio windows, self-healing `vd.layout.v7` Dockview layout, `0` WebGL on Home return, hairline `4px` `.vd-scroll-slim` scrollbars, `F1` Help Center, `?` Shortcuts modal, and clean `Escape` window dismissal.
- **Hardened Hermes Progressive Skills & 7-Layer Closed-Loop Engine (`hermes_bridge.py`, `autonomous_loop.py`, `AgentDockPanel.tsx`):** Integrated progressive `agentskills.io` `SKILL.md` discovery (Stage-1 metadata index + Stage-2 lazy body load) with OWASP ASI01/ASI03 approval defaults (`skills_write_approval`, `memory_write_approval`), full `L1 -> L7` closed-loop autonomous engineering flow with `>=3` oscillation detection and mandatory Gate-8 human hold, and `defer_loading: True` plugin tools in `mcp_live_server.py`.
- **20 Master-of-Electronics `SKILL.md` Library & 5-Repo Companion Readiness:** Authored 20 `agentskills.io` hardware engineering & orchestration skills (`res-ee-skills`), updated `vendor/MANIFEST.json`, wired `/api/v1/libraries/*` and `/api/v1/sbc-modules` companion endpoints (`kg_routes.py`, `daemon.py`), and verified 5-repo `.tar.zst`/`.sha256` bootstrap flows.
- **Multi-OS Custom Emblem Icons (`assets/icons/`, `apps/workstation/public/icons/`, `BootstrapSplash.tsx`):** Generated custom vector/ICO/ICNS/PNG icon sets and polished the bootstrap splash.

### Changed & Fixed
- **Daemon Latency, Hotkeys & Jargon Cleanup (`daemon.py`, `kg_routes.py`, `WorkstationShell.tsx`, `BespokeStudioWindows.tsx`):** Fixed missing `_REPO_ROOT` in `kg_routes.py`, hoisted `/api/v1/agent/` and `/api/v1/tx/` routes above unrelated lazy imports, aligned SPICE simulation route to `/api/v1/sim/run`, and removed internal database jargon from user-facing UI labels.
- **Repository Hygiene & Archive Organization (`.gitignore`, `.archive/`, `audit-secrets-and-paths.py`, `check-spdx-firewall.mjs`):** Relocated legacy root planning notes, superseded docs, old handoff scripts, prompt archives, and stale test caches into gitignored `.archive/` without altering tracked package/app paths.

### Fixed
- **Windows Launcher Python Auto-Detection (`scripts/launch.mjs`):** Resolved Windows App Execution Alias / host Python paths (`python` / `py`, `%LOCALAPPDATA%\Python`, `%LOCALAPPDATA%\Programs\Python`) and raised `hasCoreDeps` timeout to `15000 ms` so `vd-daemon` boots with `duckdb`, `z3`, `sympy`, `pint`, and `control` loaded (`boot_ms=346`).
- **Tokenized Browser URL & Public App Icons (`scripts/launch.mjs`, `packages/vd-daemon/src/daemon.py`):** Printed the full authenticated `http://127.0.0.1:<port>/?token=<hex>` URL on startup and permitted `/favicon.svg`, `/icon-192.png`, and `/icon-512.png` publicly while keeping API/workbench routes fail-closed (`401`).

## [0.0.4] - 2026-11-27

### Added
- **Portable Desktop Launch & Runtime Packaging:** Added silent Windows `Vajra-Dhir-EDA.vbs` launcher, `scripts/create-shortcut.mjs` desktop shortcut installer, `scripts/launch.mjs` (`--portable`, `--offline`, `--headless-check`), `docker/docker-compose.portable.yml`, `bootstrap_routes.py` resumable Tier-1/Tier-2 pack downloads + offline `.tar.zst` import + `gc`, `BootstrapSplash.tsx`, and `scripts/check-repo-size.mjs`.
- **Single-Renderer 3D & Bidirectional Workspace Sync:** Added `threeRendererPool.ts` singleton WebGL renderer, `sessionContextBus.ts`, 8 Smart Circuit Blocks in `kg_routes.py` (`/api/v1/blocks/catalog`, `/api/v1/blocks/drop`), `cosim_engine.py` live HW-IR pin macro generation, and `ArchitecturePlannerPanel` <-> HW-IR materialization.
- **Unified CAD Canvas Ergonomics:** Added `useUnifiedViewport.ts` (cursor coordinate emit, grid snap, alignment guides, `Alt+Hover` redlines) wired into `Schematic2DPanel.tsx` and `Pcb2DPanel.tsx`, pin wiring, rubber-band move, mid-route vias (`V`), copper pour fill (`B`), octilinear `X` routing, flip (`Shift+F`), Net Spotlight, and pure-MIT octilinear autorouter fallback in `router_worker.py`.
- **Verifier, Live SPICE Synthesis & Honest Fab Companion:** Added HW-IR SQLite -> SPICE compiler (`spice_synth.py`) with 3-tier behavioral models, cached KiCad/ngspice discovery (`ngspice_runner.py`), isolated `KICAD_CONFIG_HOME` DRC execution (`kicad_bridge.py`), live `/api/v1/diagnostics` + `/api/v1/diagnostics/waive` handlers (`ee_audit_routes.py`), real async job execution (`job_runner.py`), Schematic X-Ray thermal/DC overlay (`spiceSimStore.ts`), live `Z3` pinmux & `python-control` SMPS Bode routes (`daemon.py`), and `GET /api/v1/fab/status` + Bring-Up Companion (`fab_routes.py`, `FabReleasePanel.tsx`).
- **Hermes-Core BYOK Agent Runtime:** Added `packages/vd-daemon/src/agent/{vault,providers,runtime}.py` with encrypted BYOK API key storage (`OpenAI`, `Anthropic`, `Gemini`, `DeepSeek`, `OpenRouter`, `Groq`, `Local Ollama`), loopback airgap enforcement (`NDA_AIRGAPPED` -> HTTP 403), SQLite FTS5 memory, 6 built-in EE skills, `@board`/`@drc`/`@spice` context mentions, `/rollback` checkpoint rewind, and Dual-Context lock auditing.
- **App Icons, Offline User Guides & Help Center:** Added multi-OS icons (`assets/icons/`, `apps/workstation/public/`), PWA `manifest.webmanifest`, 10 offline markdown guides (`docs/guides/01..06-*.md`, `docs/{FAQ,TROUBLESHOOTING,KEYMAP,PACKS_AND_STORAGE}.md`), and interactive `HelpCenterModal.tsx` (`Shift+F1`).
- **Stage 7 E2E Verification Gates:** Added `scripts/test-{cross-integration,canvas-ergonomics,verifier-and-lab,hermes-agent-byok,product-polish}-e2e.mjs` and `scripts/test-final-torture-gate.mjs`.

### Changed & Fixed
- **Clean Project Lifecycle & Delta Sync:** Stopped auto-seeding repo fixture boards on empty launch (`settings_store.py`), isolated `.vdproj/` create/open/close workspaces, emitted compact `< 4 KB` `STATE_DELTA` patches (`sync_propagator.py`), and wired `daemon.py` `/api/v1/components/search` directly to DuckDB (`starter_kg.duckdb` column mapping).
- **Schema Idempotence & Cold-Boot Responsiveness:** Added `KERNEL_LOCK_VIOLATION` triggers to `001_v001_init.sql`, added `IF NOT EXISTS` guards to `002_manual_perfection.sql`, moved `/api/v1/jobs` outside `DB_LOCK`, and avoided eager heavy imports on `/stitch/physics/smps-bode`.
- **KiCanvas Sub-Symbol Null Safety & Performance:** Guarded missing `lib_symbol` in `packages/kicanvas-core`, removed idle cursor pointermove React re-renders (`cursorWorldMmRef` + `emitLiveCursorCoords`), cleaned status/drawer jargon, and unified `usePolishStore.ts` workflows.

## [0.0.3] - 2026-11-26

### Added & Changed
- **Workstation Shell & Desktop Polish (`apps/workstation`):** Rebuilt 6-zone UI with `MenuBar`, `TransportBar`, `ToolShelf`, `BottomDrawer`, `Ctrl+K` Command Palette, `Space` cursor context menu, `FileBrowserModal`, persistent settings (`.vd-cache/user-settings.json`), `job_runner.py`, and vendored `@tracespace/*` (`packages/tracespace-vendor`).
- **Daemon & CI Hardening:** Added Windows MIME map, gzip, lazy solver loading, SQLite WAL tuning, `.github/actions-pins.lock.json`, and verified green cross-platform CI.

## [0.0.2] - 2026-11-26 (Human Release Signoff Pending)

### Added & Hardened
- **Canonical Workstation (`apps/workstation`):** React 19.3.1 + TypeScript 7.0.2 + `dockview-react` 8.9.x MIT docking workspace served strictly on `127.0.0.1:41900` (`vd studio`), Matte Industrial Precision chrome, code-split entry JS (`< 400 KB`), WebGL2/Canvas2D PCB rendering with KiCanvas RAF lifecycle guard, `elkjs` schematic auto-layout, `uPlot` waveform plotting, pure-MIT IEEE-1364 VCD viewer (no EUPL `surfer`), MIT `tracespace` 15-layer RS-274X Gerber inspector, and `< 16 ms` `CrossProbeBus` with `zustand` omnidirectional `rev_id` sync.
- **Live MCP v2, ACP & 2-Tier Plugin Host (`packages/vd-daemon`, `packages/mcp-gateway`):** Unified 12-verb MCP v2 (`--stdio` + Streamable HTTP `/mcp`), `/ws/ui-control` bridge, ACP broker (`OFF`/`COPILOT`/`AUTONOMOUS`) with dual checkpoints, `Wasmtime 51` Code Mode, and capability-gated plugin host (`requested ∩ policy_granted`).
- **Physics, Fab Pack & Engineering Dossier:** 2.5D DC Power Integrity (`padne`), 3D MCAD thermal (`CadQuery` + `Gmsh`/`ElmerFEM`), IPC-2581 validation & fab bundle builder with fail-closed Gate-8 signoff (`403`), and Typst 3-page bring-up PDF dossier (`pypdfium2` validated).
- **Constraint & BOM Intelligence:** Added pure-MIT Rust crates `packages/constraint-mgr` (`vd-constraint-mgr`, `i64` nm netclass/skew/delay rules) and `packages/bom-analytics` (`vd-bom-analytics`, DNP assembly variants, Extended feeder fees, stock/lifecycle scoring), plus unified DFM/DFA/PI scorecard (`packages/dfm-dfa-safety/src/scorecard.py`).
- **CRDT Collab & Project Digests:** Added `@vajradhir/collab` (`packages/collab`, offline `yjs@13.6.33` enforcing fail-closed `KERNEL_LOCK_VIOLATION` across peers/agents + canonical `vd.hw.lock.v1` SHA-256 digests) and `packages/hw-ir/src/digest.rs` (`vd.hw.lock.projection.v1`).
- **Simulation, Silicon & 3D Clearances:** Added lockstep co-simulation contracts (`packages/sim-compat/src/cosim_contract.rs`), Ring-2 `network_mode: none` enforcement (`packages/vd-daemon/src/x3_routes.py`, `x4_routes.py`), `packages/silicon-pack` (LibreLane Pack-2C C2P2B bridge), `packages/cad-transcoder/src/skidl_netlist.rs`, and integer `i64` nm MCAD 3D clearance DRC (`packages/cad-geom/src/mcad_clearance.rs`).
- **Clean-Room Manufacturing & Persistence:** Added Rust `panelizer`, `rs274x`, `eagle_xml`, `wire-harness`, `pcb-diff`, `i_triangle` `i64` copper pour, `occt-import-js` isolated Web Worker, `cas-store` zstd compression, WAL checkpointing, transactional Undo/Redo, Win64/POSIX child supervision, and SSE agent proposal endpoints.
- **License, Docs & Verification Hygiene:** Unified root `LICENSE` under Apache License 2.0 (with `NOTICE` & `docs/LICENSE_EXCEPTIONS.md`), adaptive dark/light SVG branding, hardened `Spec & Security CI`, and verified offline SPDX firewall, secret scanning, and verification harness (`0/3` PCBs physically fabricated).

[Unreleased]: https://github.com/Dev-Solanki-09/Vajra-Dhir-EDA/compare/v0.0.5...HEAD
[0.0.5]: https://github.com/Dev-Solanki-09/Vajra-Dhir-EDA/compare/v0.0.4...v0.0.5
[0.0.4]: https://github.com/Dev-Solanki-09/Vajra-Dhir-EDA/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/Dev-Solanki-09/Vajra-Dhir-EDA/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/Dev-Solanki-09/Vajra-Dhir-EDA/releases/tag/v0.0.2
