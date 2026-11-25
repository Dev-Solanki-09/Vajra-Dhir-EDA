use vd_constraint_mgr::{ConstraintEvaluator, NetClassRule, RoutedNetSample};

#[test]
fn test_netclass_and_diff_pair_skew_constraints() {
    let rules = vec![NetClassRule {
        name: "USB_HS".to_string(),
        min_width_nm: 150_000,
        min_clearance_nm: 150_000,
        diff_pair_gap_nm: Some(150_000),
        target_zdiff_ohm: Some(90.0),
        max_skew_nm: Some(250_000),
        min_length_nm: Some(10_000_000),
        max_length_nm: Some(50_000_000),
    }];

    let passing = vec![RoutedNetSample {
        name: "USB_D".to_string(),
        netclass: "USB_HS".to_string(),
        width_nm: 180_000,
        clearance_nm: 180_000,
        p_length_nm: 28_100_000,
        n_length_nm: Some(28_000_000),
        er_eff: 3.8,
    }];
    let ok = ConstraintEvaluator::evaluate(&rules, &passing);
    assert!(ok.passed);
    assert!(ok.metrics[0].propagation_delay_ps > 150.0);

    let failing = vec![RoutedNetSample {
        name: "USB_D_BAD".to_string(),
        netclass: "USB_HS".to_string(),
        width_nm: 100_000,
        clearance_nm: 160_000,
        p_length_nm: 28_900_000,
        n_length_nm: Some(28_000_000),
        er_eff: 3.8,
    }];
    let report = ConstraintEvaluator::evaluate(&rules, &failing);
    assert!(!report.passed);
    assert!(report.violations.iter().any(|v| v.rule == "MIN_TRACE_WIDTH"));
    assert!(report.violations.iter().any(|v| v.rule == "DIFF_PAIR_MAX_SKEW"));

    let traj = ConstraintEvaluator::synthesize_pair_from_rule(&[[0, 0], [10_000_000, 0]], &rules[0]);
    assert!(traj.is_some());
}
