//! # Vajra-Dhīr EDA — KiCad 10 Transcoder & 3-Channel Bridge
//!
//! Provides deterministic S-Expression parsing/generation for KiCad 10 schemas,
//! IPC bridge abstractions, and the 5-second SHA-256 echo suppression ring.

pub mod echo_ring;
pub mod kicad_sch;
pub mod sexpr;

pub use echo_ring::{EchoSuppressionRing, DEFAULT_SUPPRESSION_WINDOW};
pub use kicad_sch::{KiCadSchComponent, KiCadSchTranscoder};
pub use sexpr::{SExpr, SExprError};
