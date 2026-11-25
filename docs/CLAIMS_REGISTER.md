# Claims Register — Vajra-Dhīr EDA (`v0.0.5`)

> **Hardware Status:** `Software Reference Blueprints (0/3 Physically Fabricated)`. Reference designs in `designs/` are verified through software DRC, formal constraints, and simulation harnesses; physical bench testing has not yet been performed.

| Claim ID | Component | Verified Capability | Verification Evidence | Date |
|---|---|---|---|---|
| `CLM-001` | `Wasmtime` Sandbox | `wasmtime >= 51.0.0` (`CVE-2026-115889` mitigated) with 256 MiB ceiling and epoch interruption. | `Cargo.lock`, `packages/wasm-sandbox/tests/sandbox_limits_test.rs` | 2026-11-25 |
| `CLM-002` | Frontend Runtime Floor | `react >= 19.3.1` (`CVE-2026-126187` mitigated) and `typescript == 7.0.2`. | `pnpm-lock.yaml`, `apps/workstation/package.json` | 2026-11-25 |
| `CLM-003` | Canonical `HW-IR` Locks | `i64` nm coordinates, UUIDv7 IDs, and fail-closed `KERNEL_LOCK_VIOLATION` SQLite triggers. | `scripts/test-sqlite-30tables-locks.py`, `scripts/test-sqlite-trigger.py` | 2026-11-25 |
| `CLM-004` | License Isolation Firewall | Ring 1 crates/apps restricted to Apache-2.0 / MIT (`elkjs` EPL-2.0 and `occt-import-js` LGPL worker isolated cleanly; zero `surfer` EUPL or AGPL). | `scripts/check-spdx-firewall.mjs`, `scripts/test-g8-lockfile-spdx.mjs` | 2026-11-25 |
| `CLM-005` | Reference Design Reports | All 3 reference boards (`board-1-buck-pd`, `board-2-esp32s3-node`, `board-3-stm32g4-motor`) use real LF-SHA256 artifact digests with `human_signoff: PENDING`. | `scripts/test-g7-claims-and-hashes.py`, `scripts/test-gate8-release.py` | 2026-11-25 |
| `CLM-006` | Workstation & Agent API | Loopback `apps/workstation`, `< 16 ms` `CrossProbeBus`, split entry JS `< 400 KB`, SSE agent proposals with `409` lock protection. | `scripts/test-p0-perf-budgets.py`, `scripts/test-g6c-agent-and-workspaces.py`, `scripts/test-g6d-e2e-golden-journeys.py` | 2026-11-25 |
| `CLM-007` | Constraints, BOM & Collab | `vd-constraint-mgr`, `vd-bom-analytics`, DFM/DFA/PI scorecard, `@vajradhir/collab` (`Yjs` peer lock guard + `vd.hw.lock.v1`). | `scripts/test-x1-constraints-bom.py`, `scripts/test-x2-collab-hwlock.mjs` | 2026-11-25 |
| `CLM-008` | Co-Sim, VCD, Silicon & 3D | Pure-MIT IEEE-1364 VCD parser, Ring-2 `network_mode: none` enforcement, `vd-silicon-pack`, integer `i64` nm MCAD 3D clearance DRC. | `scripts/test-x3-sim-vcd.py`, `scripts/test-x4-silicon-mcad.py` | 2026-11-25 |
