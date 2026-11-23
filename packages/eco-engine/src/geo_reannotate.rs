use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use vd_ir::model::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefDesRenameRecord {
    pub component_id: String,
    pub old_refdes: String,
    pub new_refdes: String,
    pub side: String,
    pub x_nm: Nm,
    pub y_nm: Nm,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeoReannotationPlan {
    pub total_components: usize,
    pub renamed_count: usize,
    pub locked_skipped_count: usize,
    pub renames: Vec<RefDesRenameRecord>,
    pub generated_ops: Vec<HardwarePatchOp>,
}

pub struct GeographicalReannotator;

impl GeographicalReannotator {
    /// Extracts prefix from a RefDes, e.g. "R12" -> "R", "C104" -> "C", "U_PD1" -> "U_PD".
    pub fn extract_prefix(refdes: &str) -> String {
        let prefix_chars: String = refdes
            .chars()
            .take_while(|c| !c.is_ascii_digit())
            .collect();

        if prefix_chars.is_empty() {
            "COMP".into()
        } else {
            prefix_chars
        }
    }

    /// Sorts components geographically and generates deterministic 1-based sequential RefDes numbering.
    /// Order: Top side first, then Bottom side. Top-to-bottom (Y descending), left-to-right (X ascending).
    pub fn generate_reannotation_plan(
        components: &[HardwareEntity],
    ) -> GeoReannotationPlan {
        let mut comp_list = Vec::new();
        let mut locked_skipped_count = 0;

        for entity in components {
            if let HardwareEntity::Component {
                meta,
                refdes,
                side,
                x_nm,
                y_nm,
                ..
            } = entity
            {
                if meta.lock.locked {
                    locked_skipped_count += 1;
                } else {
                    comp_list.push((
                        meta.id.clone(),
                        refdes.clone(),
                        side.clone(),
                        *x_nm,
                        *y_nm,
                        Self::extract_prefix(refdes),
                    ));
                }
            }
        }

        // Sort: Top side first, then Y descending (top of board), then X ascending (left to right)
        comp_list.sort_by(|a, b| {
            let side_order_a = if a.2.to_lowercase() == "top" { 0 } else { 1 };
            let side_order_b = if b.2.to_lowercase() == "top" { 0 } else { 1 };

            side_order_a
                .cmp(&side_order_b)
                .then(b.4.cmp(&a.4)) // Y descending
                .then(a.3.cmp(&b.3)) // X ascending
        });

        // Group by prefix and assign sequential numbers
        let mut prefix_counters: BTreeMap<String, usize> = BTreeMap::new();
        let mut renames = Vec::new();
        let mut generated_ops = Vec::new();

        for (id, old_refdes, side, x_nm, y_nm, prefix) in comp_list {
            let counter = prefix_counters.entry(prefix.clone()).or_insert(1);
            let new_refdes = format!("{}{}", prefix, counter);
            *counter += 1;

            if old_refdes != new_refdes {
                renames.push(RefDesRenameRecord {
                    component_id: id.clone(),
                    old_refdes: old_refdes.clone(),
                    new_refdes: new_refdes.clone(),
                    side,
                    x_nm,
                    y_nm,
                });

                // Generate patch operation updating entity refdes
                // Finding original entity to clone and update
                if let Some(orig) = components.iter().find(|e| match e {
                    HardwareEntity::Component { meta, .. } => meta.id == id,
                    _ => false,
                }) {
                    let mut updated = orig.clone();
                    if let HardwareEntity::Component { ref mut refdes, ref mut meta, .. } = updated {
                        *refdes = new_refdes;
                        meta.rev_lamport += 1;
                    }
                    generated_ops.push(HardwarePatchOp::UpsertEntity { entity: updated });
                }
            }
        }

        GeoReannotationPlan {
            total_components: components.len(),
            renamed_count: renames.len(),
            locked_skipped_count,
            renames,
            generated_ops,
        }
    }
}
