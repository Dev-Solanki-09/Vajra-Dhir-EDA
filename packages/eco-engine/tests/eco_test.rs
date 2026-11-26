use std::collections::BTreeMap;
use vd_eco_engine::*;
use vd_ir::model::*;

fn create_test_comp(id: &str, refdes: &str, x: Nm, y: Nm, side: &str, locked: bool) -> HardwareEntity {
    HardwareEntity::Component {
        meta: HardwareEntityMeta {
            id: id.to_string(),
            board_id: "board-1".into(),
            lock: LockGuard {
                locked,
                provenance: Provenance::Human,
                lock_owner: None,
                lock_reason: None,
            },
            rev_lamport: 1,
            deleted: false,
        },
        refdes: refdes.to_string(),
        value_str: "10k".into(),
        mpn: None,
        package_name: "0805".into(),
        footprint_ref: "Resistor_SMD:R_0805".into(),
        symbol_ref: "Device:R".into(),
        functional_group: "signal".into(),
        x_nm: x,
        y_nm: y,
        rot_mdeg: 0,
        side: side.to_string(),
        courtyard_w_nm: 2_000_000,
        courtyard_h_nm: 1_200_000,
        height_nm: 600_000,
        power_diss_mw: 0.0,
        params: BTreeMap::new(),
        datasheet_citation_id: None,
    }
}

#[test]
fn test_geographical_reannotation() {
    let comps = vec![
        create_test_comp("c1", "R99", 50_000_000, 10_000_000, "top", false), // Bottom right
        create_test_comp("c2", "R42", 10_000_000, 50_000_000, "top", false), // Top left -> Should be R1
        create_test_comp("c3", "R10", 30_000_000, 50_000_000, "top", false), // Top right -> Should be R2
        create_test_comp("c4", "C88", 10_000_000, 20_000_000, "top", false), // Should be C1
    ];

    let plan = GeographicalReannotator::generate_reannotation_plan(&comps);
    assert_eq!(plan.total_components, 4);

    let r_renames: Vec<_> = plan.renames.iter().filter(|r| r.new_refdes.starts_with('R')).collect();
    // Topmost left R was c2 (x=10mm, y=50mm), should become R1
    let c2_rename = r_renames.iter().find(|r| r.component_id == "c2").unwrap();
    assert_eq!(c2_rename.new_refdes, "R1");

    let c3_rename = r_renames.iter().find(|r| r.component_id == "c3").unwrap();
    assert_eq!(c3_rename.new_refdes, "R2");
}

#[test]
fn test_geographical_reannotation_preserves_locked() {
    let comps = vec![
        create_test_comp("c1", "R99", 10_000_000, 50_000_000, "top", true), // LOCKED
        create_test_comp("c2", "R42", 30_000_000, 50_000_000, "top", false),
    ];

    let plan = GeographicalReannotator::generate_reannotation_plan(&comps);
    assert_eq!(plan.locked_skipped_count, 1);
    // Locked component c1 should NOT be in renames
    assert!(!plan.renames.iter().any(|r| r.component_id == "c1"));
}

#[test]
fn test_staging_unplaced_components() {
    let placed = vec![
        create_test_comp("c1", "R1", 10_000_000, 10_000_000, "top", false),
        create_test_comp("c2", "R2", 40_000_000, 30_000_000, "top", false),
    ];

    let mut unplaced = vec![
        create_test_comp("u1", "U1", 0, 0, "top", false),
        create_test_comp("u2", "U2", 0, 0, "top", false),
    ];

    let cfg = StagingTrayConfig::default();
    ForwardEcoEngine::stage_unplaced_components(&placed, &mut unplaced, &cfg);

    // Bounding box max_x of placed is 40mm.
    // Staging tray start_x = 40mm + 10mm gutter = 50mm (50_000_000 nm).
    if let HardwareEntity::Component { x_nm, y_nm, .. } = &unplaced[0] {
        assert_eq!(*x_nm, 50_000_000);
        assert!(*y_nm > 0);
    } else {
        panic!("Expected Component");
    }
}
