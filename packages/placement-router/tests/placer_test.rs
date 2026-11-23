use vd_placer::{
    PlacerComponent, PlacerConfig, PlacerNet, PlacerPin, SimulatedAnnealingPlacer,
};

#[test]
fn test_placer_respects_locked_components() {
    let placer = SimulatedAnnealingPlacer::new(PlacerConfig {
        steps_per_temp: 20,
        cooling_rate: 0.90,
        ..Default::default()
    });

    let locked_x = 10_000_000;
    let locked_y = 10_000_000;

    let mut components = vec![
        PlacerComponent {
            id: "comp-locked".into(),
            refdes: "U1".into(),
            x_nm: locked_x,
            y_nm: locked_y,
            width_nm: 10_000_000,
            height_nm: 10_000_000,
            rot_mdeg: 0,
            power_diss_mw: 100.0,
            locked: true, // HUMAN LOCKED!
        },
        PlacerComponent {
            id: "comp-free".into(),
            refdes: "R1".into(),
            x_nm: 80_000_000,
            y_nm: 70_000_000,
            width_nm: 2_000_000,
            height_nm: 1_000_000,
            rot_mdeg: 0,
            power_diss_mw: 5.0,
            locked: false,
        },
    ];

    let nets = vec![PlacerNet {
        id: "net-sig".into(),
        pins: vec![
            PlacerPin {
                comp_id: "comp-locked".into(),
                offset_x_nm: 0,
                offset_y_nm: 0,
            },
            PlacerPin {
                comp_id: "comp-free".into(),
                offset_x_nm: 0,
                offset_y_nm: 0,
            },
        ],
        weight: 1.0,
    }];

    let metrics = placer.place(&mut components, &nets, &[]);

    // Verify locked component DID NOT MOVE
    assert_eq!(
        components[0].x_nm, locked_x,
        "Locked component X position must NOT change"
    );
    assert_eq!(
        components[0].y_nm, locked_y,
        "Locked component Y position must NOT change"
    );

    // Verify cost reduced or converged
    assert!(metrics.final_cost <= metrics.initial_cost);
    // Unlocked component should have moved closer to the locked one to reduce wirelength
    let final_dist = ((components[1].x_nm - locked_x).abs() + (components[1].y_nm - locked_y).abs());
    let initial_dist = (80_000_000 - locked_x).abs() + (70_000_000 - locked_y).abs();
    assert!(
        final_dist < initial_dist,
        "Unlocked component should move closer to reduce HPWL"
    );
}

#[test]
fn test_placer_resolves_overlapping_components() {
    let placer = SimulatedAnnealingPlacer::new(PlacerConfig {
        steps_per_temp: 50,
        cooling_rate: 0.90,
        beta_overlap: 200.0,
        ..Default::default()
    });

    // Start with 2 completely overlapping unlocked components
    let mut components = vec![
        PlacerComponent {
            id: "c1".into(),
            refdes: "R1".into(),
            x_nm: 50_000_000,
            y_nm: 40_000_000,
            width_nm: 4_000_000,
            height_nm: 4_000_000,
            rot_mdeg: 0,
            power_diss_mw: 0.0,
            locked: false,
        },
        PlacerComponent {
            id: "c2".into(),
            refdes: "R2".into(),
            x_nm: 50_000_000,
            y_nm: 40_000_000, // Exact same position!
            width_nm: 4_000_000,
            height_nm: 4_000_000,
            rot_mdeg: 0,
            power_diss_mw: 0.0,
            locked: false,
        },
    ];

    let metrics = placer.place(&mut components, &[], &[]);
    assert_eq!(metrics.overlap_count, 0, "Placer should resolve overlap");
}
