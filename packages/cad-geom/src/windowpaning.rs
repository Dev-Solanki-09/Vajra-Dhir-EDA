use serde::{Deserialize, Serialize};

pub type Nm = i64;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowpaneAperture {
    pub min_x: Nm,
    pub min_y: Nm,
    pub max_x: Nm,
    pub max_y: Nm,
    pub width_nm: Nm,
    pub height_nm: Nm,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowpaneGrid {
    pub pad_width_nm: Nm,
    pub pad_height_nm: Nm,
    pub grid_rows: usize,
    pub grid_cols: usize,
    pub web_gap_nm: Nm,
    pub coverage_ratio: f64,
    pub apertures: Vec<WindowpaneAperture>,
}

pub struct WindowpaningEngine;

impl WindowpaningEngine {
    pub fn compute_stencil_grid(
        center_x: Nm,
        center_y: Nm,
        pad_width_nm: Nm,
        pad_height_nm: Nm,
        target_coverage_ratio: f64,
        rows: usize,
        cols: usize,
        min_web_gap_nm: Nm,
    ) -> WindowpaneGrid {
        let rows = rows.max(1);
        let cols = cols.max(1);

        let total_web_x = min_web_gap_nm * (cols as Nm - 1);
        let total_web_y = min_web_gap_nm * (rows as Nm - 1);

        let avail_w = (pad_width_nm - total_web_x).max(10_000);
        let avail_h = (pad_height_nm - total_web_y).max(10_000);

        let scale = target_coverage_ratio.clamp(0.4, 0.85).sqrt();

        let ap_w = ((avail_w as f64 / cols as f64) * scale).round() as Nm;
        let ap_h = ((avail_h as f64 / rows as f64) * scale).round() as Nm;

        let total_ap_area = (ap_w * ap_h * (rows * cols) as Nm) as f64;
        let pad_area = (pad_width_nm * pad_height_nm) as f64;
        let actual_coverage = if pad_area > 0.0 {
            total_ap_area / pad_area
        } else {
            0.0
        };

        let step_x = if cols > 1 {
            (pad_width_nm - ap_w) / (cols as Nm - 1)
        } else {
            0
        };
        let step_y = if rows > 1 {
            (pad_height_nm - ap_h) / (rows as Nm - 1)
        } else {
            0
        };

        let start_x = center_x - pad_width_nm / 2 + ap_w / 2;
        let start_y = center_y - pad_height_nm / 2 + ap_h / 2;

        let mut apertures = Vec::with_capacity(rows * cols);

        for r in 0..rows {
            for c in 0..cols {
                let cx = start_x + (c as Nm) * step_x;
                let cy = start_y + (r as Nm) * step_y;
                apertures.push(WindowpaneAperture {
                    min_x: cx - ap_w / 2,
                    min_y: cy - ap_h / 2,
                    max_x: cx + ap_w / 2,
                    max_y: cy + ap_h / 2,
                    width_nm: ap_w,
                    height_nm: ap_h,
                });
            }
        }

        WindowpaneGrid {
            pad_width_nm,
            pad_height_nm,
            grid_rows: rows,
            grid_cols: cols,
            web_gap_nm: min_web_gap_nm,
            coverage_ratio: actual_coverage,
            apertures,
        }
    }
}
