# Changelog

All notable changes to Vajra-Dhīr EDA will be documented in this file.
The format is based on Keep a Changelog.

## [0.2.0-rc] - 2026-11-25 (Human Release Signoff Pending)

### Added
- **X1 Constraint Manager & BOM Risk:** Pure-MIT Rust crates `packages/constraint-mgr` (`vd-constraint-mgr`, `i64` nm netclass/skew/delay bounds) and `packages/bom-analytics` (`vd-bom-analytics`, DNP assembly variants, Extended feeder fees, stock/lifecycle scoring), `packages/dfm-dfa-safety/src/scorecard.py`, `packages/vd-daemon/src/x1_routes.py`, and Gate 80 (`scripts/test-x1-constraints-bom.py`).
- **X2 Collaborative CRDT & `hw.lock` Project Digests:** `@vajradhir/collab` (`packages/collab`, offline `yjs@13.6.33` with fail-closed `KERNEL_LOCK_VIOLATION` across remote peer updates, canonical `vd.hw.lock.v1` SHA-256 verification), `packages/hw-ir/src/digest.rs` (`vd.hw.lock.projection.v1`), and Gate 81 (`scripts/test-x2-collab-hwlock.mjs`).
- **X3 Co-Simulation & Pure-MIT Digital Waveform Track:** Pure-MIT IEEE-1364 VCD parser & 166k-sample min-max decimator (`apps/workstation/src/engines/vcdParser.ts`, `VcdWaveformViewer.tsx` replacing EUPL `surfer`), `packages/sim-compat/src/cosim_contract.rs` (`Renode` + `ngspice` lockstep), `packages/vd-daemon/src/x3_routes.py` (`403 RING2_EGRESS_BLOCKED` on non-`none` network mode), and Gate 82 (`scripts/test-x3-sim-vcd.py`).
- **X4 Silicon Pack & MCAD 3D Clearance DRC:** `packages/silicon-pack` (`vd-silicon-pack`, LibreLane Pack-2C forbidding legacy OpenLane + C2P2B ball coordinates), `packages/cad-geom/src/mcad_clearance.rs` (`i64` nm 3D interference/clearance DRC), `packages/cad-transcoder/src/skidl_netlist.rs`, pure-MIT RS-274X `apps/workstation/src/engines/gerberPreview.ts`, `packages/vd-daemon/src/x4_routes.py`, and Gate 83 (`scripts/test-x4-silicon-mcad.py`).
- **Release Readiness & Repository License:** Apache-2.0 repository root `LICENSE` (with `NOTICE` & `docs/LICENSE_EXCEPTIONS.md`), `docs/RELEASE_PACKET_v0.2.0.md` (`human_signoff: PENDING`, `0/3 Physically Fabricated`).

## [0.1.0-rc] - 2026-11-25 (Human Release Signoff Pending)

### Added & Hardened
- Consolidated canonical `apps/workstation/` (`React 19.3.1`, `TypeScript 7.0.2`, `dockview-react 8.9.x` MIT, `elkjs` EPL-2.0, `uPlot` MIT, WebGL2/Canvas2D fallback, `CrossProbeBus < 16 ms`) served locally by `vd studio` (`127.0.0.1:41900`).
- Clean-room Ring 1 engines across `G1–G8` (`vd-panelizer`, `rs274x`, `eagle_xml`, `wire-harness`, `pcb-diff`, `i_triangle` `i64` copper pour, `occt-import-js` isolated Web Worker, `cas-store` zstd compression, WAL checkpointing, transactional Undo/Redo, Win64/POSIX child supervision, additive SSE agent routes with fail-closed `409 KERNEL_LOCK_VIOLATION`, Playwright 5 Golden E2E Journeys, lockfile SPDX firewall, and `P0–P5` bundle splitting).
- Documented baseline gate status and real LF-SHA256 digests in `docs/RELEASE_PACKET_v0.1.0.md`.

## [v0.0.1] - 2026-11-24

### Added
- 5-Stage Semantic Schematic Beautifier (`packages/schematic-beautifier`) enforcing power rail hierarchy (+V up, GND down), left-to-right signal flow, multi-unit symbol splitting, net label collision avoidance, and KiCad 10 S-expression export.
- Autorouter Orchestrator Bridge (`packages/autorouter`) with `.kicad_dru` netclass rule sync, Specctra DSN/SES import/export, and fail-closed SHA-256 locked-copper integrity guard (`trg_protect_locked_copper`).
- IPC-7351B Footprint Synthesizer (`packages/footprint-synth`) with mathematical land pattern calculation across Least, Nominal, and Most density levels, generating KiCad 10 `.kicad_mod` S-expressions.
- Solver Convergence & Failure-Recovery Middleware (`packages/solver-recovery`) providing deterministic recovery ladders for SPICE transient failures, P&R congestion backoff, and 3D FEM mesh defeaturing.
- SMPS Control-Loop Stability Math Engine (`packages/control-loop`) with plant pole-zero analysis, Type-II/III feedback compensator synthesis, and phase margin safety verification ($\phi_m \ge 45^\circ$, $GM \ge 10\text{ dB}$).
- V-Model Requirements Traceability & CycloneDX 1.6 HBOM Generator (`packages/compliance-hbom`) with StrictDoc requirement auditing and automated CycloneDX 1.6 Hardware BOM with RoHS 3, REACH, and lifecycle metadata.
- Expanded Unified CLI (`vd`) with `vd beautify`, `vd route`, `vd footprint`, `vd recovery`, `vd control`, and `vd hbom` subcommands.
- Certified 37/37 Automated Verification Gates in `scripts/verify-all.mjs`.

## [v0.0.1-architecture] - 2026-11-23

### Added
- Frozen Industrial Architecture Standard (`VD-SAD-001 Rev 2.0`).
- Canonical HW-IR SQLite WAL DDL (`001_init.sql` and `002_manual_perfection.sql`) with `_tx_actor_ctx` and fail-closed human-lock triggers.
- Semantic 3-Way Hardware Merge Driver (`hw-merge`) with spatial courtyard collision detection.
- Wasmtime 50 Component Model sandbox runner with fuel metering and 256 MiB memory ceilings.
- Hardware DLP firewall and model tier router enforcing `NDA_AIRGAPPED` zero-egress.
- Manual CAD geometry engine (`vd-cad-geom`) with R-Tree spatial indexing and integer 2D polygon booleans.
- Multi-threaded Rayon simulated annealing placer (`vd-placer`).
- 3-Channel KiCad 10 bridge and 5-second echo suppression ring (`vd-transcoder`).
- Sub-millisecond CrossProbeBus channel (`@vajradhir/crossprobe-bus`).
- Harness MCP v2 Gateway implementing all 12 typed EDA verbs (`@vajradhir/mcp-gateway`).
- Silicon Darkroom React 19 desktop UI shell (`apps/desktop`) with WebGPU and WebGL2 fallback.
- Automated 10-Gate E2E verification harness (`scripts/verify-all.mjs`).
