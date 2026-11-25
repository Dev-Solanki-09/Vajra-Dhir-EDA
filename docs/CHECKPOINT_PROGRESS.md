# Vajra-Dhīr EDA — Engineering Checkpoint & Continuity Protocol

| Metadata Field | Value |
|---|---|
| **Document ID** | `VD-CHK-001` · Rev 7.0 |
| **Date & Timestamp** | 2026-11-25T14:20:00+05:30 |
| **Git Baseline Branch** | `main` |
| **Standards Compliance** | ISO/IEC/IEEE 42010, ISO/IEC/IEEE 15288, SLSA v1.2, OWASP Agentic AI (ASI01–ASI10) |
| **Verification Status** | **Classified 77-Gate Suite (Behavioral + Structural Contract)** |
| **Milestone 1 Hardware Exit**| **0/3 Physically Fabricated (Software Reference Blueprints; Human Signoff PENDING)** |
| **Ring 2 Container Isolation**| **ACTIVE — OCI Workers (Pack 2A/2B/2C), Worker SDK, WebGPU Canvas** |
| **Production Addendum Scope**| **ACTIVE — Multi-Region Fab Registry, EMC Workbench, CAS Store, `vd doctor`** |
| **CAD & Verification Core**| **ACTIVE — Schematic Beautifier, Autorouter, Footprints, Recovery, Control, HBOM** |

---

## 1. Executive Status & Session Continuity

This document preserves the architectural state, thinking, internal decisions, and forward execution plan for **Vajra-Dhīr EDA** (`vajra-dhir-eda`). Any future AI agent, human architect, or CI pipeline can pick up directly from this file without loss of context.

