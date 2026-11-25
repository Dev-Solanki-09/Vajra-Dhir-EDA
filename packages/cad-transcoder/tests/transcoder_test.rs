use vd_transcoder::{
    EagleBoardParser, EchoSuppressionRing, GerberOpKind, GerberParser, GerberPlotter,
    KiCadSchTranscoder, SExpr,
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

#[test]
fn test_kicad_sch_golden_round_trip_ast_equivalence() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let sch_path = manifest_dir.join("../../designs/board-1-buck-pd/board.kicad_sch");
    let raw = std::fs::read_to_string(&sch_path).expect("board-1-buck-pd/board.kicad_sch must exist");
    let ast1 = SExpr::parse(&raw).expect("Initial parse of board.kicad_sch failed");
    assert!(!ast1.is_empty(), "Expected non-empty SExpr AST");

    let serialized: String = ast1
        .iter()
        .map(|node| node.to_string_formatted(0))
        .collect::<Vec<_>>()
        .join("\n");
    let ast2 = SExpr::parse(&serialized).expect("Re-parse after serialize failed");
    assert_eq!(ast1, ast2, "AST must round-trip identically after serialize()");
}

#[test]
fn test_rs274x_golden_fixture_round_trip() {
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let gbr_path = manifest_dir.join("../../tests/fixtures/rs274x/sample_pad_flash.gbr");
    let raw = std::fs::read_to_string(&gbr_path).expect("sample_pad_flash.gbr fixture missing");
    let doc1 = GerberParser::parse(&raw).expect("RS-274X parse failed");

    assert_eq!(doc1.file_function.as_deref(), Some("Copper,L1,Top"));
    assert_eq!(doc1.apertures.len(), 2);
    assert_eq!(doc1.operations.iter().filter(|o| o.op == GerberOpKind::Draw).count(), 1);
    assert_eq!(doc1.operations.iter().filter(|o| o.op == GerberOpKind::Move).count(), 1);
    assert_eq!(doc1.operations.iter().filter(|o| o.op == GerberOpKind::Flash).count(), 2);

    let reemitted = GerberPlotter::emit(&doc1);
    let doc2 = GerberParser::parse(&reemitted).expect("Re-parse of emitted RS-274X failed");
    assert_eq!(doc1, doc2, "RS-274X document must round-trip deterministically");
}

#[test]
fn test_eagle_xml_import_nanometers() {
    let xml = r#"
        <eagle version="9.6.2">
          <drawing>
            <board>
              <elements>
                <element name="R1" package="R0603" value="10k" x="12.5" y="4.0" rot="R90"/>
              </elements>
              <signals>
                <signal name="VIN">
                  <wire x1="0.0" y1="0.0" x2="12.5" y2="4.0" width="0.25" layer="1"/>
                </signal>
              </signals>
            </board>
          </drawing>
        </eagle>
    "#;
    let board = EagleBoardParser::parse(xml).expect("EAGLE XML parse failed");
    assert_eq!(board.elements.len(), 1);
    assert_eq!(board.elements[0].name, "R1");
    assert_eq!(board.elements[0].x_nm, 12_500_000);
    assert_eq!(board.elements[0].y_nm, 4_000_000);
    assert_eq!(board.elements[0].rot_mdeg, 90_000);

    assert_eq!(board.wires.len(), 1);
    assert_eq!(board.wires[0].signal, "VIN");
    assert_eq!(board.wires[0].width_nm, 250_000);
}
