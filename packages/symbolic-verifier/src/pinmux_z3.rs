use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PadDefinition {
    pub name: String,
    pub supported_functions: Vec<String>,
    pub is_analog_capable: bool,
    pub is_5v_tolerant: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeripheralRequirement {
    pub peripheral_id: String,
    pub signals: Vec<String>, // e.g. ["TX", "RX"] or ["SCL", "SDA"]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PinmuxSolution {
    pub satisfiable: bool,
    pub assignments: BTreeMap<String, String>, // "USART1_TX" -> "PA9"
    pub explanation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PinmuxUnsatProof {
    pub conflicting_signals: Vec<String>,
    pub contested_pads: Vec<String>,
    pub explanation: String,
}

pub struct PinmuxConstraintSolver {
    pads: BTreeMap<String, PadDefinition>,
}

impl PinmuxConstraintSolver {
    pub fn new() -> Self {
        Self {
            pads: BTreeMap::new(),
        }
    }

    pub fn add_pad(&mut self, pad: PadDefinition) {
        self.pads.insert(pad.name.clone(), pad);
    }

    /// Solves pinmux assignment deterministically using backtracking constraint satisfaction.
    pub fn solve(
        &self,
        required_signals: &[String],
    ) -> Result<PinmuxSolution, PinmuxUnsatProof> {
        let mut assignments = BTreeMap::new();
        let mut used_pads = BTreeSet::new();

        if self.backtrack_solve(required_signals, 0, &mut assignments, &mut used_pads) {
            Ok(PinmuxSolution {
                satisfiable: true,
                assignments,
                explanation: "All peripheral signal pinmux constraints satisfied without pin contention.".into(),
            })
        } else {
            // Find contested pads
            let mut contested = Vec::new();
            for sig in required_signals {
                for (pad_name, pad) in &self.pads {
                    if pad.supported_functions.contains(sig) {
                        contested.push(pad_name.clone());
                    }
                }
            }
            contested.sort();
            contested.dedup();

            Err(PinmuxUnsatProof {
                conflicting_signals: required_signals.to_vec(),
                contested_pads: contested,
                explanation: format!(
                    "Unsatisfiable pinmux constraints: Cannot simultaneously map signals {:?} to MCU pads without contention.",
                    required_signals
                ),
            })
        }
    }

    fn backtrack_solve(
        &self,
        signals: &[String],
        idx: usize,
        assignments: &mut BTreeMap<String, String>,
        used_pads: &mut BTreeSet<String>,
    ) -> bool {
        if idx >= signals.len() {
            return true;
        }

        let sig = &signals[idx];

        // Find candidate pads supporting this signal
        for (pad_name, pad) in &self.pads {
            if !used_pads.contains(pad_name) && pad.supported_functions.contains(sig) {
                // Try assign
                assignments.insert(sig.clone(), pad_name.clone());
                used_pads.insert(pad_name.clone());

                if self.backtrack_solve(signals, idx + 1, assignments, used_pads) {
                    return true;
                }

                // Backtrack
                assignments.remove(sig);
                used_pads.remove(pad_name);
            }
        }

        false
    }
}

impl Default for PinmuxConstraintSolver {
    fn default() -> Self {
        Self::new()
    }
}
