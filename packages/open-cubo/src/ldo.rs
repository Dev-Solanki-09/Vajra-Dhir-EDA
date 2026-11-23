use std::collections::BTreeMap;
use vd_ir::model::*;

#[derive(Debug, Clone)]
pub struct LdoRequirements {
    pub v_in_v: f64,
    pub v_out_v: f64,
    pub i_load_max_a: f64,
    pub ambient_temp_c: f64,
}

#[derive(Debug, Clone)]
pub struct LdoSynthesisResult {
    pub power_dissipation_w: f64,
    pub junction_temp_c: f64,
    pub max_junction_temp_c: f64,
    pub thermal_ok: bool,
    pub c_in_uf: f64,
    pub c_out_uf: f64,
    pub generated_ops: Vec<HardwarePatchOp>,
}

pub struct LdoSynthesizer;

impl LdoSynthesizer {
    /// Synthesizes a low-noise 3.3V LDO circuit based on AP2112K-3.3 (SOT-23-5).
    /// Performs strict junction temperature evaluation: Tj = Ta + Pd * Rth_ja.
    pub fn synthesize(
        board_id: &str,
        req: &LdoRequirements,
        origin_x_nm: Nm,
        origin_y_nm: Nm,
    ) -> LdoSynthesisResult {
        let i_gnd_a = 0.000055; // 55uA quiescent current
        let power_dissipation_w = (req.v_in_v - req.v_out_v) * req.i_load_max_a + (req.v_in_v * i_gnd_a);

        // AP2112K SOT-23-5 thermal resistance Junction-to-Ambient is ~169 °C/W on standard 2-layer PCB
        let r_theta_ja_c_per_w = 169.0;
        let junction_temp_c = req.ambient_temp_c + (power_dissipation_w * r_theta_ja_c_per_w);
        let max_junction_temp_c = 125.0;
        let thermal_ok = junction_temp_c <= max_junction_temp_c;

        let c_in_uf = 1.0;
        let c_out_uf = 2.2;

        let mut ops = Vec::new();

        // 1. LDO regulator IC
        let u_ldo = HardwareEntity::Component {
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
            refdes: "U2".into(),
            value_str: "AP2112K-3.3".into(),
            mpn: Some("AP2112K-3.3TRG1".into()),
            package_name: "SOT-23-5".into(),
            footprint_ref: "Package_TO_SOT_SMD:SOT-23-5".into(),
            symbol_ref: "Regulator_Linear:AP2112K-3.3".into(),
            functional_group: "power".into(),
            x_nm: origin_x_nm,
            y_nm: origin_y_nm,
            rot_mdeg: 0,
            side: "top".into(),
            courtyard_w_nm: 3_100_000,
            courtyard_h_nm: 3_000_000,
            height_nm: 1_300_000,
            power_diss_mw: power_dissipation_w * 1000.0,
            params: {
                let mut p = BTreeMap::new();
                p.insert("junction_temp_c".into(), serde_json::json!(junction_temp_c));
                p.insert("thermal_ok".into(), serde_json::json!(thermal_ok));
                p
            },
            datasheet_citation_id: None,
        };
        ops.push(HardwarePatchOp::UpsertEntity { entity: u_ldo });

        // 2. Input Decoupling Cap C1
        let c1 = HardwareEntity::Component {
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
            refdes: "C1".into(),
            value_str: "1uF 25V X7R".into(),
            mpn: Some("CL10B105KA8NNNC".into()),
            package_name: "0603".into(),
            footprint_ref: "Capacitor_SMD:C_0603_1608Metric".into(),
            symbol_ref: "Device:C".into(),
            functional_group: "power".into(),
            x_nm: origin_x_nm - 2_500_000,
            y_nm: origin_y_nm,
            rot_mdeg: 90000,
            side: "top".into(),
            courtyard_w_nm: 2_000_000,
            courtyard_h_nm: 1_200_000,
            height_nm: 900_000,
            power_diss_mw: 0.0,
            params: BTreeMap::new(),
            datasheet_citation_id: None,
        };
        ops.push(HardwarePatchOp::UpsertEntity { entity: c1 });

        // 3. Output Stabilizing Cap C2
        let c2 = HardwareEntity::Component {
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
            refdes: "C2".into(),
            value_str: "2.2uF 10V X7R".into(),
            mpn: Some("CL10B225KO8NNNC".into()),
            package_name: "0603".into(),
            footprint_ref: "Capacitor_SMD:C_0603_1608Metric".into(),
            symbol_ref: "Device:C".into(),
            functional_group: "power".into(),
            x_nm: origin_x_nm + 2_500_000,
            y_nm: origin_y_nm,
            rot_mdeg: 90000,
            side: "top".into(),
            courtyard_w_nm: 2_000_000,
            courtyard_h_nm: 1_200_000,
            height_nm: 900_000,
            power_diss_mw: 0.0,
            params: BTreeMap::new(),
            datasheet_citation_id: None,
        };
        ops.push(HardwarePatchOp::UpsertEntity { entity: c2 });

        LdoSynthesisResult {
            power_dissipation_w,
            junction_temp_c,
            max_junction_temp_c,
            thermal_ok,
            c_in_uf,
            c_out_uf,
            generated_ops: ops,
        }
    }
}
