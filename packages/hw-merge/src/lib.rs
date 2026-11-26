use std::collections::{BTreeMap, BTreeSet};
use thiserror::Error;
use vd_ir::model::*;

#[derive(Debug, Error)]
pub enum MergeError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Merge conflict: {0}")]
    Conflict(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConflictKind {
    HumanLockViolation,
    ConcurrentModification,
    SpatialCourtyardCollision,
    NetBindingConflict,
    DeleteModifyConflict,
}

#[derive(Debug, Clone, PartialEq)]
pub struct MergeConflict {
    pub entity_id: EntityId,
    pub kind: ConflictKind,
    pub description: String,
    pub ours_snippet: Option<String>,
    pub theirs_snippet: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct MergeResult {
    pub merged_entities: Vec<HardwareEntity>,
    pub conflicts: Vec<MergeConflict>,
}

impl MergeResult {
    pub fn is_clean(&self) -> bool {
        self.conflicts.is_empty()
    }
}

pub struct HwMergeDriver;

impl HwMergeDriver {
    /// Perform a deterministic 3-way merge of HardwareEntity sets.
    ///
    /// Rules:
    /// 1. Human-Lock Precedence: If OURS is human-locked and THEIRS modified it, OURS wins.
    /// 2. Independent Changes: Changes to disjoint entities merge cleanly.
    /// 3. Spatial Courtyard Collision: Even disjoint edits fail if their physical courtyards overlap.
    /// 4. Concurrent Conflicts: Conflicting edits to the same entity produce explicit conflicts.
    pub fn merge_3way(
        base: &[HardwareEntity],
        ours: &[HardwareEntity],
        theirs: &[HardwareEntity],
    ) -> Result<MergeResult, MergeError> {
        let base_map: BTreeMap<EntityId, HardwareEntity> =
            base.iter().map(|e| (get_entity_id(e), e.clone())).collect();
        let ours_map: BTreeMap<EntityId, HardwareEntity> =
            ours.iter().map(|e| (get_entity_id(e), e.clone())).collect();
        let theirs_map: BTreeMap<EntityId, HardwareEntity> =
            theirs.iter().map(|e| (get_entity_id(e), e.clone())).collect();

        let mut all_ids: BTreeSet<EntityId> = BTreeSet::new();
        all_ids.extend(base_map.keys().cloned());
        all_ids.extend(ours_map.keys().cloned());
        all_ids.extend(theirs_map.keys().cloned());

        let mut merged_map: BTreeMap<EntityId, HardwareEntity> = BTreeMap::new();
        let mut conflicts: Vec<MergeConflict> = Vec::new();

        for id in all_ids {
            let b = base_map.get(&id);
            let o = ours_map.get(&id);
            let t = theirs_map.get(&id);

            match (b, o, t) {
                // Unchanged in both
                (Some(_), Some(o_ent), Some(t_ent)) if o_ent == t_ent => {
                    merged_map.insert(id, o_ent.clone());
                }
                // Only changed in OURS
                (Some(b_ent), Some(o_ent), Some(t_ent)) if t_ent == b_ent && o_ent != b_ent => {
                    merged_map.insert(id, o_ent.clone());
                }
                // Only changed in THEIRS
                (Some(b_ent), Some(o_ent), Some(t_ent)) if o_ent == b_ent && t_ent != b_ent => {
                    // Check Rule 1: Human-Lock Precedence
                    let o_meta = get_entity_meta(o_ent);
                    if o_meta.lock.locked && o_meta.lock.provenance == Provenance::Human {
                        // OURS is locked by human; OURS wins unconditionally!
                        merged_map.insert(id, o_ent.clone());
                    } else {
                        merged_map.insert(id, t_ent.clone());
                    }
                }
                // Changed in BOTH
                (Some(_), Some(o_ent), Some(t_ent)) => {
                    let o_meta = get_entity_meta(o_ent);
                    let t_meta = get_entity_meta(t_ent);

                    if o_meta.lock.locked && o_meta.lock.provenance == Provenance::Human {
                        // Human lock in OURS overrides THEIRS
                        merged_map.insert(id, o_ent.clone());
                    } else if t_meta.lock.locked && t_meta.lock.provenance == Provenance::Human {
                        // Human lock in THEIRS overrides unlocked OURS
                        merged_map.insert(id, t_ent.clone());
                    } else {
                        // True concurrent modification conflict
                        conflicts.push(MergeConflict {
                            entity_id: id.clone(),
                            kind: ConflictKind::ConcurrentModification,
                            description: format!("Entity {} modified concurrently in both branches", id),
                            ours_snippet: Some(serde_json::to_string(o_ent)?),
                            theirs_snippet: Some(serde_json::to_string(t_ent)?),
                        });
                    }
                }
                // Added in OURS only
                (None, Some(o_ent), None) => {
                    merged_map.insert(id, o_ent.clone());
                }
                // Added in THEIRS only
                (None, None, Some(t_ent)) => {
                    merged_map.insert(id, t_ent.clone());
                }
                // Added in BOTH
                (None, Some(o_ent), Some(t_ent)) => {
                    if o_ent == t_ent {
                        merged_map.insert(id, o_ent.clone());
                    } else {
                        conflicts.push(MergeConflict {
                            entity_id: id.clone(),
                            kind: ConflictKind::ConcurrentModification,
                            description: format!("Entity {} added with different definitions in both branches", id),
                            ours_snippet: Some(serde_json::to_string(o_ent)?),
                            theirs_snippet: Some(serde_json::to_string(t_ent)?),
                        });
                    }
                }
                // Deleted in OURS, unchanged in THEIRS
                (Some(b_ent), None, Some(t_ent)) if t_ent == b_ent => {
                    // Clean delete
                }
                // Deleted in THEIRS, unchanged in OURS
                (Some(b_ent), Some(o_ent), None) if o_ent == b_ent => {
                    // Check if human locked in OURS
                    let o_meta = get_entity_meta(o_ent);
                    if o_meta.lock.locked && o_meta.lock.provenance == Provenance::Human {
                        merged_map.insert(id, o_ent.clone());
                    }
                    // Else clean delete
                }
                // Delete vs Modify
                (Some(_), Some(o_ent), None) => {
                    conflicts.push(MergeConflict {
                        entity_id: id.clone(),
                        kind: ConflictKind::DeleteModifyConflict,
                        description: format!("Entity {} modified in OURS but deleted in THEIRS", id),
                        ours_snippet: Some(serde_json::to_string(o_ent)?),
                        theirs_snippet: None,
                    });
                }
                (Some(_), None, Some(t_ent)) => {
                    conflicts.push(MergeConflict {
                        entity_id: id.clone(),
                        kind: ConflictKind::DeleteModifyConflict,
                        description: format!("Entity {} deleted in OURS but modified in THEIRS", id),
                        ours_snippet: None,
                        theirs_snippet: Some(serde_json::to_string(t_ent)?),
                    });
                }
                // Deleted in both
                (Some(_), None, None) => {}
                (None, None, None) => {}
            }
        }

        // Rule 3: Spatial Courtyard Collision Check for components
        let mut components: Vec<&HardwareEntity> = Vec::new();
        for ent in merged_map.values() {
            if matches!(ent, HardwareEntity::Component { meta, .. } if !meta.deleted) {
                components.push(ent);
            }
        }

        for i in 0..components.len() {
            for j in (i + 1)..components.len() {
                if let (
                    HardwareEntity::Component {
                        meta: meta_a,
                        refdes: refdes_a,
                        x_nm: x_a,
                        y_nm: y_a,
                        rot_mdeg: rot_a,
                        side: side_a,
                        courtyard_w_nm: cw_a,
                        courtyard_h_nm: ch_a,
                        ..
                    },
                    HardwareEntity::Component {
                        meta: meta_b,
                        refdes: refdes_b,
                        x_nm: x_b,
                        y_nm: y_b,
                        rot_mdeg: rot_b,
                        side: side_b,
                        courtyard_w_nm: cw_b,
                        courtyard_h_nm: ch_b,
                        ..
                    },
                ) = (components[i], components[j])
                {
                    if meta_a.board_id == meta_b.board_id && side_a == side_b {
                        if check_courtyard_overlap(
                            *x_a, *y_a, *cw_a, *ch_a, *rot_a,
                            *x_b, *y_b, *cw_b, *ch_b, *rot_b,
                        ) {
                            conflicts.push(MergeConflict {
                                entity_id: meta_a.id.clone(),
                                kind: ConflictKind::SpatialCourtyardCollision,
                                description: format!(
                                    "SPATIAL_COURTYARD_COLLISION: Component {} ({}) and Component {} ({}) overlap on {} side",
                                    refdes_a, meta_a.id, refdes_b, meta_b.id, side_a
                                ),
                                ours_snippet: Some(format!("RefDes: {}, Center: ({}, {})", refdes_a, x_a, y_a)),
                                theirs_snippet: Some(format!("RefDes: {}, Center: ({}, {})", refdes_b, x_b, y_b)),
                            });
                        }
                    }
                }
            }
        }

        let merged_entities: Vec<HardwareEntity> = merged_map.into_values().collect();
        Ok(MergeResult {
            merged_entities,
            conflicts,
        })
    }
}

pub fn get_entity_id(entity: &HardwareEntity) -> EntityId {
    get_entity_meta(entity).id.clone()
}

pub fn get_entity_meta(entity: &HardwareEntity) -> &HardwareEntityMeta {
    match entity {
        HardwareEntity::Component { meta, .. } => meta,
        HardwareEntity::Net { meta, .. } => meta,
        HardwareEntity::Trace { meta, .. } => meta,
        HardwareEntity::Via { meta, .. } => meta,
        HardwareEntity::CopperZone { meta, .. } => meta,
    }
}

#[allow(clippy::too_many_arguments)]
fn check_courtyard_overlap(
    x1: Nm, y1: Nm, w1: Nm, h1: Nm, rot1: Mdeg,
    x2: Nm, y2: Nm, w2: Nm, h2: Nm, rot2: Mdeg,
) -> bool {
    let (eff_w1, eff_h1) = if rot1 == 90000 || rot1 == 270000 { (h1, w1) } else { (w1, h1) };
    let (eff_w2, eff_h2) = if rot2 == 90000 || rot2 == 270000 { (h2, w2) } else { (w2, h2) };

    let dx = (x1 - x2).abs();
    let dy = (y1 - y2).abs();

    let min_dist_x = (eff_w1 + eff_w2) / 2;
    let min_dist_y = (eff_h1 + eff_h2) / 2;

    dx < min_dist_x && dy < min_dist_y
}