### Hard Invariants (Never Violate)
1. **Geometry & Coordinates:** ALL PCB and IC geometry MUST be stored as signed `i64` nanometers (`1 mm = 1_000_000 nm`) and signed `i32` millidegrees (`0..360000`). NEVER store floating-point coordinates in SQLite WAL or `*.vd-ir.jsonl`.
2. **Entity Identification:** ALL entity IDs are immutable UUIDv7 strings (`uuid::Uuid::now_v7()`), guaranteeing chronological sortability and distributed clash-free synthesis.
3. **Fail-Closed Human Locks:** All modifications to `HW-IR` must set `_tx_actor_ctx`. Database triggers (`trg_protect_locked_*`) MUST immediately abort any non-human edit (`agent`, `compiler`) on `locked = 1` entities with SQLITE_ABORT `KERNEL_LOCK_VIOLATION`.
4. **Ring 1 Permissive License Firewall:** Ring 1 Core (`packages/*`, `apps/*`, `schemas/*`) is strictly dual-licensed under **MIT OR Apache-2.0**. AGPL-3.0 dependencies (e.g. `kibot`, `konnect`, `part-db`, `pypsa-app`, `openmodelica`, `PyMuPDF`) are strictly banned from Ring 1. Heavy copyleft solvers are isolated inside zero-egress Ring 2 OCI containers.
5. **Zero Inbound Open Ports & Zero Secrets:** Local communications run strictly via loopback (`127.0.0.1`), Unix Domain Sockets (UDS), or IPC. Zero plaintext tokens, secrets, or personal paths (`C:\Users\`) may be committed.

---

## 2. Inventory of Implemented Core Packages

All 26 core packages below are active, tested, and passing deterministic verification:

| Package | Path | Language / Tech | Primary Architectural Purpose |
|---|---|---|---|
| **`hw-ir`** | `packages/hw-ir` | Rust / SQLite WAL / TS | Canonical SQLite database schema, 24 tables, `_tx_actor_ctx`, human lock triggers, Lamport logical timestamps. |
| **`hw-merge`** | `packages/hw-merge` | Rust | Semantic 3-way merge driver for `*.vd-ir.jsonl` git attributes. |
| **`hw-dlp`** | `packages/hw-dlp` | Rust | Hardware DLP firewall, regex secret sanitizer, $5.00 budget circuit breaker, NDA airgap router. |
| **`wasm-sandbox`** | `packages/wasm-sandbox` | Rust / Wasmtime 51 | 256 MiB memory ceiling, fuel & epoch timeout watchdog, 16 KiB stdout cap |
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
| **`worker-sdk`** | `packages/worker-sdk` | Rust | Stateless Ring 2 worker dispatcher conforming to `worker_contract.v1.json`, input staging, and SHA-256 evidence hashing. |
| **`webgpu-cad-engine`**| `packages/webgpu-cad-engine`| TypeScript / WebGL2+2D | WebGPU/WebGL2 GLSL ES 3.00 + Software Canvas2D renderer, Geometry Worker nm hit-testing, Silicon Darkroom palette |
| **`emc-workbench`** | `packages/emc-workbench` | Rust | Harmonic collision matrix ($1f..15f$ vs protected RF bands), connector ESD proximity auditor ($< 5.0\text{ mm}$). |
| **`cas-store`** | `packages/cas-store` | Rust | Content-addressed artifact store (`cas://sha256/...`), SHA-256 verification, and digest pinning. |
| **`schematic-beautifier`** | `packages/schematic-beautifier` | Rust | 5-stage semantic layout engine: power rail hierarchy (+V up, GND down), L-to-R signal flow, multi-unit symbol splitting, net label collision avoidance, and KiCad 10 S-expression export. |
| **`autorouter`** | `packages/autorouter` | Rust | Bi-directional Specctra DSN/SES orchestrator bridge, `.kicad_dru` netclass rule sync, and fail-closed SHA-256 locked-copper integrity guard. |
| **`footprint-synth`** | `packages/footprint-synth` | Rust | IPC-7351B mathematical land pattern synthesizer across Least/Nominal/Most density levels with courtyard clearance, silkscreen, and KiCad 10 `.kicad_mod` output. |
| **`solver-recovery`** | `packages/solver-recovery` | Rust | Deterministic multi-step convergence ladder for SPICE transient, P&R congestion backoff, and 3D FEM mesh defeaturing. |
| **`control-loop`** | `packages/control-loop` | Rust | SMPS plant analysis ($f_{LC}, f_{ESR}, f_{RHPZ}$), Type-II/III feedback compensator synthesis, and phase margin safety verification ($\phi_m \ge 45^\circ$, $GM \ge 10\text{ dB}$). |
| **`compliance-hbom`** | `packages/compliance-hbom` | Rust | StrictDoc V-Model requirements traceability matrix and automated CycloneDX 1.6 Hardware BOM with RoHS 3, REACH, and lifecycle metadata. |
| **`cli`** | `packages/cli` | Rust (`vd`) | Unified command-line interface (`vd eco`, `vd gate`, `vd sim`, `vd cam`, `vd dlp`, `vd pdn`, `vd diff`, `vd harness`, `vd panel`, `vd worker`, `vd asic`, `vd emc`, `vd cas`, `vd beautify`, `vd route`, `vd footprint`, `vd recovery`, `vd control`, `vd hbom`, `vd doctor`). |
| **`ui-apps`** | `packages/ui-apps` | HTML / Strict CSP | Portable interactive MCP UI apps (waveform viewer, interactive inspection lenses). |
| **`desktop` / `workstation`** | `apps/workstation` | React 19 / Dockview | Canonical Silicon Darkroom Studio (`vd studio`, Dockview MIT, `elkjs`, `uPlot`, WebGL2/Canvas2D); `apps/desktop` kept compatible |

---

## 3. Milestone 1 Hardware Exit Verification (`0/3` Physically Fabricated · Software Blueprints)

All three reference hardware designs are software blueprints checked via offline DRC/verification scripts and fail-closed `verification_report.json` (`release_authorized: false`, `human_signoff: PENDING`; zero physical fab runs completed):

### Board 1 — USB-C PD 12V $\to$ 3.3V / 3A Synchronous Buck (2-Layer)
- **Directory:** [`designs/board-1-buck-pd`](../designs/board-1-buck-pd)
- **Artifacts:** `README.md`, `board.vd-ir.jsonl`, `board.kicad_sch`, `board.kicad_pcb`, `bom.csv`, `pnp_centroids.csv`, `verification_report.json`.
- **Verified Physics:** Negotiates 12V via CH224K, outputs $3.30\text{V} \pm 2\%$ across $0\text{--}3\text{A}$, ripple $10.2\text{ mV}_{\text{pp}}$, peak $T_j = 67.3^\circ\text{C} < 75.0^\circ\text{C}$ safe ceiling.

### Board 2 — ESP32-S3 4-Layer Environmental Sensor Node
- **Directory:** [`designs/board-2-esp32s3-node`](../designs/board-2-esp32s3-node)
- **Artifacts:** `README.md`, `board.vd-ir.jsonl`, `board.kicad_sch`, `board.kicad_pcb`, `bom.csv`, `pnp_centroids.csv`, `firmware/include/board_pins.h`, `firmware/dts/esp32s3_sensor_node.overlay`, `firmware/src/main.c`, `verification_report.json`.
- **Verified Physics:** AP2112K LDO $T_j = 63.3^\circ\text{C} < 125^\circ\text{C}$, I²C bus rise time $t_r = 55.9\text{ ns} \ll 300\text{ ns}$, CPWG antenna impedance $Z_0 = 50.2\,\Omega$, USB differential impedance $Z_{\text{diff}} = 89.8\,\Omega$.

### Board 3 — STM32G4 CAN-FD + Dual Motor Driver (4-Layer, Human Co-Edited)
- **Directory:** [`designs/board-3-stm32g4-motor`](../designs/board-3-stm32g4-motor)
- **Artifacts:** `README.md`, `board.vd-ir.jsonl`, `board.kicad_sch`, `board.kicad_pcb`, `bom.csv`, `pnp_centroids.csv`, `firmware/include/board_pins.h`, `firmware/src/main.c`, `verification_report.json`.
- **Verified Fail-Closed Human Locks:** DRV8833 power stage and 2.0mm copper traces are marked `locked = 1`. Any mutation by non-human agents (`agent`, `compiler`) aborts immediately with `KERNEL_LOCK_VIOLATION`. Only authorized human actor transactions succeed. CAN-FD differential impedance $Z_{\text{diff}} = 118.6\,\Omega$, current sense resistor dissipation $0.20\text{ W} < 0.50\text{ W}$.

---

## 4. Automated Classified Verification Suite (Gates 1..77)

To verify the repository offline (`BEHAVIORAL` + `STRUCTURAL_CONTRACT` classified gates), run:
```bash
node scripts/verify-all.mjs
```

All 31 verification gates:
1. `SPDX License & AGPL Firewall` — `check-spdx-firewall.mjs`
2. `CrossProbeBus` — Sub-millisecond channel unit tests
3. `Harness MCP v2 Gateway` — 12 Typed EDA Verbs unit tests
4. `Silicon Darkroom Theme & Contrast` — WCAG AAA contrast audit
5. `Canonical HW-IR SQLite DDL & Triggers` — `001_init.sql` & `002_manual_perfection.sql`
6. `DLP Firewall & Budget Circuit Breaker Policy` — `budget.json` audit
7. `Wasmtime 51 Sandbox WIT & Memory Ceilings` — `codemode.wit` & 256 MiB / epoch limits audit
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
23. `Hardware Exit: 3 Physical Boards & Kernel Locks` — Real HW-IR validation & lock enforcement
24. `Hardware-Firmware Co-Design Parity & DT Overlays` — Deterministic headers & Zephyr bindings
25. `Ring 2 OCI Container Isolation & Zero-Egress Compose` — Dockerfile and compose invariants
26. `Ring 2 Stateless Worker SDK & Job Contract Dispatcher` — Contract schema and staging tests
27. `WebGPU CAD Canvas Engine with WebGL2 Fallback` — Rendering pipeline and palette tests
28. `Multi-Region Fab Registry (Global & India EMS)` — Capability TOMLs & INR/USD/EUR tiers
29. `EMI/EMC Regulatory Pre-Compliance & Harmonic Matrix` — RF collisions & ESD proximity
30. `Local Content-Addressed Binary Artifact Store (CAS)` — Storage, hash validation & pinning
31. `Vajra-Dhīr Diagnostics Preflight (vd doctor)` — Health checks & GPU driver blocklist
32. `5-Stage Semantic Schematic Beautifier Engine` — Power rail hierarchy, L-to-R signal flow, unit splitting, label collision avoidance & KiCad 10 S-expression export
33. `Autorouter Orchestrator Bridge & Copper Lock Guard` — Specctra DSN/SES orchestrator, .kicad_dru rules & fail-closed locked-copper SHA-256 integrity guard
34. `IPC-7351B Footprint Synthesizer (.kicad_mod)` — Mathematical land pattern calculation across Least/Nominal/Most density & KiCad 10 .kicad_mod generation
35. `Solver Convergence & Failure-Recovery Middleware` — Deterministic SPICE, P&R congestion, and 3D FEM mesh recovery ladders
36. `SMPS Control-Loop Stability & Compensator Math` — Plant analysis, Type-II/III compensator pole-zero synthesis, and phase margin safety verification
37. `V-Model Traceability & CycloneDX 1.6 HBOM Generator` — StrictDoc requirements audit and automated CycloneDX 1.6 Hardware BOM with RoHS 3, REACH, and lifecycle metadata

---

## 5. Ring 2 OCI Container Isolation & Production Addendum Scope

- **Pack 2A (`containers/pack-2a-kicad`):** KiCad 10 headless CLI container (`kicad-cli pcb drc`, `export gerbers`, `export step`).
- **Pack 2B (`containers/pack-2b-virtual-lab`):** Renode + ngspice lockstep co-simulation & Google OpenHTF factory production test executive.
- **Pack 2C (`containers/pack-2c-silicon-asic`):** Verilator cycle-accurate RTL simulation, Yosys synthesis, and Chip-to-Package-to-Board (C2P2B) pad-ring to ball-map bridge.
- **Production Compose (`docker-compose.workers.yml`):** Drops all capabilities (`cap_drop: ALL`), read-only rootfs (`read_only: true`), non-root execution (`uid=10001`), and zero egress (`network_mode: "none"`).
- **Multi-Region Registry (`registry/fabs/`):** JLCPCB, PCBWay, Eurocircuits, Lion Circuits (India EMS), PCB Power Market (India EMS).
- **Diagnostics (`vd doctor`):** Instant preflight checking compilers, runtimes, container engines, and locking known-buggy integrated GPUs to WebGL2 fallback.
