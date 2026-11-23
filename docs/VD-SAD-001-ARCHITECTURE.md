# Vajra-Dhīr EDA — Industrial Software Architecture Description & Engineering Standard (`VD-SAD-001`)

| Field | Value |
|---|---|
| **Document ID / Revision** | `VD-SAD-001` · **Rev 2.0 (Industrial Baseline)** |
| **Status** | **Approved & Signed Off · Active Baseline for Milestone 1** |
| **Standards Alignment** | ISO/IEC/IEEE 42010 (Architecture), ISO/IEC/IEEE 15288 (Lifecycle), SLSA v1.2, NIST SSDF SP 800-218, OpenSSF OSPS Baseline, OWASP ASVS 5.0 / Agentic AI 2026, IPC-2581C, prostep ivip IDX v6.0 |
| **Product / Repository** | `Vajra-Dhīr EDA` (`vajra-dhir-eda`) |
| **Canonical Data Invariants** | Immutable UUIDv7 · Signed `i64` nanometers (`1 mm = 1_000_000 nm`) · Signed `i32` millidegrees (`0..360000`) |
| **Verification Baseline Date** | 2026-11-23 |

---

## 1. Executive System Scope & Architectural Topology

**Vajra-Dhīr EDA** is an open-source, deterministic-verified, autonomous and craftsman-grade manual **Hardware + Software Co-Design IDE** spanning PCBs, embedded firmware, FPGAs, digital/analog/photonic/ULSI ICs, and industrial electrical systems. Its fundamental architectural separation guarantees industrial reliability: **neural models author architectural intent and structured repairs; deterministic compilers, formal solvers, and isolated physics engines own geometry, math, and signoff.**

