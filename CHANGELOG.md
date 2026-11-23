# Changelog

All notable changes to Vajra-Dhīr EDA will be documented in this file.
The format is based on Keep a Changelog.

## [v0.1.0-architecture] - 2026-11-23

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
