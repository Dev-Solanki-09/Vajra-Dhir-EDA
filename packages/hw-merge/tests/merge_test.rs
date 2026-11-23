use std::collections::BTreeMap;
use vd_ir::model::*;
use vd_merge::{ConflictKind, HwMergeDriver};

fn make_component(
    id: &str,
    refdes: &str,
    x_nm: i64,
    y_nm: i64,
    w_nm: i64,
    h_nm: i64,
    locked: bool,
    prov: Provenance,
) -> HardwareEntity {
    HardwareEntity::Component {
        meta: HardwareEntityMeta {
            id: id.into(),
            board_id: "board-1".into(),
            lock: LockGuard {
                locked,
                provenance: prov,
                lock_owner: if locked { Some("human:alice".into()) } else { None },
                lock_reason: None,
            },
            rev_lamport: 1,
            deleted: false,
        },
        refdes: refdes.into(),
        value_str: "10k".into(),
        mpn: None,
        package_name: "0402".into(),
        footprint_ref: "R_0402".into(),
        symbol_ref: "Device:R".into(),
        functional_group: "pullup".into(),
        x_nm,
        y_nm,
        rot_mdeg: 0,
        side: "top".into(),
        courtyard_w_nm: w_nm,
        courtyard_h_nm: h_nm,
        height_nm: 400_000,
        power_diss_mw: 1.0,
        params: BTreeMap::new(),
        datasheet_citation_id: None,
    }
}

#[test]
fn test_rule1_human_lock_precedence() {
    let base_u1 = make_component("comp-u1", "U1", 10_000_000, 10_000_000, 4_000_000, 4_000_000, false, Provenance::Agent);
    let ours_u1 = make_component("comp-u1", "U1", 10_000_000, 10_000_000, 4_000_000, 4_000_000, true, Provenance::Human);
    let theirs_u1 = make_component("comp-u1", "U1", 20_000_000, 20_000_000, 4_000_000, 4_000_000, false, Provenance::Agent);

    let res = HwMergeDriver::merge_3way(&[base_u1], &[ours_u1.clone()], &[theirs_u1]).expect("Merge failed");

    assert!(res.is_clean(), "Human-locked component should win without conflict");
    assert_eq!(res.merged_entities.len(), 1);

    if let HardwareEntity::Component { x_nm, meta, .. } = &res.merged_entities[0] {
        assert_eq!(*x_nm, 10_000_000, "OURS position must be preserved");
        assert!(meta.lock.locked, "Lock must be preserved");
    } else {
        panic!("Expected Component entity");
    }
}

#[test]
fn test_rule2_independent_changes_merge_cleanly() {
    let base_r1 = make_component("comp-r1", "R1", 10_000_000, 10_000_000, 2_000_000, 2_000_000, false, Provenance::Human);
    let base_c1 = make_component("comp-c1", "C1", 40_000_000, 40_000_000, 2_000_000, 2_000_000, false, Provenance::Human);

    // Ours moves R1
    let ours_r1 = make_component("comp-r1", "R1", 15_000_000, 10_000_000, 2_000_000, 2_000_000, false, Provenance::Human);
    let ours = vec![ours_r1, base_c1.clone()];

    // Theirs moves C1
    let theirs_c1 = make_component("comp-c1", "C1", 45_000_000, 40_000_000, 2_000_000, 2_000_000, false, Provenance::Agent);
    let theirs = vec![base_r1.clone(), theirs_c1];

    let base = vec![base_r1, base_c1];

    let res = HwMergeDriver::merge_3way(&base, &ours, &theirs).expect("Merge failed");

    assert!(res.is_clean(), "Independent changes should merge cleanly");
    assert_eq!(res.merged_entities.len(), 2);

    let r1_merged = res.merged_entities.iter().find(|e| match e {
        HardwareEntity::Component { refdes, .. } => refdes == "R1",
        _ => false,
    }).unwrap();

    let c1_merged = res.merged_entities.iter().find(|e| match e {
        HardwareEntity::Component { refdes, .. } => refdes == "C1",
        _ => false,
    }).unwrap();

    if let HardwareEntity::Component { x_nm, .. } = r1_merged {
        assert_eq!(*x_nm, 15_000_000);
    }
    if let HardwareEntity::Component { x_nm, .. } = c1_merged {
        assert_eq!(*x_nm, 45_000_000);
    }
}

#[test]
fn test_rule3_spatial_courtyard_collision() {
    let base_r1 = make_component("comp-r1", "R1", 10_000_000, 10_000_000, 4_000_000, 4_000_000, false, Provenance::Human);
    let base_r2 = make_component("comp-r2", "R2", 50_000_000, 50_000_000, 4_000_000, 4_000_000, false, Provenance::Human);

    // Ours moves R1 to (25mm, 25mm)
    let ours_r1 = make_component("comp-r1", "R1", 25_000_000, 25_000_000, 4_000_000, 4_000_000, false, Provenance::Human);
    let ours = vec![ours_r1, base_r2.clone()];

    // Theirs moves R2 to (26mm, 25mm) -> With 4mm width, distance is 1mm < 4mm (collision!)
    let theirs_r2 = make_component("comp-r2", "R2", 26_000_000, 25_000_000, 4_000_000, 4_000_000, false, Provenance::Agent);
    let theirs = vec![base_r1.clone(), theirs_r2];

    let base = vec![base_r1, base_r2];

    let res = HwMergeDriver::merge_3way(&base, &ours, &theirs).expect("Merge failed");

    assert!(!res.is_clean(), "Spatial overlap must produce conflict");
    assert_eq!(res.conflicts.len(), 1);
    assert_eq!(res.conflicts[0].kind, ConflictKind::SpatialCourtyardCollision);
}

#[test]
fn test_concurrent_conflicting_edits() {
    let base_r1 = make_component("comp-r1", "R1", 10_000_000, 10_000_000, 2_000_000, 2_000_000, false, Provenance::Agent);

    // Ours moves R1 to (15mm, 10mm)
    let ours_r1 = make_component("comp-r1", "R1", 15_000_000, 10_000_000, 2_000_000, 2_000_000, false, Provenance::Agent);

    // Theirs moves R1 to (20mm, 10mm)
    let theirs_r1 = make_component("comp-r1", "R1", 20_000_000, 10_000_000, 2_000_000, 2_000_000, false, Provenance::Agent);

    let res = HwMergeDriver::merge_3way(&[base_r1], &[ours_r1], &[theirs_r1]).expect("Merge failed");

    assert!(!res.is_clean(), "Concurrent edits without lock must produce conflict");
    assert_eq!(res.conflicts.len(), 1);
    assert_eq!(res.conflicts[0].kind, ConflictKind::ConcurrentModification);
}
