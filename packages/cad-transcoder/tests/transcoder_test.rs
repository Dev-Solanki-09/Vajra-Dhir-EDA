use vd_cad_transcoder::{
    EchoSuppressionRing, KiCadSchTranscoder, SExpr,
};
use vd_ir::model::HardwareEntity;

#[test]
fn test_echo_suppression_ring_window() {
    let mut ring = EchoSuppressionRing::new();
    let file_hash = "a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890";

    // Record a self-write
    ring.record_write(file_hash);

    // Immediate incoming file watcher notification with same hash -> MUST SUPPRESS
    assert!(
        ring.should_suppress(file_hash),
        "File event matching self-write must be suppressed"
    );

    // Unrelated file hash -> MUST NOT SUPPRESS
    let other_hash = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    assert!(
        !ring.should_suppress(other_hash),
        "Unrelated file hash must not be suppressed"
    );
}

#[test]
fn test_sexpr_kicad_sch_transcoding() {
    let sch_snippet = r#"
        (kicad_sch
            (version 20231120)
            (generator "eeschema")
            (symbol
                (lib_id "Device:R")
                (at 1000 2000 90)
                (property "Reference" "R1" (at 1000 1900 0))
                (property "Value" "10k" (at 1000 2100 0))
                (property "Footprint" "Resistor_SMD:R_0402_1005Metric" (at 1000 2000 0))
            )
        )
    "#;

    let ast = SExpr::parse(sch_snippet).expect("S-expression parse failed");
    let components = KiCadSchTranscoder::extract_components(&ast);

    assert_eq!(components.len(), 1);
    let comp = &components[0];
    assert_eq!(comp.refdes, "R1");
    assert_eq!(comp.value, "10k");
    assert_eq!(comp.footprint, "Resistor_SMD:R_0402_1005Metric");
    assert_eq!(comp.x_mils, 1000.0);
    assert_eq!(comp.y_mils, 2000.0);
    assert_eq!(comp.rot_deg, 90.0);

    // Transcode to HW-IR
    let hw_ir_ent = KiCadSchTranscoder::to_hw_ir(comp, "board-123");
    if let HardwareEntity::Component {
        refdes,
        value_str,
        x_nm,
        y_nm,
        rot_mdeg,
        ..
    } = hw_ir_ent
    {
        assert_eq!(refdes, "R1");
        assert_eq!(value_str, "10k");
        // 1000 mils * 25,400 nm/mil = 25,400,000 nm
        assert_eq!(x_nm, 25_400_000);
        // 2000 mils * 25,400 nm/mil = 50,800,000 nm
        assert_eq!(y_nm, 50_800_000);
        // 90 deg = 90,000 mdeg
        assert_eq!(rot_mdeg, 90000);
    } else {
        panic!("Expected Component entity");
    }
}
