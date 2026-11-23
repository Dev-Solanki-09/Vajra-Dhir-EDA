use serde::{Deserialize, Serialize};
use vd_ir::model::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TraceLayerLocation {
    ExternalTopOrBottom,
    InternalPlaneOrSignal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ipc2152ThermalReport {
    pub current_a: f64,
    pub area_mil2: f64,
    pub delta_temp_c: f64,
    pub final_trace_temp_c: f64,
    pub max_dielectric_temp_c: f64,
    pub is_safe: bool,
    pub recommendation: String,
}

pub struct Ipc2152ThermalEngine;

impl Ipc2152ThermalEngine {
    /// Evaluates trace Joule heating temperature rise based on IPC-2152 universal charts.
    pub fn calculate_temp_rise(
        width_nm: Nm,
        thickness_nm: Nm,
        current_a: f64,
        ambient_temp_c: f64,
        location: TraceLayerLocation,
        max_fr4_temp_c: f64,
    ) -> Ipc2152ThermalReport {
        // 1 mil = 25,400 nm
        let w_mil = width_nm as f64 / 25_400.0;
        let t_mil = thickness_nm as f64 / 25_400.0;
        let area_mil2 = w_mil * t_mil;

        let (k, b, c) = match location {
            TraceLayerLocation::ExternalTopOrBottom => (0.048, 0.44, 0.725),
            TraceLayerLocation::InternalPlaneOrSignal => (0.024, 0.44, 0.725),
        };

        // I = k * (delta_T)^b * (Area)^c
        // delta_T = ( I / (k * Area^c) )^(1 / b)
        let delta_temp_c = if area_mil2 > 0.0 && current_a > 0.0 {
            let denom = k * area_mil2.powf(c);
            (current_a / denom).powf(1.0 / b)
        } else {
            0.0
        };

        let final_trace_temp_c = ambient_temp_c + delta_temp_c;
        let is_safe = final_trace_temp_c <= max_fr4_temp_c;

        let recommendation = if !is_safe {
            format!(
                "Trace temperature {:.1}°C exceeds FR4 limit {:.0}°C. Increase trace width from {:.2} mm or use 2oz copper.",
                final_trace_temp_c, max_fr4_temp_c, width_nm as f64 * 1e-6
            )
        } else if delta_temp_c > 30.0 {
            format!(
                "High temperature rise (+{:.1}°C). Consider widening trace to minimize thermal stress.",
                delta_temp_c
            )
        } else {
            "Trace thermal profile is optimal (low thermal rise).".into()
        };

        Ipc2152ThermalReport {
            current_a,
            area_mil2,
            delta_temp_c,
            final_trace_temp_c,
            max_dielectric_temp_c: max_fr4_temp_c,
            is_safe,
            recommendation,
        }
    }
}
