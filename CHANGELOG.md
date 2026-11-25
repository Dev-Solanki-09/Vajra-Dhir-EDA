# Changelog

All notable changes to Vajra-Dhīr EDA will be documented in this file.
The format is based on Keep a Changelog.

## [0.0.5] - 2026-11-25 (Human Release Signoff Pending)

### Added & Hardened
- **Canonical Workstation (`apps/workstation`):** React 19.3.1 + TypeScript 7.0.2 + `dockview-react` 8.9.x MIT docking workspace served strictly on `127.0.0.1:41900` (`vd studio`), code-split entry JS (`< 400 KB`), WebGL2/Canvas2D PCB rendering, `elkjs` schematic auto-layout, `uPlot` waveform plotting, pure-MIT IEEE-1364 VCD viewer (no EUPL `surfer`), RS-274X Gerber layer preview, and sub-16 ms `CrossProbeBus`.
- **Constraint & BOM Intelligence:** Added pure-MIT Rust crates `packages/constraint-mgr` (`vd-constraint-mgr`, `i64` nm netclass/skew/delay rules) and `packages/bom-analytics` (`vd-bom-analytics`, DNP assembly variants, Extended feeder fees, stock/lifecycle scoring), plus unified DFM/DFA/PI scorecard (`packages/dfm-dfa-safety/src/scorecard.py`).
- **CRDT Collab & Project Digests:** Added `@vajradhir/collab` (`packages/collab`, offline `yjs@13.6.33` enforcing fail-closed `KERNEL_LOCK_VIOLATION` across peers/agents + canonical `vd.hw.lock.v1` SHA-256 digests) and `packages/hw-ir/src/digest.rs` (`vd.hw.lock.projection.v1`).
- **Simulation, Silicon & 3D Clearances:** Added lockstep co-simulation contracts (`packages/sim-compat/src/cosim_contract.rs`), Ring-2 `network_mode: none` enforcement (`packages/vd-daemon/src/x3_routes.py`, `x4_routes.py`), `packages/silicon-pack` (LibreLane Pack-2C C2P2B bridge), `packages/cad-transcoder/src/skidl_netlist.rs`, and integer `i64` nm MCAD 3D clearance DRC (`packages/cad-geom/src/mcad_clearance.rs`).
- **Clean-Room Manufacturing & Persistence:** Added Rust `panelizer`, `rs274x`, `eagle_xml`, `wire-harness`, `pcb-diff`, `i_triangle` `i64` copper pour, `occt-import-js` isolated Web Worker, `cas-store` zstd compression, WAL checkpointing, transactional Undo/Redo, Win64/POSIX child supervision, and SSE agent proposal endpoints.
- **License, Docs & Verification Hygiene:** Unified root `LICENSE` under Apache License 2.0 (with `NOTICE` & `docs/LICENSE_EXCEPTIONS.md`), consolidated generic public docs under `docs/`, untracked internal session files, and verified offline SPDX firewall, secret scanning, and 83-gate verification harness (`0/3` PCBs physically fabricated).
