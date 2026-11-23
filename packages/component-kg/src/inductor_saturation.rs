use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InductorSpec {
    pub nominal_inductance_uh: f64,
    pub isat_a: f64,           // Saturation current (typically -30% drop point)
    pub irms_a: f64,           // Thermal current (typically +40C rise point)
    pub dcr_mohm: f64,         // DC resistance
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InductorOperatingResult {
    pub nominal_inductance_uh: f64,
    pub effective_inductance_uh: f64,
    pub peak_current_a: f64,
    pub rms_current_a: f64,
    pub is_saturated: bool,
    pub temperature_rise_c: f64,
    pub warning: Option<String>,
}

pub struct InductorSaturationEngine;

impl InductorSaturationEngine {
    /// Evaluate inductor behavior under operating DC bias and ripple current.
    pub fn evaluate_inductor(
        spec: &InductorSpec,
        dc_current_a: f64,
        ripple_current_p2p_a: f64,
    ) -> InductorOperatingResult {
        let peak_current_a = dc_current_a + (ripple_current_p2p_a / 2.0);
        let rms_current_a = (dc_current_a.powi(2) + (ripple_current_p2p_a.powi(2) / 12.0)).sqrt();

        // Inductance drop curve: L(I) = L0 * (1 - 0.3 * (I / Isat)^3) clamped
        let isat_ratio = peak_current_a / spec.isat_a;
        let eff_l = if isat_ratio <= 1.0 {
            spec.nominal_inductance_uh * (1.0 - 0.30 * isat_ratio.powi(3))
        } else {
            // Rapid collapse past Isat
            spec.nominal_inductance_uh * (0.70 / (1.0 + (isat_ratio - 1.0) * 4.0))
        };

        let is_saturated = peak_current_a >= spec.isat_a;

        // Thermal heating: DT = 40C * (Irms / Irms_rated)^2
        let irms_ratio = rms_current_a / spec.irms_a;
        let temperature_rise_c = 40.0 * irms_ratio.powi(2);

        let warning = if is_saturated {
            Some(format!(
                "CRITICAL_EE_FOOTGUN: Peak inductor current ({:.2}A) exceeds Isat ({:.2}A)! Inductance collapsed to {:.2}uH ({:.1}% of nominal). Risk of SMPS switch MOSFET destruction.",
                peak_current_a, spec.isat_a, eff_l, (eff_l / spec.nominal_inductance_uh) * 100.0
            ))
        } else if temperature_rise_c > 50.0 {
            Some(format!(
                "WARNING: Inductor thermal rise of {:.1}C exceeds safe margin (RMS current {:.2}A vs rated {:.2}A).",
                temperature_rise_c, rms_current_a, spec.irms_a
            ))
        } else {
            None
        };

        InductorOperatingResult {
            nominal_inductance_uh: spec.nominal_inductance_uh,
            effective_inductance_uh: eff_l,
            peak_current_a,
            rms_current_a,
            is_saturated,
            temperature_rise_c,
            warning,
        }
    }
}
