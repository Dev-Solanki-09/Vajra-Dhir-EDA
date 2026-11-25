use vd_cad_geom::{
    ArcVertexNm, CadSpatialIndex, DifferentialPairEngine, OffsetContourEngine,
    PolygonBooleanEngine, SpatialElement, SpatialKind,
};

#[test]
fn test_spatial_index_clearance_violation() {
    let mut index = CadSpatialIndex::new();

    // Trace A on Net 1: from x=0..10mm, y=0..1mm, layer "F.Cu"
    index.insert(SpatialElement {
        id: "trace-1".into(),
        net_id: Some("net-1".into()),
        layer: "F.Cu".into(),
        kind: SpatialKind::TraceSegment,
        min_x: 0,
        min_y: 0,
        max_x: 10_000_000,
        max_y: 1_000_000,
    });

    // Trace B on Net 2: from x=0..10mm, y=1.1mm..2.1mm (0.1mm = 100,000 nm away)
    let candidate = SpatialElement {
        id: "trace-2".into(),
        net_id: Some("net-2".into()),
        layer: "F.Cu".into(),
        kind: SpatialKind::TraceSegment,
        min_x: 0,
        min_y: 1_100_000,
        max_x: 10_000_000,
        max_y: 2_100_000,
    };

    // If clearance rule requires 200,000 nm (0.2 mm), distance 100,000 nm violates!
    let violations = index.find_clearance_violations(&candidate, 200_000);
    assert_eq!(violations.len(), 1, "Should detect 1 clearance violation");
    assert_eq!(violations[0].id, "trace-1");

    // If clearance rule requires only 50,000 nm, distance 100,000 nm passes!
    let violations_lax = index.find_clearance_violations(&candidate, 50_000);
    assert_eq!(violations_lax.len(), 0, "Should detect 0 clearance violations");
}

#[test]
fn test_point_in_polygon_detection() {
    let square = vec![
        [0, 0],
        [10_000_000, 0],
        [10_000_000, 10_000_000],
        [0, 10_000_000],
    ];

    assert!(PolygonBooleanEngine::point_in_polygon([5_000_000, 5_000_000], &square));
    assert!(!PolygonBooleanEngine::point_in_polygon([15_000_000, 5_000_000], &square));
    assert!(!PolygonBooleanEngine::point_in_polygon([-1, 5_000_000], &square));
}

#[test]
fn test_differential_pair_coupled_trajectory() {
    let guide = vec![
        [0, 0],
        [10_000_000, 0],
        [20_000_000, 10_000_000],
    ];

    let width_nm = 150_000; // 0.15 mm
    let gap_nm = 150_000;   // 0.15 mm
    let target_zdiff = 90.0; // USB 90 ohm

    let diff_pair = DifferentialPairEngine::compute_coupled_pair(&guide, width_nm, gap_nm, target_zdiff)
        .expect("Failed to compute differential pair");

    assert_eq!(diff_pair.p_trace_points.len(), 3);
    assert_eq!(diff_pair.n_trace_points.len(), 3);
    assert_eq!(diff_pair.target_impedance_zdiff_ohm, 90.0);
    assert!(diff_pair.p_length_nm > 0);
    assert!(diff_pair.n_length_nm > 0);
}

#[test]
fn test_cavalier_contours_arc_preserving_offset() {
    // Closed rounded triangle with a curved arc segment (bulge = 0.5)
    let rounded_tri = vec![
        ArcVertexNm { x_nm: 0, y_nm: 0, bulge: 0.5 },
        ArcVertexNm { x_nm: 10_000_000, y_nm: 0, bulge: 0.0 },
        ArcVertexNm { x_nm: 5_000_000, y_nm: 8_000_000, bulge: 0.0 },
    ];
    let offsets = OffsetContourEngine::parallel_offset_nm(&rounded_tri, true, -500_000)
        .expect("cavalier_contours offset should succeed");
    assert!(!offsets.is_empty(), "Expected at least one offset contour");
    assert!(
        offsets[0].iter().any(|v| v.bulge.abs() > 0.01),
        "Arc bulge must be preserved after parallel offset"
    );
}

#[test]
fn test_i_triangle_int64_copper_triangulation() {
    let outer = vec![
        [0_i64, 0],
        [40_000_000, 0],
        [40_000_000, 30_000_000],
        [0, 30_000_000],
    ];
    let hole = vec![
        [10_000_000_i64, 10_000_000],
        [10_000_000, 20_000_000],
        [20_000_000, 20_000_000],
        [20_000_000, 10_000_000],
    ];
    let mesh = CopperTriangulator::triangulate_polygon_nm(&outer, &[hole])
        .expect("Integer i64 triangulation must succeed");
    assert!(mesh.triangle_count >= 8, "Expected >= 8 triangles around keepout hole, got {}", mesh.triangle_count);
    assert_eq!(mesh.indices.len(), mesh.triangle_count * 3);
}
