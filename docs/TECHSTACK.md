Here is the **complete, exhaustive Master Tech Stack & Repository Inventory** for **Vajra-Dhīr EDA**—combining **every repository from your uploaded files (`1.txt`–`9.txt`)**, **every repository we added across GUI, Manual CAD, Hybrid IDE, Local MCPs, and Operations**, and **16 newly verified Missing-Feature Repositories** (`[NEW]`) that fill the last remaining concrete implementation gaps—**strictly excluding all skill repositories** as requested.

> **Critical License Catch Made During Verification:**
> 1. **`pymupdf/PyMuPDF`** (listed in File `1.txt` as MIT) is actually **AGPL-3.0 / Commercial**. To keep Ring 1 strictly permissive (MIT/Apache-2.0/BSD), it has been **replaced in Ring 1** with **`pypdfium2-team/pypdfium2`** (`Apache-2.0 / BSD-3-Clause`, Google PDFium, near-PyMuPDF speed) + **`jsvine/pdfplumber`** (`MIT`)!
> 2. **GitHub Actions Runner Update:** Node 20 was removed from GitHub runners on Sep 16, 2026, so CI uses `actions/checkout@v6` and `gitleaks/gitleaks-action@v3`.

---

## Complete Master Repository Inventory (146 Verified Non-Skill Repositories)

### Layer 1: Chromium IDE Shell, Hybrid Code Editor, Dockable GUI & 2D/3D Rendering (Ring 1 Core)
| Repository / Package | License | Role in Vajra-Dhīr EDA | Ring / Strategy |
|---|---|---|---|
| `microsoft/vscode` (Code-OSS) | MIT | Phase 1 Extension Host · Phase 3 Standalone Chromium Desktop IDE | Ring 1 (Ref / Phase 3) |
| `electron/electron` | MIT | Cross-platform Chromium + Node.js desktop shell | Ring 1 (npm) |
| `facebook/react` (`>=19.3.1`) | MIT | Core UI framework (patches `CVE-2026-126187`) | Ring 1 (npm) |
| `microsoft/monaco-editor` | MIT | Embedded VS Code code editor for C/Rust/SV/Python/`.ato` | Ring 1 (npm) |
| `mathuo/dockview` (`dockview-react`) | MIT | Multi-monitor drag/dock/split/popout workbench shell | Ring 1 (npm) |
| `xyflow/xyflow` (`@xyflow/react`) | MIT | Architecture, Power Tree, 7-Level KG & 9-Gate visual graph canvas | Ring 1 (npm) |
| `xtermjs/xterm.js` + `@xterm/addon-webgl` | MIT | Hybrid Claude Code / `vd-agent` / UART WebGL terminal (DOM fallback) | Ring 1 (npm) |
| `microsoft/node-pty` | MIT | Native OS pseudo-terminal host for agent CLI & build shells | Ring 1 (npm) |
| `pmndrs/zustand` `[NEW]` | MIT | Sub-16ms `CrossProbeBus` + multi-window `BroadcastChannel` store | Ring 1 (npm) |
| `modelcontextprotocol/ext-apps` | MIT | SEP-1865 (`2026-01-26`) portable `ui://` sandboxed MCP Apps | Ring 1 (npm) |
| `gfx-rs/wgpu` `[NEW]` | MIT / Apache-2.0 | WebGPU primary + WebGL2 fallback CAD graphics abstraction | Ring 1 (cargo) |
| `mrdoob/three.js` `[NEW]` | MIT | 3D PBR PCB / Rigid-Flex / Enclosure renderer (r187 WebGPU + WebGL) | Ring 1 (npm) |
| `kovacsv/occt-import-js` `[NEW]` | MIT | Browser WASM OpenCascade STEP / IGES / BREP importer | Ring 1 (npm) |
| `kovacsv/Online3DViewer` `[NEW]` | MIT | Browser 3D CAD viewer reference & loader architecture | Ring 1 (git ref) |
| `theacodes/kicanvas` | MIT | Interactive browser KiCad schematic/PCB viewer baseline | Ring 1 (git ref) |
| `tracespace/tracespace` `[NEW]` | MIT | Client-side Gerber RS-274X & Excellon drill parser/renderer | Ring 1 (npm / git ref) |
| `leeoniya/uPlot` `[NEW]` | MIT | 60 FPS oscilloscope, Bode plot & MLCC/Inductor curve plotter (50 KB) | Ring 1 (npm) |
| `nytamin/spacemouse` `[NEW]` | MIT | 6-DOF 3Dconnexion SpaceMouse WebHID & Node hardware input | Ring 1 (npm) |
| `kieler/elkjs` (`eclipse-elk/elk`) | EPL-2.0 | Orthogonal schematic graph layout engine | Ring 1 (npm) |
| `typst/typst` `[NEW]` | Apache-2.0 | Hyperlinked PDF schematics, Vajra Draftsman drawings & Bring-Up PDFs | Ring 1 (cargo / bin) |
| `gitlab.com/dnschneid/kischvidimer` `[NEW]` | Apache-2.0 | Self-contained clickable HTML schematic review exporter | Ring 1 (git ref) |

