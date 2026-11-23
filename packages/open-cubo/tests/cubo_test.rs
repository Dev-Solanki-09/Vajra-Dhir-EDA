use vd_ir::model::*;
use vd_open_cubo::*;

#[test]
fn test_buck_synthesis_with_derating() {
    let board_id = uuid::Uuid::now_v7().to_string();
    let req = BuckRequirements {
        v_in_nom_v: 12.0,
        v_in_max_v: 24.0,
        v_out_v: 5.0,
        i_out_max_a: 2.0,
        ripple_max_mv: 50.0,
    };

    let result = BuckSynthesizer::synthesize(&board_id, &req, 10_000_000, 20_000_000);
    assert!(result.inductance_uh > 0.0);
    assert!(result.inductor_isat_required_a > 2.0);
    assert!(result.r1_feedback_ohm > 0.0);
    assert!(result.c_out_effective_uf < result.c_out_nominal_uf); // derating should reduce capacitance
    assert_eq!(result.generated_ops.len(), 2);

    for op in &result.generated_ops {
        match op {
            HardwarePatchOp::UpsertEntity { entity } => {
                match entity {
                    HardwareEntity::Component { meta, x_nm, y_nm, .. } => {
                        assert_eq!(meta.lock.provenance, Provenance::Cubo);
                        assert!(!meta.id.is_empty());
                        assert!(*x_nm > 0);
                        assert!(*y_nm > 0);
                    }
                    _ => panic!("Expected Component entity"),
                }
            }
            _ => panic!("Expected UpsertEntity op"),
        }
    }
}

#[test]
fn test_ldo_synthesis_and_thermal() {
    let board_id = uuid::Uuid::now_v7().to_string();
    let req = LdoRequirements {
        v_in_v: 5.0,
        v_out_v: 3.3,
        i_load_max_a: 0.150, // 150mA
        ambient_temp_c: 25.0,
    };

    let result = LdoSynthesizer::synthesize(&board_id, &req, 30_000_000, 40_000_000);
    // Pd = (5.0 - 3.3) * 0.15 = 0.255 W
    // Tj = 25 + 0.255 * 169 ~= 68.1 °C
    assert!(result.power_dissipation_w > 0.25);
    assert!(result.junction_temp_c < 100.0);
    assert!(result.thermal_ok);
    assert_eq!(result.generated_ops.len(), 3); // LDO + Cin + Cout
}

#[test]
fn test_usb_pd_synthesis() {
    let board_id = uuid::Uuid::now_v7().to_string();
    let ops = UsbPdSynthesizer::synthesize(&board_id, RequestedPdVoltage::V20, 50_000_000, 60_000_000);
    assert_eq!(ops.len(), 1);

    match &ops[0] {
        HardwarePatchOp::UpsertEntity { entity } => {
            match entity {
                HardwareEntity::Component { refdes, params, .. } => {
                    assert_eq!(refdes, "U_PD1");
                    assert_eq!(params.get("cfg_setting").unwrap(), &serde_json::json!("Short to GND"));
                }
                _ => panic!("Expected Component"),
            }
        }
        _ => panic!("Expected UpsertEntity"),
    }
}

#[test]
fn test_esd_protection_synthesis() {
    let board_id = uuid::Uuid::now_v7().to_string();
    let ops = EsdSynthesizer::synthesize(&board_id, UsbDataRate::Usb2HighSpeed480Mbps, 70_000_000, 80_000_000);
    assert_eq!(ops.len(), 1);

    match &ops[0] {
        HardwarePatchOp::UpsertEntity { entity } => {
            match entity {
                HardwareEntity::Component { refdes, params, .. } => {
                    assert_eq!(refdes, "D_ESD1");
                    assert_eq!(params.get("max_line_cap_pf").unwrap(), &serde_json::json!(1.0));
                }
                _ => panic!("Expected Component"),
            }
        }
        _ => panic!("Expected UpsertEntity"),
    }
}

#[test]
fn test_open_cubo_registry() {
    let blocks = OpenCuboRegistry::list_standard_blocks();
    assert_eq!(blocks.len(), 4);
    assert!(blocks.iter().any(|b| b.name == "buck_stepdown"));
    assert!(blocks.iter().any(|b| b.name == "linear_ldo"));
    assert!(blocks.iter().any(|b| b.name == "usb_pd_sink"));
    assert!(blocks.iter().any(|b| b.name == "esd_clamp_array"));
}
