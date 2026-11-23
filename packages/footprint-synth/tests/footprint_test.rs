use vd_footprint_synth::*;

#[test]
fn test_chip_footprint_synthesis() {
    // 0603 passive (1.6 mm x 0.8 mm, terminal 0.3 mm)
    let fp = FootprintSynthesizer::synthesize_chip(
        "R_0603_1608Metric",
        1_600_000,
        800_000,
        300_000,
        DensityLevel::Nominal,
    )
    .expect("Failed to synthesize 0603");

    assert_eq!(fp.pads.len(), 2);
    assert_eq!(fp.pads[0].number, "1");
    assert_eq!(fp.pads[1].number, "2");
    assert!(fp.pads[0].x_nm < 0);
    assert!(fp.pads[1].x_nm > 0);

    // Verify courtyard boundary covers component + pads + margin
    let (x1, y1, x2, y2) = fp.courtyard_bbox_nm;
    assert!(x1 < -1_000_000);
    assert!(x2 > 1_000_000);
    assert!(y1 < -500_000);
    assert!(y2 > 500_000);
}

#[test]
fn test_qfn_footprint_synthesis() {
    // QFN-16 (3 mm x 3 mm body, 0.5 mm pitch, 1.6 mm EP)
    let fp = FootprintSynthesizer::synthesize_qfn(
        "QFN-16-1EP_3x3mm_P0.5mm",
        16,
        3_000_000,
        500_000,
        250_000,
        400_000,
        Some(1_600_000),
        DensityLevel::Nominal,
    )
    .expect("Failed to synthesize QFN-16");

    assert_eq!(fp.pads.len(), 17, "16 signal pads + 1 central EP pad");
    let ep_pad = fp.pads.iter().find(|p| p.number == "EP").expect("Missing EP pad");
    assert_eq!(ep_pad.x_nm, 0);
    assert_eq!(ep_pad.y_nm, 0);
    assert_eq!(ep_pad.width_nm, 1_600_000);
    assert!(ep_pad.is_thermal_pad);
}

#[test]
fn test_kicad10_mod_export() {
    let fp = FootprintSynthesizer::synthesize_chip(
        "C_0402_1005Metric",
        1_000_000,
        500_000,
        250_000,
        DensityLevel::Least,
    )
    .expect("Failed to synthesize 0402");

    let sexpr = FootprintSynthesizer::export_kicad10_mod(&fp);
    assert!(sexpr.contains("(footprint \"C_0402_1005Metric\""));
    assert!(sexpr.contains("(version 20240108)"));
    assert!(sexpr.contains("(generator \"vajra-dhir-footprint-synth\")"));
    assert!(sexpr.contains("(layer \"F.CrtYd\")"));
    assert!(sexpr.contains("(layer \"F.SilkS\")"));
    assert!(sexpr.contains("(pad \"1\" smd roundrect"));
    assert!(sexpr.contains("(layers \"F.Cu\" \"F.Paste\" \"F.Mask\")"));
}
