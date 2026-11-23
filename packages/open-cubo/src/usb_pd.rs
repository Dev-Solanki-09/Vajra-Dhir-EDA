use std::collections::BTreeMap;
use vd_ir::model::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RequestedPdVoltage {
    V9,
    V12,
    V15,
    V20,
}

pub struct UsbPdSynthesizer;

impl UsbPdSynthesizer {
    /// Synthesize a USB Type-C Power Delivery Sink block based on CH224K.
    pub fn synthesize(
        board_id: &str,
        voltage: RequestedPdVoltage,
        origin_x_nm: Nm,
        origin_y_nm: Nm,
    ) -> Vec<HardwarePatchOp> {
        let (cfg_resistor_value, note) = match voltage {
            RequestedPdVoltage::V9 => ("6.8k", "CFG1 pulled to 9V setting"),
            RequestedPdVoltage::V12 => ("Open", "CFG1 left open for 12V setting"),
            RequestedPdVoltage::V15 => ("1k", "CFG1 pulled to 15V setting"),
            RequestedPdVoltage::V20 => ("Short to GND", "CFG1 grounded for 20V setting"),
        };

        let mut ops = Vec::new();

        let u_pd = HardwareEntity::Component {
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
            refdes: "U_PD1".into(),
            value_str: "CH224K".into(),
            mpn: Some("CH224K".into()),
            package_name: "ESSOP-10".into(),
            footprint_ref: "Package_SO:ESSOP-10_3.9x4.9mm_P1.00mm".into(),
            symbol_ref: "Interface:CH224K".into(),
            functional_group: "power".into(),
            x_nm: origin_x_nm,
            y_nm: origin_y_nm,
            rot_mdeg: 0,
            side: "top".into(),
            courtyard_w_nm: 5_200_000,
            courtyard_h_nm: 6_200_000,
            height_nm: 1_600_000,
            power_diss_mw: 20.0,
            params: {
                let mut map = BTreeMap::new();
                map.insert("target_pd_voltage".into(), serde_json::json!(format!("{:?}", voltage)));
                map.insert("cfg_setting".into(), serde_json::json!(cfg_resistor_value));
                map.insert("note".into(), serde_json::json!(note));
                map
            },
            datasheet_citation_id: None,
        };

        ops.push(HardwarePatchOp::UpsertEntity { entity: u_pd });
        ops
    }
}
