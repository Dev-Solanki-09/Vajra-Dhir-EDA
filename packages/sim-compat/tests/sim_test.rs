use vd_sim_compat::*;

#[test]
fn test_detect_encrypted_cadence_pspice() {
    let encrypted_lib = r#"
* TI LM5116 PSpice Model
.SUBCKT LM5116 VIN EN VCC UVLO
$CDNENCSTART
8f4b23a1b92049c30f81...
$CDNENCEND
.ENDS
"#;

    let res = EncryptedModelDetector::scan_deck(encrypted_lib);
    assert!(res.is_encrypted);
    assert_eq!(res.classification, SpiceModelClassification::EncryptedCadencePSpice);
    assert!(res.requires_behavioral_fallback);
    assert_eq!(res.waveform_badge, Some("[BEHAVIORAL-APPROX]".into()));
}

#[test]
fn test_plain_text_standard() {
    let plain_lib = r#"
.SUBCKT RC_FILTER IN OUT GND
R1 IN OUT 10k
C1 OUT GND 100n
.ENDS
"#;
    let res = EncryptedModelDetector::scan_deck(plain_lib);
    assert!(!res.is_encrypted);
    assert_eq!(res.classification, SpiceModelClassification::PlainTextStandard);
    assert!(!res.requires_behavioral_fallback);
}

#[test]
fn test_transpile_ltspice_syntax() {
    let ltspice_deck = r#"
* LTspice deck with ^ and LIMIT
B1 OUT 0 V=LIMIT(V(IN)^2, 0, 5)
R1 OUT 0 1k
"#;

    let result = DialectTranspiler::transpile(ltspice_deck);
    assert!(result.rewrites_applied_count >= 2);
    assert!(result.transformed_netlist.contains("set ngbehavior=ltpsa"));
    assert!(result.transformed_netlist.contains("**")); // replaced ^
    assert!(result.transformed_netlist.contains("min(max(")); // replaced LIMIT
}
