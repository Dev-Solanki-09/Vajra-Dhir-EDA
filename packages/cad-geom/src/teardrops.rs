use serde::{Deserialize, Serialize};

pub type Nm = i64;
pub type IntPoint2D = [Nm; 2];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeardropParams {
    pub fillet_length_ratio: f64,
    pub max_width_ratio: f64,
    pub curved: bool,
}

impl Default for TeardropParams {
    fn default() -> Self {
        Self {
            fillet_length_ratio: 1.0,
            max_width_ratio: 0.8,
            curved: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeardropFillet {
    pub polygon_points: Vec<IntPoint2D>,
    pub pad_center: IntPoint2D,
    pub trace_neck_point: IntPoint2D,
}

pub struct TeardropEngine;

impl TeardropEngine {
    pub fn synthesize_teardrop(
        pad_center: IntPoint2D,
        pad_radius_nm: Nm,
        trace_pt: IntPoint2D,
        trace_width_nm: Nm,
        params: &TeardropParams,
    ) -> Option<TeardropFillet> {
        let dx = (trace_pt[0] - pad_center[0]) as f64;
        let dy = (trace_pt[1] - pad_center[1]) as f64;
        let dist = dx.hypot(dy);

        if dist < pad_radius_nm as f64 {
            return None;
        }

        let ux = dx / dist;
        let uy = dy / dist;
        let nx = -uy;
        let ny = ux;

        let fillet_len = (pad_radius_nm as f64 * params.fillet_length_ratio).min(dist);
        let trace_hw = trace_width_nm as f64 / 2.0;
        let pad_hw = (pad_radius_nm as f64 * params.max_width_ratio).max(trace_hw);

        let neck_x = pad_center[0] as f64 + ux * fillet_len;
        let neck_y = pad_center[1] as f64 + uy * fillet_len;

        let p_neck_left = [
            (neck_x + nx * trace_hw).round() as Nm,
            (neck_y + ny * trace_hw).round() as Nm,
        ];
        let p_neck_right = [
            (neck_x - nx * trace_hw).round() as Nm,
            (neck_y - ny * trace_hw).round() as Nm,
        ];

        let base_x = pad_center[0] as f64 + ux * (pad_radius_nm as f64 * 0.5);
        let base_y = pad_center[1] as f64 + uy * (pad_radius_nm as f64 * 0.5);

        let p_base_left = [
            (base_x + nx * pad_hw).round() as Nm,
            (base_y + ny * pad_hw).round() as Nm,
        ];
        let p_base_right = [
            (base_x - nx * pad_hw).round() as Nm,
            (base_y - ny * pad_hw).round() as Nm,
        ];

        let poly = vec![
            pad_center,
            p_base_left,
            p_neck_left,
            p_neck_right,
            p_base_right,
        ];

        Some(TeardropFillet {
            polygon_points: poly,
            pad_center,
            trace_neck_point: [(neck_x).round() as Nm, (neck_y).round() as Nm],
        })
    }
}
