//! # Vajra-Dhīr EDA — Wasmtime 51+ Component Model Code Mode Sandbox
//!
//! Provides isolated, deterministic in-memory execution for AI agent script synthesis,
//! atopile parsing, and parametric calculations with strict fuel, memory (256 MiB),
//! wall-clock timeout (5.0s), and output capping (16 KiB).

pub mod runner;

pub use runner::{
    ExecutionLimits, ExecutionOutput, SandboxError, WasmSandboxRunner,
    DEFAULT_FUEL_UNITS, DEFAULT_MAX_MEMORY_BYTES, DEFAULT_MAX_OUTPUT_BYTES,
    DEFAULT_TIMEOUT_MS,
};
