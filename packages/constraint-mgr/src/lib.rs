//! Constraint-Driven PCB Design Manager (`vd-constraint-mgr`).
//! Pure integer `i64` nanometer rules for netclasses, differential pair skew,
//! and speed-of-light delay bounds riding `vd-cad-geom`.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use vd_cad_geom::{DifferentialPairEngine, IntPoint2D, LengthTuningEngine};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetClassRule {
    pub name: String,
    pub min_width_nm: i64,
    pub min_clearance_nm: i64,
    pub diff_pair_gap_nm: Option<i64>,
    pub target_zdiff_ohm: Option<f64>,
    pub max_skew_nm: Option<i64>,
    pub min_length_nm: Option<i64>,
    pub max_length_nm: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutedNetSample {
    pub name: String,
    pub netclass: String,
    pub width_nm: i64,
    pub clearance_nm: i64,
    pub p_length_nm: i64,
    pub n_length_nm: Option<i64>,
    pub er_eff: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConstraintViolation {
    pub net: String,
    pub netclass: String,
    pub rule: String,
    pub actual_nm: i64,
    pub limit_nm: i64,
    pub severity: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetDelayMetric {
    pub net: String,
    pub length_nm: i64,
    pub skew_nm: i64,
    pub propagation_delay_ps: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConstraintAuditReport {
    pub passed: bool,
    pub checked_nets: usize,
    pub violations: Vec<ConstraintViolation>,
    pub metrics: Vec<NetDelayMetric>,
}

pub struct ConstraintEvaluator;

impl ConstraintEvaluator {
    /// Evaluate routed nets against net-class rules in exact `i64` nanometers.
    pub fn evaluate(rules: &[NetClassRule], nets: &[RoutedNetSample]) -> ConstraintAuditReport {
        let rule_map: BTreeMap<&str, &NetClassRule> =
            rules.iter().map(|r| (r.name.as_str(), r)).collect();
        let mut violations = Vec::new();
        let mut metrics = Vec::with_capacity(nets.len());

        for net in nets {
            let skew_nm = net
                .n_length_nm
                .map(|n| (net.p_length_nm - n).abs())
                .unwrap_or(0);
            let er = if net.er_eff > 0.1 { net.er_eff } else { 3.8 };
            let delay_ps = LengthTuningEngine::compute_delay_ps(net.p_length_nm, er);
            metrics.push(NetDelayMetric {
                net: net.name.clone(),
                length_nm: net.p_length_nm,
                skew_nm,
                propagation_delay_ps: (delay_ps * 100.0).round() / 100.0,
            });

            let Some(rule) = rule_map.get(net.netclass.as_str()) else {
                violations.push(ConstraintViolation {
                    net: net.name.clone(),
                    netclass: net.netclass.clone(),
                    rule: "UNKNOWN_NETCLASS".to_string(),
                    actual_nm: 0,
                    limit_nm: 0,
                    severity: "ERROR".to_string(),
                });
                continue;
            };

            if net.width_nm < rule.min_width_nm {
                violations.push(ConstraintViolation {
                    net: net.name.clone(),
                    netclass: rule.name.clone(),
                    rule: "MIN_TRACE_WIDTH".to_string(),
                    actual_nm: net.width_nm,
                    limit_nm: rule.min_width_nm,
                    severity: "CRITICAL".to_string(),
                });
            }
            if net.clearance_nm < rule.min_clearance_nm {
                violations.push(ConstraintViolation {
                    net: net.name.clone(),
                    netclass: rule.name.clone(),
                    rule: "MIN_CLEARANCE".to_string(),
                    actual_nm: net.clearance_nm,
                    limit_nm: rule.min_clearance_nm,
                    severity: "CRITICAL".to_string(),
                });
            }
            if let Some(max_skew) = rule.max_skew_nm.filter(|&m| skew_nm > m) {
                violations.push(ConstraintViolation {
                    net: net.name.clone(),
                    netclass: rule.name.clone(),
                    rule: "DIFF_PAIR_MAX_SKEW".to_string(),
                    actual_nm: skew_nm,
                    limit_nm: max_skew,
                    severity: "CRITICAL".to_string(),
                });
            }
            if let Some(min_len) = rule.min_length_nm.filter(|&m| net.p_length_nm < m) {
                violations.push(ConstraintViolation {
                    net: net.name.clone(),
                    netclass: rule.name.clone(),
                    rule: "MIN_ROUTED_LENGTH".to_string(),
                    actual_nm: net.p_length_nm,
                    limit_nm: min_len,
                    severity: "ERROR".to_string(),
                });
            }
            if let Some(max_len) = rule.max_length_nm.filter(|&m| net.p_length_nm > m) {
                violations.push(ConstraintViolation {
                    net: net.name.clone(),
                    netclass: rule.name.clone(),
                    rule: "MAX_ROUTED_LENGTH".to_string(),
                    actual_nm: net.p_length_nm,
                    limit_nm: max_len,
                    severity: "ERROR".to_string(),
                });
            }
        }

        ConstraintAuditReport {
            passed: violations.is_empty(),
            checked_nets: nets.len(),
            violations,
            metrics,
        }
    }

    /// Delegate differential-pair guide generation directly to `vd-cad-geom`.
    pub fn synthesize_pair_from_rule(
        guide: &[IntPoint2D],
        rule: &NetClassRule,
    ) -> Option<vd_cad_geom::CoupledDiffPairTrajectory> {
        let gap = rule.diff_pair_gap_nm.unwrap_or(rule.min_clearance_nm);
        let zdiff = rule.target_zdiff_ohm.unwrap_or(90.0);
        DifferentialPairEngine::compute_coupled_pair(guide, rule.min_width_nm, gap, zdiff)
    }
}
