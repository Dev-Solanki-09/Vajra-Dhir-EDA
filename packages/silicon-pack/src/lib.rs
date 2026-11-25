//! LibreLane Pack-2C Silicon/FPGA Worker Contract & C2P2B Bridge (`vd-silicon-pack`).
//! Enforces LibreLane (never legacy OpenLane) + Ring-2 `network_mode == "none"`.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BallCoordinateNm {
    pub ball: String,
    pub pad_idx: u32,
    pub net: String,
    pub x_nm: i64,
    pub y_nm: i64,
    pub pitch_nm: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibreLanePackJob {
    pub flow: String,
    pub pdk: String,
    pub network_mode: String,
    pub image_digest_sha256: String,
    pub clock_period_ps: u64,
    pub die_width_nm: i64,
    pub die_height_nm: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SiliconPackError {
    LegacyOpenLaneForbidden,
    EgressBlocked,
    InvalidDigest,
}

impl LibreLanePackJob {
    pub fn validate(&self) -> Result<(), SiliconPackError> {
        if self.flow != "librelane" {
            return Err(SiliconPackError::LegacyOpenLaneForbidden);
        }
        if self.network_mode != "none" {
            return Err(SiliconPackError::EgressBlocked);
        }
        let Some(hex) = self.image_digest_sha256.strip_prefix("sha256:") else {
            return Err(SiliconPackError::InvalidDigest);
        };
        if hex.len() != 64 || !hex.chars().all(|c| matches!(c, '0'..='9' | 'a'..='f')) {
            return Err(SiliconPackError::InvalidDigest);
        }
        Ok(())
    }

    pub fn synthesize_default_c2p2b_balls(&self) -> Vec<BallCoordinateNm> {
        vec![
            BallCoordinateNm {
                ball: "A1".to_string(),
                pad_idx: 1,
                net: "VDD_CORE".to_string(),
                x_nm: 800_000,
                y_nm: 800_000,
                pitch_nm: 800_000,
            },
            BallCoordinateNm {
                ball: "A2".to_string(),
                pad_idx: 2,
                net: "VSS_CORE".to_string(),
                x_nm: 1_600_000,
                y_nm: 800_000,
                pitch_nm: 800_000,
            },
            BallCoordinateNm {
                ball: "B1".to_string(),
                pad_idx: 3,
                net: "SPI_SCK".to_string(),
                x_nm: 800_000,
                y_nm: 1_600_000,
                pitch_nm: 800_000,
            },
        ]
    }
}
