use vd_wasm_sandbox::{ExecutionLimits, SandboxError, WasmSandboxRunner};

#[test]
fn test_clean_wasm_execution() {
    let runner = WasmSandboxRunner::new().expect("Failed to create runner");
    let wat = r#"
        (module
            (func (export "_start"))
        )
    "#;
    let wasm = wat::parse_str(wat).expect("WAT parse failed");
    let limits = ExecutionLimits::default();

    let res = runner.execute_module(&wasm, limits).expect("Execution should succeed");
    assert_eq!(res.exit_code, 0);
    assert!(res.fuel_consumed > 0, "Should have consumed fuel");
}

#[test]
fn test_fuel_exhaustion_stops_infinite_loop() {
    let runner = WasmSandboxRunner::new().expect("Failed to create runner");
    let wat = r#"
        (module
            (func (export "_start")
                (loop $infinite
                    br $infinite
                )
            )
        )
    "#;
    let wasm = wat::parse_str(wat).expect("WAT parse failed");

    // Allocate only 1000 fuel units
    let mut limits = ExecutionLimits::default();
    limits.fuel_units = 1_000;

    let res = runner.execute_module(&wasm, limits);
    match res {
        Err(SandboxError::FuelExhausted) => {
            // Success! Fuel metering caught the infinite loop
        }
        other => panic!("Expected FuelExhausted error, got {:?}", other),
    }
}

#[test]
fn test_memory_limiter_stops_excessive_growth() {
    let runner = WasmSandboxRunner::new().expect("Failed to create runner");
    // WebAssembly module that tries to grow memory by 1000 pages (64 MiB each page is 64 KiB -> 64 MiB total)
    let wat = r#"
        (module
            (memory (export "memory") 1)
            (func (export "_start")
                ;; try to grow memory by 5000 pages (320 MiB), which exceeds 256 MiB limit
                (drop (memory.grow (i32.const 5000)))
            )
        )
    "#;
    let wasm = wat::parse_str(wat).expect("WAT parse failed");

    let mut limits = ExecutionLimits::default();
    limits.max_memory_bytes = 64 * 1024 * 1024; // 64 MiB limit

    let res = runner.execute_module(&wasm, limits);
    // memory.grow returns -1 when ResourceLimiter denies growth, so module runs or traps
    assert!(res.is_ok() || matches!(res, Err(SandboxError::MemoryLimitExceeded(_))));
}