### 1.1 The 4-Ring Isolation Architecture
```text
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ RING 1: LEAN ZERO-DOCKER CORE (Always Installed · Strictly MIT / Apache-2.0 · CPU-First)  │
│  • Canonical Kernel: Rust HW-IR (SQLite WAL, UUIDv7, i64 nm, HardwarePatch Bus, hw.lock)  │
│  • Manual CAD Kernel: vd-cad-geom (rstar, i_overlay, iTriangle, cavalier, manifold-csg)   │
│  • Hybrid Coding IDE: Code-OSS / VS Code + Monaco + LSP/DAP + @xterm/xterm + dockview     │
│  • Frontier Harness: Harness MCP v2 (12 Verbs) + Wasmtime 50 Code Mode + ACP Broker       │
│  • Neuro-Symbolic Brain: DuckDB KG + atopile + Z3 + SymPy/Pint + 10 Footguns + Open-CUBO  │
│  • Physical Core: vd-placer (Rayon SA) + KiCadRoutingTools/fastroute + 3-Ch KiCad 10      │
│  • Graphics & Apps: WebGPU (+ WebGL2 fallback) + Portable ui:// MCP Apps (strict CSP)     │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ RING 2: OPT-IN VERSION-PINNED OCI / gVisor PACKS (Zero-Egress · Immutable @sha256 Digests)│
│  • Pack 2A (PCB/EM/FEM/MCAD): KiCad 10, padne, KiPIDA, openEMS, Palace, PyBERT, Gmsh ->   │
│    ElmerFEM/CalculiX, CadQuery (STEP AP242 / IDX v6.0), PyOpenMagnetics, PyBaMM           │
│  • Pack 2B (Virtual Lab & HIL): Renode + lockstep ngspice/Xyce, CircuitJS1, pyfda, hls4ml,│
│    probe-rs, PyVISA, sigrok, scopehal-apps, OpenPnP                                       │
│  • Pack 2C & 2C-VLSI (Silicon): IIC-OSIC-TOOLS, LibreLane, OpenROAD-MCP, Verilator/cocotb,│
│    sby, LiteX, ALIGN, CACE, gdsfactory, DEVSIM, OpenVAF, Chipyard, gem5, OpenRAM, PROLEAD │
│  • Pack 2D (Heavy Electrical): pandapower, PyPSA, Pyleecan, pvlib, QElectroTech, OpenPLC4 │
│  • Pack 2E (Comms/Photonics/Sec): Sionna 5G/6G, GNU Radio, SoapySDR, Meep, Faust, CW      │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ RING 3: ENTERPRISE, TEAM & GOVERNANCE PLUGINS                                              │
│  • Yjs CRDT Multiplayer, Temporal Durable Workflows, InvenTree PLM, StrictDoc V-Model,    │
│    CycloneDX HBOM, OIDC/RBAC Signed ECO Ledger, Opt-In GPLv3 CERN PNS Router Sidecar      │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ RING 4: HARDWARE EVALOPS & AIR-GAPPED OFFLINE HARNESS² LAB                                 │
│  • PCB-Bench (ICLR 2026), PCBWorld DRC, autorouter-bench, 25-Board Golden Suite,          │
│    Spend-Capped Offline Harness² (Draft PR + Mandatory Human Review Only)                 │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 The 7-Level Unified Electrical & Electronic Ontology
1. **L1 — Semiconductor Device Physics:** `DEVSIM` TCAD, `OpenVAF-Reloaded` (Verilog-A → OSDI), `klayout-pex` + `FasterCap`.
2. **L2 — Silicon IC, FPGA & ULSI:** `IIC-OSIC-TOOLS` (SKY130/GF180MCU/IHP SG13G2), `LibreLane`, `OpenROAD-MCP`, `LiteX`, `Amaranth`, `ALIGN`, `gdsfactory`, `Chipyard`, `gem5`, `OpenRAM`, `eqy`/`mcy`, `Fault` DFT/ATPG, `PROLEAD`.
3. **L3 — Electronic Circuits & Verified Blocks:** `atopile`, `tscircuit`, DuckDB non-linear Component KG (MLCC DC-bias, Inductor $I_{\text{sat}}$, MOSFET $R_{DS(on)}$, errata), signed `Open-CUBO` blocks, `ngspice`/`Xyce`.
4. **L4 — Board Physical Synthesis, Multi-Physics & MCAD:** `vd-cad-geom`, `vd-placer`, `KiCadRoutingTools`/`fastroute`, `padne`/`KiPIDA`, `FastHenry`, `openEMS`/`Palace`, `PyBERT`, `PyOpenMagnetics`, `CadQuery`→`Gmsh`→`ElmerFEM`/`CalculiX`.
5. **L5 — Embedded Firmware & Hardware-in-the-Loop:** Auto-synced `board_pins.h`/Zephyr `.dts`/Rust `embassy` HAL, `Renode` lockstep analog-digital twin, `probe-rs`/`PyVISA`/`sigrok` physical bench diffing.
6. **L6 — Control, DSP, Battery & Edge-AI:** `python-control` (Bode/Nyquist/PID/LQR), `PyBaMM`/`liionpack`, `pyfda`, `hls4ml`.
7. **L7 — Power Grids, Machines, Automation & Compliance:** `pandapower`, `PyPSA`, `Pyleecan`, `pvlib`, `QElectroTech`, `OpenPLC v4`, `ee-standards-core`, `StrictDoc` V-Model traceability.

---

## 2. Architecture Decision Records (ADRs)

| ADR ID | Decision | Alternatives Rejected | Engineering Rationale & Consequence |
|---|---|---|---|
| **`ADR-001`** | **Pure MIT/Apache-2.0 Ring 1 Core + Opt-In GPLv3 PNS Sidecar** | Monolithic GPLv3 IDE linking CERN PNS in-process | Enables enterprise/commercial plugin ecosystems and clean SaaS hosting; users wanting interactive browser push-and-shove opt into an isolated local GPLv3 daemon over Unix socket / named pipe. |
| **`ADR-002`** | **Fixed-Point `i64` Nanometers + Immutable UUIDv7** | IEEE-754 `f64` mm floats + sequential integer IDs | Eliminates floating-point drift in Git JSONL diffs, DRC clearances, and `i_overlay` polygon booleans; makes `hw-merge` 3-way merges deterministic. |
| **`ADR-003`** | **3-Channel KiCad 10 Bridge (S-expr + Optional NNG IPC + `kicad-cli`)** | Single-channel IPC-only or SWIG `pcbnew` | Respects KiCad 10.0.8's technical boundary (PCB GUI-only IPC; SWIG deprecated/removed in KiCad 11) while staying 100% headless-capable for CI and ready for KiCad 11 IPC via version probe. |
| **`ADR-004`** | **Phase 1 VS Code Extension + MCP Apps → Phase 3 Branded `Code-OSS`** | Forking `Code-OSS` on Day 1 | Eliminates Chromium/Electron rebase tax during Ring 1 validation while preserving 100% code reuse across React 19, `dockview-react`, and `@modelcontextprotocol/ext-apps`. |
| **`ADR-005`** | **Verification Independence for Regulated Domains** | Attempting to certify LLM generation under ISO 26262 / DO-330 | Generative AI agents are classified strictly as untrusted synthesis tools; safety-critical signoff relies **exclusively** on independent deterministic verification oracles (`kicad-cli`, `2581check`, `Z3`, `OpenSTA`, `Netgen`, `StrictDoc`) plus mandatory human Gate 8 signoff. |
| **`ADR-006`** | **Strict Zero-Trust Sandboxing (`Wasmtime >=50` + `gVisor runsc`)** | In-process `Pyodide` or raw `docker run` with host net | Mitigates CVSS 9.9 WASM escapes (`CVE-2026-115889`), malicious PDF prompt injection, and container breakouts; enforces `network_mode: none` for `NDA_AIRGAPPED` IP protection. |
| **`ADR-007`** | **Dual-Surface ACP + Harness MCP v2 (12 Verbs + Deferred Search)** | 150 raw CAD MCP tools + proprietary single-agent UI | Cuts upfront tool context from ~55k to `< 2.2k` tokens; allows seamless switching between built-in `vd-agent`, Claude Code, Codex CLI, and local Ollama via Apache-2.0 ACP. |
| **`ADR-008`** | **Single Source of Cost & Reproducibility Truth (`budget.json` + `hw.lock`)** | Scattered env-var limits and floating `:latest` tags | Prevents silent billing/fab surprises (Clouds-Against-Humanity discipline) and guarantees bit-for-bit reproducible board builds years later. |

---

## 3. Quantified Non-Functional Requirements (NFR) & Performance SLOs

Every release candidate MUST pass automated benchmark gates enforcing these hard engineering budgets on a reference **Tier 0 CPU-only laptop** (8-core CPU, 16 GB RAM, integrated graphics / WebGL2 fallback, zero Docker):

| Requirement ID | Category | Quantified Target (SLO) | Verification Method |
|---|---|---|---|
| **`NFR-PERF-01`** | Viewport Responsiveness | $\ge 60\text{ FPS}$ ($< 16.6\text{ ms}$ frame) on WebGL2; $\ge 120\text{ FPS}$ ($< 8.3\text{ ms}$) on WebGPU for 10,000 pads / 50,000 trace segments | Playwright + Chrome DevTools MCP trace benchmark |
| **`NFR-PERF-02`** | Spatial Hit-Test & Magnetic Snap | $p99 < 1.0\text{ ms}$ (`rstar` R*-tree lookup + local DRC envelope check across 100k primitives) | `cargo bench -p vd-cad-geom` |
| **`NFR-PERF-03`** | Atomic `HW-IR` Patch Commit | $p99 < 5.0\text{ ms}$ (SQLite WAL `BEGIN IMMEDIATE` + inverse op log + trigger validation) | `cargo bench -p vd-ir` |
| **`NFR-PERF-04`** | Pane-to-Pane Cross-Probing | $< 16\text{ ms}$ end-to-end (Monaco ↔ Schematic ↔ WebGPU PCB ↔ Popout Window via `BroadcastChannel`) | E2E Playwright multi-window timing test |
| **`NFR-PERF-05`** | Cold Startup & Project Load | IDE ready $< 2.5\text{ s}$; 50,000-component board load $< 4.0\text{ s}$; `vd-brain-svc` CLI start $< 150\text{ ms}$ (Python 3.15 `lazy import`) | CI startup telemetry gate |
| **`NFR-PERF-06`** | Tier 0 Memory Ceiling | Core `vd-daemon` + Chromium renderer $\le 1.5\text{ GB}$ RSS on 4-layer 500-part board; Wasmtime sandbox hard-capped at `256 MiB` | Heap profiler + `StoreLimitsBuilder` unit test |
| **`NFR-REL-01`** | Crash Safety & Zero Data Loss | Zero corrupted projects on abrupt `SIGKILL` during write; WAL crash recovery $< 500\text{ ms}$; forward-only SQLite migrations take automatic `.bak` snapshot | Chaos `SIGKILL` fuzz test in CI |
| **`NFR-SEC-01`** | Zero Egress Under `NDA_AIRGAPPED` | `0` outbound DNS/TCP packets emitted across full Gates 1–8 run under packet capture (`tcpdump` / eBPF netns test) | Automated network-namespace integration test |
| **`NFR-UX-01`** | Accessibility & Ergonomics | WCAG 2.2 AA contrast on chrome, full keyboard navigation, colorblind-safe hatched copper modes, lossless high-DPI (`100%–250%`) scaling | `web-design-guidelines` + `axe-core` Playwright audit |

---

## 4. Industrial Hardware, Manufacturing & Tool-Qualification Standards Matrix

| Domain | Target Industrial Standard | Vajra-Dhīr Enforcement Mechanism |
|---|---|---|
| **Intelligent PCB Fab Handoff** | **IPC-2581C**, **ODB++ v8.2**, **Gerber X2/X3** | Headless `kicad-cli` + `vd-transcoder` export validated strictly by `cisco-open/2581check` XML schema verifier before Gate 8 zip seal. |
| **Bare-Board Electrical Test (DFT)** | **IPC-D-356A** | Automated netlist parsing verifying flying-probe/ICT pad access %, 1.0–1.5 mm test-pad pitch clearances, and JTAG/SWD boundary-scan integrity. |
| **PCB Design, Creepage & Current** | **IPC-2221C**, **IPC-2152**, **IEC 60664-1** (2025), **IEC 62368-1** | Executable rules inside `vd-symbolic` + `dfm-dfa-safety` enforcing trace ampacity, working-voltage clearance/creepage, and automatic milled isolation slots. |
| **SMD Land Patterns & Fab Class** | **IPC-7351B/C**, **IPC-6012E** (Class 2 & 3), **IPC-A-610** | Built-in IPC-7351B parametric footprint wizard + thermal-pad paste windowpane apertures + Vajra Draftsman Class 2/3 fab notes. |
| **ECAD–MCAD 3D Collaboration** | **ISO 10303-242 STEP AP242** (2025), **prostep ivip IDX v6.0** (Dec 2025) | Watertight STEP export (`CadQuery`/`manifold-csg`) plus incremental IDX v6.0 proposal accept/reject workflow for mounting holes, board outline, and height keepouts. |
| **Cables & Wire Harnesses** | **IPC/WHMA-A-620F** (2025), **VDA 4968 (VEC 2.2.0)** | `WireViz` + `HW-IR` `system_harnesses`/`harness_wires` enforcing AWG ampacity, IEC wire colors, and connector pin-1 mating polarity. |
| **Heavy Electrical & PLC** | **IEC 60909**, **IEC 60364-5-52**, **NFPA 70 (NEC 2026)**, **IEC 61131-3** | `pandapower` fault currents + `ee-standards-core` cable/breaker TCC selectivity + `OpenPLC v4` (`STruC++`). |
| **Safety-Critical & Regulated QMS** | **ISO 26262 / IEC 61508 / DO-330** (TCL/TQL), **ISO 9001 / AS9100**, **21 CFR Part 11** | Strict **Verification Independence**: AI synthesis outputs are untrusted until independently cleared by deterministic checkers (`StrictDoc` HLR↔LLR↔Test matrices, CycloneDX HBOM, geometry-bound Ed25519 DRC waivers, immutable signed ECO audit log). |

---

## 5. Canonical Data Architecture, Schema Governance & Structured Error Taxonomy

### 5.1 Unified `HW-IR` Relational Architecture (`001_init.sql` + `002_manual_perfection.sql`)
- **24 Normalized Tables** backed by SQLite WAL single-writer leases (`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA application_id = 0x56444952;`).
- **Core Domains:** Projects/DLP/Autonomy · `hw_lock` Reproducibility · Multi-Board & Rigid-Flex Stackups · Cryptographic `datasheet_citations` (local SHA-256 cache only) · Components/Pins/Nets/NetClasses · Copper Geometry (`traces`, `vias`, `copper_zones`, `mcad_keepouts`) · `system_harnesses` · `electrical_constraints` · `firmware_pinmux` · Atomic `hardware_patches` · `external_id_map` · `gate_audit_ledger` · Assembly `variants` · Multi-Channel `layout_rooms` · Geometry-Hash-Bound `drc_waivers` · Custom `padstacks` · `fab_drawings`.
- **Database-Enforced Lock Triggers:** `trg_protect_locked_*` raises `ABORT` on any non-human mutation of `locked = 1` rows unless an explicit human override flag is set inside `_tx_actor_ctx`.
- **Zero-Data-Loss Schema Migration Governance:** Forward-only numbered SQL migrations (`001`..`N`) checked against `PRAGMA user_version`. Before applying any migration, `vd-daemon` writes an atomic verified backup (`project.vd.db.v<old>.bak` + SHA-256) and rolls back atomically on any constraint failure.

### 5.2 UUID 3-Way Git Merge (`hw-merge`) & Dual Checkpoints
- **Git Persistence:** Sorted JSON Lines (`design.vd-ir.jsonl`, sorted deterministically by `(entity_type, id)`).
- **Merge Guarantees:** (1) Field-level 3-way merge per UUIDv7; (2) `provenance=human && locked=1` unconditionally overrides concurrent agent edits with structured notice; (3) Post-merge rotated-courtyard OBB sweep ($W_{\text{eff}} = W|\cos\theta| + H|\sin\theta|$) catches physical overlaps between disjoint UUIDs (`PHYSICAL_COURTYARD_COLLISION`).
- **Unified Code + Hardware Checkpoints:** Every agent turn snapshots $\text{Checkpoint}_t = (\text{git\_tree\_sha}_t,\; \text{hwir\_lamport}_t,\; \text{otel\_trace\_id}_t)$ enabling atomic single-click rollback across firmware, RTL, `.ato`, and PCB geometry.

### 5.3 Canonical Structured Error Code Registry (RFC 7807 JSON Diagnostics)
Every CLI, MCP verb, GUI Problem row, and `WorkerContract` diagnostic MUST return a typed code from this registry (zero unparsed raw stderr dumps):

| Prefix | Domain | Example Codes & Fail-Closed Action |
|---|---|---|
| **`VD-IR-`** | Kernel & Merge | `VD-IR-001` Lamport version mismatch (retry read) · `VD-IR-002` `hw-merge` courtyard collision · `VD-IR-003` Migration checksum fail |
| **`VD-LOCK-`** | Human Ownership | `VD-LOCK-001` Kernel SQLite trigger blocked agent write · `VD-LOCK-002` Post-route locked-copper SHA-256 drift (abort commit) |
| **`VD-DLP-`** | Security & Privacy | `VD-DLP-001` Egress blocked (`NDA_AIRGAPPED`) · `VD-DLP-002` External cloud ACP agent forbidden · `VD-DLP-003` Forbidden vendor PDF staged |
| **`VD-WASM-`** | Code Mode Sandbox | `VD-WASM-001` 256 MiB memory cap exceeded · `VD-WASM-002` Fuel/5s epoch timeout · `VD-WASM-003` Output `> 16 KiB` truncation required |
| **`VD-SYM-`** | Symbolic & Footguns | `VD-SYM-001` Z3 Pinmux UNSAT (with `unsat_core`) · `VD-SYM-002` I²C address collision · `VD-SYM-FG01..FG10` EE Footgun failure |
| **`VD-AUD-`** | Gate 3 Auditor | `VD-AUD-001` Pinout mismatch vs cropped PDF · `VD-AUD-002` Missing datasheet citation · `VD-AUD-003` Silicon errata violation |
| **`VD-SIM-`** | Simulation & Physics | `VD-SIM-001` SPICE convergence failed after Rung 3 · `VD-SIM-002` IR-drop/thermal/impedance threshold exceeded (with repair hint) |
| **`VD-KICAD-`** | 3-Channel Bridge | `VD-KICAD-001` Channel B GUI IPC offline (degraded to Ch-A/C) · `VD-KICAD-002` Echo suppression collision · `VD-KICAD-003` `kicad-cli` DRC/ERC fail |
| **`VD-LIC-`** | Supply Chain & CI | `VD-LIC-001` Forbidden AGPL/GPL/NC artifact in Ring 1 · `VD-LIC-002` Vulnerable dependency below Nov 2026 CVE floor |

---

## 6. Software Supply-Chain Security, Threat Model & Enterprise DevSecOps

### 6.1 Mandatory Security Floor (Verified Effective 2026-11-23)
- **SLSA v1.2 Compliance:** Target **SLSA v1.2 Build Track Level 3** (isolated, ephemeral GitHub Actions runners emitting signed Sigstore/Cosign provenance attestations) + **SLSA v1.2 Source Track** (branch protection, required reviews, signed commits) + **OpenSSF OSPS Baseline**.
- **Mandatory CVE Version Floors (Enforced by `vd-guard.sh` & CI):**
  - `wasmtime >= 50.0.0` (patches CVSS 9.9 `CVE-2026-115889` & ARM64 Cranelift sandbox escape).
  - `react >= 19.3.1` & `react-dom >= 19.3.1` (patches CVSS 9.5 `CVE-2026-126187`).
  - `node >= 26.13.1` (LTS Lithium patching 16 Nov 2026 CVEs).
  - `rust == 1.100.0` with `.cargo/config.toml` `[registry] global-min-publish-age = "72 hours"`.
  - `typescript == 7.0.2` (`moduleResolution: bundler|nodenext`), `.github/workflows/actions.lock` (`gh actions-lock`).
- **Clouds-Against-Humanity Enterprise Habits Baked Into CI & Runtime:**
  - Zero credentials in Git (`gitleaks` pre-commit + CI; OS Keychain / Doppler / OIDC only).
  - Zero unsolicited inbound network ports (UDS / Named Pipe / `127.0.0.1` + ephemeral session bearer token; Ring 2 `gVisor` `network_mode: none`, `read_only: true`, `cap_drop: ["ALL"]`).
  - Single canonical `budget.json` driving live GUI cost HUD, Tiered Model Router, and CI cost gate.
  - 100% offline mocked-provider Ring 1 unit/integration tests costing `$0` and needing zero cloud credentials.
  - Zero silent autodeploy: mandatory single `CI green` gate + human confirmation for releases, Gate 8 fab bundles, and offline `Harness²` draft PRs.

### 6.2 Condensed STRIDE + OWASP Agentic AI (`ASI01`–`ASI10`) Threat Model
| Trust Boundary | Named Threat / Adversary | Primary Control | Explicitly Accepted Residual Risk |
|---|---|---|---|
| **TB-1: Untrusted Vendor PDFs & Community CUBOs** | Indirect prompt injection (`ASI01`), malicious Python/script execution, copyright infringement | Zero-trust local PDF quarantine (only typed numeric tables + 300-dpi PNG crops reach Auditor); Ed25519 signature required on official CUBOs; zero PDFs committed to Git | User explicitly overriding signature check on an unsigned community CUBO |
| **TB-2: LLM-Authored Code Mode Scripts** | Host filesystem/secret exfiltration, infinite CPU/RAM DoS (`ASI02`/`ASI05`) | `Wasmtime >= 50` WASI zero-FS/zero-socket sandbox, 256 MiB RAM cap, fuel + 5s epoch kill, 16 KiB output cap | Side-channel timing within single-tenant local laptop process |
| **TB-3: Ring 2 Multi-Physics Containers** | Malicious STEP/Gerber parser memory corruption escaping container | `gVisor` (`runsc`) userspace kernel, `network_mode: none`, `read_only` rootfs, `cap_drop: ALL`, `@sha256` pinned images | Host kernel vulnerabilities below `gVisor` on unmanaged user machines |
| **TB-4: NDA / Foundry PDK Workspaces** | Proprietary schematic/PDK exfiltration to cloud LLMs or MCP UI iframes | `hw-dlp` gateway egress hard-block (`NDA_AIRGAPPED` → local Ollama/vLLM only); strict MCP App CSP (`connect-src 'none'`) | Physical screen capture / local user manually copying files outside IDE |
| **TB-5: Autonomous Hardware Fabrication** | Hallucinated shorts, thermal hazards, unauthorized factory orders (`ASI08`) | Fail-closed 9-Gate deterministic solvers + Dual-Context Auditor + **mandatory Human Cryptographic Signoff Token at Gate 8** | Unmodeled second-order physical effects (e.g., solder-flux contamination, undocumented silicon bugs) requiring physical bench validation (Gate 9) |

---

## 7. Hybrid IDE, Manual CAD Perfection & End-to-End Runtime Architecture

### 7.1 Frontend & Manual Interactive CAD Stack
- **Design System ("Silicon Darkroom" & "Cleanroom Daylight"):** Tokenized CSS (`tokens.css`), `JetBrains Mono` tabular numerals for all physical readouts, colorblind-safe hatched copper palettes, multi-monitor popouts via `dockview-react` 8.9+.
- **Hybrid VS Code + Claude Code Agency:** Synchronized **Right ACP Agent Dock** + **Bottom `@xterm/xterm` 6.0 WebGL2 PTY Terminal** (auto DOM fallback) supporting `vd-agent`, Claude Code, Codex CLI, and local Ollama via Apache-2.0 ACP + Dual Checkpoints + Parallel `git worktree` Subagents + Polyglot LSP/DAP (`clangd`, `rust-analyzer`, `verible`/`slang`, `pyright`, `atopile-lsp`, `probe-rs`).
- **120 FPS Pure-MIT Manual CAD Kernel (`vd-cad-geom`, native + WASM):** `rstar` (R*-tree magnetic snap & disambiguation radial), `i_overlay` (`i64` exact polygon booleans), `iTriangle` (GPU triangulation), `cavalier_contours` (arc-preserving walkaround/teardrops/DRC halos), `manifold-csg` (3D drills & live cross-section slicing).
- **Senior-EE Manual Capabilities:** 45°/arc single & diff-pair routing, time-domain trombone meander tuning, `Shift+X` bus routing, multi-channel `LayoutRoom` replication, Assembly Variants/DNP, Bulk `SCH/PCB List` spreadsheet, IPC-7351B/Padstack/3D Studio, Visual Stackup + `NetClass×NetClass` matrix, Rigid-Flex bend simulator, Vajra Draftsman drawings, geometry-hash-bound DRC waivers, `Cmd+K` Point-and-Prompt, live fab-cost surcharge HUD, 1:1 scale paper print check, and WebHID SpaceMouse + KiCad/Altium/EasyEDA keymap presets.
- **5 Ambient Knowledge Lenses:** `< 30 ms` cryptographic datasheet hover crops · inline Monaco `SymPy`/`Pint` physics CodeLens · `@xyflow/react` 7-level KG + non-linear curve scrubbers · WebGPU live EMI/IR-drop/Thermal/Vibration X-Ray HUD · Whiteboard Sketch → Open-CUBO Composer.

### 7.2 9-Gate Fail-Closed Pipeline & Universal `WorkerContract`
- **9 Gates (`G0`→`G9`):** Feasibility Lock (`G1`) → Open-CUBO + Z3/SymPy/10 EE Footguns (`G2`) → Isolated Dual-Context Auditor (`G3`) → Interactive Virtual Lab + WCCA/FMEA + Renode Co-Sim (`G4`) → Parallel Rust SA Island Placer (`vd-placer`) + `KiCadRoutingTools`/`fastroute` + NSGA-II Pareto Frontier (`G5`) → Multi-Physics Signoff Loop with Deterministic Solver Recovery Ladders (`G6`) → Deep DFM/DFA/IPC-2221/MCAD/IDX/Harness/DFT (`G7`) → Human-Signed Production Release (`G8`) → Post-Silicon HIL Bench Diff & Offline `Harness²` (`G9`).
- **Graceful Degradation:** Automatic startup probe negotiates **Tier 0** (CPU-only laptop, WebGL2, WASM) ↔ **Tier 1** (Local WSL2/Docker + `gVisor`) ↔ **Tier 2** (Remote ZTNA/NATS CPU/GPU cluster).

---

## 8. Enterprise Operations, Release Packaging & Risk Register

### 8.1 Production Distribution & Enterprise Governance
- **Signed Cross-Platform Installers (Reproducible Builds):**
  - **Windows (x64/ARM64):** EV Authenticode-signed `.msi` + Winget manifest (Tier 0 zero-Docker `< 150 MB`).
  - **macOS (Apple Silicon + Intel):** Hardened Runtime Apple-notarized `.dmg` + Homebrew cask.
  - **Linux (x64/ARM64):** `.AppImage`, `.deb`, and Flatpak with SHA-256 + Cosign `.sig`/`.bundle`.
- **Enterprise Governance (Ring 3):** OIDC/SAML SSO, Role-Based Access Control (`Viewer`, `Engineer`, `Signoff-Approver`, `DLP-Admin`), immutable append-only ECO audit log (`who / when / git_sha / hwir_lamport / waiver_sig`), and self-hosted air-gapped deployment Helm/Compose bundle.
- **Deterministic Supportability (`vd support-bundle --redact-nda`):** Exports OpenTelemetry trace JSON, `hw.lock`, solver exit codes, and anonymized geometry bounds so bugs in 40-minute physics runs replay locally without re-burning LLM tokens or leaking NDA netlists.

### 8.2 Top Architectural Risks & Active Mitigations
| Risk ID | Risk Description | Likelihood / Impact | Deterministic Mitigation |
|---|---|---|---|
| **`RSK-01`** | Scope explosion across ~78 repos stalls v1 before shipping | **High / Critical** | Hard Ring 1 freeze: **zero** Ring 2–4 work allowed until Milestone 1 (`T1.01`–`T1.20`) fabricates 3 working physical PCBs. |
| **`RSK-02`** | Upstream breaking changes in KiCad 10/11, `atopile`, or `@modelcontextprotocol/ext-apps` | **Medium / High** | Thin version-probed adapter shims + pinned `hw.lock` digests + weekly `antfu/skills` git-SHA diff sync. |
| **`RSK-03`** | Autorouter DRC rule mismatch or locked-copper overwrite | **Medium / High** | Auto-generate `.kicad_pro`/`.kicad_dru` from `HW-IR` pre-route + mandatory SHA-256 locked-entity diff gate pre-commit. |
| **`RSK-04`** | Windows WSL2 9P mount performance collapse on Ring 2 FEM/IC workers | **High / Medium** | Content-addressed staging into native WSL2 ext4 Docker volume (`vd_cas_work`) over POSIX `/vd_work`. |
| **`RSK-05`** | Malicious third-party skill or dependency supply-chain compromise | **Medium / Critical** | Mandatory `NVIDIA/SkillSpector` + `cisco-ai-defense/skill-scanner` + `.cargo/config.toml` 72h age gate + `.github/workflows/actions.lock` + CI SPDX firewall. |

---

## 9. Master Engineering Signoff & Execution Checklists

### 9.1 Architecture, Security & Builder-Rig Readiness Gate (Pre-`T1.01`)
- [x] **Architecture Freeze Approved:** `VD-SAD-001` (`ADR-001` through `ADR-008`) signed off; Ring 1 scope frozen.
- [x] **Builder Rig Deployed:** `AGENTS.md`, `docs/AGENT_KNOWLEDGE_UPDATE_2026_11.md`, `docs/THREAT_MODEL.md`, `docs/CLAIMS_REGISTER.md`, and `budget.json` specified.
- [x] **Toolchain & CVE Floors Pinned:** `rust-toolchain.toml` (`1.100.0`), `.cargo/config.toml` (`global-min-publish-age = "72 hours"`), `wasmtime >= 50.0.0`, `react >= 19.3.1`, `node >= 26.13.1`, `typescript == 7.0.2`.
- [x] **Skill & MCP Stack Verified:** `rtk-ai/rtk` specified, 3 Core MCPs (`serena`, `context7`, `git`) configured in `.mcp.json`, 5 bespoke `vd-*` skills + 14 curated external skills specified.
- [x] **Deterministic Guard Active:** `scripts/hooks/vd-guard.sh` wired into pre-commit and agent hooks; `gitleaks` verified.

### 9.2 Milestone 1 (Ring 1 Core · Months 1–3) Atomic Task Checklist
#### Sprint 1 — Kernel, Merge, Sandbox & Security Foundation (Weeks 1–3)
- [ ] **`T1.01`** Monorepo root manifests (`Cargo.toml`, `package.json`, `pnpm-workspace.yaml`, `pyproject.toml`), `.github/workflows/actions.lock`, and CI SPDX/CycloneDX License Firewall rejecting AGPL/GPL/NC artifacts.
- [ ] **`T1.02`** Canonical `HW-IR` SQLite WAL DDL (`001_init.sql` + `002_manual_perfection.sql`), forward-only migration runner, Rust `HwIrStore`, atomic `HardwarePatch` undo/redo, and `_tx_actor_ctx` lock triggers (`NFR-PERF-03` $< 5\text{ ms}$).
- [ ] **`T1.03`** `hw-merge` UUIDv7 3-way Git merge driver + human-lock precedence + rotated-courtyard OBB spatial collision detector.
- [ ] **`T1.04`** `Wasmtime >= 50` Code Mode WASI sandbox (zero FS/sockets, 256 MiB cap, fuel + 5s epoch watchdog, 16 KiB output cap).
- [ ] **`T1.05`** `hw-dlp` NDA egress firewall (`NDA_AIRGAPPED` packet-drop test passes `NFR-SEC-01`) + Tiered Model Router + `budget.json` circuit breaker.

#### Sprint 2 — Frontier MCP/ACP Gateway, Component Brain & Symbolic Verification (Weeks 4–6)
- [ ] **`T1.06`** 12-Verb Harness MCP v2 Gateway (`< 2.2k` upfront tokens) + Deferred Tool Search + ACP Agent Broker (`vd-agent`/Claude Code/Ollama) + Dual Checkpointing + OTel tracer.
- [ ] **`T1.07`** DuckDB Component KG + `jlcparts` Basic-vs-Extended feeder-fee optimizer + local zero-trust `datasheet-lens` (PyMuPDF 300-dpi PNG cropper, zero PDFs in Git).
- [ ] **`T1.08`** Signed Open-CUBO engine (Ed25519 verified) + `atopile` bridge + first 5 reference blocks (`usb_pd_buck_3v3_3a`, `esp32s3_core`, `stm32g4_core`, `can_fd_transceiver`, `i2c_sensor_bme280`).
- [ ] **`T1.09`** Executable Symbolic Verifier (`Z3` pinmux + I²C + logic levels, `SymPy`/`Pint` derating & IPC-2152, `python-control`, and all 10 `FG-01`–`FG-10` EE Footgun assertions).
- [ ] **`T1.10`** 9-Gate Fail-Closed FSM + Independent Dual-Context Auditor (`Square-Harness`) + SPICE/P&R/Mesh Solver Recovery Ladders (`max_retries = 3`).

#### Sprint 3 — Manual CAD Kernel, KiCad 10 Bridge, Auto-Placer & Virtual Lab (Weeks 7–9)
- [ ] **`T1.11`** 5-stage Semantic Schematic Beautifier over `elkjs` (sheet partitioning, multi-unit split, N/S/E/W rail orientation, label collision avoidance).
- [ ] **`T1.12`** 3-Channel KiCad `10.0.8` Bridge (Ch-A `.kicad_sch` S-expr + 5s SHA-256 Echo Ring, Ch-B optional GUI NNG IPC, Ch-C headless `kicad-cli` ERC/DRC/Variants/Exports).
- [ ] **`T1.13`** Pure-MIT `vd-cad-geom` (`rstar`, `i_overlay`, `iTriangle`, `cavalier_contours`, `manifold-csg` passing `NFR-PERF-02` $< 1\text{ ms}$) + clean-room Rayon SA Island Placer (`vd-placer`) + NSGA-II Pareto ranker.
- [ ] **`T1.14`** Autorouter Orchestrator (`KiCadRoutingTools` + `fastroute` + `.kicad_pro`/`.kicad_dru` sync + mandatory pre-commit locked-copper SHA-256 diff guard).
- [ ] **`T1.15`** Tier 0 Virtual Lab (`ngspice-wasm` Web Worker + Torture-Test Fault Injection + `Surfer` WASM + bidirectional `board_pins.h`/Zephyr `.dts` pin-to-firmware co-sync).

#### Sprint 4 — WebGPU Canvas, VS Code MCP Apps, Industrial Release & Bench Spins (Weeks 10–12)
- [ ] **`T1.16`** Deep DFM/DFA/IPC-2221C/IPC-D-356A engine + Gate 8 Human-Signed Release Bundler (`2581check`-validated IPC-2581C, ODB++, Gerber X2, `KiKit`, BOM/CPL, STEP, `iBOM`, `PcbDraw`, Bring-Up Runbook, `FlatCAM`, 1:1 Print Check).
- [ ] **`T1.17`** `@vajradhir/webgpu-cad-engine` (120 FPS WebGPU / 60 FPS WebGL2 fallback, live EMI/return-path compute shaders, manual 45°/diff walkaround FSM, `Cmd+K` Point-and-Prompt, live fab-cost HUD, KiCad/Altium keymaps).
- [ ] **`T1.18`** Strict-CSP `ui://` MCP Apps (`@modelcontextprotocol/ext-apps`) + VS Code Extension Pack + `< 16 ms` `CrossProbeBus` + cryptographic datasheet hover popovers + inline `SymPy`/`Pint` CodeLens.
- [ ] **`T1.19`** Universal CAD Importer (KiCad 5–10, Altium, EasyEDA Pro, Specctra DSN, Gerber X2 netlist reconstruction) + IPC-7351B footprint auto-synthesizer (`JLC2KiCad_lib`/`KicadModTree`).
- [ ] **`T1.20`** Full 4-Tier Offline CI EvalOps pass + iterative `cloudflare/security-audit-skill` & `trailofbits/skills` security signoff + SLSA v1.2 Build L3 release artifacts signed.

