use vd_schematic_beautifier::*;

#[test]
fn test_stage1_power_rail_orientation() {
    let beautifier = SchematicBeautifier::new(BeautifierConfig::default());
    let mut sheet = SchematicSheet {
        title: "Power Test".into(),
        symbols: vec![SchematicSymbol {
            id: "sym1".into(),
            refdes: "U1".into(),
            value: "LM7805".into(),
            footprint: "TO-220".into(),
            unit: 1,
            x: 0,
            y: 0,
            pins: vec![
                SchematicPin {
                    number: "1".into(),
                    name: "VIN".into(),
                    pin_type: PinType::Unspecified,
                    rel_x: 0,
                    rel_y: 0,
                    orientation: Orientation::Left,
                },
                SchematicPin {
                    number: "2".into(),
                    name: "GND".into(),
                    pin_type: PinType::Unspecified,
                    rel_x: 0,
                    rel_y: 0,
                    orientation: Orientation::Left,
                },
                SchematicPin {
                    number: "3".into(),
                    name: "VOUT".into(),
                    pin_type: PinType::Unspecified,
                    rel_x: 0,
                    rel_y: 0,
                    orientation: Orientation::Left,
                },
            ],
            is_power_unit: false,
        }],
        wires: vec![],
        labels: vec![],
        junctions: vec![],
    };

    beautifier.stage1_power_rail_hierarchy(&mut sheet);
    let pins = &sheet.symbols[0].pins;
    assert_eq!(pins[0].orientation, Orientation::Up, "VIN must face UP");
    assert_eq!(pins[1].orientation, Orientation::Down, "GND must face DOWN");
}

#[test]
fn test_stage2_signal_flow() {
    let beautifier = SchematicBeautifier::new(BeautifierConfig::default());
    let mut sheet = SchematicSheet {
        title: "Signal Flow".into(),
        symbols: vec![SchematicSymbol {
            id: "sym2".into(),
            refdes: "U2".into(),
            value: "MAX3232".into(),
            footprint: "SOIC-16".into(),
            unit: 1,
            x: 0,
            y: 0,
            pins: vec![
                SchematicPin {
                    number: "11".into(),
                    name: "T1IN".into(),
                    pin_type: PinType::Input,
                    rel_x: 0,
                    rel_y: 0,
                    orientation: Orientation::Up,
                },
                SchematicPin {
                    number: "14".into(),
                    name: "T1OUT".into(),
                    pin_type: PinType::Output,
                    rel_x: 0,
                    rel_y: 0,
                    orientation: Orientation::Up,
                },
            ],
            is_power_unit: false,
        }],
        wires: vec![],
        labels: vec![],
        junctions: vec![],
    };

    beautifier.stage2_signal_flow_left_to_right(&mut sheet);
    let pins = &sheet.symbols[0].pins;
    assert_eq!(pins[0].orientation, Orientation::Left, "Input must face LEFT");
    assert_eq!(pins[1].orientation, Orientation::Right, "Output must face RIGHT");
}

#[test]
fn test_stage3_multi_unit_splitting() {
    let beautifier = SchematicBeautifier::new(BeautifierConfig::default());
    let mut sheet = SchematicSheet {
        title: "MCU Split".into(),
        symbols: vec![SchematicSymbol {
            id: "mcu1".into(),
            refdes: "U3".into(),
            value: "STM32F401".into(),
            footprint: "LQFP-64".into(),
            unit: 1,
            x: 0,
            y: 0,
            pins: vec![
                SchematicPin { number: "1".into(), name: "PA0_IN".into(), pin_type: PinType::Input, rel_x: 0, rel_y: 0, orientation: Orientation::Left },
                SchematicPin { number: "2".into(), name: "PA1_OUT".into(), pin_type: PinType::Output, rel_x: 0, rel_y: 0, orientation: Orientation::Right },
                SchematicPin { number: "3".into(), name: "PA2_IN".into(), pin_type: PinType::Input, rel_x: 0, rel_y: 0, orientation: Orientation::Left },
                SchematicPin { number: "4".into(), name: "PA3_OUT".into(), pin_type: PinType::Output, rel_x: 0, rel_y: 0, orientation: Orientation::Right },
                SchematicPin { number: "5".into(), name: "VDD".into(), pin_type: PinType::PowerIn, rel_x: 0, rel_y: 0, orientation: Orientation::Up },
                SchematicPin { number: "6".into(), name: "GND".into(), pin_type: PinType::PowerIn, rel_x: 0, rel_y: 0, orientation: Orientation::Down },
            ],
            is_power_unit: false,
        }],
        wires: vec![],
        labels: vec![],
        junctions: vec![],
    };

    beautifier.stage3_multi_unit_splitting(&mut sheet);
    assert_eq!(sheet.symbols.len(), 2, "Symbol must be split into Core and Power units");
    assert_eq!(sheet.symbols[0].unit, 1);
    assert_eq!(sheet.symbols[1].unit, 2);
    assert!(sheet.symbols[1].is_power_unit);
}

