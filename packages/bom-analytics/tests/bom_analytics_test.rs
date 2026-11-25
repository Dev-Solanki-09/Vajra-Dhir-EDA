use std::collections::BTreeMap;
use vd_bom_analytics::{
    AssemblyVariant, BomLineItem, BomRiskAnalyzer, FeederFeeType, LifecycleState,
};

#[test]
fn test_variant_dnp_filtering_and_risk_scoring() {
    let mut overrides = BTreeMap::new();
    overrides.insert("R5".to_string(), "RC0603FR-074K7L".to_string());
    let variant = AssemblyVariant {
        name: "PROTO_NO_CAN".to_string(),
        dnp_refdes: vec!["U9".to_string()],
        overrides,
    };

    let items = vec![
        BomLineItem {
            refdes: "U1".to_string(),
            mpn: "CH224K".to_string(),
            package: "ESSOP-10".to_string(),
            feeder_fee_type: FeederFeeType::Basic,
            stock_qty: 1000,
            unit_price_usd: 0.45,
            lifecycle: LifecycleState::Active,
            qty: 1,
            alternate_mpns: vec!["TPS25750".to_string()],
        },
        BomLineItem {
            refdes: "U2".to_string(),
            mpn: "TPS54302DDCR".to_string(),
            package: "SOT-23-6".to_string(),
            feeder_fee_type: FeederFeeType::Extended,
            stock_qty: 4,
            unit_price_usd: 1.10,
            lifecycle: LifecycleState::Active,
            qty: 2,
            alternate_mpns: vec![],
        },
        BomLineItem {
            refdes: "U9".to_string(),
            mpn: "TJA1051T/3".to_string(),
            package: "SOIC-8".to_string(),
            feeder_fee_type: FeederFeeType::Extended,
            stock_qty: 0,
            unit_price_usd: 0.90,
            lifecycle: LifecycleState::Obsolete,
            qty: 1,
            alternate_mpns: vec![],
        },
    ];

    let report = BomRiskAnalyzer::analyze(&items, Some(&variant), 5);
    assert_eq!(report.active_line_count, 2);
    assert_eq!(report.dnp_excluded_count, 1);
    assert!((report.extended_feeder_fees_usd - 3.0).abs() < 1e-6);
    assert!(report.risks.iter().any(|r| r.refdes == "U2" && r.kind == "LOW_STOCK"));
    assert!(!report.risks.iter().any(|r| r.refdes == "U9"));
}
