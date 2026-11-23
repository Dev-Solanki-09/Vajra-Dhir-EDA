//! # Vajra-Dhīr EDA — Hardware Data Loss Prevention (DLP) & Model Router
//!
//! Enforces zero-egress containment for `NDA_AIRGAPPED` projects, sanitizes sensitive
//! API tokens and secrets, and trips automated circuit breakers when `budget.json` limits
//! are exceeded.

pub mod firewall;
pub mod router;

pub use firewall::{DlpClass, DlpError, DlpFirewall};
pub use router::{
    BudgetConfig, BudgetError, BudgetTracker, ModelRouter, ModelTier, RouterError,
    SpendStatus, SpendUpdate,
};
