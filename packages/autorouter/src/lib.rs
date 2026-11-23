//! Vajra-Dhīr EDA — Autorouter Orchestrator Bridge (`vd-autorouter`)
//!
//! Provides clean-room bridge between HW-IR and router engines:
//! 1. Synchronizes .kicad_pro and .kicad_dru rules directly from HW-IR.net_classes.
//! 2. Specctra DSN export and SES import.
//! 3. Fail-closed locked-copper SHA-256 integrity guard (trg_protect_locked_copper).

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AutorouterError {
    #[error("Locked copper integrity violation: entity {id} was mutated by router! Expected hash {expected}, got {actual}")]
    CopperLockViolation {
        id: String,
        expected: String,
        actual: String,
    },
    #[error("Locked copper entity {0} was deleted or dropped during routing!")]
    LockedEntityMissing(String),
    #[error("Invalid Specctra DSN/SES syntax: {0}")]
    SyntaxError(String),
    #[error("Router execution failure: {0}")]
    ExecutionFailure(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetClassRule {
    pub name: String,
    pub clearance_nm: i64,
    pub track_width_nm: i64,
    pub via_dia_nm: i64,
    pub via_drill_nm: i64,
    pub diff_pair_width_nm: Option<i64>,
    pub diff_pair_gap_nm: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopperEntity {
    pub id: String,
    pub net_name: String,
    pub layer: String,
    pub start_nm: (i64, i64),
    pub end_nm: (i64, i64),
    pub width_nm: i64,
    pub is_via: bool,
    pub via_drill_nm: i64,
    pub locked: bool,
}

impl CopperEntity {
    pub fn compute_sha256(&self) -> String {
        let mut hasher = Sha256::new();
        hasher.update(self.id.as_bytes());
        hasher.update(self.net_name.as_bytes());
        hasher.update(self.layer.as_bytes());
        hasher.update(self.start_nm.0.to_le_bytes());
        hasher.update(self.start_nm.1.to_le_bytes());
        hasher.update(self.end_nm.0.to_le_bytes());
        hasher.update(self.end_nm.1.to_le_bytes());
        hasher.update(self.width_nm.to_le_bytes());
        hasher.update([self.is_via as u8]);
        hasher.update(self.via_drill_nm.to_le_bytes());
        format!("{:x}", hasher.finalize())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LockedCopperSnapshot {
    pub hashes: HashMap<String, String>, // entity_id -> sha256
}

impl LockedCopperSnapshot {
    pub fn create(entities: &[CopperEntity]) -> Self {
        let mut hashes = HashMap::new();
        for entity in entities {
            if entity.locked {
                hashes.insert(entity.id.clone(), entity.compute_sha256());
            }
        }
        Self { hashes }
    }

    pub fn verify_integrity(&self, post_routing_entities: &[CopperEntity]) -> Result<(), AutorouterError> {
        let mut current_hashes = HashMap::new();
        for entity in post_routing_entities {
            if entity.locked {
                current_hashes.insert(entity.id.clone(), entity.compute_sha256());
            }
        }

        for (id, expected_hash) in &self.hashes {
            match current_hashes.get(id) {
                Some(actual_hash) => {
                    if actual_hash != expected_hash {
                        return Err(AutorouterError::CopperLockViolation {
                            id: id.clone(),
                            expected: expected_hash.clone(),
                            actual: actual_hash.clone(),
                        });
                    }
                }
                None => {
                    return Err(AutorouterError::LockedEntityMissing(id.clone()));
                }
            }
        }

        Ok(())
    }
}

pub struct AutorouterOrchestrator;

impl AutorouterOrchestrator {
    /// Generates KiCad 10 custom design rules (.kicad_dru) from net classes
    pub fn generate_kicad_dru(net_classes: &[NetClassRule]) -> String {
        let mut out = String::new();
        out.push_str("# Vajra-Dhīr EDA KiCad 10 Design Rules (.kicad_dru)\n");
        out.push_str("# Auto-generated from HW-IR net_classes\n\n");

        for nc in net_classes {
            let cl_mm = nc.clearance_nm as f64 / 1_000_000.0;
            let tw_mm = nc.track_width_nm as f64 / 1_000_000.0;
            out.push_str(&format!(
                "(rule \"NetClass_{}_Clearance\"\n  (constraint clearance (min {:.3}mm))\n  (condition \"A.NetClass == '{}'\"))\n\n",
                nc.name, cl_mm, nc.name
            ));
            out.push_str(&format!(
                "(rule \"NetClass_{}_TrackWidth\"\n  (constraint track_width (min {:.3}mm))\n  (condition \"A.NetClass == '{}'\"))\n\n",
                nc.name, tw_mm, nc.name
            ));
        }

        out
    }

    /// Generates Specctra DSN export string for external autorouters (KiCadRoutingTools, fastroute, Freerouting)
    pub fn export_specctra_dsn(
        board_name: &str,
        outline_pts_nm: &[(i64, i64)],
        net_classes: &[NetClassRule],
        copper_entities: &[CopperEntity],
    ) -> String {
        let mut out = String::new();
        out.push_str(&format!("(pcb \"{}\"\n", board_name));
        out.push_str("  (parser (string_quote \") (space_in_quoted_tokens on))\n");
        out.push_str("  (resolution um 1000)\n");
        out.push_str("  (unit um)\n");

        // Structure
        out.push_str("  (structure\n");
        out.push_str("    (layer F.Cu (type signal))\n");
        out.push_str("    (layer B.Cu (type signal))\n");
        out.push_str("    (boundary\n      (path pcb 0");
        for pt in outline_pts_nm {
            let x_um = pt.0 / 1000;
            let y_um = pt.1 / 1000;
            out.push_str(&format!(" {} {}", x_um, y_um));
        }
        out.push_str(")\n    )\n");

        // Rules
        if let Some(default_nc) = net_classes.first() {
            out.push_str(&format!(
                "    (rule (width {}) (clearance {}))\n",
                default_nc.track_width_nm / 1000,
                default_nc.clearance_nm / 1000
            ));
        }
        out.push_str("  )\n"); // End structure

        // Wiring (existing traces and locked copper)
        out.push_str("  (wiring\n");
        for entity in copper_entities {
            let x1_um = entity.start_nm.0 / 1000;
            let y1_um = entity.start_nm.1 / 1000;
            let x2_um = entity.end_nm.0 / 1000;
            let y2_um = entity.end_nm.1 / 1000;
            let width_um = entity.width_nm / 1000;
            let lock_tag = if entity.locked { " (type fix)" } else { "" };
            out.push_str(&format!(
                "    (wire (path {} {} {} {} {} {}) (net \"{}\"){})\n",
                entity.layer, width_um, x1_um, y1_um, x2_um, y2_um, entity.net_name, lock_tag
            ));
        }
        out.push_str("  )\n"); // End wiring

        out.push_str(")\n"); // End pcb
        out
    }

    /// Parses a Specctra SES session file and reconstructs routed wire segments
    pub fn import_specctra_ses(ses_content: &str) -> Result<Vec<CopperEntity>, AutorouterError> {
        let mut routed_entities = Vec::new();
        let mut current_net = String::new();

        for line in ses_content.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("(net \"") || trimmed.starts_with("(net ") {
                if let Some(start) = trimmed.find('"') {
                    if let Some(end) = trimmed[start + 1..].find('"') {
                        current_net = trimmed[start + 1..start + 1 + end].to_string();
                    }
                }
            } else if trimmed.starts_with("(path ") {
                let parts: Vec<&str> = trimmed
                    .trim_matches(|c| c == '(' || c == ')')
                    .split_whitespace()
                    .collect();

                // Format: path <layer> <width_um> <x1_um> <y1_um> <x2_um> <y2_um>
                if parts.len() >= 6 && parts[0] == "path" {
                    let layer = parts[1].to_string();
                    let width_um: i64 = parts[2].parse().unwrap_or(250);
                    let x1_um: i64 = parts[3].parse().unwrap_or(0);
                    let y1_um: i64 = parts[4].parse().unwrap_or(0);
                    let x2_um: i64 = parts[5].parse().unwrap_or(0);
                    let y2_um: i64 = parts[6].parse().unwrap_or(0);

                    routed_entities.push(CopperEntity {
                        id: uuid::Uuid::new_v4().to_string(),
                        net_name: current_net.clone(),
                        layer,
                        start_nm: (x1_um * 1000, y1_um * 1000),
                        end_nm: (x2_um * 1000, y2_um * 1000),
                        width_nm: width_um * 1000,
                        is_via: false,
                        via_drill_nm: 0,
                        locked: false,
                    });
                }
            }
        }

        Ok(routed_entities)
    }
}
