use serde::{Deserialize, Serialize};
use vd_ir::model::Nm;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StencilApertureSpec {
    pub pad_width_nm: Nm,
    pub pad_length_nm: Nm,
    pub foil_thickness_nm: Nm, // e.g. 120_000 nm (120 um / 4.7 mil)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StencilDfmReport {
    pub area_ratio: f64,
    pub aspect_ratio: f64,
    pub satisfies_ipc_7525b: bool,
    pub window_paning_applied: bool,
    pub sub_apertures_count: usize,
    pub coverage_percentage: f64,
    pub recommendations: Vec<String>,
}

pub struct StencilDfmEngine;

impl StencilDfmEngine {
    /// Evaluates IPC-7525B rules and generates window-paning for large thermal pads.
    pub fn evaluate_aperture(spec: &StencilApertureSpec) -> StencilDfmReport {
        let w = spec.pad_width_nm as f64;
        let l = spec.pad_length_nm as f64;
        let t = spec.foil_thickness_nm as f64;

        let aspect_ratio = w.min(l) / t;
        let area_ratio = (w * l) / (2.0 * (w + l) * t);

        let mut recommendations = Vec::new();
        let mut window_paning_applied = false;
        let mut sub_apertures_count = 1;
        let mut coverage_percentage = 100.0;

        // IPC-7525B criteria: Area ratio >= 0.66, Aspect ratio >= 1.50
        if area_ratio < 0.66 {
            recommendations.push(format!(
                "Area ratio {:.2} < 0.66: High solder paste release failure hazard. Reduce stencil foil thickness.",
                area_ratio
            ));
        }

        if aspect_ratio < 1.50 {
            recommendations.push(format!(
                "Aspect ratio {:.2} < 1.50: Insufficient paste release. Increase aperture width.",
                aspect_ratio
            ));
        }

        // Large pad check (> 2.5 mm in either dimension -> window-pane)
        let large_pad_threshold_nm: Nm = 2_500_000;
        if spec.pad_width_nm >= large_pad_threshold_nm && spec.pad_length_nm >= large_pad_threshold_nm {
            window_paning_applied = true;
            // Split into 2x2 or 3x3 window panes with 60% nominal paste coverage
            sub_apertures_count = if spec.pad_width_nm >= 4_000_000 { 9 } else { 4 };
            coverage_percentage = 65.0; // 65% paste coverage prevents component lifting/bridging
            recommendations.push(format!(
                "Applied {}x window-pane aperture matrix (coverage reduced to {:.0}%) to prevent solder balling/bridging.",
                sub_apertures_count, coverage_percentage
            ));
        }

        let satisfies_ipc_7525b = area_ratio >= 0.66 && aspect_ratio >= 1.50;

        StencilDfmReport {
            area_ratio,
            aspect_ratio,
            satisfies_ipc_7525b,
            window_paning_applied,
            sub_apertures_count,
            coverage_percentage,
            recommendations,
        }
    }
}
