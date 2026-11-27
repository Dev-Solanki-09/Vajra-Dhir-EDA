# Architecture Overview — Vajra-Dhīr EDA (`v0.0.4`)

Vajra-Dhīr EDA is a local-first hardware and firmware co-design workspace combining a Rust geometry/state kernel, a Python neuro-symbolic verification layer, and a browser workstation UI served strictly on `127.0.0.1:41900` (with fallback across `41900..41950` and portable `launch.bat` / `launch.command` / `launch.sh` / `Vajra-Dhir-EDA.vbs` entrypoints).

## Core Layers

1. **Canonical Hardware IR (`packages/hw-ir`):**
   - Stores schematics, layouts, constraints, BOM variants, pinmux mappings, DRC waivers, and undo journals in SQLite WAL (`i64` nanometers, `i32` millidegrees, UUIDv7 entity identifiers).
   - Enforces human-lock invariants at the SQLite trigger layer via `_tx_actor_ctx`: non-human actors (`agent`, `compiler`) cannot modify locked entities (`KERNEL_LOCK_VIOLATION`).
   - Emits compact `< 4 KB` `STATE_DELTA` WebSocket patches (`packages/vd-daemon/src/sync_propagator.py`) and clean isolated `.vdproj/` project directories (`settings_store.py`).
   - Supports deterministic CRDT sync projections and canonical `hw.lock` SHA-256 project digests (`packages/collab`, `packages/hw-ir/src/digest.rs`).

2. **Ring 1 Core Engines (`packages/*`, Apache-2.0 / MIT):**
   - Geometry, spatial indexing, boolean operations, arc offsets, triangulation, and 3D clearance bounds (`cad-geom`).
   - Manufacturing and CAD translation (`panelizer`, `pcb-diff`, `wire-harness`, `cad-transcoder`, `cam-pnp`, `footprint-synth`).
   - Constraints, BOM variants, thermal/power integrity, and silicon/FPGA bridge contracts (`constraint-mgr`, `bom-analytics`, `pdn-solver`, `control-loop`, `silicon-pack`, `sim-compat`).
   - Wasmtime sandbox (`>= 51.0.0`), DLP airgap enforcement, and semantic 3-way HW-IR merge (`wasm-sandbox`, `hw-dlp`, `hw-merge`, `cas-store`).

3. **Python Solver, Verification & Agent Daemon (`packages/vd-daemon`, `packages/symbolic-verifier`, `packages/dfm-dfa-safety`):**
   - Exposes REST, SSE agent routes, live DuckDB catalog search (`kg_routes.py`), HW-IR-driven SPICE synthesis & `ngspice` simulation (`spice_synth.py`, `ngspice_runner.py`), Z3 pinmux & `python-control` SMPS Bode solvers, isolated `kicad-cli` ERC/DRC (`kicad_bridge.py`), waivable diagnostics (`ee_audit_routes.py`), and honest fabrication status (`fab_routes.py`) exclusively on `127.0.0.1`.
   - Implements the Hermes-Core BYOK agent runtime (`packages/vd-daemon/src/agent/{vault,providers,runtime}.py`) with encrypted key storage, DLP airgap enforcement, SQLite FTS5 memory, and Dual-Context lock auditing.
   - Manages Tier-1/Tier-2 offline pack downloads (`bootstrap_routes.py`) and child process supervision with clean OS shutdown isolation.

4. **Workstation UI (`apps/workstation`):**
   - React 19.3.1 + TypeScript 7.0.2 + `dockview-react` interface with WebGL2/Canvas2D KiCanvas interactive Schematic & PCB canvases, unified cursor/redline/alignment hooks (`useUnifiedViewport.ts`), singleton `threeRendererPool` 3D STEP/MCAD viewport, `elkjs` schematic layout, `uPlot` waveform plotting, pure-MIT IEEE-1364 VCD viewer, RS-274X Gerber preview, offline Help Center (`HelpCenterModal.tsx`), and sub-16 ms cross-probing (`packages/crossprobe-bus`).

5. **Ring 2 Isolated Solvers (`WorkerContract` / OCI):**
   - Heavy external tools (`KiCad`, `KiKit`, `openEMS`, `Palace`, `ElmerFEM`, `CalculiX`, `LibreLane`, `Renode`) run out-of-process with `network_mode: none` isolation. See [LICENSE_EXCEPTIONS.md](LICENSE_EXCEPTIONS.md).
