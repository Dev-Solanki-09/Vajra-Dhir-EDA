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
                        { "name": "eda_patch_circuit", "description": "Apply atomic HardwarePatch" },
                        { "name": "eda_query_design", "description": "Query HW-IR database" },
                        { "name": "eda_verify_drc", "description": "Deterministic DRC signoff" },
                        { "name": "eda_run_spice", "description": "Execute SPICE simulation" },
                        { "name": "eda_synthesize_block", "description": "Synthesize circuit block" },
                        { "name": "eda_pinmux_solve", "description": "Solve pinmux with Z3" },
                        { "name": "eda_export_fab", "description": "Export Gerber / IPC-2581C" },
                        { "name": "eda_diff_revisions", "description": "Semantic 3-way hardware diff" },
                        { "name": "eda_route_walkaround", "description": "Interactive walkaround routing" },
                        { "name": "eda_check_datasheet", "description": "Query datasheet citations" },
                        { "name": "eda_signoff_waiver", "description": "Cryptographically sign DRC waiver" },
                        { "name": "eda_run_code_mode", "description": "Execute sandboxed Wasm code" }
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
