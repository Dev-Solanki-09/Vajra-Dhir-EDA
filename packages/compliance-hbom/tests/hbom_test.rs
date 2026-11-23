use vd_compliance_hbom::*;

#[test]
fn test_requirements_traceability_audit() {
    let reqs = vec![
        RequirementBinding {
            req_uid: "REQ-PWR-001".into(),
            title: "Output voltage 3.3V +/- 2%".into(),
            verification_method: "SPICE-Transient".into(),
            bound_refdes: vec!["U1".into(), "R1".into(), "R2".into()],
            passed: true,
            evidence_sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855".into(),
        },
        RequirementBinding {
            req_uid: "REQ-EMC-002".into(),
            title: "TVS clamp <= 5.0mm from USB-C connector".into(),
            verification_method: "EMC-Workbench-ESD".into(),
            bound_refdes: vec!["J1".into(), "D1".into()],
            passed: true,
            evidence_sha256: "8743b52063cd84097a65d1633f5c74f5".into(),
        },
    ];

    let count = HbomGenerator::audit_requirements(&reqs).expect("Audit failed");
    assert_eq!(count, 2);
}

#[test]
fn test_failed_requirement_fails_closed() {
    let reqs = vec![RequirementBinding {
        req_uid: "REQ-THERMAL-003".into(),
        title: "LDO Tj <= 125C".into(),
        verification_method: "Thermal-FEM".into(),
        bound_refdes: vec!["U2".into()],
        passed: false, // Failed
        evidence_sha256: "0000000".into(),
    }];

    let res = HbomGenerator::audit_requirements(&reqs);
    assert!(res.is_err());
}

#[test]
fn test_cyclonedx_1_6_generation() {
    let components = vec![
        HbomComponent {
            refdes: "U1".into(),
            mpn: "TPS54302DDCR".into(),
            manufacturer: "Texas Instruments".into(),
            description: "4.5V to 28V Input, 3A Step-Down Converter".into(),
            package: "SOT-23-6".into(),
            rohs_compliant: true,
            reach_svhc_free: true,
            halogen_free: true,
            lifecycle_status: "Active".into(),
            conflict_minerals_3tg: true,
        },
        HbomComponent {
            refdes: "C1".into(),
            mpn: "CL10B106KP8NNNC".into(),
            manufacturer: "Samsung".into(),
            description: "CAP CER 10UF 10V X7R 0603".into(),
            package: "0603".into(),
            rohs_compliant: true,
            reach_svhc_free: true,
            halogen_free: true,
            lifecycle_status: "Active".into(),
            conflict_minerals_3tg: true,
        },
    ];

    let reqs = vec![RequirementBinding {
        req_uid: "REQ-PWR-001".into(),
        title: "3.3V Output Regulation".into(),
        verification_method: "SPICE".into(),
        bound_refdes: vec!["U1".into()],
        passed: true,
        evidence_sha256: "abc123hash".into(),
    }];

    let json = HbomGenerator::generate_cyclonedx_1_6("VD-BRD-001", "1.0.0", &components, &reqs)
        .expect("Failed to generate CycloneDX HBOM");

    assert!(json.contains("\"bomFormat\": \"CycloneDX\""));
    assert!(json.contains("\"specVersion\": \"1.6\""));
    assert!(json.contains("\"TPS54302DDCR\""));
    assert!(json.contains("\"rohs:compliant\""));
    assert!(json.contains("\"lifecycle:status\""));
    assert!(json.contains("\"traceability:REQ-PWR-001\""));
}
