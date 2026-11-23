use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use thiserror::Error;
use wasmtime::{
    Config, Engine, Instance, Linker, Module, Mutex, ResourceLimiter, Store,
};

pub const DEFAULT_MAX_MEMORY_BYTES: usize = 256 * 1024 * 1024; // 256 MiB
pub const DEFAULT_FUEL_UNITS: u64 = 100_000_000;              // 100M Fuel
pub const DEFAULT_TIMEOUT_MS: u64 = 5_000;                     // 5.0 seconds
pub const DEFAULT_MAX_OUTPUT_BYTES: usize = 16 * 1024;         // 16 KiB

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionLimits {
    pub max_memory_bytes: usize,
    pub fuel_units: u64,
    pub timeout_ms: u64,
    pub max_output_bytes: usize,
}

impl Default for ExecutionLimits {
    fn default() -> Self {
        Self {
            max_memory_bytes: DEFAULT_MAX_MEMORY_BYTES,
            fuel_units: DEFAULT_FUEL_UNITS,
            timeout_ms: DEFAULT_TIMEOUT_MS,
            max_output_bytes: DEFAULT_MAX_OUTPUT_BYTES,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub fuel_consumed: u64,
    pub duration_ms: u64,
}

#[derive(Debug, Error)]
pub enum SandboxError {
    #[error("Fuel exhausted: consumed all allocated fuel")]
    FuelExhausted,

    #[error("Execution timed out after {0} ms")]
    Timeout(u64),

    #[error("Memory limit exceeded: allocation exceeded {0} bytes")]
    MemoryLimitExceeded(usize),

    #[error("Runtime trap: {0}")]
    Trap(String),

    #[error("Wasmtime engine error: {0}")]
    Engine(String),

    #[error("Output capped: output exceeded {0} bytes")]
    OutputCapped(usize),
}

struct MemoryLimiter {
    max_bytes: usize,
}

impl ResourceLimiter for MemoryLimiter {
    fn memory_growing(
        &mut self,
        _current: usize,
        desired: usize,
        _maximum: Option<usize>,
    ) -> Result<bool, wasmtime::Error> {
        Ok(desired <= self.max_bytes)
    }

    fn table_growing(
        &mut self,
        _current: usize,
        desired: usize,
        _maximum: Option<usize>,
    ) -> Result<bool, wasmtime::Error> {
        Ok(desired <= 50_000)
    }
}

struct SandboxState {
    limiter: MemoryLimiter,
    stdout_buffer: Arc<Mutex<Vec<u8>>>,
    stderr_buffer: Arc<Mutex<Vec<u8>>>,
    max_output: usize,
    timed_out: Arc<AtomicBool>,
}

pub struct WasmSandboxRunner {
    engine: Engine,
}

impl WasmSandboxRunner {
    /// Create a new WasmSandboxRunner with Wasmtime 50 hardened configuration.
    pub fn new() -> Result<Self, SandboxError> {
        let mut config = Config::new();
        config.consume_fuel(true);
        config.epoch_interruption(true);
        config.wasm_component_model(true);
        config.async_support(false);

        let engine = Engine::new(&config).map_err(|e| SandboxError::Engine(e.to_string()))?;
        Ok(Self { engine })
    }

    /// Access the underlying Wasmtime Engine.
    pub fn engine(&self) -> &Engine {
        &self.engine
    }

    /// Execute a compiled WebAssembly module with strict fuel, memory, output, and watchdog limits.
    pub fn execute_module(
        &self,
        wasm_bytes: &[u8],
        limits: ExecutionLimits,
    ) -> Result<ExecutionOutput, SandboxError> {
        let start_time = Instant::now();
        let module = Module::new(&self.engine, wasm_bytes)
            .map_err(|e| SandboxError::Engine(format!("Module compilation failed: {}", e)))?;

        let stdout_buf = Arc::new(Mutex::new(Vec::new()));
        let stderr_buf = Arc::new(Mutex::new(Vec::new()));
        let timed_out = Arc::new(AtomicBool::new(false));

        let state = SandboxState {
            limiter: MemoryLimiter {
                max_bytes: limits.max_memory_bytes,
            },
            stdout_buffer: stdout_buf.clone(),
            stderr_buffer: stderr_buf.clone(),
            max_output: limits.max_output_bytes,
            timed_out: timed_out.clone(),
        };

        let mut store = Store::new(&self.engine, state);
        store.set_fuel(limits.fuel_units)
            .map_err(|e| SandboxError::Engine(e.to_string()))?;
        store.limiter(|s| &mut s.limiter);
        store.set_epoch_deadline(1);

        let mut linker = Linker::new(&self.engine);

        // Host stdout write function
        let stdout_cb = stdout_buf.clone();
        let max_out = limits.max_output_bytes;
        linker
            .func_wrap("env", "print_out", move |val: i32| {
                let mut buf = stdout_cb.lock();
                if buf.len() < max_out {
                    buf.extend_from_slice(format!("{}\n", val).as_bytes());
                }
            })
            .map_err(|e| SandboxError::Engine(e.to_string()))?;

        // Watchdog background epoch ticker
        let engine_clone = self.engine.clone();
        let timeout_ms = limits.timeout_ms;
        let timed_out_flag = timed_out.clone();
        let watchdog_handle = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(timeout_ms));
            timed_out_flag.store(true, Ordering::SeqCst);
            engine_clone.increment_epoch();
        });

        let instance_res = Instance::new(&mut store, &module, linker.into_iter(&mut store).map(|(n, item)| (n.to_string(), item)));
        
        let run_res = match instance_res {
            Ok(instance) => {
                // If the module exports a "_start" or "run" or "main" function, call it
                if let Ok(func) = instance.get_typed_func::<(), ()>(&mut store, "_start") {
                    func.call(&mut store, ()).map(|_| 0)
                } else if let Ok(func) = instance.get_typed_func::<(), i32>(&mut store, "main") {
                    func.call(&mut store, ())
                } else {
                    Ok(0)
                }
            }
            Err(e) => Err(e),
        };

        drop(watchdog_handle);

        let duration_ms = start_time.elapsed().as_millis() as u64;
        let remaining_fuel = store.get_fuel().unwrap_or(0);
        let fuel_consumed = limits.fuel_units.saturating_sub(remaining_fuel);

        if timed_out.load(Ordering::SeqCst) {
            return Err(SandboxError::Timeout(limits.timeout_ms));
        }

        match run_res {
            Ok(code) => {
                let stdout_bytes = stdout_buf.lock().clone();
                let stderr_bytes = stderr_buf.lock().clone();
                Ok(ExecutionOutput {
                    stdout: String::from_utf8_lossy(&stdout_bytes).to_string(),
                    stderr: String::from_utf8_lossy(&stderr_bytes).to_string(),
                    exit_code: code,
                    fuel_consumed,
                    duration_ms,
                })
            }
            Err(trap) => {
                let trap_str = trap.to_string();
                if trap_str.contains("all fuel consumed") {
                    Err(SandboxError::FuelExhausted)
                } else if trap_str.contains("epoch") {
                    Err(SandboxError::Timeout(limits.timeout_ms))
                } else if trap_str.contains("memory") || trap_str.contains("ResourceLimit") {
                    Err(SandboxError::MemoryLimitExceeded(limits.max_memory_bytes))
                } else {
                    Err(SandboxError::Trap(trap_str))
                }
            }
        }
    }
}
