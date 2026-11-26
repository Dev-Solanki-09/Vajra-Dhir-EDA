# Changelog

All notable changes to Vajra-Dhīr EDA will be documented in this file.
The format is based on Keep a Changelog.

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
