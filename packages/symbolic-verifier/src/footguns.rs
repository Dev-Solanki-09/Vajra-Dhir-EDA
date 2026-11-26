use serde::{Deserialize, Serialize};
use vd_component_kg::{MlccDeratingEngine, MlccSpec};
use vd_ir::model::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FindingSeverity {
    Fatal,
    Error,
    Warning,
    Advisory,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum FootgunKind {
    Fg01MlccDcBiasCollapse,
    Fg02InductorSaturation,
    Fg03FloatingCmosInputs,
    Fg04MissingDecouplingCaps,
    Fg05SplitGroundCrossing,
    Fg06I2cPullupRiseTime,
    Fg07ReversePolarityThermal,
    Fg08McuBootStrapping,
    Fg09CrystalLoadCapMismatch,
    Fg10ThermalJunctionExceedance,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FootgunFinding {
    pub kind: FootgunKind,
    pub severity: FindingSeverity,
    pub title: String,
    pub affected_entities: Vec<String>,
    pub explanation: String,
    pub remedy: String,
    pub mathematical_proof: String,
}

pub struct FootgunChecker;

impl FootgunChecker {
    /// 1. MLCC DC-bias collapse (> 50% loss at operating voltage)
    pub fn check_mlcc_dc_bias(
        refdes: &str,
        entity_id: &str,
        spec: &MlccSpec,
        operating_voltage_v: f64,
    ) -> Option<FootgunFinding> {
        let derating = MlccDeratingEngine::calculate_effective_capacitance(spec, operating_voltage_v);
        if derating.derating_percentage > 50.0 {
            Some(FootgunFinding {
                kind: FootgunKind::Fg01MlccDcBiasCollapse,
                severity: FindingSeverity::Error,
                title: format!("MLCC DC-Bias Capacitance Collapse on {}", refdes),
                affected_entities: vec![entity_id.to_string()],
                explanation: format!(
                    "Nominal capacitance {:.2}uF derated to {:.2}uF ({:.1}% loss) at operating voltage {:.2}V.",
                    spec.nominal_capacitance_uf,
                    derating.effective_capacitance_uf,
                    derating.derating_percentage,
                    operating_voltage_v
                ),
                remedy: "Upsize component case footprint (e.g. 0603 -> 0805), select higher voltage rating, or switch to X7R/C0G dielectric.".into(),
                mathematical_proof: format!(
                    "C_eff = C_nom * (1 - 0.75 * (V_op / V_rated)^1.4) = {:.3} uF < 0.5 * C_nom ({:.3} uF)",
                    derating.effective_capacitance_uf,
                    spec.nominal_capacitance_uf * 0.5
                ),
            })
        } else {
            None
        }
    }

    /// 2. Inductor saturation (I_peak > I_sat)
    pub fn check_inductor_saturation(
        refdes: &str,
        entity_id: &str,
        i_load_a: f64,
        ripple_ratio: f64,
        i_sat_rated_a: f64,
    ) -> Option<FootgunFinding> {
        let delta_i = i_load_a * ripple_ratio;
        let i_peak = i_load_a + (delta_i / 2.0);

        if i_peak > i_sat_rated_a {
            Some(FootgunFinding {
                kind: FootgunKind::Fg02InductorSaturation,
                severity: FindingSeverity::Fatal,
                title: format!("Inductor Core Saturation Hazard on {}", refdes),
                affected_entities: vec![entity_id.to_string()],
                explanation: format!(
                    "Calculated peak inductor current {:.2}A exceeds rated saturation current I_sat = {:.2}A.",
                    i_peak, i_sat_rated_a
                ),
                remedy: "Select an inductor with higher saturation rating (at least 20-30% margin above I_peak).".into(),
                mathematical_proof: format!(
                    "I_peak = I_load + (delta_I / 2) = {:.2}A + ({:.2}A / 2) = {:.2}A > I_sat ({:.2}A)",
                    i_load_a, delta_i, i_peak, i_sat_rated_a
                ),
            })
        } else {
            None
        }
    }

    /// 3. Floating CMOS inputs
    pub fn check_floating_input(
        refdes: &str,
        pin_name: &str,
        entity_id: &str,
        is_input: bool,
        is_connected: bool,
        has_internal_pull: bool,
    ) -> Option<FootgunFinding> {
        if is_input && !is_connected && !has_internal_pull {
            Some(FootgunFinding {
                kind: FootgunKind::Fg03FloatingCmosInputs,
                severity: FindingSeverity::Error,
                title: format!("Floating CMOS Input on {}.{}", refdes, pin_name),
                affected_entities: vec![entity_id.to_string()],
                explanation: format!(
                    "Pin {}.{} is a high-impedance CMOS digital input with no net connection and no internal pull resistor.",
                    refdes, pin_name
                ),
                remedy: "Tie pin to VDD/GND or add a 10k pull-up/pull-down resistor to prevent high shoot-through current.".into(),
                mathematical_proof: "Z_in -> inf, V_gate undefined in 0.3*Vdd..0.7*Vdd forbidden band.".into(),
            })
        } else {
            None
        }
    }

    /// 4. Missing local ceramic decoupling within 2.0 mm (2_000_000 nm)
    #[allow(clippy::too_many_arguments)]
    pub fn check_decoupling_distance(
        ic_refdes: &str,
        ic_id: &str,
        power_pin_x_nm: Nm,
        power_pin_y_nm: Nm,
        cap_refdes: Option<&str>,
        cap_id: Option<&str>,
        cap_x_nm: Option<Nm>,
        cap_y_nm: Option<Nm>,
    ) -> Option<FootgunFinding> {
        let max_allowed_distance_nm: Nm = 2_000_000; // 2.0 mm

        match (cap_refdes, cap_id, cap_x_nm, cap_y_nm) {
            (Some(c_ref), Some(c_id), Some(cx), Some(cy)) => {
                let dx = (power_pin_x_nm - cx) as f64;
                let dy = (power_pin_y_nm - cy) as f64;
                let dist_nm = (dx * dx + dy * dy).sqrt() as Nm;

                if dist_nm > max_allowed_distance_nm {
                    let dist_mm = dist_nm as f64 / 1_000_000.0;
                    Some(FootgunFinding {
                        kind: FootgunKind::Fg04MissingDecouplingCaps,
                        severity: FindingSeverity::Warning,
                        title: format!("Decoupling Capacitor {} Too Far from {}", c_ref, ic_refdes),
                        affected_entities: vec![ic_id.to_string(), c_id.to_string()],
                        explanation: format!(
                            "Capacitor {} is located {:.2} mm away from power pin (max recommended is 2.00 mm).",
                            c_ref, dist_mm
                        ),
                        remedy: "Relocate decoupling capacitor closer to IC power pin to minimize trace loop inductance.".into(),
                        mathematical_proof: format!(
                            "d = sqrt((x1-x2)^2 + (y1-y2)^2) = {:.2} mm > 2.00 mm threshold (L_loop ~= 1nH/mm)",
                            dist_mm
                        ),
                    })
                } else {
                    None
                }
            }
            _ => Some(FootgunFinding {
                kind: FootgunKind::Fg04MissingDecouplingCaps,
                severity: FindingSeverity::Error,
                title: format!("Missing Decoupling Capacitor on {}", ic_refdes),
                affected_entities: vec![ic_id.to_string()],
                explanation: format!("Power pin on {} has no associated local ceramic decoupling capacitor.", ic_refdes),
                remedy: "Place a 100nF ceramic capacitor within 2 mm of the power pin directly to ground plane.".into(),
                mathematical_proof: "Loop inductance L_loop -> inf without local decoupling.".into(),
            }),
        }
    }

    /// 5. Split ground plane crossing
    pub fn check_split_plane_crossing(
        net_name: &str,
        track_id: &str,
        crosses_void_plane: bool,
    ) -> Option<FootgunFinding> {
        if crosses_void_plane {
            Some(FootgunFinding {
                kind: FootgunKind::Fg05SplitGroundCrossing,
                severity: FindingSeverity::Fatal,
                title: format!("High-Speed Signal {} Crosses Split Reference Plane", net_name),
                affected_entities: vec![track_id.to_string()],
                explanation: format!(
                    "High-speed trace on net '{}' passes over an aperture, split, or void in its adjacent reference plane.",
                    net_name
                ),
                remedy: "Reroute trace over contiguous copper reference plane or stitch ground planes with stitching vias/capacitors.".into(),
                mathematical_proof: "Return current loop area A >> 0 causes severe radiated emissions (EMI) and Z0 surge.".into(),
            })
        } else {
            None
        }
    }

    /// 6. I²C bus pull-up rise time violation: tr = 0.8473 * Rp * Cb
    pub fn check_i2c_rise_time(
        bus_name: &str,
        bus_id: &str,
        r_pullup_ohm: f64,
        c_bus_pf: f64,
        is_fast_mode: bool,
    ) -> Option<FootgunFinding> {
        let c_bus_f = c_bus_pf * 1e-12;
        let t_rise_ns = 0.8473 * r_pullup_ohm * c_bus_f * 1e9;
        let max_t_rise_ns = if is_fast_mode { 300.0 } else { 1000.0 };

        if t_rise_ns > max_t_rise_ns {
            let mode_str = if is_fast_mode { "Fast Mode (400kHz)" } else { "Standard Mode (100kHz)" };
            Some(FootgunFinding {
                kind: FootgunKind::Fg06I2cPullupRiseTime,
                severity: FindingSeverity::Error,
                title: format!("I2C Bus {} Rise Time Violation ({})", bus_name, mode_str),
                affected_entities: vec![bus_id.to_string()],
                explanation: format!(
                    "Calculated rise time tr = {:.1} ns exceeds maximum permitted {:.0} ns for {}.",
                    t_rise_ns, max_t_rise_ns, mode_str
                ),
                remedy: format!(
                    "Decrease pull-up resistor from {:.1}k to maximum {:.1}k to satisfy rise time limit.",
                    r_pullup_ohm / 1000.0,
                    (max_t_rise_ns * 1e-9 / (0.8473 * c_bus_f)) / 1000.0
                ),
                mathematical_proof: format!(
                    "tr = 0.8473 * Rp * Cb = 0.8473 * {:.0} * {:.1}pF = {:.1} ns > {:.0} ns",
                    r_pullup_ohm, c_bus_pf, t_rise_ns, max_t_rise_ns
                ),
            })
        } else {
            None
        }
    }

    /// 7. Reverse polarity protection diode thermal dissipation
    pub fn check_reverse_polarity_diode(
        refdes: &str,
        entity_id: &str,
        v_forward_v: f64,
        i_load_a: f64,
        r_theta_ja: f64,
        ambient_temp_c: f64,
        max_junction_c: f64,
    ) -> Option<FootgunFinding> {
        let p_diss_w = v_forward_v * i_load_a;
        let t_junction_c = ambient_temp_c + (p_diss_w * r_theta_ja);

        if t_junction_c > max_junction_c {
            Some(FootgunFinding {
                kind: FootgunKind::Fg07ReversePolarityThermal,
                severity: FindingSeverity::Fatal,
                title: format!("Thermal Overload on Reverse Polarity Diode {}", refdes),
                affected_entities: vec![entity_id.to_string()],
                explanation: format!(
                    "Power dissipation Pd = {:.2}W causes estimated junction temp Tj = {:.1}°C, exceeding max rating {:.0}°C.",
                    p_diss_w, t_junction_c, max_junction_c
                ),
                remedy: "Replace series diode with P-channel MOSFET or dedicated ideal diode controller to reduce conduction loss.".into(),
                mathematical_proof: format!(
                    "Pd = Vf * I = {:.2}V * {:.2}A = {:.2}W; Tj = Ta + Pd*Rth = {:.1}C + ({:.2}W * {:.0}) = {:.1}C > {:.0}C",
                    v_forward_v, i_load_a, p_diss_w, ambient_temp_c, p_diss_w, r_theta_ja, t_junction_c, max_junction_c
                ),
            })
        } else {
            None
        }
    }

    /// 8. MCU GPIO boot strapping pin conflict
    pub fn check_mcu_boot_strap(
        mcu_refdes: &str,
        mcu_id: &str,
        pin_name: &str,
        is_pulled_high: bool,
        required_boot_state: bool,
    ) -> Option<FootgunFinding> {
        if is_pulled_high != required_boot_state {
            let state_str = if is_pulled_high { "HIGH" } else { "LOW" };
            let req_str = if required_boot_state { "HIGH" } else { "LOW" };
            Some(FootgunFinding {
                kind: FootgunKind::Fg08McuBootStrapping,
                severity: FindingSeverity::Fatal,
                title: format!("MCU Boot Strapping Failure on {}.{}", mcu_refdes, pin_name),
                affected_entities: vec![mcu_id.to_string()],
                explanation: format!(
                    "Boot pin {}.{} is pulled {} at reset, but normal execution requires {}.",
                    mcu_refdes, pin_name, state_str, req_str
                ),
                remedy: format!("Change external pull resistor on {} to pull it {} for normal boot.", pin_name, req_str),
                mathematical_proof: format!("Boot pin state {} != required reset vector {}.", state_str, req_str),
            })
        } else {
            None
        }
    }

    /// 9. Crystal oscillator load capacitance mismatch: CL = (C1*C2)/(C1+C2) + Cstray
    pub fn check_crystal_load_caps(
        crystal_refdes: &str,
        crystal_id: &str,
        c1_pf: f64,
        c2_pf: f64,
        c_stray_pf: f64,
        spec_cl_pf: f64,
    ) -> Option<FootgunFinding> {
        let c_load_calc = ((c1_pf * c2_pf) / (c1_pf + c2_pf)) + c_stray_pf;
        let delta_cl = (c_load_calc - spec_cl_pf).abs();

        if delta_cl > 2.0 {
            Some(FootgunFinding {
                kind: FootgunKind::Fg09CrystalLoadCapMismatch,
                severity: FindingSeverity::Warning,
                title: format!("Crystal Load Capacitance Mismatch on {}", crystal_refdes),
                affected_entities: vec![crystal_id.to_string()],
                explanation: format!(
                    "Effective load capacitance CL = {:.2} pF differs from crystal rated CL = {:.2} pF by {:.2} pF (threshold: 2.0 pF).",
                    c_load_calc, spec_cl_pf, delta_cl
                ),
                remedy: format!(
                    "Adjust load capacitors C1 and C2 so that (C1*C2)/(C1+C2) + {:.1}pF ~= {:.1}pF.",
                    c_stray_pf, spec_cl_pf
                ),
                mathematical_proof: format!(
                    "CL = (C1*C2)/(C1+C2) + Cstray = ({:.1}*{:.1})/({:.1}+{:.1}) + {:.1} = {:.2} pF != {:.1} pF",
                    c1_pf, c2_pf, c1_pf, c2_pf, c_stray_pf, c_load_calc, spec_cl_pf
                ),
            })
        } else {
            None
        }
    }

    /// 10. Maximum junction temperature exceedance: Tj = Ta + Pd * Rth_ja
    pub fn check_junction_temp(
        refdes: &str,
        entity_id: &str,
        power_diss_w: f64,
        r_theta_ja: f64,
        ambient_temp_c: f64,
        max_junction_c: f64,
    ) -> Option<FootgunFinding> {
        let tj = ambient_temp_c + (power_diss_w * r_theta_ja);

        if tj > max_junction_c {
            Some(FootgunFinding {
                kind: FootgunKind::Fg10ThermalJunctionExceedance,
                severity: FindingSeverity::Fatal,
                title: format!("Junction Temperature Overload on {}", refdes),
                affected_entities: vec![entity_id.to_string()],
                explanation: format!(
                    "Component {} reaches estimated junction temperature {:.1}°C, exceeding max absolute rating {:.0}°C.",
                    refdes, tj, max_junction_c
                ),
                remedy: "Add thermal copper pour with vias, reduce operating power, or attach a heatsink.".into(),
                mathematical_proof: format!(
                    "Tj = Ta + Pd*Rth_ja = {:.1}C + ({:.3}W * {:.1}C/W) = {:.1}C > {:.0}C",
                    ambient_temp_c, power_diss_w, r_theta_ja, tj, max_junction_c
                ),
            })
        } else {
            None
        }
    }
}
