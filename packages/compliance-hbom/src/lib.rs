//! Vajra-Dhīr EDA — Compliance & CycloneDX 1.6 HBOM Engine (`vd-compliance-hbom`)
//!
//! Provides V-Model requirements traceability and standardized CycloneDX 1.6 Hardware BOM:
//! - StrictDoc Requirements Traceability: Binds Requirement UIDs (REQ-*) to schematic blocks,
//!   deterministic simulation assertions, and SHA-256 evidence tokens.
//! - CycloneDX 1.6 HBOM: Generates production Hardware Bill of Materials with RoHS 3,
//!   REACH SVHC, Halogen-Free, 3TG Conflict Minerals, and component lifecycle (Active/NRND/EOL).

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum HbomError {
    #[error("Requirement {0} failed verification: {1}")]
    UnsatisfiedRequirement(String, String),
    #[error("Non-compliant component detected: {0} ({1})")]
    NonCompliantComponent(String, String),
    #[error("Serialization error: {0}")]
    SerializationError(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequirementBinding {
    pub req_uid: String,
    pub title: String,
    pub verification_method: String,
    pub bound_refdes: Vec<String>,
    pub passed: bool,
    pub evidence_sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HbomComponent {
    pub refdes: String,
    pub mpn: String,
    pub manufacturer: String,
    pub description: String,
    pub package: String,
    pub rohs_compliant: bool,
    pub reach_svhc_free: bool,
    pub halogen_free: bool,
    pub lifecycle_status: String, // "Active", "NRND", "EOL"
    pub conflict_minerals_3tg: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CycloneDxHbom {
    #[serde(rename = "bomFormat")]
    pub bom_format: String,
    #[serde(rename = "specVersion")]
    pub spec_version: String,
    #[serde(rename = "serialNumber")]
    pub serial_number: String,
    pub version: u32,
    pub metadata: HbomMetadata,
    pub components: Vec<CycloneDxComponent>,
    pub properties: Vec<HbomProperty>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HbomMetadata {
    pub timestamp: String,
    pub component: RootComponent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RootComponent {
    pub name: String,
    pub version: String,
    #[serde(rename = "type")]
    pub component_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CycloneDxComponent {
    #[serde(rename = "type")]
    pub component_type: String,
    pub name: String,
    pub version: String,
    pub purl: String,
    pub properties: Vec<HbomProperty>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HbomProperty {
    pub name: String,
    pub value: String,
}

pub struct HbomGenerator;

impl HbomGenerator {
    /// Audits all requirements and verifies 100% compliance
    pub fn audit_requirements(bindings: &[RequirementBinding]) -> Result<usize, HbomError> {
        for req in bindings {
            if !req.passed {
                return Err(HbomError::UnsatisfiedRequirement(
                    req.req_uid.clone(),
                    format!("Verification method {} failed", req.verification_method),
                ));
            }
        }
        Ok(bindings.len())
    }

    /// Generates CycloneDX 1.6 HBOM JSON document
    pub fn generate_cyclonedx_1_6(
        board_name: &str,
        board_version: &str,
        components: &[HbomComponent],
        requirements: &[RequirementBinding],
    ) -> Result<String, HbomError> {
        let mut cdx_components = Vec::new();

        for comp in components {
            let purl = format!("pkg:generic/{}@{}", comp.mpn.to_lowercase(), comp.manufacturer.to_lowercase());
            let properties = vec![
                HbomProperty { name: "refdes".into(), value: comp.refdes.clone() },
                HbomProperty { name: "package".into(), value: comp.package.clone() },
                HbomProperty { name: "rohs:compliant".into(), value: comp.rohs_compliant.to_string() },
                HbomProperty { name: "reach:svhc-free".into(), value: comp.reach_svhc_free.to_string() },
                HbomProperty { name: "halogen-free".into(), value: comp.halogen_free.to_string() },
                HbomProperty { name: "lifecycle:status".into(), value: comp.lifecycle_status.clone() },
                HbomProperty { name: "conflict-minerals:3tg".into(), value: comp.conflict_minerals_3tg.to_string() },
            ];

            cdx_components.push(CycloneDxComponent {
                component_type: "device".into(),
                name: comp.mpn.clone(),
                version: comp.package.clone(),
                purl,
                properties,
            });
        }

        let mut root_properties = Vec::new();
        for req in requirements {
            root_properties.push(HbomProperty {
                name: format!("traceability:{}", req.req_uid),
                value: format!("{}:{}:{}", req.verification_method, req.passed, req.evidence_sha256),
            });
        }

        let hbom = CycloneDxHbom {
            bom_format: "CycloneDX".into(),
            spec_version: "1.6".into(),
            serial_number: format!("urn:uuid:{}", uuid::Uuid::now_v7()),
            version: 1,
            metadata: HbomMetadata {
                timestamp: "2026-11-24T01:50:00Z".into(),
                component: RootComponent {
                    name: board_name.to_string(),
                    version: board_version.to_string(),
                    component_type: "device".into(),
                },
            },
            components: cdx_components,
            properties: root_properties,
        };

        serde_json::to_string_pretty(&hbom).map_err(|e| HbomError::SerializationError(e.to_string()))
    }
}
