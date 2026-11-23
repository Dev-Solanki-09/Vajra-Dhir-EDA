use crate::firewall::{DlpClass, DlpError, DlpFirewall};
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelTier {
    TierA,     // Complex reasoning / multi-page schematic synthesis
    TierB,     // Fast local/hosted syntax repair, ERC/DRC lint fixes
    TierLocal, // 100% offline local Ollama/vLLM instance
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetConfig {
    pub session_cost_cap_usd: f64,
    pub per_turn_cost_cap_usd: f64,
    pub require_human_confirmation_above_usd: f64,
    pub tier_a_input_per_million: f64,
    pub tier_a_output_per_million: f64,
    pub tier_b_input_per_million: f64,
    pub tier_b_output_per_million: f64,
}

impl Default for BudgetConfig {
    fn default() -> Self {
        Self {
            session_cost_cap_usd: 5.00,
            per_turn_cost_cap_usd: 0.50,
            require_human_confirmation_above_usd: 2.50,
            tier_a_input_per_million: 3.00,
            tier_a_output_per_million: 15.00,
            tier_b_input_per_million: 0.50,
            tier_b_output_per_million: 1.50,
        }
    }
}

#[derive(Debug, Error)]
pub enum BudgetError {
    #[error("Session budget cap exceeded: current ${0:.4} >= limit ${1:.4}")]
    CapExceeded(f64, f64),

    #[error("Per-turn cost cap exceeded: turn cost ${0:.4} > limit ${1:.4}")]
    TurnCapExceeded(f64, f64),
}

#[derive(Debug, Clone, PartialEq)]
pub enum SpendStatus {
    Normal,
    RequiresHumanApproval,
    Warning80Percent,
}

#[derive(Debug, Clone)]
pub struct SpendUpdate {
    pub turn_cost_usd: f64,
    pub total_spent_usd: f64,
    pub status: SpendStatus,
}

pub struct BudgetTracker {
    config: BudgetConfig,
    total_spent_usd: f64,
}

impl BudgetTracker {
    pub fn new(config: BudgetConfig) -> Self {
        Self {
            config,
            total_spent_usd: 0.0,
        }
    }

    pub fn total_spent(&self) -> f64 {
        self.total_spent_usd
    }

    /// Calculate cost and verify against circuit breaker caps.
    pub fn record_turn(
        &mut self,
        tier: ModelTier,
        input_tokens: u64,
        output_tokens: u64,
    ) -> Result<SpendUpdate, BudgetError> {
        let (in_rate, out_rate) = match tier {
            ModelTier::TierA => (
                self.config.tier_a_input_per_million,
                self.config.tier_a_output_per_million,
            ),
            ModelTier::TierB => (
                self.config.tier_b_input_per_million,
                self.config.tier_b_output_per_million,
            ),
            ModelTier::TierLocal => (0.0, 0.0),
        };

        let turn_cost = (input_tokens as f64 / 1_000_000.0) * in_rate
            + (output_tokens as f64 / 1_000_000.0) * out_rate;

        if turn_cost > self.config.per_turn_cost_cap_usd {
            return Err(BudgetError::TurnCapExceeded(
                turn_cost,
                self.config.per_turn_cost_cap_usd,
            ));
        }

        let new_total = self.total_spent_usd + turn_cost;
        if new_total > self.config.session_cost_cap_usd {
            return Err(BudgetError::CapExceeded(
                new_total,
                self.config.session_cost_cap_usd,
            ));
        }

        self.total_spent_usd = new_total;

        let status = if self.total_spent_usd >= self.config.require_human_confirmation_above_usd {
            SpendStatus::RequiresHumanApproval
        } else if self.total_spent_usd >= (self.config.session_cost_cap_usd * 0.8) {
            SpendStatus::Warning80Percent
        } else {
            SpendStatus::Normal
        };

        Ok(SpendUpdate {
            turn_cost_usd: turn_cost,
            total_spent_usd: self.total_spent_usd,
            status,
        })
    }
}

#[derive(Debug, Error)]
pub enum RouterError {
    #[error("DLP policy error: {0}")]
    Dlp(#[from] DlpError),

    #[error("Budget circuit breaker tripped: {0}")]
    Budget(#[from] BudgetError),
}

pub struct ModelRouter {
    tracker: BudgetTracker,
}

impl ModelRouter {
    pub fn new(config: BudgetConfig) -> Self {
        Self {
            tracker: BudgetTracker::new(config),
        }
    }

    /// Route a model inference request through DLP firewall and budget circuit breakers.
    pub fn route(
        &mut self,
        dlp: DlpClass,
        preferred_tier: ModelTier,
        target_endpoint: &str,
        prompt: &str,
    ) -> Result<(String, ModelTier), RouterError> {
        // 1. DLP Firewall egress verification
        DlpFirewall::check_egress(dlp, target_endpoint)?;

        // If NDA_AIRGAPPED, automatically downgrade/pin to local tier
        let active_tier = match dlp {
            DlpClass::NdaAirgapped => ModelTier::TierLocal,
            _ => preferred_tier,
        };

        // 2. DLP Prompt Sanitization
        let sanitized_prompt = DlpFirewall::sanitize_text(prompt);

        Ok((sanitized_prompt, active_tier))
    }

    pub fn tracker_mut(&mut self) -> &mut BudgetTracker {
        &mut self.tracker
    }
}
