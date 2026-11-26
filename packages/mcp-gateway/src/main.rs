use std::io::{self, BufRead, Write};
use vd_ir::store::HwIrStore;
use vd_dlp::BudgetConfig;
use vd_wasm_sandbox::WasmSandboxRunner;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let stdin = io::stdin();
    let mut stdout = io::stdout();

    eprintln!("vd-mcp: Vajra-Dhīr EDA Rust Harness MCP v2 Gateway starting on stdio...");

    for line_res in stdin.lock().lines() {
        let line = line_res?;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let parsed: serde_json::Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(e) => {
                let err_resp = serde_json::json!({
                    "jsonrpc": "2.0",
                    "id": null,
                    "error": { "code": -32700, "message": format!("Parse error: {}", e) }
                });
                writeln!(stdout, "{}", serde_json::to_string(&err_resp)?)?;
                stdout.flush()?;
                continue;
            }
        };

        let method = parsed.get("method").and_then(|m| m.as_str()).unwrap_or("");
        let id = parsed.get("id");

        let response = match method {
            "initialize" => serde_json::json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {
                        "tools": { "listChanged": false }
                    },
                    "serverInfo": {
                        "name": "vajra-dhir-mcp-rust-gateway",
                        "version": "0.1.0"
                    }
                }
            }),
            "notifications/initialized" => continue,
            "tools/list" => serde_json::json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": {
                    "tools": [
                        { "name": "hw_discover", "description": "Discover parts and verified datasheet evidence" },
                        { "name": "hw_inspect", "description": "Query HW-IR or run Wasmtime 51 Code Mode filter" },
                        { "name": "hw_patch", "description": "Apply atomic HardwarePatch with human-lock guards" },
                        { "name": "hw_lock", "description": "Set/query entity human lock status" },
                        { "name": "hw_compile", "description": "Compile atopile/KiCad schematics & enclosure" },
                        { "name": "hw_verify", "description": "Run ERC/DRC, EE Audit, PI, MCAD Clash & 2581check" },
                        { "name": "hw_simulate", "description": "Run SPICE analog & FEM simulations" },
                        { "name": "hw_layout", "description": "Run OrthoRoute / Fast-RTR & Gerber inspection" },
                        { "name": "hw_signoff", "description": "Gate 8 human cryptographic signoff & waivers" },
                        { "name": "hw_firmware", "description": "Compile firmware and run Renode co-simulation" },
                        { "name": "hw_export", "description": "Export Gerbers, IPC-2581C, STEP, iBom, PcbDraw & Typst PDF" },
                        { "name": "hw_diff", "description": "Compute hardware diffs & Dual Checkpoints" }
                    ]
                }
            }),
            _ => serde_json::json!({
                "jsonrpc": "2.0",
                "id": id,
                "error": { "code": -32601, "message": format!("Method not found: {}", method) }
            }),
        };

        writeln!(stdout, "{}", serde_json::to_string(&response)?)?;
        stdout.flush()?;
    }

    Ok(())
}
