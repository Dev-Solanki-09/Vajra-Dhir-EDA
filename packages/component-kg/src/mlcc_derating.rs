use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DielectricType {
    C0G_NP0, // Class 1: Ultra-stable, 0% DC-bias drop, 0% temp coefficient
    X7R,     // Class 2: ±15% temp variation, moderate DC bias drop
    X5R,     // Class 2: ±15% temp variation, higher DC bias drop in small package
    X8R,     // Class 2: Automotive high temp 150C
    Y5V,     // Class 3: Catastrophic -82% temp variation, severe DC bias collapse
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CaseSize {
    Metric0402, // 01005 imperial
    Metric0603, // 0201 imperial
    Metric1005, // 0402 imperial
    Metric1608, // 0603 imperial
    Metric2012, // 0805 imperial
    Metric3216, // 1206 imperial
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MlccSpec {
    pub nominal_capacitance_uf: f64,
    pub rated_voltage_v: f64,
    pub dielectric: DielectricType,
    pub case_size: CaseSize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MlccDeratingResult {
    pub nominal_capacitance_uf: f64,
    pub operating_voltage_v: f64,
    pub effective_capacitance_uf: f64,
    pub derating_percentage: f64,
    pub is_critical_drop: bool,
    pub warning: Option<String>,
}

pub struct MlccDeratingEngine;

impl MlccDeratingEngine {
    /// Calculate effective capacitance under applied DC bias voltage.
    ///
    /// Formula based on empirical voltage-coefficient fitting:
    /// C(V) = C0 / (1 + (V / Vknee)^alpha)^beta
    pub fn calculate_effective_capacitance(
        spec: &MlccSpec,
        operating_voltage_v: f64,
    ) -> MlccDeratingResult {
        if spec.dielectric == DielectricType::C0G_NP0 {
            // Class 1 dielectrics have essentially zero DC bias derating
            return MlccDeratingResult {
                nominal_capacitance_uf: spec.nominal_capacitance_uf,
                operating_voltage_v,
                effective_capacitance_uf: spec.nominal_capacitance_uf,
                derating_percentage: 0.0,
                is_critical_drop: false,
                warning: None,
            };
        }

        let voltage_ratio = (operating_voltage_v / spec.rated_voltage_v).clamp(0.0, 1.5);

        // Parameters determined by package volume and dielectric
        let (vknee_factor, alpha, beta) = match spec.case_size {
            CaseSize::Metric1005 => (0.35, 1.8, 1.2), // 0402: very steep collapse
            CaseSize::Metric1608 => (0.50, 1.6, 1.1), // 0603: moderate collapse
            CaseSize::Metric2012 => (0.65, 1.5, 0.9), // 0805: better volume
            CaseSize::Metric3216 => (0.80, 1.4, 0.8), // 1206: low drop
            _ => (0.40, 1.7, 1.2),
        };

        let knee = spec.rated_voltage_v * vknee_factor;
        let denominator = (1.0 + (operating_voltage_v / knee).powf(alpha)).powf(beta);
        let eff_c = spec.nominal_capacitance_uf / denominator;

        let derating_pct = ((spec.nominal_capacitance_uf - eff_c) / spec.nominal_capacitance_uf) * 100.0;
        let is_critical_drop = derating_pct >= 50.0;

        let warning = if is_critical_drop {
            Some(format!(
                "CRITICAL_EE_FOOTGUN: MLCC capacitance collapsed by {:.1}% at {:.1}V (rated {:.1}V)! Effective: {:.2}uF (nominal {:.2}uF). Consider larger package size or higher voltage rating.",
                derating_pct, operating_voltage_v, spec.rated_voltage_v, eff_c, spec.nominal_capacitance_uf
            ))
        } else {
            None
        };

        MlccDeratingResult {
            nominal_capacitance_uf: spec.nominal_capacitance_uf,
            operating_voltage_v,
            effective_capacitance_uf: eff_c,
            derating_percentage: derating_pct,
            is_critical_drop,
            warning,
        }
    }
}
