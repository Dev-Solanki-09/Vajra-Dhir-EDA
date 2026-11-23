use serde::{Deserialize, Serialize};
use vd_ir::model::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopperLayerProperties {
    pub thickness_nm: Nm, // 35_000 nm for 1 oz (35 um), 70_000 nm for 2 oz
    pub operating_temp_c: f64,
}

impl Default for CopperLayerProperties {
    fn default() -> Self {
        Self {
            thickness_nm: 35_000, // 1 oz copper
            operating_temp_c: 25.0,
        }
    }
}

impl CopperLayerProperties {
    /// Resistivity of copper at operating temperature: rho(T) = rho_20 * (1 + alpha * (T - 20))
    pub fn resistivity_ohm_m(&self) -> f64 {
        let rho_20 = 1.724e-8; // annealed copper standard
        let alpha = 0.00393;
        rho_20 * (1.0 + alpha * (self.operating_temp_c - 20.0))
    }

    /// Sheet resistance in ohms per square: R_sq = rho / thickness
    pub fn sheet_resistance_ohms(&self) -> f64 {
        let t_m = self.thickness_nm as f64 * 1e-9;
        self.resistivity_ohm_m() / t_m
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraceSegment {
    pub net_name: String,
    pub length_nm: Nm,
    pub width_nm: Nm,
    pub current_a: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViaSegment {
    pub net_name: String,
    pub drill_diameter_nm: Nm,   // e.g. 300_000 nm (0.3 mm)
    pub plating_thickness_nm: Nm, // e.g. 20_000 nm (20 um electroplated copper)
    pub barrel_height_nm: Nm,    // e.g. 1_600_000 nm (1.6 mm standard FR4)
    pub current_a: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdnDropResult {
    pub net_name: String,
    pub trace_resistance_ohms: f64,
    pub via_resistance_ohms: f64,
    pub total_resistance_ohms: f64,
    pub total_voltage_drop_mv: f64,
    pub max_voltage_drop_pct: f64,
    pub nominal_rail_voltage_v: f64,
    pub current_density_a_per_mm2: f64,
    pub is_within_spec: bool,
    pub warnings: Vec<String>,
}

pub struct PdnIrDropSolver;

impl PdnIrDropSolver {
    /// Solves DC voltage drop across a power distribution rail trace segment and via transition.
    pub fn solve_rail_segment(
        layer_props: &CopperLayerProperties,
        nominal_rail_v: f64,
        max_allowed_drop_pct: f64,
        trace: &TraceSegment,
        via: Option<&ViaSegment>,
    ) -> PdnDropResult {
        let mut warnings = Vec::new();

        // 1. Trace resistance: R_trace = R_sq * (length / width)
        let r_sq = layer_props.sheet_resistance_ohms();
        let num_squares = trace.length_nm as f64 / trace.width_nm as f64;
        let trace_resistance_ohms = r_sq * num_squares;

        // Current density: J = I / Area
        let trace_w_mm = trace.width_nm as f64 * 1e-6;
        let trace_t_mm = layer_props.thickness_nm as f64 * 1e-6;
        let area_mm2 = trace_w_mm * trace_t_mm;
        let current_density_a_per_mm2 = trace.current_a / area_mm2;

        // Safe current density check: > 35 A/mm^2 for 1oz copper induces high thermal rise
        if current_density_a_per_mm2 > 35.0 {
            warnings.push(format!(
                "High current density J = {:.1} A/mm^2 (exceeds recommended 35 A/mm^2 baseline).",
                current_density_a_per_mm2
            ));
        }

        // 2. Via resistance: R_via = (rho * h) / (pi * (d*t - t^2))
        let via_resistance_ohms = match via {
            Some(v) => {
                let rho = layer_props.resistivity_ohm_m();
                let h_m = v.barrel_height_nm as f64 * 1e-9;
                let d_m = v.drill_diameter_nm as f64 * 1e-9;
                let t_m = v.plating_thickness_nm as f64 * 1e-9;

                let cross_sec_area_m2 = std::f64::consts::PI * (d_m * t_m - t_m * t_m);
                let r_via = (rho * h_m) / cross_sec_area_m2;

                if v.current_a > 1.5 {
                    warnings.push(format!(
                        "Via on net '{}' carries {:.2} A (exceeds 1.5 A single-via limit; add parallel stitching vias).",
                        v.net_name, v.current_a
                    ));
                }

                r_via
            }
            None => 0.0,
        };

        let total_resistance_ohms = trace_resistance_ohms + via_resistance_ohms;
        let total_voltage_drop_v = trace.current_a * total_resistance_ohms;
        let total_voltage_drop_mv = total_voltage_drop_v * 1000.0;

        let max_voltage_drop_pct = (total_voltage_drop_v / nominal_rail_v) * 100.0;
        let is_within_spec = max_voltage_drop_pct <= max_allowed_drop_pct;

        if !is_within_spec {
            warnings.push(format!(
                "DC IR drop {:.2}% exceeds max allowable {:.1}% on {:.1}V rail.",
                max_voltage_drop_pct, max_allowed_drop_pct, nominal_rail_v
            ));
        }

        PdnDropResult {
            net_name: trace.net_name.clone(),
            trace_resistance_ohms,
            via_resistance_ohms,
            total_resistance_ohms,
            total_voltage_drop_mv,
            max_voltage_drop_pct,
            nominal_rail_voltage_v: nominal_rail_v,
            current_density_a_per_mm2,
            is_within_spec,
            warnings,
        }
    }
}
