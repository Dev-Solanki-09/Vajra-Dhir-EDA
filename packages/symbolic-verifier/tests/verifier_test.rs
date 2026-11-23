use vd_component_kg::{CaseSize, DielectricType, MlccSpec};
use vd_symbolic_verifier::*;

#[test]
fn test_fg01_mlcc_bias_collapse() {
    let spec = MlccSpec {
        nominal_capacitance_uf: 10.0,
        rated_voltage_v: 6.3,
        dielectric: DielectricType::X5R,
        case_size: CaseSize::Metric1608, // 0603
    };
    // At 5.0V on a 6.3V rated 0603 X5R, capacitance collapses by > 50%
    let finding = FootgunChecker::check_mlcc_dc_bias("C12", "uuid-c12", &spec, 5.0);
    assert!(finding.is_some());
    let f = finding.unwrap();
    assert_eq!(f.kind, FootgunKind::Fg01MlccDcBiasCollapse);
    assert_eq!(f.severity, FindingSeverity::Error);
}

#[test]
fn test_fg02_inductor_saturation() {
    // I_load = 2.0A, ripple = 0.3 (0.6A pk-pk) -> I_peak = 2.3A. Rated I_sat = 2.0A
    let finding = FootgunChecker::check_inductor_saturation("L1", "uuid-l1", 2.0, 0.3, 2.0);
    assert!(finding.is_some());
    let f = finding.unwrap();
    assert_eq!(f.kind, FootgunKind::Fg02InductorSaturation);
    assert_eq!(f.severity, FindingSeverity::Fatal);
}

#[test]
fn test_fg03_floating_cmos_inputs() {
    let finding = FootgunChecker::check_floating_input("U3", "EN", "uuid-u3", true, false, false);
    assert!(finding.is_some());
    let f = finding.unwrap();
    assert_eq!(f.kind, FootgunKind::Fg03FloatingCmosInputs);
    assert_eq!(f.severity, FindingSeverity::Error);
}

#[test]
fn test_fg04_missing_decoupling() {
    // Capacitor located 4.0 mm away (4_000_000 nm) -> exceeds 2.0 mm limit
    let finding = FootgunChecker::check_decoupling_distance(
        "U1",
        "uuid-u1",
        10_000_000,
        10_000_000,
        Some("C1"),
        Some("uuid-c1"),
        Some(14_000_000),
        Some(10_000_000),
    );
    assert!(finding.is_some());
    let f = finding.unwrap();
    assert_eq!(f.kind, FootgunKind::Fg04MissingDecouplingCaps);
}

#[test]
fn test_fg05_split_ground_crossing() {
    let finding = FootgunChecker::check_split_plane_crossing("USB_DP", "uuid-track-1", true);
    assert!(finding.is_some());
    let f = finding.unwrap();
    assert_eq!(f.kind, FootgunKind::Fg05SplitGroundCrossing);
    assert_eq!(f.severity, FindingSeverity::Fatal);
}

#[test]
fn test_fg06_i2c_rise_time() {
    // 10k pullup with 100pF bus capacitance in Fast Mode (400kHz, max 300ns)
    // tr = 0.8473 * 10000 * 100e-12 = 847.3 ns > 300 ns
    let finding = FootgunChecker::check_i2c_rise_time("I2C1", "uuid-i2c1", 10_000.0, 100.0, true);
    assert!(finding.is_some());
    let f = finding.unwrap();
    assert_eq!(f.kind, FootgunKind::Fg06I2cPullupRiseTime);
    assert_eq!(f.severity, FindingSeverity::Error);
}

#[test]
fn test_fg07_reverse_polarity_thermal() {
    // 1N4007 Vf=0.9V at 2A -> Pd = 1.8W. Rth_ja = 80 C/W, Ta = 50 C -> Tj = 50 + 144 = 194 C > 150 C
    let finding = FootgunChecker::check_reverse_polarity_diode(
        "D1",
        "uuid-d1",
        0.9,
        2.0,
        80.0,
        50.0,
        150.0,
    );
    assert!(finding.is_some());
    let f = finding.unwrap();
    assert_eq!(f.kind, FootgunKind::Fg07ReversePolarityThermal);
    assert_eq!(f.severity, FindingSeverity::Fatal);
}

