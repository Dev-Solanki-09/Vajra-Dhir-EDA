# Acknowledgments & Upstream Attribution

Vajra-Dhīr EDA builds upon the work of open-source libraries, formal verification tools, hardware ecosystems, and published engineering standards. We gratefully acknowledge the maintainers and contributors of these projects:

## Core Runtime & Systems Foundations (Ring 1)
- **[Rust](https://www.rust-lang.org/)** & **Crate Authors:** `rusqlite`, `rstar`, `iOverlay`, `iTriangle`, `cavalier_contours`, `wasmtime`, `serde`, `sha2`, `uuid`, `zstd`, `tokio`, `axum`, `rayon` — powering deterministic integer-nanometer geometry, WAL persistence, and WASI sandboxing.
- **TypeScript & Workstation UI:** `React`, `TypeScript`, `Vite`, `dockview-react` (MIT), `zustand`, `uPlot`, `Yjs`, `three.js`, `@modelcontextprotocol/sdk`, and `lucide-react`.
- **Agentic Co-Designer Patterns:** [`NousResearch/hermes-agent`](https://github.com/NousResearch/hermes-agent) (MIT architecture patterns for 3-layer memory, progressive skill disclosure, and local BYOK vaulting).
- **Neuro-Symbolic Verification & Compilers (Python):** `atopile`, `Z3` (`z3-solver`), `SymPy`, `Pint`, `python-control`, `DuckDB`, `pypdfium2`, `pdfplumber`, `cyclonedx-python`, `InteractiveHtmlBom`, `PcbDraw`, `jlcparts`, `JLC2KiCad_lib`, and `2581check`.

## Documented Isolated Runtime Components
- **`elkjs` (`EPL-2.0`):** Eclipse Layout Kernel JavaScript bindings for orthogonal schematic layout.
- **`occt-import-js` (`LGPL-2.1-with-OCCT-exception`):** Open CASCADE STEP/IGES WebAssembly importer running inside an isolated browser Web Worker boundary.

## External Subprocess & Simulation Ecosystems (Ring 2 Boundaries)
When installed optionally on host or in isolated zero-egress containers (`WorkerContract`), Vajra-Dhīr EDA interoperates cleanly via standard file formats, IPC, or CLI invocations with:
- **PCB & Manufacturing:** `KiCad` (`kicad-cli`), `KiKit`
- **Circuit, Digital & Multi-Physics Simulation:** `ngspice`, `Xyce`, `Renode`, `openEMS`, `Palace`, `ElmerFEM`, `CalculiX`, `Gmsh`
- **Silicon / FPGA Toolflows:** `LibreLane`, `OpenROAD`, `Verilator`, `Yosys`, `nextpnr`

## Open Engineering Standards
- **IPC Standards:** IPC-2152, IPC-2221, IPC-7351B, IPC-7525B, IPC-2581, and IPC-D-356A guidelines.
- **IEEE / IEC Formats:** IEEE 1364 (VCD waveform interchange), RS-274X/X2 Gerber & Excellon CNC drill specifications, IEC 60757, and CycloneDX 1.6 HBOM.

All Ring 1 source code respects the boundary guarantees documented in [`LICENSE`](../LICENSE), [`NOTICE`](../NOTICE), and [`LICENSE_EXCEPTIONS.md`](LICENSE_EXCEPTIONS.md).