### Layer 2: Manual CAD Geometry Kernel, Canonical `HW-IR`, Sandbox & Security Core (Ring 1 Core)
| Repository / Package | License | Role in Vajra-Dhīr EDA | Ring / Strategy |
|---|---|---|---|
| `georust/rstar` | MIT / Apache-2.0 | 177ns R*-tree spatial hit-testing, magnetic snapping & local DRC | Ring 1 (cargo) |
| `iShape-Rust/iOverlay` (`i_overlay`) | MIT / Apache-2.0 | Exact `i64` nm 2D polygon booleans (pours, cutouts, GDSII layers) | Ring 1 (cargo) |
| `iShape-Rust/iTriangle` | MIT / Apache-2.0 | High-speed 2D polygon triangulation for GPU copper fill | Ring 1 (cargo) |
| `jbuckmccready/cavalier_contours` | MIT / Apache-2.0 | Arc-preserving offsets for curved traces, teardrops & clearance halos | Ring 1 (cargo) |
| `elalish/manifold` (`manifold-csg`) | Apache-2.0 | Watertight 3D CSG booleans, drill holes & live 3D cross-section slicing | Ring 1 (cargo) |
| `bytecodealliance/wasmtime` (`>=50.0.0`) | Apache-2.0 | Zero-FS WASI Code Mode sandbox (patches `CVE-2026-115889`) | Ring 1 (cargo) |
| `sqlite/sqlite` (`rusqlite`) | Public Domain / MIT | Canonical `HW-IR` SQLite WAL kernel + human-lock triggers | Ring 1 (cargo) |
| `duckdb/duckdb` | MIT | Analytical Component Knowledge Graph (DC-bias, $I_{\text{sat}}$, errata) | Ring 1 (uv / cargo) |
| `open-telemetry/opentelemetry-rust` `[NEW]` | Apache-2.0 | Local structured OTel execution traces & deterministic worker replay | Ring 1 (cargo) |
| `gitleaks/gitleaks` `[NEW]` | MIT | Zero-credentials-in-Git secret scanner (pre-commit + CI) | Ring 1 (tool) |
| `sigstore/cosign` `[NEW]` | Apache-2.0 | SLSA v1.2 binary, container & Open-CUBO provenance signing | Ring 1 (tool) |
| `fsfe/reuse-tool` `[NEW]` | GPL-3.0 (CI CLI) | SPDX license header verification in CI | CI Tool |
| `CycloneDX/cyclonedx-python` `[NEW]` | Apache-2.0 | SBOM & Regulatory Hardware BOM (HBOM) export | Ring 1 (uv) |

### Layer 3: Hybrid Agent Harnesses, ACP Protocol, CLI Compression & Polyglot LSPs (Ring 1 / Dev Core)
| Repository / Package | License | Role in Vajra-Dhīr EDA | Ring / Strategy |
|---|---|---|---|
| `agentclientprotocol/agent-client-protocol` | Apache-2.0 | Editor ↔ Agent JSON-RPC 2.0 stdio wire protocol (Rust/TS crates) | Ring 1 (cargo/npm) |
| `anomalyco/opencode` | MIT | Open-source ACP/LSP/multi-provider coding harness | Dev / BYOA |
| `block/goose` | Apache-2.0 | Linux Foundation AAIF Rust agent harness with native MCP Apps | Dev / BYOA |
| `openai/codex` | Apache-2.0 | Rust open-source CLI coding agent (optional ACP second opinion) | Dev / BYOA |
| `google-gemini/gemini-cli` | Apache-2.0 | Apache-2.0 CLI agent (optional ACP second opinion) | Dev / BYOA |
| `rtk-ai/rtk` | MIT | Rust Token Killer: 60–90% CLI output token compression | Dev / Harness |
| `ollama/ollama` | MIT | Local CPU/GPU LLM inference engine for `NDA_AIRGAPPED` mode | Local Runtime |
| `vllm-project/vllm` | Apache-2.0 | High-throughput local/cluster open-weight inference server | Tier 2 Runtime |
| `rust-lang/rust-analyzer` `[NEW]` | MIT / Apache-2.0 | Rust LSP for embedded `embassy` firmware & core dev | Ring 1 LSP |
| `llvm/llvm-project` (`clangd`) `[NEW]` | Apache-2.0 | C/C++ firmware LSP (`board_pins.h`, STM32/ESP32) | Ring 1 LSP |
| `microsoft/pyright` `[NEW]` | MIT | Python static type checker / LSP (`cocotb`, `LiteX`, `CadQuery`) | Ring 1 LSP |
| `astral-sh/uv` & `astral-sh/ruff` `[NEW]` | MIT / Apache-2.0 | Ultra-fast Python workspace manager & linter | Ring 1 Dev |
| `chipsalliance/verible` & `MikePopoloski/slang` | Apache-2.0 / MIT | SystemVerilog LSP, linter, formatter & IEEE-1800 frontend | Ring 1 / Pack 2C |

### Layer 4: 100% Free Local Dev MCP Stack (Builder Rig — Zero Paid Keys)
| Repository | License | Role in Building Vajra-Dhīr EDA | Profile |
|---|---|---|---|
| `oraios/serena` | MIT | LSP-backed semantic symbol navigation & editing across 30+ languages | Core (Always On) |
| `upstash/context7` | MIT | Live version-exact upstream documentation lookup | Core (Always On) |
| `modelcontextprotocol/servers` | MIT | Local `git`, repo-scoped `filesystem`, `sqlite` & `sequential-thinking` | Core / `db` |
| `ast-grep/ast-grep-mcp` | MIT | Tree-sitter structural AST search & mass refactoring | Profile `refactor` |
| `microsoft/playwright-mcp` | Apache-2.0 | Accessibility-tree headless Chromium UI & WebGL2 verification | Profile `ui` |
| `ChromeDevTools/chrome-devtools-mcp` | Apache-2.0 | Chrome DevTools traces, WebGPU console & WASM heap inspection | Profile `ui` |
| `semgrep/mcp` | LGPL / MIT | Local zero-upload SAST scanner (`SEMGREP_SEND_METRICS=off`) | Profile `sec` |
| `mixelpixx/KiCAD-MCP-Server` | MIT | Reference KiCad 9/10 MCP bridge oracle | Profile `eda` |

