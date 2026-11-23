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
