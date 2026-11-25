use std::collections::BTreeMap;
use vd_ir::model::*;
use vd_pcb_diff::*;

fn make_comp(refdes: &str, val: &str, fp: &str, x: Nm, y: Nm) -> HardwareEntity {
    HardwareEntity::Component {
        meta: HardwareEntityMeta {
            id: uuid::Uuid::now_v7().to_string(),
            board_id: "board-1".into(),
            lock: LockGuard {
                locked: false,
                provenance: Provenance::Manual,
                lock_owner: None,
                lock_reason: None,
            },
            rev_lamport: 1,
            deleted: false,
        },
        refdes: refdes.into(),
        value_str: val.into(),
        mpn: None,
        package_name: fp.into(),
        footprint_ref: format!("Test:{}", fp),
        symbol_ref: "Device:R".into(),
        functional_group: "signal".into(),
        x_nm: x,
        y_nm: y,
        rot_mdeg: 0,
        side: "top".into(),
        courtyard_w_nm: 2_000_000,
        courtyard_h_nm: 1_200_000,
        height_nm: 600_000,
        power_diss_mw: 0.0,
        params: BTreeMap::new(),
        datasheet_citation_id: None,
    }
}

#[test]
fn test_pcb_diff_engine() {
    let rev_a = vec![
        make_comp("R1", "10k", "0603", 10_000_000, 10_000_000),
        make_comp("R2", "1k", "0805", 20_000_000, 20_000_000),
        make_comp("C1", "100n", "0402", 30_000_000, 30_000_000),
    ];

    let rev_b = vec![
        make_comp("R1", "10k", "0603", 15_000_000, 10_000_000), // Moved dx = 5mm
        make_comp("R2", "2.2k", "0805", 20_000_000, 20_000_000), // Value changed
        // C1 removed
        make_comp("C2", "10u", "0805", 40_000_000, 40_000_000), // Added
    ];

    let report = PcbDiffEngine::compute_diff("Rev1.0", &rev_a, "Rev1.1", &rev_b);

    assert_eq!(report.component_changes.len(), 4);
    assert!(report.component_changes.iter().any(|c| c.refdes == "R1" && matches!(c.kind, ComponentChangeKind::Moved { .. })));
    assert!(report.component_changes.iter().any(|c| c.refdes == "R2" && matches!(c.kind, ComponentChangeKind::ValueChanged { .. })));
    assert!(report.component_changes.iter().any(|c| c.refdes == "C1" && matches!(c.kind, ComponentChangeKind::Removed)));
    assert!(report.component_changes.iter().any(|c| c.refdes == "C2" && matches!(c.kind, ComponentChangeKind::Added)));

    assert!(report.svg_diff_markup.contains("<svg"));
    assert!(report.svg_diff_markup.contains("Green: Added"));
}

#[test]
fn test_pcb_diff_trace_and_layer_deltas() {
    let rev_a = vec![
        ("018e0000-0000-7000-8000-000000000101".into(), "F.Cu".into(), 0, 0, 5_000_000, 0, 250_000),
        ("018e0000-0000-7000-8000-000000000102".into(), "B.Cu".into(), 0, 1_000_000, 5_000_000, 1_000_000, 250_000),
    ];
    let rev_b = vec![
        ("018e0000-0000-7000-8000-000000000101".into(), "F.Cu".into(), 0, 0, 6_000_000, 0, 250_000),
        ("018e0000-0000-7000-8000-000000000103".into(), "F.Cu".into(), 1_000_000, 2_000_000, 4_000_000, 2_000_000, 200_000),
    ];

    let report = PcbDiffEngine::compute_trace_and_layer_diff("rev_a", &rev_a, "rev_b", &rev_b);
    assert_eq!(report.layer_summaries.len(), 2);
    assert!(report.component_changes.iter().any(|c| matches!(c.kind, ComponentChangeKind::Added)));
    assert!(report.component_changes.iter().any(|c| matches!(c.kind, ComponentChangeKind::Removed)));
    assert!(report.component_changes.iter().any(|c| matches!(c.kind, ComponentChangeKind::Moved { dx_nm: 1_000_000, .. })));
}
