//! # Vajra-Dhīr EDA — Nine Gates Verification Pipeline
//!
//! Exposes the 9-Gate deterministic hardware signoff state machine,
//! sequential precondition checking, evidence hashing, and isolated
//! Dual-Context Adversarial Auditor.

pub mod auditor;
pub mod gates;
pub mod pipeline;

pub use auditor::{AuditorError, AuditorInputContext, AuditorVerdict, DualContextAuditor};
pub use gates::{GateStage, GateVerdict};
pub use pipeline::{GatePipelineError, NineGatePipeline};
