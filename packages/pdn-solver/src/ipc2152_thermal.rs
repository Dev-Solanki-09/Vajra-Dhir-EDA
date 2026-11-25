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

/// IPC-2152 (2009) Universal Chart anchor grid (still-air baseline, no internal plane).
const IPC2152_AREAS_MIL2: [f64; 7] = [10.0, 25.0, 50.0, 100.0, 200.0, 500.0, 1000.0];
const IPC2152_DELTAS_C: [f64; 6] = [10.0, 20.0, 30.0, 45.0, 75.0, 100.0];
const IPC2152_CURRENTS_A: [[f64; 7]; 6] = [
    [0.65, 1.15, 1.75, 2.70, 4.10, 7.20, 11.0],
    [0.95, 1.68, 2.55, 3.90, 5.95, 10.4, 15.9],
    [1.20, 2.10, 3.20, 4.90, 7.45, 13.0, 19.9],
    [1.50, 2.65, 4.00, 6.15, 9.35, 16.3, 25.0],
    [1.98, 3.50, 5.30, 8.15, 12.4, 21.6, 33.0],
    [2.35, 4.15, 6.30, 9.65, 14.7, 25.6, 39.2],
];

fn ipc2152_interp_current(area_mil2: f64, delta_t_c: f64, location: TraceLayerLocation) -> f64 {
    if area_mil2 <= 0.0 || delta_t_c <= 0.0 {
        return 0.0;
    }
    let la = area_mil2.ln();
    let ld = delta_t_c.ln();

    let mut ai = 0;
    while ai < IPC2152_AREAS_MIL2.len() - 2 && area_mil2 > IPC2152_AREAS_MIL2[ai + 1] {
        ai += 1;
    }
    let mut di = 0;
    while di < IPC2152_DELTAS_C.len() - 2 && delta_t_c > IPC2152_DELTAS_C[di + 1] {
        di += 1;
    }

    let la0 = IPC2152_AREAS_MIL2[ai].ln();
    let la1 = IPC2152_AREAS_MIL2[ai + 1].ln();
    let ld0 = IPC2152_DELTAS_C[di].ln();
    let ld1 = IPC2152_DELTAS_C[di + 1].ln();
    let ta = (la - la0) / (la1 - la0);
    let td = (ld - ld0) / (ld1 - ld0);

    let c00 = IPC2152_CURRENTS_A[di][ai].ln();
    let c10 = IPC2152_CURRENTS_A[di][ai + 1].ln();
    let c01 = IPC2152_CURRENTS_A[di + 1][ai].ln();
    let c11 = IPC2152_CURRENTS_A[di + 1][ai + 1].ln();

    let log_i = c00 * (1.0 - ta) * (1.0 - td)
        + c10 * ta * (1.0 - td)
        + c01 * (1.0 - ta) * td
        + c11 * ta * td;
    let layer_factor = match location {
        TraceLayerLocation::ExternalTopOrBottom => 1.0,
        TraceLayerLocation::InternalPlaneOrSignal => 0.85,
    };
    log_i.exp() * layer_factor
}

/// Truthful IPC-2221 (1998) empirical formula engine (`k=0.048/0.024, b=0.44, c=0.725`).
pub struct Ipc2221ThermalEngine;

impl Ipc2221ThermalEngine {
    /// Evaluates trace Joule heating temperature rise using IPC-2221 (1998) constants.
    pub fn calculate_temp_rise(
        width_nm: Nm,
        thickness_nm: Nm,
        current_a: f64,
        ambient_temp_c: f64,
        location: TraceLayerLocation,
        max_fr4_temp_c: f64,
    ) -> Ipc2152ThermalReport {
        let w_mil = width_nm as f64 / 25_400.0;
        let t_mil = thickness_nm as f64 / 25_400.0;
        let area_mil2 = w_mil * t_mil;

        let (k, b, c) = match location {
            TraceLayerLocation::ExternalTopOrBottom => (0.048, 0.44, 0.725),
            TraceLayerLocation::InternalPlaneOrSignal => (0.024, 0.44, 0.725),
        };

        let delta_temp_c = if area_mil2 > 0.0 && current_a > 0.0 {
            let denom = k * area_mil2.powf(c);
            (current_a / denom).powf(1.0 / b)
        } else {
            0.0
        };

        build_report(current_a, area_mil2, delta_temp_c, ambient_temp_c, max_fr4_temp_c, width_nm)
    }
}

pub struct Ipc2152ThermalEngine;

impl Ipc2152ThermalEngine {
    /// Evaluates trace Joule heating temperature rise using IPC-2152 (2009)
    /// 2D log-log universal chart interpolation.
    pub fn calculate_temp_rise(
        width_nm: Nm,
        thickness_nm: Nm,
        current_a: f64,
        ambient_temp_c: f64,
        location: TraceLayerLocation,
        max_fr4_temp_c: f64,
    ) -> Ipc2152ThermalReport {
        let w_mil = width_nm as f64 / 25_400.0;
        let t_mil = thickness_nm as f64 / 25_400.0;
        let area_mil2 = w_mil * t_mil;

        let delta_temp_c = if area_mil2 > 0.0 && current_a > 0.0 {
            let mut lo = 0.05_f64;
            let mut hi = 500.0_f64;
            while ipc2152_interp_current(area_mil2, hi, location) < current_a && hi < 10_000.0 {
                hi *= 2.0;
            }
            for _ in 0..48 {
                let mid = 0.5 * (lo + hi);
                if ipc2152_interp_current(area_mil2, mid, location) < current_a {
                    lo = mid;
                } else {
                    hi = mid;
                }
            }
            0.5 * (lo + hi)
        } else {
            0.0
        };

        build_report(current_a, area_mil2, delta_temp_c, ambient_temp_c, max_fr4_temp_c, width_nm)
    }
}

fn build_report(
    current_a: f64,
    area_mil2: f64,
    delta_temp_c: f64,
    ambient_temp_c: f64,
    max_fr4_temp_c: f64,
    width_nm: Nm,
) -> Ipc2152ThermalReport {
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
