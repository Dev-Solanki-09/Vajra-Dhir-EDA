use vd_wire_harness::*;

#[test]
fn test_wire_harness_compiler() {
    let connectors = vec![
        HarnessConnector {
            designator: "J1".into(),
            mpn: "JST-PH-4P".into(),
            pin_count: 4,
        },
        HarnessConnector {
            designator: "J2".into(),
            mpn: "JST-PH-4P".into(),
            pin_count: 4,
        },
    ];

    let wires = vec![
        HarnessWire {
            signal_name: "VBUS".into(),
            from_connector: "J1".into(),
            from_pin: 1,
            to_connector: "J2".into(),
            to_pin: 1,
            gauge: AwgGauge::Awg22, // 0.326 mm2, low resistance for power
            color: Iec60757Color::Red,
            length_mm: 250.0,
            rated_current_a: 1.5,
            is_twisted_pair: false,
            pair_partner_signal: None,
        },
        HarnessWire {
            signal_name: "GND".into(),
            from_connector: "J1".into(),
            from_pin: 4,
            to_connector: "J2".into(),
            to_pin: 4,
            gauge: AwgGauge::Awg22,
            color: Iec60757Color::Black,
            length_mm: 250.0,
            rated_current_a: 1.5,
            is_twisted_pair: false,
            pair_partner_signal: None,
        },
        HarnessWire {
            signal_name: "CAN_H".into(),
            from_connector: "J1".into(),
            from_pin: 2,
            to_connector: "J2".into(),
            to_pin: 2,
            gauge: AwgGauge::Awg26,
            color: Iec60757Color::Yellow,
            length_mm: 250.0,
            rated_current_a: 0.1,
            is_twisted_pair: true,
            pair_partner_signal: Some("CAN_L".into()),
        },
    ];

    let report = WireHarnessCompiler::compile("CAN_SENSOR_HARNESS", &connectors, &wires);

    assert_eq!(report.total_wires_count, 3);
    assert_eq!(report.connectors_count, 2);
    assert!(report.total_copper_mass_g > 0.0);
    assert_eq!(report.wiring_table.len(), 3);

    // VBUS wire checks
    let vbus_record = &report.wiring_table[0];
    assert_eq!(vbus_record.color_code, "RD");
    assert_eq!(vbus_record.cut_length_mm, 260.0); // 250mm + 10mm margin
    assert!(vbus_record.calculated_resistance_ohms > 0.0);
    assert!(vbus_record.voltage_drop_mv < 50.0); // at 1.5A over 0.25m Awg22: 1.5 * (0.053 * 0.25) ~= 20mV

    assert_eq!(report.bom_lines.len(), 3);
}

#[test]
fn test_wire_harness_yaml_fixture_svg_and_csv() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let yml = std::fs::read_to_string(manifest_dir.join("../../tests/fixtures/wire-harness/spec_harness.yml"))
        .expect("spec_harness.yml fixture missing");

    let report = WireHarnessCompiler::parse_yaml_and_compile("SPEC_HARNESS", &yml);
    assert_eq!(report.connectors_count, 2);
    assert_eq!(report.total_wires_count, 4);
    assert_eq!(report.wiring_table[0].color_code, "RD");

    let svg = WireHarnessCompiler::export_svg(&report);
    assert!(svg.contains("<svg") && svg.contains("SPEC_HARNESS"));

    let csv = WireHarnessCompiler::export_cut_list_csv(&report);
    assert!(csv.contains("index,signal,color,cut_length_mm"));
    assert!(csv.contains("J1:1,J2:1"));
}
