use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranspiledSpiceDeck {
    pub transformed_netlist: String,
    pub rewrites_applied_count: usize,
    pub added_control_directives: Vec<String>,
}

pub struct DialectTranspiler;

impl DialectTranspiler {
    /// Transpiles vendor LTspice/PSpice syntax into strict ngspice ltpsa-compatible netlists.
    pub fn transpile(input_netlist: &str) -> TranspiledSpiceDeck {
        let mut rewrites = 0;
        let mut lines = Vec::new();

        // 1. Ensure ngbehavior=ltpsa directive is included
        let control_directives = vec![
            "set ngbehavior=ltpsa".to_string(),
            "set color0=rgb:12/16/1f".to_string(),
        ];

        for line in input_netlist.lines() {
            let mut transformed = line.to_string();

            // Exponentiation operator ^ -> **
            if transformed.contains('^') && !transformed.trim_start().starts_with('*') {
                transformed = transformed.replace('^', "**");
                rewrites += 1;
            }

            // LIMIT(val, min, max) -> min(max(val, min), max)
            if transformed.contains("LIMIT(") || transformed.contains("limit(") {
                // Regex-free robust substitution for standard LIMIT(x, a, b)
                transformed = Self::rewrite_limit_expression(&transformed);
                rewrites += 1;
            }

            lines.push(transformed);
        }

        let mut transformed_netlist = String::new();
        // Prepend ngspice compatibility header
        transformed_netlist.push_str("* Transpiled by Vajra-Dhir vd-sim-compat\n");
        transformed_netlist.push_str(".control\n");
        for d in &control_directives {
            transformed_netlist.push_str(&format!("  {}\n", d));
        }
        transformed_netlist.push_str(".endc\n\n");

        transformed_netlist.push_str(&lines.join("\n"));

        TranspiledSpiceDeck {
            transformed_netlist,
            rewrites_applied_count: rewrites,
            added_control_directives: control_directives,
        }
    }

    fn rewrite_limit_expression(line: &str) -> String {
        // Replaces LIMIT(x, a, b) with (min(max(x, a), b))
        let lower = line.to_lowercase();
        if let Some(pos) = lower.find("limit(") {
            let start = pos + 6;
            if let Some(end) = line[start..].find(')') {
                let inner = &line[start..start + end];
                let parts: Vec<&str> = inner.split(',').map(|s| s.trim()).collect();
                if parts.len() == 3 {
                    let rewritten = format!("(min(max({}, {}), {}))", parts[0], parts[1], parts[2]);
                    return format!("{}{}{}", &line[..pos], rewritten, &line[start + end + 1..]);
                }
            }
        }
        line.to_string()
    }
}
