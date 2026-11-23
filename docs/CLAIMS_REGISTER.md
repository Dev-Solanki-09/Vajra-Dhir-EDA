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
