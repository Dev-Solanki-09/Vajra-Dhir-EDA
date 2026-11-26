use serde::{Deserialize, Serialize};

pub type Nm = i64;
pub type IntPoint2D = [Nm; 2];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffPairSegment {
    pub p_center: IntPoint2D,
    pub n_center: IntPoint2D,
    pub width_nm: Nm,
    pub gap_nm: Nm,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoupledDiffPairTrajectory {
    pub p_trace_points: Vec<IntPoint2D>,
    pub n_trace_points: Vec<IntPoint2D>,
    pub p_length_nm: u64,
    pub n_length_nm: u64,
    pub skew_diff_nm: u64,
    pub target_impedance_zdiff_ohm: f64,
}

pub struct DifferentialPairEngine;

impl DifferentialPairEngine {
    /// Generate positive and negative trace centerlines from a guide path with width W and gap S.
    pub fn compute_coupled_pair(
        guide_path: &[IntPoint2D],
        width_nm: Nm,
        gap_nm: Nm,
        target_zdiff: f64,
    ) -> Option<CoupledDiffPairTrajectory> {
        if guide_path.len() < 2 {
            return None;
        }

        let half_dist = (width_nm + gap_nm) / 2;

        let mut p_points: Vec<IntPoint2D> = Vec::with_capacity(guide_path.len());
        let mut n_points: Vec<IntPoint2D> = Vec::with_capacity(guide_path.len());

        let mut p_len: u64 = 0;
        let mut n_len: u64 = 0;

        for i in 0..guide_path.len() {
            let curr = guide_path[i];

            // Direction vector
            let (dx, dy) = if i + 1 < guide_path.len() {
                let next = guide_path[i + 1];
                ((next[0] - curr[0]) as f64, (next[1] - curr[1]) as f64)
            } else {
                let prev = guide_path[i - 1];
                ((curr[0] - prev[0]) as f64, (curr[1] - prev[1]) as f64)
            };

            let len = (dx * dx + dy * dy).sqrt();
            if len < 1.0 {
                continue;
            }

            // Normal vector (-dy, dx) normalized
            let nx = -dy / len;
            let ny = dx / len;

            let p_x = (curr[0] as f64 + nx * half_dist as f64).round() as Nm;
            let p_y = (curr[1] as f64 + ny * half_dist as f64).round() as Nm;

            let n_x = (curr[0] as f64 - nx * half_dist as f64).round() as Nm;
            let n_y = (curr[1] as f64 - ny * half_dist as f64).round() as Nm;

            if let Some(last_p) = p_points.last() {
                let seg_dx = (p_x - last_p[0]) as f64;
                let seg_dy = (p_y - last_p[1]) as f64;
                p_len += (seg_dx * seg_dx + seg_dy * seg_dy).sqrt() as u64;
            }
            if let Some(last_n) = n_points.last() {
                let seg_dx = (n_x - last_n[0]) as f64;
                let seg_dy = (n_y - last_n[1]) as f64;
                n_len += (seg_dx * seg_dx + seg_dy * seg_dy).sqrt() as u64;
            }

            p_points.push([p_x, p_y]);
            n_points.push([n_x, n_y]);
        }

        let skew_diff_nm = p_len.abs_diff(n_len);

        Some(CoupledDiffPairTrajectory {
            p_trace_points: p_points,
            n_trace_points: n_points,
            p_length_nm: p_len,
            n_length_nm: n_len,
            skew_diff_nm,
            target_impedance_zdiff_ohm: target_zdiff,
        })
    }
}
