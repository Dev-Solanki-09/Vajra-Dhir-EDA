use vd_autorouter::*;

#[test]
fn test_kicad_dru_generation() {
    let net_classes = vec![
        NetClassRule {
            name: "Power_3A".into(),
            clearance_nm: 300_000,   // 0.300 mm
            track_width_nm: 1_000_000, // 1.000 mm
            via_dia_nm: 800_000,
            via_drill_nm: 400_000,
            diff_pair_width_nm: None,
            diff_pair_gap_nm: None,
        },
        NetClassRule {
            name: "RF_50Ohm".into(),
            clearance_nm: 200_000,   // 0.200 mm
            track_width_nm: 450_000, // 0.450 mm
            via_dia_nm: 600_000,
            via_drill_nm: 300_000,
            diff_pair_width_nm: None,
            diff_pair_gap_nm: None,
        },
    ];

    let dru = AutorouterOrchestrator::generate_kicad_dru(&net_classes);
    assert!(dru.contains("(rule \"NetClass_Power_3A_Clearance\""));
    assert!(dru.contains("(constraint clearance (min 0.300mm))"));
    assert!(dru.contains("(rule \"NetClass_Power_3A_TrackWidth\""));
    assert!(dru.contains("(constraint track_width (min 1.000mm))"));
    assert!(dru.contains("(rule \"NetClass_RF_50Ohm_Clearance\""));
}

#[test]
fn test_specctra_dsn_export() {
    let outline = vec![(0, 0), (50_000_000, 0), (50_000_000, 50_000_000), (0, 50_000_000)];
    let net_classes = vec![NetClassRule {
        name: "Default".into(),
        clearance_nm: 200_000,
        track_width_nm: 250_000,
        via_dia_nm: 600_000,
        via_drill_nm: 300_000,
        diff_pair_width_nm: None,
        diff_pair_gap_nm: None,
    }];
    let copper = vec![CopperEntity {
        id: "trace_lock_1".into(),
        net_name: "GND".into(),
        layer: "F.Cu".into(),
        start_nm: (10_000_000, 10_000_000),
        end_nm: (20_000_000, 10_000_000),
        width_nm: 500_000,
        is_via: false,
        via_drill_nm: 0,
        locked: true,
    }];

    let dsn = AutorouterOrchestrator::export_specctra_dsn("TestBoard", &outline, &net_classes, &copper);
    assert!(dsn.contains("(pcb \"TestBoard\""));
    assert!(dsn.contains("(resolution um 1000)"));
    assert!(dsn.contains("(boundary"));
    assert!(dsn.contains("(wiring"));
    assert!(dsn.contains("(wire (path F.Cu 500 10000 10000 20000 10000) (net \"GND\") (type fix))"));
}

#[test]
fn test_specctra_ses_import() {
    let ses = r#"
(session "TestBoard"
  (routes
    (network
      (net "VCC"
        (wire (path F.Cu 250 5000 5000 15000 5000))
        (wire (path F.Cu 250 15000 5000 15000 12000))
      )
    )
  )
)
"#;

    let tracks = AutorouterOrchestrator::import_specctra_ses(ses).expect("SES parse failed");
    assert_eq!(tracks.len(), 2);
    assert_eq!(tracks[0].net_name, "VCC");
    assert_eq!(tracks[0].layer, "F.Cu");
    assert_eq!(tracks[0].start_nm, (5_000_000, 5_000_000));
    assert_eq!(tracks[0].end_nm, (15_000_000, 5_000_000));
    assert_eq!(tracks[0].width_nm, 250_000);
}

#[test]
fn test_fail_closed_locked_copper_guard() {
    let original_copper = vec![
        CopperEntity {
            id: "human_sw_node".into(),
            net_name: "SW_12V".into(),
            layer: "F.Cu".into(),
            start_nm: (12_000_000, 15_000_000),
            end_nm: (18_000_000, 15_000_000),
            width_nm: 1_200_000,
            is_via: false,
            via_drill_nm: 0,
            locked: true,
        },
        CopperEntity {
            id: "unlocked_signal".into(),
            net_name: "GPIO1".into(),
            layer: "F.Cu".into(),
            start_nm: (0, 0),
            end_nm: (5_000_000, 0),
            width_nm: 250_000,
            is_via: false,
            via_drill_nm: 0,
            locked: false,
        },
    ];

    let snapshot = LockedCopperSnapshot::create(&original_copper);
    assert_eq!(snapshot.hashes.len(), 1, "Only locked entities are snapshotted");

    // Case 1: Unlocked entity altered, locked entity intact -> PASS
    let post_clean = vec![
        original_copper[0].clone(),
        CopperEntity {
            id: "unlocked_signal".into(),
            net_name: "GPIO1".into(),
            layer: "F.Cu".into(),
            start_nm: (0, 0),
            end_nm: (10_000_000, 0), // Modified by autorouter
            width_nm: 250_000,
            is_via: false,
            via_drill_nm: 0,
            locked: false,
        },
    ];
    assert!(snapshot.verify_integrity(&post_clean).is_ok());

    // Case 2: Locked entity mutated by router -> FAIL-CLOSED
    let mut post_mutated = post_clean.clone();
    post_mutated[0].start_nm = (12_500_000, 15_000_000); // Nudged by 0.5 mm
    let err = snapshot.verify_integrity(&post_mutated);
    assert!(err.is_err());
    match err.unwrap_err() {
        AutorouterError::CopperLockViolation { id, .. } => assert_eq!(id, "human_sw_node"),
        other => panic!("Expected CopperLockViolation, got {:?}", other),
    }

    // Case 3: Locked entity deleted by router -> FAIL-CLOSED
    let post_dropped = vec![post_clean[1].clone()];
    let err_drop = snapshot.verify_integrity(&post_dropped);
    assert!(err_drop.is_err());
    match err_drop.unwrap_err() {
        AutorouterError::LockedEntityMissing(id) => assert_eq!(id, "human_sw_node"),
        other => panic!("Expected LockedEntityMissing, got {:?}", other),
    }
}
