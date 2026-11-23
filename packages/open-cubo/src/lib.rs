pub mod buck;
pub mod esd;
pub mod ldo;
pub mod usb_pd;

pub use buck::{BuckRequirements, BuckSynthesisResult, BuckSynthesizer};
pub use esd::{EsdProtectionSpec, EsdSynthesizer, UsbDataRate};
pub use ldo::{LdoRequirements, LdoSynthesisResult, LdoSynthesizer};
pub use usb_pd::{RequestedPdVoltage, UsbPdSynthesizer};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenCuboBlockDescriptor {
    pub name: String,
    pub domain: String,
    pub description: String,
    pub input_parameters: Vec<String>,
    pub output_rails: Vec<String>,
    pub deterministic_seed_support: bool,
}

pub struct OpenCuboRegistry;

impl OpenCuboRegistry {
    pub fn list_standard_blocks() -> Vec<OpenCuboBlockDescriptor> {
        vec![
            OpenCuboBlockDescriptor {
                name: "buck_stepdown".into(),
                domain: "power".into(),
                description: "Synchronous step-down buck converter (TPS54302) with dynamic MLCC DC-bias derating".into(),
                input_parameters: vec!["vin_nom".into(), "vin_max".into(), "vout".into(), "iout_max".into()],
                output_rails: vec!["SW".into(), "VOUT".into(), "FB".into()],
                deterministic_seed_support: true,
            },
            OpenCuboBlockDescriptor {
                name: "linear_ldo".into(),
                domain: "power".into(),
                description: "Low-noise LDO regulator (AP2112K-3.3) with junction thermal headroom calculation".into(),
                input_parameters: vec!["vin".into(), "vout".into(), "i_load_max".into(), "ambient_temp".into()],
                output_rails: vec!["VOUT".into()],
                deterministic_seed_support: true,
            },
            OpenCuboBlockDescriptor {
                name: "usb_pd_sink".into(),
                domain: "power_negotiation".into(),
                description: "USB Type-C Power Delivery sink decoy (CH224K) for 9V/12V/15V/20V rails".into(),
                input_parameters: vec!["target_voltage".into()],
                output_rails: vec!["VBUS".into(), "CC1".into(), "CC2".into()],
                deterministic_seed_support: true,
            },
            OpenCuboBlockDescriptor {
                name: "esd_clamp_array".into(),
                domain: "protection".into(),
                description: "High-speed differential ESD protection array with < 1.0pF parasitic limit".into(),
                input_parameters: vec!["data_rate".into()],
                output_rails: vec!["D+".into(), "D-".into()],
                deterministic_seed_support: true,
            },
        ]
    }
}