#[test]
fn test_fg08_mcu_boot_strapping() {
    // ESP32 GPIO0 pulled HIGH when LOW is needed for flashing or vice versa
    let finding = FootgunChecker::check_mcu_boot_strap("U_ESP32", "uuid-esp32", "GPIO0", true, false);
    assert!(finding.is_some());
    let f = finding.unwrap();
    assert_eq!(f.kind, FootgunKind::Fg08McuBootStrapping);
    assert_eq!(f.severity, FindingSeverity::Fatal);
}

#[test]
fn test_fg09_crystal_load_caps() {
    // Crystal rated for 18pF. Caps are 10pF and 10pF, Cstray = 4pF -> CL = 5 + 4 = 9pF. Delta = 9pF > 2pF
    let finding = FootgunChecker::check_crystal_load_caps(
        "Y1",
        "uuid-y1",
        10.0,
        10.0,
        4.0,
        18.0,
    );
    assert!(finding.is_some());
    let f = finding.unwrap();
    assert_eq!(f.kind, FootgunKind::Fg09CrystalLoadCapMismatch);
}

#[test]
fn test_fg10_thermal_junction() {
    // Pd = 1.2W, Rth = 100 C/W, Ta = 40 C -> Tj = 160 C > 125 C
    let finding = FootgunChecker::check_junction_temp(
        "U4",
        "uuid-u4",
        1.2,
        100.0,
        40.0,
        125.0,
    );
    assert!(finding.is_some());
    let f = finding.unwrap();
    assert_eq!(f.kind, FootgunKind::Fg10ThermalJunctionExceedance);
    assert_eq!(f.severity, FindingSeverity::Fatal);
}

#[test]
fn test_pinmux_satisfiable() {
    let mut solver = PinmuxConstraintSolver::new();
    solver.add_pad(PadDefinition {
        name: "PA9".into(),
        supported_functions: vec!["USART1_TX".into(), "TIM1_CH2".into()],
        is_analog_capable: false,
        is_5v_tolerant: true,
    });
    solver.add_pad(PadDefinition {
        name: "PA10".into(),
        supported_functions: vec!["USART1_RX".into(), "TIM1_CH3".into()],
        is_analog_capable: false,
        is_5v_tolerant: true,
    });
    solver.add_pad(PadDefinition {
        name: "PB6".into(),
        supported_functions: vec!["I2C1_SCL".into(), "USART1_TX".into()],
        is_analog_capable: false,
        is_5v_tolerant: true,
    });
    solver.add_pad(PadDefinition {
        name: "PB7".into(),
        supported_functions: vec!["I2C1_SDA".into(), "USART1_RX".into()],
        is_analog_capable: false,
        is_5v_tolerant: true,
    });

    let signals = vec![
        "USART1_TX".into(),
        "USART1_RX".into(),
        "I2C1_SCL".into(),
        "I2C1_SDA".into(),
    ];

    let result = solver.solve(&signals);
    assert!(result.is_ok());
    let sol = result.unwrap();
    assert_eq!(sol.assignments.len(), 4);
    assert_ne!(sol.assignments["USART1_TX"], sol.assignments["I2C1_SCL"]);
}

#[test]
fn test_pinmux_unsatisfiable_contention() {
    let mut solver = PinmuxConstraintSolver::new();
    // Only 1 physical pad supports both USART1_TX and I2C1_SCL
    solver.add_pad(PadDefinition {
        name: "PA9".into(),
        supported_functions: vec!["USART1_TX".into(), "I2C1_SCL".into()],
        is_analog_capable: false,
        is_5v_tolerant: true,
    });

    let signals = vec!["USART1_TX".into(), "I2C1_SCL".into()];
    let result = solver.solve(&signals);
    assert!(result.is_err());
    let proof = result.unwrap_err();
    assert!(proof.contested_pads.contains(&"PA9".to_string()));
}
