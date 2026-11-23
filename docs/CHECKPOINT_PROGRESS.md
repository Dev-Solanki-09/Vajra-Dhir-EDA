# Vajra-Dhīr EDA — Engineering Checkpoint & Continuity Protocol

| Metadata Field | Value |
|---|---|
| **Document ID** | `VD-CHK-001` · Rev 2.0 |
| **Date & Timestamp** | 2026-11-24T00:20:00+05:30 |
| **Git Baseline Branch** | `main` |
| **Standards Compliance** | ISO/IEC/IEEE 42010, ISO/IEC/IEEE 15288, SLSA v1.2, OWASP Agentic AI (ASI01–ASI10) |
| **Verification Status** | **22/22 Gates Passing Cleanly (100% Certified)** |

---

## 1. Executive Status & Session Continuity

This document preserves the architectural state, thinking, internal decisions, and forward execution plan for **Vajra-Dhīr EDA** (`vajra-dhir-eda`). Any future AI agent, human architect, or CI pipeline can pick up directly from this file without loss of context.

### Hard Invariants (Never Violate)
1. **Geometry & Coordinates:** ALL PCB and IC geometry MUST be stored as signed `i64` nanometers (`1 mm = 1_000_000 nm`) and signed `i32` millidegrees (`0..360000`). NEVER store floating-point coordinates in SQLite WAL or `*.vd-ir.jsonl`.
2. **Entity Identification:** ALL entity IDs are immutable UUIDv7 strings (`uuid::Uuid::now_v7()`), guaranteeing chronological sortability and distributed clash-free synthesis.
3. **Fail-Closed Human Locks:** All modifications to `HW-IR` must set `_tx_actor_ctx`. Database triggers (`trg_protect_locked_*`) MUST immediately abort any non-human edit (`agent`, `compiler`) on `locked = 1` entities with SQLITE_ABORT `KERNEL_LOCK_VIOLATION`.
4. **Ring 1 Permissive License Firewall:** Ring 1 Core (`packages/*`, `apps/*`, `schemas/*`) is strictly dual-licensed under **MIT OR Apache-2.0**. AGPL-3.0 dependencies (e.g. `kibot`, `konnect`, `part-db`, `pypsa-app`, `openmodelica`, `PyMuPDF`) are strictly banned from Ring 1.
5. **Zero Inbound Open Ports & Zero Secrets:** Local communications run strictly via loopback (`127.0.0.1`), Unix Domain Sockets (UDS), or IPC. Zero plaintext tokens, secrets, or personal paths (`C:\Users\`) may be committed.

---

## 2. Inventory of Implemented Ring 1 Packages

All 22 packages below are active, tested, and passing deterministic verification:

| Package | Path | Language / Tech | Primary Architectural Purpose |
|---|---|---|---|
| **`hw-ir`** | `packages/hw-ir` | Rust / SQLite WAL / TS | Canonical SQLite database schema, 24 tables, `_tx_actor_ctx`, human lock triggers, Lamport logical timestamps. |
| **`hw-merge`** | `packages/hw-merge` | Rust | Semantic 3-way merge driver for `*.vd-ir.jsonl` git attributes. |
| **`hw-dlp`** | `packages/hw-dlp` | Rust | Hardware DLP firewall, regex secret sanitizer, $5.00 budget circuit breaker, NDA airgap router. |
| **`wasm-sandbox`** | `packages/wasm-sandbox` | Rust / Wasmtime 50 | 256 MiB memory ceiling, fuel-metered execution sandbox for untrusted scripts and external plugins. |
| **`cad-geom`** | `packages/cad-geom` | Rust / `rstar` / `i_overlay` | 2D CAD kernel, R-Tree spatial index, differential pair geometry, boolean polygon operations. |
| **`placement-router`**| `packages/placement-router`| Rust / `rayon` | Multi-threaded simulated annealing component placer with HPWL, overlap penalty, and thermal centroid balance. |
| **`cad-transcoder`** | `packages/cad-transcoder` | Rust / KiCad S-Expr | KiCad 10 3-channel bidirectional bridge with 5-second SHA-256 echo suppression ring. |
| **`crossprobe-bus`** | `packages/crossprobe-bus` | TypeScript / Node | Sub-16ms cross-probe event channel linking schematic, PCB layout, 3D viewer, and agent inspector. |
| **`mcp-gateway`** | `packages/mcp-gateway` | TypeScript / Node | Harness MCP v2 Server exposing all 12 typed EDA verbs to LLM agents. |
| **`component-kg`** | `packages/component-kg` | Rust | MLCC DC-bias derating ($C_{\text{eff}} = C_{\text{nom}} [1 - 0.75 (V/V_r)^{1.4}]$), inductor saturation physics, datasheet citations. |
| **`open-cubo`** | `packages/open-cubo` | Rust | Parametric synthesizers: TPS54302 Buck, AP2112K-3.3 LDO ($T_j = T_a + P_d R_{\theta JA}$), CH224K USB-PD sink, USBLC6-2SC6 ESD clamp. |
| **`symbolic-verifier`**| `packages/symbolic-verifier`| Rust | 10 EE Footguns engine (MLCC collapse, inductor saturation, floating CMOS, decoupling distance, split planes, I²C rise time, diode thermal, boot pins, crystal caps, junction temp) + Pinmux solver. |
| **`nine-gates`** | `packages/nine-gates` | Rust | Sequential fail-closed state machine for G1 through G9 hardware signoff with SHA-256 evidence hashing. |
| **`eco-engine`** | `packages/eco-engine` | Rust | Geographical RefDes re-annotation (`R1..Rn`, `C1..Cn`, `U1..Un`) and off-board staging tray layout. |
| **`sim-compat`** | `packages/sim-compat` | Rust | Vendor SPICE compatibility, `$CDNENCSTART` detection with `[BEHAVIORAL-APPROX]` fallback, and LTspice AST transpiler. |
| **`cam-pnp`** | `packages/cam-pnp` | Rust | IPC-7525B stencil aperture DFM (area ratio $\ge 0.66$, aspect $\ge 1.50$, window-paning) and SMT pick-and-place feeder optimizer. |
| **`pdn-solver`** | `packages/pdn-solver` | Rust | 2.5D DC Power Integrity, IR-Drop & IPC-2152 thermal solver for copper rails and via transitions. |
| **`pcb-diff`** | `packages/pcb-diff` | Rust | Pure-MIT visual layer-by-layer PCB diff engine (green added, red removed, blue modified). |
| **`wire-harness`** | `packages/wire-harness` | Rust | Pure-MIT declarative cable, wire harness compiler, AWG/IEC 60757 tables, and voltage drop calculator. |
| **`panelizer`** | `packages/panelizer` | Rust | Pure-MIT automated $M \times N$ PCB panelization with rails, mouse bites, tooling holes, and fiducials. |
| **`cli`** | `packages/cli` | Rust (`vd`) | Unified command-line interface (`vd eco`, `vd gate`, `vd sim`, `vd cam`, `vd dlp`, `vd pdn`, `vd diff`, `vd harness`, `vd panel`). |
| **`ui-apps`** | `packages/ui-apps` | HTML / Strict CSP | Portable interactive MCP UI apps (waveform viewer, interactive inspection lenses). |
| **`desktop`** | `apps/desktop` | React 19 / Dockview | Silicon Darkroom spatial desktop IDE with WebGPU/WebGL2 viewport and high-contrast accessible theme. |

---

## 3. Automated 22-Gate Verification Suite

To verify the entire repository offline, run:
```bash
node scripts/verify-all.mjs
```

All 22 verification gates:
1. `SPDX License & AGPL Firewall` — `check-spdx-firewall.mjs`
2. `CrossProbeBus` — Sub-millisecond channel unit tests
3. `Harness MCP v2 Gateway` — 12 Typed EDA Verbs unit tests
4. `Silicon Darkroom Theme & Contrast` — WCAG AAA contrast audit
5. `Canonical HW-IR SQLite DDL & Triggers` — `001_init.sql` & `002_manual_perfection.sql`
6. `DLP Firewall & Budget Circuit Breaker Policy` — `budget.json` audit
7. `Wasmtime 50 Sandbox WIT & Memory Ceilings` — `codemode.wit` audit
8. `Semantic 3-Way Merge Driver` — `.gitattributes` binding
9. `KiCad 10 Transcoder & 5s Echo Suppression` — Echo suppression ring audit
10. `Threat Model & Security Floor (Nov 2026)` — STRIDE & OWASP ASI01–ASI10 mapping
11. `Component Knowledge Graph & Physics Calculations` — MLCC derating & saturation
12. `Open-CUBO Parametric Synthesizers` — Buck, LDO, USB-PD, ESD clamping
13. `Symbolic Verifier & 10 EE Footguns Engine` — 10 EE Footguns audit
14. `9-Gate Fail-Closed Pipeline State Machine` — Precondition state transitions
15. `Forward/Back-Annotation ECO Engine` — Geographical sort & staging tray
16. `Vendor SPICE Compatibility & Dialect Transpiler` — AST rewrites & encrypted shield
17. `IPC-7525B Stencil DFM & Pick-and-Place Generator` — Stencil DFM & feeder optimization
18. `Vajra-Dhīr Unified CLI Engine` — Subcommand router (`vd`)
19. `2.5D DC Power Integrity & IPC-2152 PDN Solver` — Sheet resistance, IR drop & thermal rise
20. `Pure-MIT Visual Layer-by-Layer PCB Diff Engine` — Polygon boolean diff & SVG output
21. `Pure-MIT Wire Harness & Interconnect Compiler` — Wire cut-lists & BOM generator
22. `Pure-MIT Automated PCB Panelization & Stencil Engine` — Rails, fiducials & mouse bites

---

## 4. Next Implementation Milestones (Roadmap)

### Milestone 1 Hardware Exit Criteria
Before expanding into Ring 2 containers or heavy packaging, the project requires autonomous generation, formal verification, and physical hardware signoff of three real boards:
1. **Board 1 — USB-C PD 12V $\to$ 3.3V / 3A Synchronous Buck (2-Layer):**
   - Negotiates 12V via CH224K.
   - Generates $3.30\text{V} \pm 2\%$ across $0\text{--}3\text{A}$, ripple $< 40\text{ mV}_{\text{pp}}$.
   - Thermal maximum $< 75^\circ\text{C}$.
2. **Board 2 — ESP32-S3 Sensor Node (4-Layer):**
   - Auto-synced `board_pins.h` generated deterministically from HW-IR.
   - Reads BME280 over I²C ($t_r < 300\text{ ns}$).
   - 2.4 GHz RF trace with controlled $50\Omega$ coplanar waveguide geometry.
3. **Board 3 — STM32G4 CAN-FD + Motor Driver (4-Layer, Human Co-Edited):**
   - Mixed manual and autonomous layout: human locks fail closed against agent modification.
   - 1 Mbps CAN-FD loopback with 0 errors.
   - Drives 2A inductive motor load cleanly with flyback protection.

### Ring 2 Container Integration
- Pack 2A: KiCad 10 headless CLI container (`kicad-cli pcb export gerber/drc`).
- Pack 2B: Renode + lockstep ngspice co-simulation runner.
- Pack 2C: IIC-OSIC-TOOLS open-source ASIC flow (OpenLane 2, SkyWater 130nm / IHP 130nm).