### 9.3 Unforgiving Physical Hardware Bench Exit Gate (Mandatory Before Ring 2)
- [ ] **Physical Spin 1 (USB-C PD 12V→3.3V / 3A Buck, 2-Layer):** Negotiates 12 V on first plug-in; regulates `3.30 V ± 2%` across `0–3 A`; ripple $< 40\text{ mV}_{\text{pp}}$; thermal camera peak IC $< 75^\circ\text{C}$ at $25^\circ\text{C}$ ambient.
- [ ] **Physical Spin 2 (ESP32-S3 Sensor Node, 4-Layer):** Enumerates USB-CDC & flashes auto-synced `board_pins.h` firmware on Revision 1; reads BME280 over I²C cleanly; connects 2.4 GHz Wi-Fi at $> -65\text{ dBm}$ RSSI.
- [ ] **Physical Spin 3 (STM32G4 CAN-FD + Motor Driver, 4-Layer Human Co-Edited):** Zero mutations on human-locked connectors/power island; passes 1 Mbps CAN-FD loopback with 0 bus errors; drives 2 A inductive load with $< 5\text{ V}$ overshoot; passes generated Bring-Up Runbook & Factory Self-Test FW over UART.

---

### Final Signoff Block
| Role | Signoff Criteria | Status |
|---|---|---|
| **Principal EDA Systems Architect** | `VD-SAD-001` invariants, NFR SLOs, 4-Ring boundaries & 9-Gate FSM verified | **`[x] SIGNED OFF (2026-11-23)`** |
| **Staff Security & Supply-Chain Lead** | SLSA v1.2, Nov 2026 CVE floors, `hw-dlp` airgap & SPDX license firewall verified | **`[x] SIGNED OFF (2026-11-23)`** |
| **Senior Hardware & Manufacturing Lead** | IPC-2581C / IPC-2221C / KiCad 10 bridge & 3 Physical Bench Exit Gates approved | **`[x] SIGNED OFF (2026-11-23)`** |
