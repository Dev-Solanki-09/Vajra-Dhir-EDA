use vd_pdn_solver::*;

#[test]
fn test_ir_drop_solution() {
    let props = CopperLayerProperties {
        thickness_nm: 35_000, // 1 oz
        operating_temp_c: 25.0,
    };

    // 50 mm length, 1.0 mm width trace carrying 2.0 A on 3.3V rail
    let trace = TraceSegment {
        net_name: "+3V3".into(),
        length_nm: 50_000_000,
        width_nm: 1_000_000,
        current_a: 2.0,
    };

    let via = ViaSegment {
        net_name: "+3V3".into(),
        drill_diameter_nm: 300_000,
        plating_thickness_nm: 20_000,
        barrel_height_nm: 1_600_000,
        current_a: 2.0,
    };

    let result = PdnIrDropSolver::solve_rail_segment(&props, 3.3, 3.0, &trace, Some(&via));

    assert!(result.total_resistance_ohms > 0.0);
    assert!(result.total_voltage_drop_mv > 0.0);
    assert!(result.max_voltage_drop_pct < 3.0); // should be well within 3% spec
    assert!(result.is_within_spec);
    // Via warning should trigger because 2.0A > 1.5A single via limit
    assert!(result.warnings.iter().any(|w| w.contains("exceeds 1.5 A single-via limit")));
}

#[test]
fn test_ipc2152_thermal_rise() {
    // 0.5 mm trace, 1 oz copper (35 um), 2.5 A current on external layer
    let report = Ipc2152ThermalEngine::calculate_temp_rise(
        500_000,
        35_000,
        2.5,
        25.0,
        TraceLayerLocation::ExternalTopOrBottom,
        130.0,
    );

    assert!(report.delta_temp_c > 0.0);
    assert!(report.final_trace_temp_c < 130.0);
    assert!(report.is_safe);

    // Internal layer should have higher delta T for the same dimensions
    let internal_report = Ipc2152ThermalEngine::calculate_temp_rise(
        500_000,
        35_000,
        2.5,
        25.0,
        TraceLayerLocation::InternalPlaneOrSignal,
        130.0,
    );
    assert!(internal_report.delta_temp_c > report.delta_temp_c);
}

#[test]
fn test_ipc2221_vs_ipc2152_distinction() {
    let r2152 = Ipc2152ThermalEngine::calculate_temp_rise(
        250_000,
        35_000,
        2.0,
        25.0,
        TraceLayerLocation::ExternalTopOrBottom,
        130.0,
    );
    let r2221 = Ipc2221ThermalEngine::calculate_temp_rise(
        250_000,
        35_000,
        2.0,
        25.0,
        TraceLayerLocation::ExternalTopOrBottom,
        130.0,
    );
    assert!(
        (r2152.delta_temp_c - r2221.delta_temp_c).abs() > 10.0,
        "IPC-2152 universal curve must be distinct from IPC-2221 constants"
    );
}