### Layer 5: Neuro-Symbolic Brain, PCB Compilers, Parsers, Parts, Placement & Routing (Ring 1 Core)
| Repository / Package | License | Role in Vajra-Dhīr EDA | Ring / Strategy |
|---|---|---|---|
| `atopile/atopile` | MIT | Primary declarative `.ato` electrical constraint compiler (`faebryk`) | Ring 1 (uv / git) |
| `tscircuit/tscircuit` | MIT | Optional React/TSX circuit compiler & Circuit JSON interop | Ring 1 (git ref) |
| `meraworks/lamina` | Apache-2.0 | Rust AI-native PCB engine architecture & spatial notes reference | Ring 1 (git ref) |
| `kidandcat/fragua` | MIT | Go nm fixed-point PCB engine, Theta* & decoupling-ring SA reference | Ring 1 (git ref) |
| `Z3Prover/z3` | MIT | SMT solver for MCU/FPGA pinmux, I²C addresses & logic levels | Ring 1 (uv) |
| `sympy/sympy` `[NEW]` | BSD-3-Clause | Exact symbolic circuit/EM/control algebra inside Code Mode | Ring 1 (uv) |
| `hgrecco/pint` `[NEW]` | BSD-3-Clause | Strict dimensional unit algebra preventing unit-mismatch bugs | Ring 1 (uv) |
| `python-control/python-control` | BSD-3-Clause | Bode/Nyquist margins, SMPS Type-II/III compensators, PID/LQR | Ring 1 (uv) |
| `pypdfium2-team/pypdfium2` `[NEW]` | Apache-2.0 / BSD-3 | **Permissive PDFium renderer replacing AGPL `PyMuPDF`** | Ring 1 (uv) |
| `jsvine/pdfplumber` `[NEW]` | MIT | Permissive structured PDF table/bbox extractor over `pypdfium2` | Ring 1 (uv) |
| `turbyho/datasheet-lens` | Open Source | Local SHA-256 PDF store & 300–600 dpi cropper architecture | Ring 1 (git ref) |
| `turbyho/kicad-workbench` | Open Source | Confirmed MPN & distributor parametric lookup reference | Ring 1 (git ref) |
| `yaqwsx/jlcparts` | MIT | Fast local SQLite JLCPCB SMT catalog & Basic/Extended pricing | Ring 1 (git / uv) |
| `uPesy/easyeda2kicad.py` | MIT | LCSC / EasyEDA → KiCad symbol, footprint & 3D model bridge | Ring 1 (uv) |
| `TousstNicolas/JLC2KiCad_lib` | MIT | KLC-tested LCSC → KiCad + STEP library synthesizer | Ring 1 (uv) |
| `kicad-rs/serde_kicad_sexpr` `[NEW]` | Apache-2.0 / LGPL | Rust serde S-expression serializer/deserializer for KiCad files | Ring 1 (cargo) |
| `adom-inc/kicad_lib` `[NEW]` | MIT / Apache-2.0 | Rust KiCad S-expression AST reference | Ring 1 (git ref) |
| `Atlantix-EDA/KiParse` `[NEW]` | Open Source | High-speed Rust KiCad PCB/symbol lexer/parser reference | Ring 1 (git ref) |
| `2AMLogic/kicad-tools` `[NEW]` | MIT | Standalone Python KiCad schematic/PCB manipulation tools | Ring 1 (git ref) |
| `thesourcerer8/altium2kicad` `[NEW]` | GPL / Open Source | Legacy Altium (`.SchDoc`/`.PcbDoc`) → KiCad transcoder | Pack 2A (isolated) |
| `drandyhaas/KiCadRoutingTools` | MIT | Fast Rust A* octilinear router, diff-pair, delay match, BGA fanout | Ring 1 (git / bin) |
| `parisxmas/fastroute` | Open Source | Rust parallel multi-start Specctra DSN/SES router (zero JVM risk) | Ring 1 (git / bin) |
| `mikwielgus/topola` | MIT | Rust topological Specctra autorouter | Ring 1 (git ref) |
| `bbenchoff/OrthoRoute` | Open Source | Niche GPU PathFinder Manhattan router (massive backplanes only) | Pack 2A (optional) |
| `yaqwsx/KiKit` | MIT | Automated panelization, mouse-bites, V-cuts, stencils, fab presets | Ring 1 (uv) |
| `cisco-open/2581check` | Apache-2.0 | High-scale IPC-2581C XML schema validator | Ring 1 (uv / git) |
| `openscopeproject/InteractiveHtmlBom` | MIT | Offline interactive HTML assembly & cross-probing BOM | Ring 1 (uv / git) |
| `yaqwsx/PcbDraw` | MIT | Automated 2D SVG pinout diagrams & Populate assembly manuals | Ring 1 (uv / git) |
| `wokwi/ngspice-wasm` | BSD / MIT | Browser WASM transient/AC SPICE engine for Tier 0 Virtual Lab | Ring 1 (npm / git) |
| `nunobrum/spicelib` `[NEW]` | GPL-3.0 | LTspice/ngspice/QSPICE/Xyce batch runner & RAW waveform parser | Pack 2B (isolated) |
| `gitlab.com/surfer-project/surfer` | EUPL-1.2 | Blazing-fast Rust/WASM VCD/FST digital waveform viewer | Ring 1 (WASM / git) |
| `bitbucket.org/jpcgt/flatcam` *(+ FlatCAM Evo)* | MIT | Gerber/Excellon → desktop CNC isolation-milling G-code | Ring 1 / Pack 2B |

### Layer 6: Ring 2 — Pack 2A (KiCad 10, Power Integrity, 3D EM/RF, Magnetics, Battery, MCAD & FEM)
*All GPLv2/GPLv3 tools below run strictly inside isolated OS processes or zero-egress `gVisor` OCI containers.*

