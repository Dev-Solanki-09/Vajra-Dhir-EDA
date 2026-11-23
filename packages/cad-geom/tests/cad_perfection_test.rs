use vd_cad_geom::{
    DrcWaiverGuard, DrcWaiverRecord, GeomKind, GeometrySnapshotItem, InteractiveSpatialKernel,
    LengthTuningEngine, MeanderParams, MeanderStyle, ReplicatedComponent, ReplicatedTrace,
    RoomReplicationEngine, SpatialItem, TeardropEngine, TeardropParams, WindowpaningEngine,
};

#[test]
fn test_magnetic_snap_and_posture() {
    let items = vec![
        SpatialItem {
            entity_id: "pad_u1_1".into(),
            net_id: Some("net_3v3".into()),
            layer: "F.Cu".into(),
            kind: GeomKind::Pad,
            x1: 10_000_000,
            y1: 10_000_000,
            x2: 10_000_000,
            y2: 10_000_000,
            half_width_nm: 250_000,
            locked: false,
        },
        SpatialItem {
            entity_id: "via_v1".into(),
            net_id: Some("net_gnd".into()),
            layer: "*".into(),
            kind: GeomKind::Via,
            x1: 20_000_000,
            y1: 15_000_000,
            x2: 20_000_000,
            y2: 15_000_000,
            half_width_nm: 300_000,
            locked: true,
        },
    ];

    let kernel = InteractiveSpatialKernel::bulk_load(items);

    // Snap to pad center within 1 mm snap radius
    let snap = kernel.magnetic_snap(10_300_000, 10_200_000, 250_000, 1_000_000, "F.Cu");
    assert_eq!(snap.snap_kind, "pad_center");
    assert_eq!(snap.x_nm, 10_000_000);
    assert_eq!(snap.y_nm, 10_000_000);
    assert_eq!(snap.target_entity_id.as_deref(), Some("pad_u1_1"));

    // Far point falls back to grid snap (250um grid)
    let grid_snap = kernel.magnetic_snap(15_120_000, 8_130_000, 250_000, 500_000, "F.Cu");
    assert_eq!(grid_snap.snap_kind, "grid");
    assert_eq!(grid_snap.x_nm, 15_000_000);
    assert_eq!(grid_snap.y_nm, 8_250_000);

    // 45-degree miter posture
    let path = InteractiveSpatialKernel::solve_45deg_posture(0, 0, 10_000_000, 5_000_000, false);
    assert_eq!(path.len(), 3);
    assert_eq!(path[0], (0, 0));
    assert_eq!(path[2], (10_000_000, 5_000_000));
}

#[test]
fn test_length_tuning_and_delay() {
    let start = [0, 0];
    let end = [10_000_000, 0]; // 10 mm
    let params = MeanderParams {
        amplitude_nm: 1_000_000, // 1 mm amplitude
        pitch_nm: 1_500_000,     // 1.5 mm pitch
        style: MeanderStyle::Trombone,
        target_length_nm: 16_000_000, // Target 16 mm
    };

    let result = LengthTuningEngine::generate_meander(start, end, &params, 3.8);
    assert!(result.total_length_nm >= 14_000_000);
    assert!(result.delay_ps > 0.0);
    assert!(result.points.len() > 2);
}

#[test]
fn test_teardrop_fillet_synthesis() {
    let pad_center = [5_000_000, 5_000_000];
    let pad_radius = 500_000;
    let trace_pt = [7_000_000, 5_000_000];
    let trace_width = 200_000;
    let params = TeardropParams::default();

    let td = TeardropEngine::synthesize_teardrop(
        pad_center,
        pad_radius,
        trace_pt,
        trace_width,
        &params,
    );
    assert!(td.is_some());
    let fillet = td.unwrap();
    assert_eq!(fillet.polygon_points.len(), 5);
}

#[test]
fn test_qfn_paste_windowpaning() {
    let grid = WindowpaningEngine::compute_stencil_grid(
        0, 0, 4_000_000, 4_000_000, 0.65, 3, 3, 200_000,
    );
    assert_eq!(grid.grid_rows, 3);
    assert_eq!(grid.grid_cols, 3);
    assert_eq!(grid.apertures.len(), 9);
    assert!(grid.coverage_ratio >= 0.50 && grid.coverage_ratio <= 0.80);
}

#[test]
fn test_room_replication() {
    let template_comps = vec![ReplicatedComponent {
        source_id: "u1".into(),
        target_id: "".into(),
        refdes: "U1".into(),
        x_nm: 1_000_000,
        y_nm: 2_000_000,
        rot_mdeg: 0,
    }];
    let template_traces = vec![ReplicatedTrace {
        source_id: "tr1".into(),
        target_id: "".into(),
        net_id: "PWM".into(),
        layer: "F.Cu".into(),
        x1_nm: 1_000_000,
        y1_nm: 2_000_000,
        x2_nm: 5_000_000,
        y2_nm: 2_000_000,
        width_nm: 250_000,
    }];

    let repl = RoomReplicationEngine::replicate_channel(
        "motor_phase",
        2,
        (0, 0),
        (10_000_000, 10_000_000),
        0,
        &template_comps,
        &template_traces,
        |src, ch| format!("{}_ch{}", src, ch),
    );

    assert_eq!(repl.channel_index, 2);
    assert_eq!(repl.components.len(), 1);
    assert_eq!(repl.components[0].x_nm, 11_000_000);
    assert_eq!(repl.components[0].y_nm, 12_000_000);
    assert_eq!(repl.traces[0].net_id, "PWM_ch2");
}

#[test]
fn test_drc_waiver_geometry_guard() {
    let items = vec![GeometrySnapshotItem {
        entity_id: "bridge_rf1".into(),
        entity_type: "trace".into(),
        coordinates: vec![1_000_000, 1_000_000, 2_000_000, 1_000_000],
        net_id: Some("ANT_50R".into()),
        layer: "F.Cu".into(),
    }];

    let sha = DrcWaiverGuard::compute_geometry_sha256(&items);

    let waiver = DrcWaiverRecord {
        id: "w_001".into(),
        rule_code: "clearance".into(),
        entity_ids: vec!["bridge_rf1".into()],
        expected_sha256: sha.clone(),
        waived_by: "rf_engineer@domain.com".into(),
        justification: "Intentional 50-ohm RF bridge".into(),
        status: "active".into(),
    };

    let (valid, _) = DrcWaiverGuard::validate_waiver(&waiver, &items);
    assert!(valid);

    // Mutate geometry by 1 nm
    let mut mutated = items.clone();
    mutated[0].coordinates[0] += 1; // +1 nm drift
    let (drift_valid, reason) = DrcWaiverGuard::validate_waiver(&waiver, &mutated);
    assert!(!drift_valid);
    assert!(reason.contains("Geometry drift detected"));
}
