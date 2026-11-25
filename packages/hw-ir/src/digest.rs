//! Deterministic `hw.lock` canonical project digest over integer `i64` nm projections.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HwLockEntityProjection {
    pub id: String,
    pub refdes: String,
    pub x_nm: i64,
    pub y_nm: i64,
    pub rot_mdeg: i32,
    pub locked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HwLockDigest {
    pub schema: String,
    pub digest_sha256: String,
    pub entity_count: usize,
}

/// Compute deterministic hex SHA-256 over sorted integer HW-IR entity projections.
pub fn compute_hw_lock_sha256(entities: &[HwLockEntityProjection]) -> HwLockDigest {
    let mut sorted = entities.to_vec();
    sorted.sort_by(|a, b| a.id.cmp(&b.id));
    let mut hasher = Sha256::new();
    hasher.update(b"vd.hw.lock.v1\n");
    for e in &sorted {
        hasher.update(
            format!(
                "{}|{}|{}|{}|{}|{}\n",
                e.id, e.refdes, e.x_nm, e.y_nm, e.rot_mdeg, e.locked
            )
            .as_bytes(),
        );
    }
    let bytes = hasher.finalize();
    let hex: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    HwLockDigest {
        schema: "vd.hw.lock.v1".to_string(),
        digest_sha256: hex,
        entity_count: sorted.len(),
    }
}

pub fn verify_hw_lock_sha256(expected_hex: &str, entities: &[HwLockEntityProjection]) -> bool {
    compute_hw_lock_sha256(entities).digest_sha256 == expected_hex
}