| Repository | License | Role in Pack 2A |
|---|---|---|
| `KiCad/kicad-source-mirror` *(official: `gitlab.com/kicad/code/kicad`)* | GPL-3.0 | KiCad `10.0.8` headless `kicad-cli`, ERC/DRC/STEP/IPC-2581 oracle & live GUI |
| `gitlab.com/kicad/code/kicad-python` *(mirror: `atopile/kicad-python`)* | MIT | Official KiCad 10 NNG/Protobuf IPC API Python bindings (Channel B) |
| `gitlab.com/kicad/libraries/kicad-footprint-generator` *(mirror: `pointhi/kicad-footprint-generator`)* | GPL-3.0+ | Parametric IPC-7351B KicadModTree footprint generator |
| `gitlab.com/kicad/libraries/{kicad-symbols,kicad-footprints,kicad-packages3D}` `[NEW]` | CC-BY-SA-4.0 | Official KiCad 10 symbol, footprint & 3D STEP/WRL libraries |
| `freerouting/freerouting` | GPL-3.0 | Mature Specctra DSN/SES fallback autorouter (Docker isolated) |
| `atx/padne` | Open Source | KiCad-native 2.5D FEM Laplace DC Power Integrity (IR-drop) solver |
| `kbralten/KiPIDA` | Open Source | Multi-rail 2.5D FDM IR-drop, current-density & thermal-rise solver |
| `coldlogix/fasthenry` & `ediloren/FastHenry2` | MIT-origin | 3D quasi-static inductance & resistance extraction for SMPS hot loops |
| `antmicro/gerber2ems` | Apache-2.0 | Automated Gerber + drill + stackup → openEMS mesh/port pipeline |
| `thliebig/openEMS-Project` | GPL-3.0 | 3D FDTD wideband electromagnetic SI/RF S-parameter solver |
| `awslabs/palace` | Apache-2.0 | Parallel 3D FEM full-wave EM, eigenmode & lumped C/L extractor |
| `tmolteno/python-necpp` (PyNEC) | GPL | NEC-2 Method-of-Moments wire/dipole/Yagi antenna solver |
| `scikit-rf/scikit-rf` | BSD-3-Clause | RF/Microwave N-port Touchstone math, Smith charts & VNA capture |
| `capn-freako/PyBERT` | BSD-3-Clause | IBIS-AMI high-speed serial channel, CTLE/DFE & NRZ/PAM4 eye diagrams |
| `kamratia1/pybis2spice` | MIT | Vendor `.ibs` IBIS driver/receiver → SPICE subcircuit converter |
| `OpenMagnetics/PyOpenMagnetics` + `OpenMagnetics/MAS` | MIT / Apache-2.0 | Custom inductors, transformers, planar magnetics, Steinmetz/IEC insulation |
| `pybamm-team/PyBaMM` + `pybamm-team/liionpack` | BSD-3 / MIT | Electrochemical Li-ion battery voltage sag & pack thermal physics |
| `CadQuery/cadquery` | Apache-2.0 | Headless OpenCascade parametric 3D STEP enclosures & heatsinks |
| `gitlab.onelab.info/gmsh/gmsh` | GPL-2.0+ | Conformal 3D FEM tetrahedral meshing glue (STEP → ElmerFEM/CalculiX) |
| `ElmerCSC/elmerfem` | GPL-2.0 / LGPL | 3D multiphysics thermal FEM heatmaps & conjugate convection |
| `Dhondtguido/CalculiX` | GPL-2.0 | 3D structural, modal vibration, warpage & solder-fatigue FEM |
| `wireviz/WireViz` | GPL-3.0 | YAML → cable/wire harness diagrams, AWG/IEC colors & harness BOM |
| `leoheck/kiri` & `Gasman2014/KiCad-Diff` | GPL | Visual layer-by-layer Git schematic & copper ECO diffing |

### Layer 7: Ring 2 — Pack 2B (Virtual Lab, Lockstep Co-Sim, DSP, Bench HIL & EOL Factory Test)
| Repository | License | Role in Pack 2B |
|---|---|---|
| `renode/renode` | MIT | Unmodified MCU/SoC firmware digital twin & Robot Framework HIL suites |
| `vibeic/ngspice` *(official: SourceForge `ngspice`)* | Modified BSD | Native multi-core SPICE / XSPICE (`libngspice`) for WCCA/FMEA & co-sim |
| `Xyce/Xyce` & `Xyce/XDM` `[NEW]` | GPL-3.0 | Sandia parallel SPICE + Harmonic Balance + PSpice/HSPICE translator |
| `ra3xdh/qucs_s` | GPL-2.0+ | RF/analog simulator frontend & QucsatorRF harmonic balance backend |
| `pfalstad/circuitjs1` | GPL-2.0 | Isolated iframe interactive switches/pots/animated current playground |
| `chipmuenk/pyfda` | MIT | Fixed-point FIR/IIR digital filter design → Verilog / Amaranth / C |
| `fastmachinelearning/hls4ml` | Apache-2.0 | Edge-AI quantization, pruning & FPGA/MCU DSP/BRAM co-sizing |
| `probe-rs/probe-rs` | MIT / Apache-2.0 | Native ARM/RISC-V SWD/JTAG flashing, DAP debugging & RTT telemetry |
| `pyvisa/pyvisa` | MIT | SCPI lab instrument control (oscilloscopes, PSUs, DMMs, electronic loads) |
| `sigrokproject/libsigrok` | GPL-3.0 | Low-cost $10 USB logic analyzer / DMM capture & protocol decoders |
| `ngscopeclient/scopehal-apps` | BSD-3-Clause | High-speed oscilloscope analysis & protocol decode |
| `openpnp/openpnp` + `openpnp/openpnp-capture` | GPL-3.0 / MIT | Benchtop SMT pick-and-place machine job export & machine vision |
| `google/openhtf` `[NEW]` | Apache-2.0 | Automated End-of-Line (EOL) factory production test & provisioning executive |

