use vd_component_kg::{
    CaseSize, ComponentCatalog, DatasheetFactCitation, DielectricType, InductorSaturationEngine,
    InductorSpec, MlccDeratingEngine, MlccSpec,
};

#[test]
fn test_mlcc_dc_bias_collapse_detected() {
    // 10uF 6.3V 0402 X5R capacitor operating at 5.0V (near rated limit)
    let spec = MlccSpec {
        nominal_capacitance_uf: 10.0,
        rated_voltage_v: 6.3,
        dielectric: DielectricType::X5R,
        case_size: CaseSize::Metric1005, // 0402
    };

    let result = MlccDeratingEngine::calculate_effective_capacitance(&spec, 5.0);

    // In a 0402 package at 5V, capacitance collapses by over 60%!
    assert!(result.is_critical_drop, "Should flag critical capacitance collapse");
    assert!(result.derating_percentage > 50.0, "Derating should be > 50%");
    assert!(result.effective_capacitance_uf < 4.5, "Effective capacitance should drop significantly");
    assert!(result.warning.is_some(), "Warning should be emitted");
}

#[test]
fn test_c0g_has_zero_dc_bias_drop() {
    let spec = MlccSpec {
        nominal_capacitance_uf: 0.001, // 1nF C0G
        rated_voltage_v: 50.0,
        dielectric: DielectricType::C0G_NP0,
        case_size: CaseSize::Metric1608,
    };

    let result = MlccDeratingEngine::calculate_effective_capacitance(&spec, 40.0);
    assert_eq!(result.derating_percentage, 0.0, "C0G must have 0% DC-bias drop");
    assert_eq!(result.effective_capacitance_uf, 0.001);
}

#[test]
fn test_inductor_saturation_protection() {
    let spec = InductorSpec {
        nominal_inductance_uh: 4.7,
        isat_a: 2.5,
        irms_a: 3.0,
        dcr_mohm: 45.0,
    };

    // Operating at 2.8A peak current > 2.5A Isat -> Must detect saturation!
    let result = InductorSaturationEngine::evaluate_inductor(&spec, 2.0, 1.6); // Ipeak = 2.0 + 0.8 = 2.8A

    assert!(result.is_saturated, "Should flag inductor saturation");
    assert!(result.effective_inductance_uh < 3.5, "Inductance should collapse");
    assert!(result.warning.is_some());
}

#[test]
fn test_catalog_finds_basic_replacement() {
    let catalog = ComponentCatalog::new_with_golden_catalog();

    let basic_res = catalog.find_basic_replacement("Resistors", "10k", "0402");
    assert!(basic_res.is_some());
    assert_eq!(basic_res.unwrap().lcsc_part, "C25076");

    let tps = catalog.search("TPS54302");
    assert_eq!(tps.len(), 1);
    assert_eq!(tps[0].lcsc_part, "C84333");
}

#[test]
fn test_datasheet_citation_hash() {
    let citation = DatasheetFactCitation {
        id: "cite-1".into(),
        pdf_sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855".into(),
        mpn: "TPS54302DDCR".into(),
        manufacturer: "TI".into(),
        page_number: 4,
        bbox_norm: [0.1, 0.2, 0.9, 0.5],
        extracted_fact_json: serde_json::json!({ "abs_max_vin": 30.0, "recommend_vin": 28.0 }),
        verified_by: "auditor:dual_context".into(),
        verified_at_utc: "2026-11-23T00:00:00Z".into(),
    };

    let hash = citation.compute_citation_hash();
    assert!(!hash.is_empty());
    assert_eq!(hash.len(), 64, "SHA-256 hash must be 64 hex characters");
}
