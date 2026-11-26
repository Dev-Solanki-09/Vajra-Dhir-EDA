# Architecture Overview — Vajra-Dhīr EDA (`v0.0.2`)

Vajra-Dhīr EDA is a local-first hardware and firmware co-design workspace combining a Rust geometry/state kernel, a Python neuro-symbolic verification layer, and a web-based workstation UI served strictly on `127.0.0.1:41900`.

## Core Layers

1. **Canonical Hardware IR (`packages/hw-ir`):**
   - Stores schematics, layouts, constraints, BOM variants, pinmux mappings, and undo journals in SQLite WAL (`i64` nanometers, `i32` millidegrees, UUIDv7 entity identifiers).
   - Enforces human-lock invariants at the SQLite trigger layer via `_tx_actor_ctx`: non-human actors (`agent`, `compiler`) cannot modify locked entities (`KERNEL_LOCK_VIOLATION`).
   - Supports deterministic CRDT sync projections and canonical `hw.lock` SHA-256 project digests (`packages/collab`, `packages/hw-ir/src/digest.rs`).

2. **Ring 1 Core Engines (`packages/*`, Apache-2.0 / MIT):**
   - Geometry, spatial indexing, boolean operations, arc offsets, triangulation, and 3D clearance bounds (`cad-geom`).
   - Manufacturing and CAD translation (`panelizer`, `pcb-diff`, `wire-harness`, `cad-transcoder`, `cam-pnp`, `footprint-synth`).
   - Constraints, BOM variants, thermal/power integrity, and silicon/FPGA bridge contracts (`constraint-mgr`, `bom-analytics`, `pdn-solver`, `control-loop`, `silicon-pack`, `sim-compat`).
   - Wasmtime sandbox, DLP airgap enforcement, and semantic 3-way HW-IR merge (`wasm-sandbox`, `hw-dlp`, `hw-merge`, `cas-store`).

3. **Python Solver & Daemon Layer (`packages/vd-daemon`, `packages/symbolic-verifier`, `packages/dfm-dfa-safety`):**
   - Exposes REST, SSE agent routes, DFM/DFA/PI scorecards, co-simulation contracts, and 3D clearance checks exclusively on `127.0.0.1`.
   - Supervises child processes with clean OS shutdown isolation.

4. **Workstation UI (`apps/workstation`):**
   - React 19 + TypeScript 7 + `dockview-react` interface with WebGL2/Canvas2D PCB rendering, `elkjs` schematic layout, `uPlot` waveform plotting, pure-MIT IEEE-1364 VCD viewer, RS-274X Gerber preview, and sub-16 ms cross-probing (`packages/crossprobe-bus`).

5. **Ring 2 Isolated Solvers (`WorkerContract` / OCI):**
   - Heavy external tools (`KiCad`, `KiKit`, `openEMS`, `Palace`, `ElmerFEM`, `CalculiX`, `LibreLane`, `Renode`) run out-of-process with `network_mode: none` isolation. See [LICENSE_EXCEPTIONS.md](LICENSE_EXCEPTIONS.md).
