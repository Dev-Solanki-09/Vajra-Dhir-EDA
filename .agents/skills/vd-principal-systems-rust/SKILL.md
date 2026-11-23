---
name: vd-principal-systems-rust
description: Principal Rust systems engineering rules for Vajra-Dhīr EDA (HW-IR SQLite WAL, i64 nm geometry, rstar/i_overlay/iTriangle/cavalier_contours, Wasmtime 50, hw-merge). Trigger whenever editing Cargo.toml or any .rs file.
---
# Principal Rust Systems Engineering — Vajra-Dhīr EDA

## 1. Exact Integer Geometry & Spatial Rules
- Represent coordinates exclusively as `pub type Nm = i64;` and angles as `pub type Mdeg = i32;` (`0..360_000`).
- Perform intermediate dot/cross/distance-squared products in `i128` to eliminate silent `i64` overflow on >300 mm boards.
- Use `rstar` for spatial hit-tests/snapping, `i_overlay` for exact `i64` polygon booleans, `iTriangle` for GPU triangulation, `cavalier_contours` for arc-preserving offsets, and `manifold-csg` for 3D slicing.
- Leverage Rust 1.100's stable `Allocator` API (arena allocation per frame/iteration) inside `vd-cad-geom` and `vd-placer` hot loops to eliminate per-segment heap churn.

## 2. SQLite WAL & Kernel Lock Discipline
- Open `HW-IR` with `PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;`.
- Wrap every `HardwarePatch` in an immediate SQLite transaction (`BEGIN IMMEDIATE`):
  1. Verify `expected_lamport == current_lamport` (optimistic concurrency control).
  2. Set `_tx_actor_ctx` to the exact `actor_kind` (`human` | `agent` | `compiler`).
  3. Compute & persist `inverse_ops_json` in `hardware_patches` inside the SAME transaction so Undo is O(1) and crash-atomic.
- NEVER swallow `KERNEL_LOCK_VIOLATION` SQLite trigger errors; surface them as structured `LockViolation` JSON.

## 3. Wasmtime 50 Zero-Trust Sandbox Discipline
- Require `wasmtime >= 50.0.0` (CVE-2026-115889 patched).
- Always enable BOTH `consume_fuel(true)` AND `epoch_interruption(true)` with a wall-clock watchdog thread.
- Construct `WasiCtxBuilder::new()` with ZERO preopened directories, ZERO env inheritance, and ZERO network sockets. Enforce `StoreLimitsBuilder::memory_size(256 MiB)` and cap guest return string length (`<= 16 KiB`).

## 4. Production Rust Hygiene
- ZERO `.unwrap()` or `.expect()` in library crates (`packages/*`). Return typed `thiserror` errors.
- Never parse hardcoded `target/` paths in build scripts (Rust 1.100 changed `target/` layout); use `cargo --message-format=json`.
- Before concluding any Rust task, run: `rtk cargo clippy --workspace --all-targets -- -D warnings && rtk cargo test --workspace`.