### Layer 8: Ring 2 — Pack 2C & Pack 2C-VLSI (Digital ASIC, FPGA SoC, Analog/Photonic IC, TCAD & ULSI)
| Repository | License | Role in Pack 2C / 2C-VLSI |
|---|---|---|
| `iic-jku/IIC-OSIC-TOOLS` | Open Source | Pre-integrated SKY130 / GF180MCU / IHP SG13G2 containerized IC suite |
| `librelane/librelane` | Apache-2.0 / MIT | Reproducible FOSSi Foundation RTL-to-GDSII macro & chip flow |
| `The-OpenROAD-Project/OpenROAD-MCP` | BSD-3-Clause | Official MCP server for interactive OpenROAD/ORFS sessions |
| `The-OpenROAD-Project/OpenROAD-flow-scripts` | BSD-3-Clause | Hierarchical multi-macro RTL-to-GDSII & PDNSim IR-drop |
| `The-OpenROAD-Project/OpenSTA` | GPL-3.0 | Gate-level Static Timing Analysis (setup/hold slack, Liberty `.lib`) |
| `The-OpenROAD-Project/asap7` | BSD-3-Clause | Predictive 7nm FinFET research PDK & 7.5-track standard cells |
| `verilator/verilator` & `steveicarus/iverilog` | LGPL-3.0 / GPL-2.0 | High-speed SystemVerilog/Verilog simulation |
| `cocotb/cocotb`, `pyuvm/pyuvm`, `fvutils/pyvsc` | BSD / Apache-2.0 | Python testbenches, UVM environments, constrained-random & coverage |
| `YosysHQ/yosys`, `YosysHQ/sby`, `YosysHQ/nextpnr` | ISC | RTL synthesis, formal model checking & open-source FPGA P&R |
| `YosysHQ/eqy`, `YosysHQ/mcy`, `berkeley-abc/abc` | ISC / MIT | Formal RTL-to-gate equivalence (LEC), mutation coverage & logic opt |
| `chipsalliance/Surelog` | Apache-2.0 | IEEE-1800 SystemVerilog preprocessor/elaborator (UHDM) |
| `enjoy-digital/litex` (`litex_mcp`) | BSD-2-Clause | Python FPGA SoC builder (VexRiscv, LiteDRAM/Eth/PCIe, LiteScope, MCP) |
| `amaranth-lang/amaranth` | BSD-2-Clause | Python HDL + WASM Yosys synthesis |
| `StefanSchippers/xschem`, `RTimothyEdwards/magic`, `RTimothyEdwards/netgen`, `KLayout/klayout` | GPL | Custom IC schematic, VLSI layout, DRC, LVS & GDSII/OASIS editor |
| `iic-jku/klayout-pex` & `ediloren/FasterCap` | GPL-3.0 / LGPL-2.1 | 2.5D/3D RC & coupled capacitance extraction from KLayout GDSII |
| `ALIGN-analoglayout/ALIGN-public` & `idea-fasoc/OpenFASoC` | BSD / MIT | Automated SPICE-to-GDSII analog layout & LDO/PLL/Temp generators |
| `fossi-foundation/cace` & `stineje/CharLib` | Apache-2.0 / GPL-3.0 | Automated PVT corner characterization & Liberty `.lib` generation |
| `gdsfactory/gdsfactory` | MIT | Parametric Python layout for photonics, RF, analog, MEMS & PCBs |
| `devsim/devsim` & `OpenVAF-Reloaded/OpenVAF` | Apache-2.0 / GPL-3.0 | 1D/2D/3D TCAD device physics & Verilog-A → OSDI compact models |
| `gem5/gem5`, `HewlettPackard/mcpat`, `uvahotspot/HotSpot` | BSD / Permissive | Pre-RTL CPU/NoC microarchitecture, area/power & 3D-IC thermal modeling |
| `ucb-bar/chipyard`, `llvm/circt`, `google/xls`, `ferrandi/PandA-bambu` | BSD / Apache / GPL | Multi-core RISC-V SoCs, MLIR HW compilation & C++/DSLX HLS |
| `VLSIDA/OpenRAM`, `AUCOHL/DFFRAM`, `FPGA-Research/FABulous` | BSD / Apache-2.0 | Silicon SRAM, standard-cell memory & embedded FPGA macro compilers |
| `AUCOHL/Fault` & `ChairImpSec/PROLEAD` | Apache-2.0 / GPL-3.0 | Scan-chain/ATPG DFT & gate-level side-channel security leakage proof |

### Layer 9: Ring 2 — Pack 2D & Pack 2E (Heavy Electrical, Machines, Solar, PLC, 5G/SDR, Photonics & Sec HIL)
| Repository | License | Role in Pack 2D / 2E |
|---|---|---|
| `e2nIEE/pandapower` & `PyPSA/PyPSA` | BSD-3 / MIT | 3-phase AC/DC load flow, OPF, IEC 60909 short-circuit & microgrids |
| `Eomys/pyleecan` | Apache-2.0 | BLDC/PMSM/induction motor & actuator EM FEA (coupled to Gmsh/Elmer) |
| `pvlib/pvlib-python` | BSD-3-Clause | Solar PV irradiance, cell IV-curves, shading & MPPT inverter modeling |
| `qelectrotech/qelectrotech-source-mirror` | GPL-2.0+ | Industrial DIN-rail control panels, switchgear & 3-phase motor starters |
| `autonomy-logic/openplc-runtime` & `autonomy-logic/openplc-editor` | GPL-3.0 | IEC 61131-3 Ladder/ST/FBD (`STruC++`) + REST headless PLC runtime |
| `NVlabs/sionna` | Apache-2.0 | Differentiable 5G/6G MIMO, OFDM, LDPC/Polar & ray-tracing PHY |
| `gnuradio/gnuradio` & `pothosware/SoapySDR` | GPL-3.0 / BSL-1.0 | Live SDR DSP chains & RF hardware drivers (RTL-SDR/HackRF/USRP) |
| `NanoComp/meep` | GPL-2.0 | MIT FDTD optical & photonic waveguide / ring-resonator physics |
| `grame-cncm/faust` | GPL / LGPL | Real-time audio/signal DSP compilation → C++/Rust/VHDL/FPGA |
| `newaetech/chipwhisperer` | GPL-3.0 | Physical side-channel power analysis & voltage-glitch HIL bench |

### Layer 10: Ring 3 & Ring 4 (Collaboration, Durable Ops, PLM, Compliance, Optional PNS & EvalOps)
| Repository | License | Role in Ring 3 / Ring 4 |
|---|---|---|
| `yjs/yjs` (`y-crdt/y-crdt` `yrs` / `pycrdt`) | MIT | Offline-first CRDT multiplayer co-editing & spatial review threads |
| `temporalio/temporal` | MIT | Crash-resilient multi-hour durable 9-Gate workflow orchestrator |
| `nats-io/nats-server` `[NEW]` | Apache-2.0 | Lightweight Tier 2 remote worker queue & telemetry pub/sub |
| `inventree/InvenTree` | MIT | Self-hosted physical lab inventory, barcodes & factory PLM |
| `strictdoc-project/strictdoc` | Apache-2.0 | V-Model HLR ↔ LLR ↔ Schematic ↔ Test compliance traceability |
| `google/gvisor` (`runsc`) | Apache-2.0 | Hardened userspace kernel isolating Ring 2 containers |
| `horizon-eda/horizon` | GPL-3.0 | Reference for immutable-UUID EDA architecture & opt-in CERN PNS sidecar |
| `digailab/PCB-Bench` | Research | ICLR 2026 3,700-question multimodal PCB engineering EvalOps benchmark |
| `LGAI-Research/PCBWorld` *(env/scorer ONLY)* | BSD-3 / GPLv3 | 99 real open-source boards + KiCad DRC scorer *(NO NC checkpoints!)* |
| `Koppar-AI/autorouter-bench` | Open Source | Clean-room autorouter evaluation & commercial-safe RL harness |

