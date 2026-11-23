use std::collections::BTreeMap;
use vd_ir::model::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UsbDataRate {
    Usb2FullSpeed12Mbps,
    Usb2HighSpeed480Mbps,
    Usb3SuperSpeed5Gbps,
}

#[derive(Debug, Clone)]
pub struct EsdProtectionSpec {
    pub data_rate: UsbDataRate,
    pub max_line_capacitance_pf: f64,
    pub working_voltage_v: f64,
    pub esd_clamp_device: &'static str,
    pub footprint: &'static str,
    pub package: &'static str,
}

pub struct EsdSynthesizer;

impl EsdSynthesizer {
    pub fn spec_for_rate(rate: UsbDataRate) -> EsdProtectionSpec {
        match rate {
            UsbDataRate::Usb2FullSpeed12Mbps => EsdProtectionSpec {
                data_rate: rate,
                max_line_capacitance_pf: 5.0,
                working_voltage_v: 5.0,
                esd_clamp_device: "USBLC6-2SC6",
                footprint: "Package_TO_SOT_SMD:SOT-23-6",
                package: "SOT-23-6",
            },
            UsbDataRate::Usb2HighSpeed480Mbps => EsdProtectionSpec {
                data_rate: rate,
                max_line_capacitance_pf: 1.0, // High-speed max 1.0 pF (USBLC6-2SC6 has 0.8 pF)
                working_voltage_v: 5.0,
                esd_clamp_device: "USBLC6-2SC6",
                footprint: "Package_TO_SOT_SMD:SOT-23-6",
                package: "SOT-23-6",
            },
            UsbDataRate::Usb3SuperSpeed5Gbps => EsdProtectionSpec {
                data_rate: rate,
                max_line_capacitance_pf: 0.35, // SuperSpeed requires ultra-low cap < 0.4 pF
                working_voltage_v: 3.3,
                esd_clamp_device: "TPD4E02B04",
                footprint: "Package_DFN_QFN:USON-10_2.5x1.0mm_P0.5mm",
                package: "USON-10",
            },
        }
    }

    /// Synthesizes an ESD protection stage for a differential line.
    pub fn synthesize(
        board_id: &str,
        rate: UsbDataRate,
        origin_x_nm: Nm,
        origin_y_nm: Nm,
    ) -> Vec<HardwarePatchOp> {
        let spec = Self::spec_for_rate(rate);
        let mut ops = Vec::new();

        let u_esd = HardwareEntity::Component {
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
            refdes: "D_ESD1".into(),
            value_str: spec.esd_clamp_device.into(),
            mpn: Some(format!("{}TR", spec.esd_clamp_device)),
            package_name: spec.package.into(),
            footprint_ref: spec.footprint.into(),
            symbol_ref: "Power_Protection:USBLC6-2SC6".into(),
            functional_group: "protection".into(),
            x_nm: origin_x_nm,
            y_nm: origin_y_nm,
            rot_mdeg: 0,
            side: "top".into(),
            courtyard_w_nm: 3_200_000,
            courtyard_h_nm: 3_000_000,
            height_nm: 1_200_000,
            power_diss_mw: 0.0,
            params: {
                let mut map = BTreeMap::new();
                map.insert("max_line_cap_pf".into(), serde_json::json!(spec.max_line_capacitance_pf));
                map.insert("target_bus_speed".into(), serde_json::json!(format!("{:?}", rate)));
                map
            },
            datasheet_citation_id: None,
        };

        ops.push(HardwarePatchOp::UpsertEntity { entity: u_esd });
        ops
    }
}
