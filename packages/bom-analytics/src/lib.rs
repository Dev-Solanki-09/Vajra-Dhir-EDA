//! Clean-Room MIT BOM Analytics & Assembly Variants (`vd-bom-analytics`).
//! Replaces GPL/AGPL Python/PHP BOM tools in pure-MIT Rust per cross-language policy.

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum FeederFeeType {
    Basic,
    Extended,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum LifecycleState {
    Active,
    Nrnd,
    Obsolete,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BomLineItem {
    pub refdes: String,
    pub mpn: String,
    pub package: String,
    pub feeder_fee_type: FeederFeeType,
    pub stock_qty: u32,
    pub unit_price_usd: f64,
    pub lifecycle: LifecycleState,
    pub qty: u32,
    pub alternate_mpns: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssemblyVariant {
    pub name: String,
    pub dnp_refdes: Vec<String>,
    pub overrides: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BomRiskFlag {
    pub refdes: String,
    pub mpn: String,
    pub kind: String,
    pub severity: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BomAnalysisReport {
    pub variant_name: String,
    pub board_count: u32,
    pub active_line_count: usize,
    pub dnp_excluded_count: usize,
    pub total_part_cost_usd: f64,
    pub extended_feeder_fees_usd: f64,
    pub supply_readiness_score: u32,
    pub risks: Vec<BomRiskFlag>,
}

pub struct BomRiskAnalyzer;

impl BomRiskAnalyzer {
    pub const EXTENDED_FEEDER_FEE_USD: f64 = 3.0;

    pub fn analyze(
        items: &[BomLineItem],
        variant: Option<&AssemblyVariant>,
        board_count: u32,
    ) -> BomAnalysisReport {
        let boards = board_count.max(1);
        let dnp: BTreeSet<&str> = variant
            .map(|v| v.dnp_refdes.iter().map(String::as_str).collect())
            .unwrap_or_default();

        let mut active_lines = 0usize;
        let mut dnp_excluded = 0usize;
        let mut part_cost_usd = 0.0f64;
        let mut extended_mpns: BTreeSet<String> = BTreeSet::new();
        let mut risks = Vec::new();
        let mut score: i32 = 100;

        for item in items {
            if dnp.contains(item.refdes.as_str()) {
                dnp_excluded += 1;
                continue;
            }
            active_lines += 1;
            let effective_mpn = variant
                .and_then(|v| v.overrides.get(&item.refdes))
                .cloned()
                .unwrap_or_else(|| item.mpn.clone());

            let needed = item.qty.saturating_mul(boards);
            part_cost_usd += item.unit_price_usd.max(0.0) * (needed as f64);

            if item.feeder_fee_type == FeederFeeType::Extended {
                extended_mpns.insert(effective_mpn.clone());
            }

            if item.lifecycle == LifecycleState::Obsolete {
                score -= 25;
                risks.push(BomRiskFlag {
                    refdes: item.refdes.clone(),
                    mpn: effective_mpn.clone(),
                    kind: "OBSOLETE_PART".to_string(),
                    severity: "CRITICAL".to_string(),
                    message: "Component marked Obsolete; substitute MPN required".to_string(),
                });
            } else if item.lifecycle == LifecycleState::Nrnd {
                score -= 10;
                risks.push(BomRiskFlag {
                    refdes: item.refdes.clone(),
                    mpn: effective_mpn.clone(),
                    kind: "NRND_LIFECYCLE".to_string(),
                    severity: "WARNING".to_string(),
                    message: "Component is Not Recommended for New Designs".to_string(),
                });
            }

            if item.stock_qty < needed {
                score -= 20;
                risks.push(BomRiskFlag {
                    refdes: item.refdes.clone(),
                    mpn: effective_mpn.clone(),
                    kind: "LOW_STOCK".to_string(),
                    severity: "ERROR".to_string(),
                    message: format!("Need {needed} pcs across {boards} boards, stock={}", item.stock_qty),
                });
            }

            if item.alternate_mpns.is_empty() {
                score -= 5;
                risks.push(BomRiskFlag {
                    refdes: item.refdes.clone(),
                    mpn: effective_mpn,
                    kind: "SINGLE_SOURCE".to_string(),
                    severity: "INFO".to_string(),
                    message: "No second-source alternate MPN attached".to_string(),
                });
            }
        }

        let extended_feeder_fees_usd =
            (extended_mpns.len() as f64) * Self::EXTENDED_FEEDER_FEE_USD;
        let variant_name = variant
            .map(|v| v.name.clone())
            .unwrap_or_else(|| "DEFAULT".to_string());

        BomAnalysisReport {
            variant_name,
            board_count: boards,
            active_line_count: active_lines,
            dnp_excluded_count: dnp_excluded,
            total_part_cost_usd: (part_cost_usd * 100.0).round() / 100.0,
            extended_feeder_fees_usd,
            supply_readiness_score: score.clamp(0, 100) as u32,
            risks,
        }
    }
}
