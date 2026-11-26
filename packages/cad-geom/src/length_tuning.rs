use serde::{Deserialize, Serialize};

pub type Nm = i64;
pub type IntPoint2D = [Nm; 2];

pub const SPEED_OF_LIGHT_MM_PER_PS: f64 = 0.299792458;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MeanderStyle {
    Trombone,
    Accordion,
    Sawtooth,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeanderParams {
    pub amplitude_nm: Nm,
    pub pitch_nm: Nm,
    pub style: MeanderStyle,
    pub target_length_nm: Nm,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TunedTraceResult {
    pub points: Vec<IntPoint2D>,
    pub total_length_nm: Nm,
    pub delay_ps: f64,
    pub added_meanders_count: usize,
}

pub struct LengthTuningEngine;

impl LengthTuningEngine {
    pub fn compute_delay_ps(length_nm: Nm, er_eff: f64) -> f64 {
        let length_mm = length_nm as f64 / 1_000_000.0;
        (length_mm * er_eff.sqrt()) / SPEED_OF_LIGHT_MM_PER_PS
    }

    pub fn compute_length_for_delay(target_delay_ps: f64, er_eff: f64) -> Nm {
        let length_mm = (target_delay_ps * SPEED_OF_LIGHT_MM_PER_PS) / er_eff.sqrt();
        (length_mm * 1_000_000.0).round() as Nm
    }

    pub fn generate_meander(
        start: IntPoint2D,
        end: IntPoint2D,
        params: &MeanderParams,
        er_eff: f64,
    ) -> TunedTraceResult {
        let dx = (end[0] - start[0]) as f64;
        let dy = (end[1] - start[1]) as f64;
        let base_length = dx.hypot(dy);

        if base_length < 1.0 || params.pitch_nm <= 0 || params.amplitude_nm <= 0 {
            let direct_len = base_length.round() as Nm;
            let delay = Self::compute_delay_ps(direct_len, er_eff);
            return TunedTraceResult {
                points: vec![start, end],
                total_length_nm: direct_len,
                delay_ps: delay,
                added_meanders_count: 0,
            };
        }

        let ux = dx / base_length;
        let uy = dy / base_length;
        let nx = -uy;
        let ny = ux;

        let needed_extra = (params.target_length_nm as f64 - base_length).max(0.0);
        let cycle_extra = 2.0 * params.amplitude_nm as f64;

        let num_cycles = if cycle_extra > 0.0 {
            ((needed_extra / cycle_extra).ceil() as usize).max(1)
        } else {
            1
        };

        let pitch = (params.pitch_nm as f64).min(base_length / (num_cycles as f64 + 1.0));
        let mut pts = vec![start];

        let mut current_pos = pitch / 2.0;
        let mut direction = 1.0;

        for _ in 0..num_cycles {
            if current_pos + pitch > base_length {
                break;
            }

            let cx = start[0] as f64 + ux * current_pos;
            let cy = start[1] as f64 + uy * current_pos;

            let amp = params.amplitude_nm as f64 * direction;
            let p1 = [(cx + nx * amp).round() as Nm, (cy + ny * amp).round() as Nm];

            let next_pos = current_pos + pitch;
            let c2x = start[0] as f64 + ux * next_pos;
            let c2y = start[1] as f64 + uy * next_pos;
            let p2 = [(c2x + nx * amp).round() as Nm, (c2y + ny * amp).round() as Nm];

            pts.push(p1);
            pts.push(p2);

            current_pos = next_pos + pitch / 2.0;
            direction = -direction;
        }

        pts.push(end);

        let mut total_len: Nm = 0;
        for i in 1..pts.len() {
            let seg_dx = (pts[i][0] - pts[i - 1][0]) as f64;
            let seg_dy = (pts[i][1] - pts[i - 1][1]) as f64;
            total_len += seg_dx.hypot(seg_dy).round() as Nm;
        }

        let delay_ps = Self::compute_delay_ps(total_len, er_eff);

        TunedTraceResult {
            points: pts,
            total_length_nm: total_len,
            delay_ps,
            added_meanders_count: num_cycles,
        }
    }
}
