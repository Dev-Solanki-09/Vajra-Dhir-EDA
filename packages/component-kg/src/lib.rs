//! # Vajra-Dhīr EDA — Analytical Component Knowledge Graph
//!
//! Provides non-linear MLCC DC-bias derating calculation, inductor saturation curves,
//! JLCPCB/LCSC Basic vs Extended parts optimizer, and cryptographic datasheet evidence citations.

pub mod catalog;
pub mod datasheet_evidence;
pub mod inductor_saturation;
pub mod mlcc_derating;

pub use catalog::{ComponentCatalog, JlcCatalogPart, JlcPartTier};
pub use datasheet_evidence::DatasheetFactCitation;
pub use inductor_saturation::{InductorOperatingResult, InductorSaturationEngine, InductorSpec};
pub use mlcc_derating::{CaseSize, DielectricType, MlccDeratingEngine, MlccDeratingResult, MlccSpec};
