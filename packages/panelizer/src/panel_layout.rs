use serde::{Deserialize, Serialize};
use vd_ir::model::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SeparationMethod {
    MouseBites,
    VScore,
    MilledSlots,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PanelConfiguration {
    pub rows: usize,
    pub cols: usize,
    pub board_width_nm: Nm,
    pub board_height_nm: Nm,
    pub rail_width_nm: Nm,   // standard 5.0 mm = 5_000_000 nm
    pub spacing_x_nm: Nm,    // e.g. 2.0 mm milled slot
    pub spacing_y_nm: Nm,    // e.g. 2.0 mm milled slot
    pub separation: SeparationMethod,
}

impl Default for PanelConfiguration {
    fn default() -> Self {
        Self {
            rows: 2,
            cols: 3,
            board_width_nm: 50_000_000,  // 50 mm
            board_height_nm: 40_000_000, // 40 mm
            rail_width_nm: 5_000_000,    // 5 mm rails
            spacing_x_nm: 2_000_000,     // 2 mm gap
            spacing_y_nm: 2_000_000,
            separation: SeparationMethod::MouseBites,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerforationHole {
    pub x_nm: Nm,
    pub y_nm: Nm,
    pub diameter_nm: Nm, // e.g. 500_000 nm (0.5 mm)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FiducialMarker {
    pub x_nm: Nm,
    pub y_nm: Nm,
    pub copper_diameter_nm: Nm, // 1_000_000 nm (1.0 mm)
    pub mask_clearance_nm: Nm,  // 2_000_000 nm (2.0 mm)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolingHole {
    pub x_nm: Nm,
    pub y_nm: Nm,
    pub diameter_nm: Nm, // 3_200_000 nm (3.2 mm NPTH for conveyor pins)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PanelLayoutReport {
    pub total_width_nm: Nm,
    pub total_height_nm: Nm,
    pub total_boards_count: usize,
    pub board_area_utilization_pct: f64,
    pub perforation_holes: Vec<PerforationHole>,
    pub fiducials: Vec<FiducialMarker>,
    pub tooling_holes: Vec<ToolingHole>,
    pub v_score_lines_count: usize,
}

pub struct PanelizerEngine;

impl PanelizerEngine {
    /// Generates a complete production panel with rails, tooling holes, fiducials, and breakout tabs.
    pub fn generate_panel(config: &PanelConfiguration) -> PanelLayoutReport {
        let active_w = (config.cols as Nm * config.board_width_nm)
            + ((config.cols.saturating_sub(1)) as Nm * config.spacing_x_nm);
        let active_h = (config.rows as Nm * config.board_height_nm)
            + ((config.rows.saturating_sub(1)) as Nm * config.spacing_y_nm);

        let total_width_nm = active_w + (2 * config.rail_width_nm);
        let total_height_nm = active_h + (2 * config.rail_width_nm);

        let total_boards_count = config.rows * config.cols;
        let total_board_area_nm2 = total_boards_count as f64 * (config.board_width_nm as f64 * config.board_height_nm as f64);
        let total_panel_area_nm2 = total_width_nm as f64 * total_height_nm as f64;
        let board_area_utilization_pct = (total_board_area_nm2 / total_panel_area_nm2) * 100.0;

        // 1. Tooling holes: 4 corners of the panel rails (centered in rail margin, e.g. 2.5mm from edges)
        let margin_nm = config.rail_width_nm / 2;
        let tooling_holes = vec![
            ToolingHole { x_nm: margin_nm, y_nm: margin_nm, diameter_nm: 3_200_000 },
            ToolingHole { x_nm: total_width_nm - margin_nm, y_nm: margin_nm, diameter_nm: 3_200_000 },
            ToolingHole { x_nm: margin_nm, y_nm: total_height_nm - margin_nm, diameter_nm: 3_200_000 },
            ToolingHole { x_nm: total_width_nm - margin_nm, y_nm: total_height_nm - margin_nm, diameter_nm: 3_200_000 },
        ];

        // 2. Optical Fiducials: 3 corners for non-symmetric machine vision orientation
        let fid_offset_nm = config.rail_width_nm / 2;
        let fiducials = vec![
            FiducialMarker { x_nm: fid_offset_nm + 7_000_000, y_nm: fid_offset_nm, copper_diameter_nm: 1_000_000, mask_clearance_nm: 2_000_000 },
            FiducialMarker { x_nm: total_width_nm - fid_offset_nm - 7_000_000, y_nm: fid_offset_nm, copper_diameter_nm: 1_000_000, mask_clearance_nm: 2_000_000 },
            FiducialMarker { x_nm: fid_offset_nm + 7_000_000, y_nm: total_height_nm - fid_offset_nm, copper_diameter_nm: 1_000_000, mask_clearance_nm: 2_000_000 },
        ];

        // 3. Separation features
        let mut perforation_holes = Vec::new();
        let mut v_score_lines_count = 0;

        match config.separation {
            SeparationMethod::MouseBites => {
                // Generate 5-hole perforation tabs across each board bridge
                let hole_diam = 500_000; // 0.5 mm
                let hole_pitch = 800_000; // 0.8 mm pitch

                for r in 0..config.rows {
                    for c in 0..config.cols {
                        let bx = config.rail_width_nm + (c as Nm * (config.board_width_nm + config.spacing_x_nm));
                        let by = config.rail_width_nm + (r as Nm * (config.board_height_nm + config.spacing_y_nm));

                        // Top tab center
                        let tab_center_x = bx + (config.board_width_nm / 2);
                        let tab_y = by + config.board_height_nm;

                        for k in -2..=2 {
                            perforation_holes.push(PerforationHole {
                                x_nm: tab_center_x + (k * hole_pitch),
                                y_nm: tab_y,
                                diameter_nm: hole_diam,
                            });
                        }
                    }
                }
            }
            SeparationMethod::VScore => {
                v_score_lines_count = (config.rows.saturating_sub(1)) + (config.cols.saturating_sub(1));
            }
            SeparationMethod::MilledSlots => {}
        }

        PanelLayoutReport {
            total_width_nm,
            total_height_nm,
            total_boards_count,
            board_area_utilization_pct,
            perforation_holes,
            fiducials,
            tooling_holes,
            v_score_lines_count,
        }
    }
}