#[test]
fn test_stage4_collision_resolution_and_orthogonal_routing() {
    let beautifier = SchematicBeautifier::new(BeautifierConfig::default());
    let mut sheet = SchematicSheet {
        title: "Collision & Routing".into(),
        symbols: vec![SchematicSymbol {
            id: "s1".into(),
            refdes: "R1".into(),
            value: "10k".into(),
            footprint: "R_0603".into(),
            unit: 1,
            x: 10_000_000,
            y: 10_000_000,
            pins: vec![SchematicPin {
                number: "1".into(),
                name: "1".into(),
                pin_type: PinType::Passive,
                rel_x: 0,
                rel_y: 0,
                orientation: Orientation::Left,
            }],
            is_power_unit: false,
        }],
        wires: vec![SchematicWire {
            net: "SIG1".into(),
            pts: vec![(0, 0), (10_000_000, 20_000_000)], // Diagonal wire
        }],
        labels: vec![SchematicLabel {
            net: "SIG1".into(),
            x: 10_000_000, // Exact collision with pin (10_000_000, 10_000_000)
            y: 10_000_000,
            orientation: Orientation::Right,
        }],
        junctions: vec![],
    };

    let res = beautifier.stage4_net_label_collision_avoidance(&mut sheet);
    assert!(res.is_ok());

    // Label should have been shifted off collision
    assert!(sheet.labels[0].y > 10_000_000, "Colliding label must be shifted along grid");

    // Wire must now have 3 points forming a 90-degree orthogonal bend
    assert_eq!(sheet.wires[0].pts.len(), 3, "Diagonal wire must be converted to Manhattan L-route");
    assert_eq!(sheet.wires[0].pts[1], (10_000_000, 0));
}

#[test]
fn test_stage5_kicad10_sexpr_export() {
    let beautifier = SchematicBeautifier::new(BeautifierConfig::default());
    let sheet = SchematicSheet {
        title: "Test Board".into(),
        symbols: vec![SchematicSymbol {
            id: "sym1".into(),
            refdes: "D1".into(),
            value: "LED".into(),
            footprint: "LED_0603".into(),
            unit: 1,
            x: 50_000_000,
            y: 50_000_000,
            pins: vec![SchematicPin {
                number: "1".into(),
                name: "A".into(),
                pin_type: PinType::Passive,
                rel_x: -2_540_000,
                rel_y: 0,
                orientation: Orientation::Left,
            }],
            is_power_unit: false,
        }],
        wires: vec![SchematicWire {
            net: "VCC".into(),
            pts: vec![(0, 0), (20_000_000, 0)],
        }],
        labels: vec![SchematicLabel {
            net: "VCC".into(),
            x: 20_000_000,
            y: 0,
            orientation: Orientation::Right,
        }],
        junctions: vec![SchematicJunction {
            x: 20_000_000,
            y: 0,
        }],
    };

    let sexpr = beautifier.export_kicad10_sexpr(&sheet);
    assert!(sexpr.contains("(kicad_sch"));
    assert!(sexpr.contains("(version 20240108)"));
    assert!(sexpr.contains("(generator \"vajra-dhir-schematic-beautifier\")"));
    assert!(sexpr.contains("(symbol (lib_id \"LED\")"));
    assert!(sexpr.contains("(wire (pts (xy 0.00 0.00) (xy 20.00 0.00)))"));
    assert!(sexpr.contains("(label \"VCC\""));
    assert!(sexpr.contains("(junction (at 20.00 0.00)"));
}
