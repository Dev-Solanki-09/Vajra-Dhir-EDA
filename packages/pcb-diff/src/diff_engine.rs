use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use vd_ir::model::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComponentChange {
    pub refdes: String,
    pub kind: ComponentChangeKind,
    pub details: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ComponentChangeKind {
    Added,
    Removed,
    Moved { dx_nm: Nm, dy_nm: Nm, drot_mdeg: i32 },
    FootprintChanged { old_fp: String, new_fp: String },
    ValueChanged { old_val: String, new_val: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayerDiffSummary {
    pub layer_name: String,
    pub added_features_count: usize,
    pub removed_features_count: usize,
    pub unchanged_features_count: usize,
    pub net_area_change_nm2: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PcbDiffReport {
    pub rev_a_label: String,
    pub rev_b_label: String,
    pub component_changes: Vec<ComponentChange>,
    pub layer_summaries: Vec<LayerDiffSummary>,
    pub svg_diff_markup: String,
}

pub struct PcbDiffEngine;

impl PcbDiffEngine {
    /// Computes full structural and visual difference between two revisions of a hardware design.
    pub fn compute_diff(
        rev_a_label: &str,
        rev_a_entities: &[HardwareEntity],
        rev_b_label: &str,
        rev_b_entities: &[HardwareEntity],
    ) -> PcbDiffReport {
        let mut comp_a_map: BTreeMap<String, &HardwareEntity> = BTreeMap::new();
        let mut comp_b_map: BTreeMap<String, &HardwareEntity> = BTreeMap::new();

        for e in rev_a_entities {
            if let HardwareEntity::Component { refdes, .. } = e {
                comp_a_map.insert(refdes.clone(), e);
            }
        }

        for e in rev_b_entities {
            if let HardwareEntity::Component { refdes, .. } = e {
                comp_b_map.insert(refdes.clone(), e);
            }
        }

        let mut comp_changes = Vec::new();

        // 1. Check for removed or modified components
        for (refdes, e_a) in &comp_a_map {
            match comp_b_map.get(refdes) {
                Some(e_b) => {
                    // Check moved or altered
                    if let (
                        HardwareEntity::Component { x_nm: xa, y_nm: ya, rot_mdeg: rota, footprint_ref: fpa, value_str: vala, .. },
                        HardwareEntity::Component { x_nm: xb, y_nm: yb, rot_mdeg: rotb, footprint_ref: fpb, value_str: valb, .. },
                    ) = (e_a, e_b)
                    {
                        if xa != xb || ya != yb || rota != rotb {
                            comp_changes.push(ComponentChange {
                                refdes: refdes.clone(),
                                kind: ComponentChangeKind::Moved {
                                    dx_nm: *xb - *xa,
                                    dy_nm: *yb - *ya,
                                    drot_mdeg: *rotb - *rota,
                                },
                                details: format!("Moved by ({:.2} mm, {:.2} mm)", (*xb - *xa) as f64 * 1e-6, (*yb - *ya) as f64 * 1e-6),
                            });
                        }
                        if fpa != fpb {
                            comp_changes.push(ComponentChange {
                                refdes: refdes.clone(),
                                kind: ComponentChangeKind::FootprintChanged {
                                    old_fp: fpa.clone(),
                                    new_fp: fpb.clone(),
                                },
                                details: format!("Footprint changed from {} to {}", fpa, fpb),
                            });
                        }
                        if vala != valb {
                            comp_changes.push(ComponentChange {
                                refdes: refdes.clone(),
                                kind: ComponentChangeKind::ValueChanged {
                                    old_val: vala.clone(),
                                    new_val: valb.clone(),
                                },
                                details: format!("Value changed from {} to {}", vala, valb),
                            });
                        }
                    }
                }
                None => {
                    comp_changes.push(ComponentChange {
                        refdes: refdes.clone(),
                        kind: ComponentChangeKind::Removed,
                        details: format!("Component {} was removed", refdes),
                    });
                }
            }
        }

        // 2. Check for added components
        for (refdes, _) in &comp_b_map {
            if !comp_a_map.contains_key(refdes) {
                comp_changes.push(ComponentChange {
                    refdes: refdes.clone(),
                    kind: ComponentChangeKind::Added,
                    details: format!("Component {} was added", refdes),
                });
            }
        }

        // 3. Layer diff summary (mock/sample metrics for F.Cu)
        let added_count = comp_changes.iter().filter(|c| c.kind == ComponentChangeKind::Added).count();
        let removed_count = comp_changes.iter().filter(|c| c.kind == ComponentChangeKind::Removed).count();
        let unchanged_count = comp_a_map.len().saturating_sub(removed_count);

        let layer_summaries = vec![LayerDiffSummary {
            layer_name: "F.Cu".into(),
            added_features_count: added_count,
            removed_features_count: removed_count,
            unchanged_features_count: unchanged_count,
            net_area_change_nm2: (added_count as i64 - removed_count as i64) * 2_000_000_000_000,
        }];

        // 4. Generate SVG Visual Diff
        let svg = Self::generate_svg_diff(rev_a_label, rev_b_label, &comp_changes);

        PcbDiffReport {
            rev_a_label: rev_a_label.to_string(),
            rev_b_label: rev_b_label.to_string(),
            component_changes: comp_changes,
            layer_summaries,
            svg_diff_markup: svg,
        }
    }

    fn generate_svg_diff(rev_a: &str, rev_b: &str, changes: &[ComponentChange]) -> String {
        let mut svg = String::from(r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="100%" height="100%" style="background:#0b0e14; font-family:sans-serif;">"#);
        svg.push_str(&format!(
            r#"<text x="20" y="30" fill="#94a3b8" font-size="14">Vajra-Dhīr Visual Diff: {} → {}</text>"#,
            rev_a, rev_b
        ));
        svg.push_str(r#"<g transform="translate(20, 60)">"#);
        svg.push_str(r#"<rect x="0" y="0" width="760" height="500" fill="#12161f" stroke="#222733" rx="8"/>"#);
        svg.push_str(r#"<text x="20" y="40" fill="#10B981" font-size="12">● Green: Added</text>"#);
        svg.push_str(r#"<text x="140" y="40" fill="#EF4444" font-size="12">● Red: Removed</text>"#);
        svg.push_str(r#"<text x="260" y="40" fill="#3B82F6" font-size="12">● Blue: Modified</text>"#);

        let mut y = 80;
        for c in changes.iter().take(10) {
            let color = match c.kind {
                ComponentChangeKind::Added => "#10B981",
                ComponentChangeKind::Removed => "#EF4444",
                _ => "#3B82F6",
            };
            svg.push_str(&format!(
                r#"<text x="20" y="{}" fill="{}" font-size="11">{}: {}</text>"#,
                y, color, c.refdes, c.details
            ));
            y += 24;
        }

        svg.push_str("</g></svg>");
        svg
    }
}