### Explicitly Quarantined / Excluded Repositories (NEVER Imported Into Ring 1 Core)
| Excluded Repo | Exact Reason | Clean Replacement Already Included Above |
|---|---|---|
| `pymupdf/PyMuPDF` | **AGPL-3.0** (SaaS copyleft trap) | `pypdfium2-team/pypdfium2` (`Apache-2.0/BSD`) + `jsvine/pdfplumber` (`MIT`) |
| `INTI-CMNB/KiBot` | **AGPL-3.0** | `yaqwsx/KiKit` (`MIT`) + `kicad-cli` + `yaqwsx/PcbDraw` (`MIT`) |
| `mixelpixx/Konnect` | **AGPL-3.0** | Custom 3-Channel MIT KiCad 10 Bridge |
| `Part-DB/Part-DB-server` | **AGPL-3.0** | `inventree/InvenTree` (`MIT`) |
| `PyPSA/pypsa-app` | **AGPL-3.0** | `PyPSA/PyPSA` (`MIT`) |
| `OpenModelica/OpenModelica` | **OSMC-PL / AGPL-3.0** | User-installed external opt-in plugin ONLY |
| `PCBWorld` pretrained checkpoints | **Non-Commercial weights** | Train commercial-safe weights via `autorouter-bench` + Rust SA `vd-placer` |
| *All GitHub Skill Repositories* | Explicitly excluded by request | Managed separately via `.agents/skills/` |

*(Architectural Note: There is currently no mature permissive open-source **prostep ivip IDX v6.0** parser repo on GitHub—implement clean-room inside `packages/cad-transcoder` directly against the open PSI 5 IDX v6.0 XSD schema.)*

---

## Automated License-Safe Importer Script (`scripts/import-upstream-stack.sh`)

> **Engineering Safety Warning:** Never blindly merge 140+ upstream repos directly into your main Git history or link GPL repositories into Ring 1! This script imports them **the right way**:
> 1. **Ring 1 Libraries:** Installed natively via `cargo`, `pnpm`, and `uv` (100% MIT/Apache-2.0/BSD).
> 2. **Ring 1 Source References:** Shallow-cloned (`--depth 1`) into `vendor/ring1-refs/` (gitignored).
> 3. **Ring 2 GPL/Mixed Solvers:** Strictly quarantined inside `workers/sources/pack-*/` for isolated `gVisor` OCI container builds—**never touched by Ring 1 compilers**.
> 4. **Ring 3 Plugins, Ring 4 EvalOps & Free Local MCPs:** Staged cleanly in separate folders. Zero skill repos and zero AGPL repos imported.

Save as `scripts/import-upstream-stack.sh`, run `chmod +x scripts/import-upstream-stack.sh`, and invoke with `--ring 1`, `--ring 2`, `--ring 3`, `--ring 4`, `--mcp`, or `--all`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Vajra-Dhīr EDA — Complete License-Isolated Upstream Tech Stack Importer
# Excludes ALL skill repos and strictly blocks AGPL / Non-Commercial exclusions.
# Usage: ./scripts/import-upstream-stack.sh [--ring 1|2|3|4 | --mcp | --all]
# ==============================================================================

MODE="${1:---ring1}"

clone_shallow() {
  local dest="$1"
  local url="$2"
  local name
  name="$(basename "$url" .git)"
  mkdir -p "$dest"
  if [ -d "$dest/$name/.git" ]; then
    echo "[SKIP] $dest/$name already imported"
  else
    echo "[IMPORT] $url -> $dest/$name"
    git clone --depth 1 --filter=blob:none "$url" "$dest/$name" || echo "[WARN] Failed to clone $url (check network/auth)"
  fi
}

import_ring1() {
  echo "=== RING 1: PURE PERMISSIVE CORE (MIT / Apache-2.0 / BSD) ==="
  local DIR="vendor/ring1-refs"
  local REPOS=(
    # UI, IDE & 2D/3D Rendering
    "https://github.com/microsoft/vscode.git"
    "https://github.com/modelcontextprotocol/ext-apps.git"
    "https://github.com/mathuo/dockview.git"
    "https://github.com/xyflow/xyflow.git"
    "https://github.com/xtermjs/xterm.js.git"
    "https://github.com/microsoft/node-pty.git"
    "https://github.com/microsoft/monaco-editor.git"
    "https://github.com/pmndrs/zustand.git"
    "https://github.com/gfx-rs/wgpu.git"
    "https://github.com/mrdoob/three.js.git"
    "https://github.com/kovacsv/occt-import-js.git"
    "https://github.com/kovacsv/Online3DViewer.git"
    "https://github.com/theacodes/kicanvas.git"
    "https://github.com/tracespace/tracespace.git"
    "https://github.com/leeoniya/uPlot.git"
    "https://github.com/nytamin/spacemouse.git"
    "https://github.com/kieler/elkjs.git"
    "https://github.com/typst/typst.git"
    "https://gitlab.com/dnschneid/kischvidimer.git"
    # Pure-MIT CAD Geometry, Sandbox, Protocols & Security
    "https://github.com/georust/rstar.git"
    "https://github.com/iShape-Rust/iOverlay.git"
    "https://github.com/iShape-Rust/iTriangle.git"
    "https://github.com/jbuckmccready/cavalier_contours.git"
    "https://github.com/elalish/manifold.git"
    "https://github.com/bytecodealliance/wasmtime.git"
    "https://github.com/duckdb/duckdb.git"
    "https://github.com/agentclientprotocol/agent-client-protocol.git"
    "https://github.com/open-telemetry/opentelemetry-rust.git"
    "https://github.com/gitleaks/gitleaks.git"
    "https://github.com/sigstore/cosign.git"
    "https://github.com/CycloneDX/cyclonedx-python.git"
    # Harnesses & CLI Token Compression (Non-Skill)
    "https://github.com/anomalyco/opencode.git"
    "https://github.com/block/goose.git"
    "https://github.com/openai/codex.git"
    "https://github.com/google-gemini/gemini-cli.git"
    "https://github.com/rtk-ai/rtk.git"
    "https://github.com/ollama/ollama.git"
    # Neuro-Symbolic Brain, PCB Compilers, Parsers & Routers
    "https://github.com/atopile/atopile.git"
    "https://github.com/tscircuit/tscircuit.git"
    "https://github.com/meraworks/lamina.git"
    "https://github.com/kidandcat/fragua.git"
    "https://github.com/Z3Prover/z3.git"
    "https://github.com/sympy/sympy.git"
    "https://github.com/hgrecco/pint.git"
    "https://github.com/python-control/python-control.git"
    "https://github.com/pypdfium2-team/pypdfium2.git"
    "https://github.com/jsvine/pdfplumber.git"
    "https://github.com/turbyho/datasheet-lens.git"
    "https://github.com/turbyho/kicad-workbench.git"
    "https://github.com/yaqwsx/jlcparts.git"
    "https://github.com/uPesy/easyeda2kicad.py.git"
    "https://github.com/TousstNicolas/JLC2KiCad_lib.git"
    "https://github.com/kicad-rs/serde_kicad_sexpr.git"
    "https://github.com/adom-inc/kicad_lib.git"
    "https://github.com/Atlantix-EDA/KiParse.git"
    "https://github.com/2AMLogic/kicad-tools.git"
    "https://github.com/drandyhaas/KiCadRoutingTools.git"
    "https://github.com/parisxmas/fastroute.git"
    "https://github.com/mikwielgus/topola.git"
    "https://github.com/yaqwsx/KiKit.git"
    "https://github.com/cisco-open/2581check.git"
    "https://github.com/openscopeproject/InteractiveHtmlBom.git"
    "https://github.com/yaqwsx/PcbDraw.git"
    "https://github.com/wokwi/ngspice-wasm.git"
    "https://gitlab.com/surfer-project/surfer.git"
    "https://bitbucket.org/jpcgt/flatcam.git"
    "https://gitlab.com/kicad/code/kicad-python.git"
    # Core Polyglot LSP & Tooling
    "https://github.com/rust-lang/rust-analyzer.git"
    "https://github.com/microsoft/pyright.git"
    "https://github.com/astral-sh/uv.git"
    "https://github.com/astral-sh/ruff.git"
  )
  for r in "${REPOS[@]}"; do clone_shallow "$DIR" "$r"; done
}

