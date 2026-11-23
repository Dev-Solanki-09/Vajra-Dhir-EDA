use vd_control_loop::*;

#[test]
fn test_buck_plant_analysis() {
    let specs = SmpsSpecs {
        topology: ConverterTopology::Buck,
        vin_nom_v: 12.0,
        vout_v: 3.3,
        iout_max_a: 3.0,
        fsw_hz: 500_000.0,
        l_henry: 4.7e-6,
        cout_farad: 44e-6,
        esr_ohm: 0.005,
    };

    let plant = ControlLoopSynthesizer::analyze_plant(&specs).expect("Failed to analyze plant");
    // f_LC = 1 / (2 * pi * sqrt(4.7u * 44u)) = ~11.08 kHz
    assert!(plant.flc_hz > 10_000.0 && plant.flc_hz < 12_000.0);
    // f_ESR = 1 / (2 * pi * 0.005 * 44u) = ~723.4 kHz
    assert!(plant.fesr_hz > 700_000.0 && plant.fesr_hz < 750_000.0);
    assert!(plant.frhpz_hz.is_none(), "Buck converter must have NO RHPZ");
}

#[test]
fn test_boost_rhpz_detection() {
    let specs = SmpsSpecs {
        topology: ConverterTopology::Boost,
        vin_nom_v: 5.0,
        vout_v: 12.0,
        iout_max_a: 1.0,
        fsw_hz: 600_000.0,
        l_henry: 10e-6,
        cout_farad: 22e-6,
        esr_ohm: 0.010,
    };

    let plant = ControlLoopSynthesizer::analyze_plant(&specs).expect("Failed to analyze plant");
    assert!(plant.frhpz_hz.is_some(), "Boost converter MUST have an RHPZ");
    let rhpz = plant.frhpz_hz.unwrap();
    assert!(rhpz > 20_000.0 && rhpz < 60_000.0);

    // Verify error if target crossover attempts to exceed RHPZ / 3
    let res = ControlLoopSynthesizer::synthesize_type2(&specs, Some(rhpz / 2.0), Some(60.0));
    assert!(res.is_err(), "Must reject crossover exceeding RHPZ / 3");
}

#[test]
fn test_type2_compensator_synthesis() {
    let specs = SmpsSpecs {
        topology: ConverterTopology::Buck,
        vin_nom_v: 12.0,
        vout_v: 3.3,
        iout_max_a: 3.0,
        fsw_hz: 500_000.0,
        l_henry: 4.7e-6,
        cout_farad: 44e-6,
        esr_ohm: 0.005,
    };

    let comp = ControlLoopSynthesizer::synthesize_type2(&specs, None, Some(60.0))
        .expect("Type-II synthesis failed");

    assert_eq!(comp.comp_type, CompensatorType::Type2);
    assert_eq!(comp.phase_margin_deg, 60.0);
    assert!(comp.gain_margin_db >= 10.0);
    assert!(comp.rc_ohm > 0.0);
    assert!(comp.cc_farad > 0.0);
    assert!(comp.cp_farad > 0.0);
}

#[test]
fn test_excessive_bandwidth_rejected() {
    let specs = SmpsSpecs {
        topology: ConverterTopology::Buck,
        vin_nom_v: 12.0,
        vout_v: 3.3,
        iout_max_a: 3.0,
        fsw_hz: 500_000.0, // max fc is 100 kHz (fsw / 5)
        l_henry: 4.7e-6,
        cout_farad: 44e-6,
        esr_ohm: 0.005,
    };

    let res = ControlLoopSynthesizer::synthesize_type2(&specs, Some(150_000.0), None);
    assert!(res.is_err());
}
