# Changelog

All notable changes to Vajra-Dhīr EDA will be documented in this file.
The format is based on Keep a Changelog.

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