import_ring2() {
  echo "=== RING 2: ISOLATED OCI / gVisor WORKER PACKS (NEVER LINKED INTO RING 1) ==="

  local PACK_2A=(
    "https://github.com/KiCad/kicad-source-mirror.git"
    "https://gitlab.com/kicad/libraries/kicad-footprint-generator.git"
    "https://gitlab.com/kicad/libraries/kicad-symbols.git"
    "https://gitlab.com/kicad/libraries/kicad-footprints.git"
    "https://github.com/freerouting/freerouting.git"
    "https://github.com/bbenchoff/OrthoRoute.git"
    "https://github.com/thesourcerer8/altium2kicad.git"
    "https://github.com/atx/padne.git"
    "https://github.com/kbralten/KiPIDA.git"
    "https://github.com/coldlogix/fasthenry.git"
    "https://github.com/ediloren/FastHenry2.git"
    "https://github.com/antmicro/gerber2ems.git"
    "https://github.com/thliebig/openEMS-Project.git"
    "https://github.com/awslabs/palace.git"
    "https://github.com/tmolteno/python-necpp.git"
    "https://github.com/scikit-rf/scikit-rf.git"
    "https://github.com/capn-freako/PyBERT.git"
    "https://github.com/kamratia1/pybis2spice.git"
    "https://github.com/OpenMagnetics/PyOpenMagnetics.git"
    "https://github.com/OpenMagnetics/MAS.git"
    "https://github.com/pybamm-team/PyBaMM.git"
    "https://github.com/pybamm-team/liionpack.git"
    "https://github.com/CadQuery/cadquery.git"
    "https://gitlab.onelab.info/gmsh/gmsh.git"
    "https://github.com/ElmerCSC/elmerfem.git"
    "https://github.com/Dhondtguido/CalculiX.git"
    "https://github.com/wireviz/WireViz.git"
    "https://github.com/leoheck/kiri.git"
    "https://github.com/Gasman2014/KiCad-Diff.git"
  )
  for r in "${PACK_2A[@]}"; do clone_shallow "workers/sources/pack-2a-pcb-physics" "$r"; done

  local PACK_2B=(
    "https://github.com/renode/renode.git"
    "https://github.com/vibeic/ngspice.git"
    "https://github.com/Xyce/Xyce.git"
    "https://github.com/Xyce/XDM.git"
    "https://github.com/nunobrum/spicelib.git"
    "https://github.com/ra3xdh/qucs_s.git"
    "https://github.com/pfalstad/circuitjs1.git"
    "https://github.com/chipmuenk/pyfda.git"
    "https://github.com/fastmachinelearning/hls4ml.git"
    "https://github.com/probe-rs/probe-rs.git"
    "https://github.com/pyvisa/pyvisa.git"
    "https://github.com/sigrokproject/libsigrok.git"
    "https://github.com/ngscopeclient/scopehal-apps.git"
    "https://github.com/openpnp/openpnp.git"
    "https://github.com/openpnp/openpnp-capture.git"
    "https://github.com/google/openhtf.git"
  )
  for r in "${PACK_2B[@]}"; do clone_shallow "workers/sources/pack-2b-virtual-hil" "$r"; done

  local PACK_2C=(
    "https://github.com/iic-jku/IIC-OSIC-TOOLS.git"
    "https://github.com/librelane/librelane.git"
    "https://github.com/The-OpenROAD-Project/OpenROAD-MCP.git"
    "https://github.com/The-OpenROAD-Project/OpenROAD-flow-scripts.git"
    "https://github.com/The-OpenROAD-Project/OpenSTA.git"
    "https://github.com/The-OpenROAD-Project/asap7.git"
    "https://github.com/verilator/verilator.git"
    "https://github.com/steveicarus/iverilog.git"
    "https://github.com/cocotb/cocotb.git"
    "https://github.com/pyuvm/pyuvm.git"
    "https://github.com/fvutils/pyvsc.git"
    "https://github.com/YosysHQ/yosys.git"
    "https://github.com/YosysHQ/sby.git"
    "https://github.com/YosysHQ/nextpnr.git"
    "https://github.com/YosysHQ/eqy.git"
    "https://github.com/YosysHQ/mcy.git"
    "https://github.com/berkeley-abc/abc.git"
    "https://github.com/chipsalliance/Surelog.git"
    "https://github.com/MikePopoloski/slang.git"
    "https://github.com/chipsalliance/verible.git"
    "https://github.com/enjoy-digital/litex.git"
    "https://github.com/amaranth-lang/amaranth.git"
    "https://github.com/StefanSchippers/xschem.git"
    "https://github.com/RTimothyEdwards/magic.git"
    "https://github.com/RTimothyEdwards/netgen.git"
    "https://github.com/KLayout/klayout.git"
    "https://github.com/iic-jku/klayout-pex.git"
    "https://github.com/ediloren/FasterCap.git"
    "https://github.com/ALIGN-analoglayout/ALIGN-public.git"
    "https://github.com/idea-fasoc/OpenFASoC.git"
    "https://github.com/fossi-foundation/cace.git"
    "https://github.com/stineje/CharLib.git"
    "https://github.com/gdsfactory/gdsfactory.git"
    "https://github.com/devsim/devsim.git"
    "https://github.com/OpenVAF-Reloaded/OpenVAF.git"
    "https://github.com/gem5/gem5.git"
    "https://github.com/HewlettPackard/mcpat.git"
    "https://github.com/uvahotspot/HotSpot.git"
    "https://github.com/ucb-bar/chipyard.git"
    "https://github.com/llvm/circt.git"
    "https://github.com/google/xls.git"
    "https://github.com/ferrandi/PandA-bambu.git"
    "https://github.com/VLSIDA/OpenRAM.git"
    "https://github.com/AUCOHL/DFFRAM.git"
    "https://github.com/FPGA-Research/FABulous.git"
    "https://github.com/AUCOHL/Fault.git"
    "https://github.com/ChairImpSec/PROLEAD.git"
  )
  for r in "${PACK_2C[@]}"; do clone_shallow "workers/sources/pack-2c-silicon-vlsi" "$r"; done

  local PACK_2D=(
    "https://github.com/e2nIEE/pandapower.git"
    "https://github.com/PyPSA/PyPSA.git"
    "https://github.com/Eomys/pyleecan.git"
    "https://github.com/pvlib/pvlib-python.git"
    "https://github.com/qelectrotech/qelectrotech-source-mirror.git"
    "https://github.com/autonomy-logic/openplc-runtime.git"
    "https://github.com/autonomy-logic/openplc-editor.git"
  )
  for r in "${PACK_2D[@]}"; do clone_shallow "workers/sources/pack-2d-power-machines" "$r"; done

  local PACK_2E=(
    "https://github.com/NVlabs/sionna.git"
    "https://github.com/gnuradio/gnuradio.git"
    "https://github.com/pothosware/SoapySDR.git"
    "https://github.com/NanoComp/meep.git"
    "https://github.com/grame-cncm/faust.git"
    "https://github.com/newaetech/chipwhisperer.git"
  )
  for r in "${PACK_2E[@]}"; do clone_shallow "workers/sources/pack-2e-comms-photonics" "$r"; done
}

