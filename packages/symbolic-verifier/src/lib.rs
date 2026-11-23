pub mod footguns;
pub mod pinmux_z3;

pub use footguns::{FindingSeverity, FootgunChecker, FootgunFinding, FootgunKind};
pub use pinmux_z3::{PadDefinition, PinmuxConstraintSolver, PinmuxSolution, PinmuxUnsatProof};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesignAuditSummary {
    pub total_findings: usize,
    pub fatal_count: usize,
    pub error_count: usize,
    pub warning_count: usize,
    pub findings: Vec<FootgunFinding>,
    pub passed_clean: bool,
}

pub struct SymbolicDesignAuditor;

impl SymbolicDesignAuditor {
    pub fn summarize_findings(findings: Vec<FootgunFinding>) -> DesignAuditSummary {
        let mut fatal_count = 0;
        let mut error_count = 0;
        let mut warning_count = 0;

        for f in &findings {
            match f.severity {
                FindingSeverity::Fatal => fatal_count += 1,
                FindingSeverity::Error => error_count += 1,
                FindingSeverity::Warning => warning_count += 1,
                FindingSeverity::Advisory => {}
            }
        }

        let passed_clean = fatal_count == 0 && error_count == 0;

        DesignAuditSummary {
            total_findings: findings.len(),
            fatal_count,
            error_count,
            warning_count,
            findings,
            passed_clean,
        }
    }
}
