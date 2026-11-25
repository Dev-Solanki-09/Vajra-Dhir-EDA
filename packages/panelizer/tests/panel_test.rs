use vd_panelizer::*;

#[test]
fn test_mouse_bites_panelization() {
    let cfg = PanelConfiguration {
        rows: 2,
        cols: 2,
        board_width_nm: 40_000_000,  // 40 mm
        board_height_nm: 30_000_000, // 30 mm
        rail_width_nm: 5_000_000,    // 5 mm
        spacing_x_nm: 2_000_000,     // 2 mm
        spacing_y_nm: 2_000_000,
        separation: SeparationMethod::MouseBites,
    };

    let report = PanelizerEngine::generate_panel(&cfg);

    assert_eq!(report.total_boards_count, 4);
    // Active width = 2 * 40mm + 1 * 2mm = 82mm. Total = 82mm + 2 * 5mm = 92mm = 92_000_000 nm
    assert_eq!(report.total_width_nm, 92_000_000);
    // Active height = 2 * 30mm + 1 * 2mm = 62mm. Total = 62mm + 2 * 5mm = 72mm = 72_000_000 nm
    assert_eq!(report.total_height_nm, 72_000_000);

    assert_eq!(report.tooling_holes.len(), 4);
    assert_eq!(report.fiducials.len(), 3);
    assert!(report.perforation_holes.len() >= 20); // 4 boards * 5 holes per tab
    assert!(report.board_area_utilization_pct > 50.0);
}

#[test]
fn test_v_score_panelization() {
    let cfg = PanelConfiguration {
        rows: 3,
        cols: 4,
        board_width_nm: 25_000_000,
        board_height_nm: 25_000_000,
        rail_width_nm: 5_000_000,
        spacing_x_nm: 0,
        spacing_y_nm: 0,
        separation: SeparationMethod::VScore,
    };

    let report = PanelizerEngine::generate_panel(&cfg);
    assert_eq!(report.total_boards_count, 12);
    assert_eq!(report.v_score_lines_count, 5); // 2 horizontal + 3 vertical cuts
    assert!(report.perforation_holes.is_empty());
}

#[test]
fn test_kicad10_panel_pcb_export_round_trip() {
    let cfg = PanelConfiguration {
        rows: 2,
        cols: 2,
        board_width_nm: 40_000_000,
        board_height_nm: 30_000_000,
        rail_width_nm: 5_000_000,
        spacing_x_nm: 2_000_000,
        spacing_y_nm: 2_000_000,
        separation: SeparationMethod::MouseBites,
    };
    let report = PanelizerEngine::generate_panel(&cfg);
    let sexpr_text = PanelizerEngine::export_kicad10_panel_pcb(&cfg, &report);

    assert!(sexpr_text.contains("(kicad_pcb"));
    assert!(sexpr_text.contains("92.000000 72.000000"));
    assert!(sexpr_text.contains("Edge.Cuts"));

    let ast = vd_transcoder::SExpr::parse(&sexpr_text).expect("Panel .kicad_pcb must parse cleanly");
    assert_eq!(ast.len(), 1, "Expected single top-level kicad_pcb S-expr node");
}
