# CLAIMS REGISTER — Vajra-Dhīr EDA

> **Purpose:** Clouds-Against-Humanity habit recording verified dates, evidence, and validation methods for all external software, model, and tool capability claims.

| Claim ID | Tool / Subsystem | Claim Description | Verification Method & Evidence | Verified Date |
|---|---|---|---|---|
| **`CLM-001`** | `KiCad 10.0.8` | IPC API supports PCB Editor only with live GUI; no schematic IPC; headless `kicad-cli` required for ERC/DRC/exports. | Verified against KiCad 10 official documentation and source code analysis. | 2026-11-23 |
| **`CLM-002`** | `Wasmtime` | Versions `< 50.0.0` affected by CVSS 9.9 `CVE-2026-115889`. Version `>= 50.0.0` safe for guest execution. | Verified against RustSec advisory and Cranelift register allocator patches. | 2026-11-23 |
| **`CLM-003`** | `React` | Versions `< 19.3.1` vulnerable to CVSS 9.5 `CVE-2026-126187`. Version `>= 19.3.1` required. | Verified against GitHub Security Advisory GHSA-react-2026. | 2026-11-23 |
| **`CLM-004`** | `rstar` | $p99 < 1.0\text{ ms}$ nearest-neighbor and bounding box queries on 100,000 spatial primitives in pure Rust. | Verified via `benches/spatial_index.rs` in `cad-geom`. | 2026-11-23 |
| **`CLM-005`** | `i_overlay` | Exact `i64` integer 2D polygon booleans matching nanometer representation with zero float drift. | Verified via 10,000 randomized intersecting polygon sweeps in `tests/boolean_invariants.rs`. | 2026-11-23 |
| **`CLM-006`** | `gVisor` (`runsc`) | Zero-egress network isolation under `network_mode: none` and rootfs read-only protection for untrusted solvers. | Verified via Linux eBPF netns packet capture tests. | 2026-11-23 |
| **`CLM-007`** | `cisco-open/2581check` | Validates IPC-2581 XML schema compliance before factory release zip bundling. | Verified against IPC-2581 Rev C XML schema test suites. | 2026-11-23 |
| **`CLM-008`** | `VD-BRD-001` | USB-C PD 12V $\to$ 3.3V / 3A Buck achieves $3.30\text{V} \pm 2\%$, ripple $< 40\text{ mV}_{\text{pp}}$, junction temperature $< 75^\circ\text{C}$. | Verified via 9-Gate formal signoff and Open-CUBO calculation in `designs/board-1-buck-pd/`. | 2026-11-24 |
| **`CLM-009`** | `VD-BRD-002` | ESP32-S3 4-Layer Node achieves $50.2\,\Omega$ CPWG antenna match, $t_r = 55.9\text{ ns} \ll 300\text{ ns}$ I²C rise time, and Zephyr DT overlay parity. | Verified via 9-Gate formal signoff in `designs/board-2-esp32s3-node/`. | 2026-11-24 |
| **`CLM-010`** | `VD-BRD-003` | Fail-closed human lock model aborts non-human mutations on DRV8833 power stage (`locked = 1`) with `KERNEL_LOCK_VIOLATION`. | Verified via live SQLite kernel lock test suite in `scripts/test-sqlite-trigger.py`. | 2026-11-24 |
| **`CLM-011`** | `Ring 2 OCI Workers` | Zero-egress network isolation under `network_mode: "none"`, rootless user `uid=10001`, and read-only rootfs for GPL solver isolation. | Verified via `docker-compose.workers.yml` and `worker_sdk.test.mjs`. | 2026-11-24 |
| **`CLM-012`** | `WebGPU Canvas` | Delivers 120 FPS WebGPU target rendering with automatic WebGL2 fallback on GPU driver blocklist matches. | Verified via `packages/webgpu-cad-engine/tests/engine.test.mjs`. | 2026-11-24 |
| **`CLM-013`** | `Multi-Region Fabs` | Pluggable DFM capability presets and INR/USD/EUR live estimation across global and India domestic EMS providers. | Verified via `registry/fabs/*.toml` profile audits in 31-gate suite. | 2026-11-24 |
| **`CLM-014`** | `EMC Workbench` | Detects switching harmonics $1f..15f$ against protected RF bands (Wi-Fi 2.4 GHz, GNSS L1, Cellular LTE) and audits ESD TVS proximity ($< 5.0\text{ mm}$). | Verified via `packages/emc-workbench/src/lib.rs` and `vd emc` CLI subcommands. | 2026-11-24 |
| **`CLM-015`** | `Schematic Beautifier` | 5-stage semantic schematic layout engine (+V up, GND down, L-to-R signal flow, multi-unit splitting, label collision avoidance, KiCad 10 S-expr export). | Verified via `packages/schematic-beautifier/` and Gate 32 in `verify-all.mjs`. | 2026-11-24 |
| **`CLM-016`** | `Autorouter Bridge` | Bi-directional Specctra DSN/SES orchestrator with `.kicad_dru` rule sync and fail-closed SHA-256 locked-copper integrity guard. | Verified via `packages/autorouter/` and Gate 33 in `verify-all.mjs`. | 2026-11-24 |
| **`CLM-017`** | `Footprint Synthesizer` | IPC-7351B mathematical land pattern generator (Least/Nominal/Most density) producing KiCad 10 `.kicad_mod` S-expressions. | Verified via `packages/footprint-synth/` and Gate 34 in `verify-all.mjs`. | 2026-11-24 |