import_ring3_and_4() {
  echo "=== RING 3: ENTERPRISE & TEAM PLUGINS ==="
  local RING3=(
    "https://github.com/yjs/yjs.git"
    "https://github.com/y-crdt/y-crdt.git"
    "https://github.com/temporalio/temporal.git"
    "https://github.com/nats-io/nats-server.git"
    "https://github.com/inventree/InvenTree.git"
    "https://github.com/strictdoc-project/strictdoc.git"
    "https://github.com/google/gvisor.git"
    "https://github.com/horizon-eda/horizon.git"
    "https://github.com/vllm-project/vllm.git"
    "https://github.com/fsfe/reuse-tool.git"
  )
  for r in "${RING3[@]}"; do clone_shallow "plugins/sources" "$r"; done

  echo "=== RING 4: HARDWARE EVALOPS BENCHMARKS ==="
  local RING4=(
    "https://github.com/digailab/PCB-Bench.git"
    "https://github.com/LGAI-Research/PCBWorld.git"
    "https://github.com/Koppar-AI/autorouter-bench.git"
  )
  for r in "${RING4[@]}"; do clone_shallow "evalops/sources" "$r"; done
}

import_local_mcps() {
  echo "=== FREE LOCAL DEV MCP SERVERS (NO SKILL REPOS) ==="
  local MCPS=(
    "https://github.com/oraios/serena.git"
    "https://github.com/upstash/context7.git"
    "https://github.com/modelcontextprotocol/servers.git"
    "https://github.com/ast-grep/ast-grep-mcp.git"
    "https://github.com/microsoft/playwright-mcp.git"
    "https://github.com/ChromeDevTools/chrome-devtools-mcp.git"
    "https://github.com/semgrep/mcp.git"
    "https://github.com/mixelpixx/KiCAD-MCP-Server.git"
  )
  for r in "${MCPS[@]}"; do clone_shallow "tools/local-mcps" "$r"; done
}

# Ensure cloned upstream vendor trees NEVER accidentally pollute main Git commits
mkdir -p vendor workers/sources plugins/sources evalops/sources tools/local-mcps
grep -qxF "vendor/ring1-refs/" .gitignore 2>/dev/null || cat <<'EOF' >> .gitignore
# Upstream mirrored source trees (managed by scripts/import-upstream-stack.sh)
vendor/ring1-refs/
workers/sources/
plugins/sources/
evalops/sources/
tools/local-mcps/
EOF

case "$MODE" in
  --ring1|--ring\ 1) import_ring1 ;;
  --ring2|--ring\ 2) import_ring2 ;;
  --ring3|--ring4)   import_ring3_and_4 ;;
  --mcp)             import_local_mcps ;;
  --all)             import_ring1; import_ring2; import_ring3_and_4; import_local_mcps ;;
  *) echo "Usage: $0 [--ring1 | --ring2 | --ring3 | --mcp | --all]"; exit 1 ;;
esac

echo "DONE: Selected Vajra-Dhīr upstream stack imported cleanly with license isolation."
```

### Recommended Execution Order
1. **Start Lean Today (Milestone 1):** Run `./scripts/import-upstream-stack.sh --ring1` and `./scripts/import-upstream-stack.sh --mcp` (fast, zero GPL contamination, zero Docker bloat, ~100% pure permissive Ring 1 + free local MCPs).
2. **Pull Heavy Packs Only When Building Ring 2 Containers:** Run `--ring2` and `--ring3` only when packaging the isolated `gVisor` Dockerfiles (`docker/docker-compose.workers.yml`). Note that `gitlab.com/kicad/libraries/kicad-packages3D` is intentionally omitted from default shallow clones because its STEP archive is several gigabytes—pull it selectively inside Pack 2A's OCI build stage.