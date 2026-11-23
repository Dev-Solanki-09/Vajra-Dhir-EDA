use std::collections::BTreeMap;
use vd_component_kg::{CaseSize, DielectricType, MlccDeratingEngine, MlccSpec};
use vd_ir::model::*;

#[derive(Debug, Clone)]
pub struct BuckRequirements {
    pub v_in_nom_v: f64,
    pub v_in_max_v: f64,
    pub v_out_v: f64,
    pub i_out_max_a: f64,
    pub ripple_max_mv: f64,
}

#[derive(Debug, Clone)]
pub struct BuckSynthesisResult {
    pub inductance_uh: f64,
    pub inductor_isat_required_a: f64,
    pub r1_feedback_ohm: f64,
    pub r2_feedback_ohm: f64,
    pub c_in_nominal_uf: f64,
    pub c_out_nominal_uf: f64,
    pub c_out_effective_uf: f64,
    pub generated_ops: Vec<HardwarePatchOp>,
}

pub struct BuckSynthesizer;

impl BuckSynthesizer {
    /// Synthesize a complete synchronous step-down converter based on TPS54302.
    pub fn synthesize(
        board_id: &str,
        req: &BuckRequirements,
        origin_x_nm: Nm,
        origin_y_nm: Nm,
    ) -> BuckSynthesisResult {
        let f_sw_hz = 400_000.0; // TPS54302 fixed 400kHz
        let v_ref_v = 0.596;     // TPS54302 internal reference

        // 1. Inductor calculation (30% ripple ratio)
        let delta_i = req.i_out_max_a * 0.30;
        let l_h = (req.v_out_v * (req.v_in_max_v - req.v_out_v))
            / (req.v_in_max_v * f_sw_hz * delta_i);
        let l_uh_raw = l_h * 1_000_000.0;
        // Select standard value: 4.7uH or 6.8uH
        let inductance_uh = if l_uh_raw <= 5.5 { 4.7 } else { 6.8 };
        let inductor_isat_required_a = req.i_out_max_a + (delta_i / 2.0) * 1.25; // 25% margin

        // 2. Feedback divider: Vout = Vref * (1 + R1 / R2)
        let r2_ohm = 10_000.0; // 10k standard
        let r1_ohm = ((req.v_out_v / v_ref_v) - 1.0) * r2_ohm;
        let r1_rounded = (r1_ohm / 100.0).round() * 100.0; // round to nearest 100 ohm

        // 3. Capacitors with MLCC DC-bias derating
        let c_in_nominal_uf = 20.0; // 2x 10uF 50V
        let c_out_nominal_uf = 44.0; // 2x 22uF 16V

        let c_out_spec = MlccSpec {
            nominal_capacitance_uf: 22.0,
            rated_voltage_v: 16.0,
            dielectric: DielectricType::X5R,
            case_size: CaseSize::Metric2012, // 0805
        };
        let c_out_derated = MlccDeratingEngine::calculate_effective_capacitance(&c_out_spec, req.v_out_v);
        let c_out_effective_uf = c_out_derated.effective_capacitance_uf * 2.0;

        // 4. Construct Hardware entities
        let mut ops = Vec::new();

        let u_buck = HardwareEntity::Component {
            meta: HardwareEntityMeta {
                id: uuid::Uuid::now_v7().to_string(),
                board_id: board_id.to_string(),
                lock: LockGuard {
                    locked: false,
                    provenance: Provenance::Cubo,
                    lock_owner: None,
                    lock_reason: None,
                },
                rev_lamport: 1,
                deleted: false,
            },
            refdes: "U1".into(),
            value_str: "TPS54302".into(),
            mpn: Some("TPS54302DDCR".into()),
            package_name: "SOT-23-6".into(),
            footprint_ref: "Package_TO_SOT_SMD:SOT-23-6".into(),
            symbol_ref: "Power_Management:TPS54302".into(),
            functional_group: "power".into(),
            x_nm: origin_x_nm,
            y_nm: origin_y_nm,
            rot_mdeg: 0,
            side: "top".into(),
            courtyard_w_nm: 3_200_000,
            courtyard_h_nm: 3_000_000,
            height_nm: 1_200_000,
            power_diss_mw: 250.0,
            params: BTreeMap::new(),
            datasheet_citation_id: None,
        };
        ops.push(HardwarePatchOp::UpsertEntity { entity: u_buck });

        // Inductor L1
        let l1 = HardwareEntity::Component {
            meta: HardwareEntityMeta {
                id: uuid::Uuid::now_v7().to_string(),
                board_id: board_id.to_string(),
                lock: LockGuard {
                    locked: false,
                    provenance: Provenance::Cubo,
                    lock_owner: None,
                    lock_reason: None,
                },
                rev_lamport: 1,
                deleted: false,
            },
            refdes: "L1".into(),
            value_str: format!("{:.1}uH 3.5A", inductance_uh),
            mpn: Some("SWPA4030S4R7MT".into()),
            package_name: "IND_4030".into(),
            footprint_ref: "Inductor_SMD:L_4030".into(),
            symbol_ref: "Device:L".into(),
            functional_group: "power".into(),
            x_nm: origin_x_nm + 6_000_000,
            y_nm: origin_y_nm,
            rot_mdeg: 0,
            side: "top".into(),
            courtyard_w_nm: 4_400_000,
            courtyard_h_nm: 4_400_000,
            height_nm: 3_000_000,
            power_diss_mw: 100.0,
            params: BTreeMap::new(),
            datasheet_citation_id: None,
        };
        ops.push(HardwarePatchOp::UpsertEntity { entity: l1 });

        BuckSynthesisResult {
            inductance_uh,
            inductor_isat_required_a,
            r1_feedback_ohm: r1_rounded,
            r2_feedback_ohm: r2_ohm,
            c_in_nominal_uf,
            c_out_nominal_uf,
            c_out_effective_uf,
            generated_ops: ops,
        }
    }
}
