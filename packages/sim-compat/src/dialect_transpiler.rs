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
        // Replaces LIMIT(x, a, b) with (min(max(x, a), b)), respecting nested parentheses
        let lower = line.to_lowercase();
        let Some(pos) = lower.find("limit(") else {
            return line.to_string();
        };
        let start = pos + 6;
        let mut depth = 1usize;
        let mut close_idx = None;
        let mut comma_offsets = Vec::new();

        for (offset, ch) in line[start..].char_indices() {
            match ch {
                '(' => depth += 1,
                ')' => {
                    depth -= 1;
                    if depth == 0 {
                        close_idx = Some(start + offset);
                        break;
                    }
                }
                ',' if depth == 1 => comma_offsets.push(start + offset),
                _ => {}
            }
        }

        if let (Some(end), 2) = (close_idx, comma_offsets.len()) {
            let arg0 = line[start..comma_offsets[0]].trim();
            let arg1 = line[comma_offsets[0] + 1..comma_offsets[1]].trim();
            let arg2 = line[comma_offsets[1] + 1..end].trim();
            let rewritten = format!("(min(max({}, {}), {}))", arg0, arg1, arg2);
            return format!("{}{}{}", &line[..pos], rewritten, &line[end + 1..]);
        }
        line.to_string()
    }
}
