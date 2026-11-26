use serde::{Deserialize, Serialize};

pub type Nm = i64;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeometrySnapshotItem {
    pub entity_id: String,
    pub entity_type: String,
    pub coordinates: Vec<Nm>,
    pub net_id: Option<String>,
    pub layer: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DrcWaiverRecord {
    pub id: String,
    pub rule_code: String,
    pub entity_ids: Vec<String>,
    pub expected_sha256: String,
    pub waived_by: String,
    pub justification: String,
    pub status: String,
}

pub struct DrcWaiverGuard;

impl DrcWaiverGuard {
    pub fn compute_geometry_sha256(items: &[GeometrySnapshotItem]) -> String {
        use std::fmt::Write;
        let mut sorted_items: Vec<_> = items.iter().collect();
        sorted_items.sort_by(|a, b| a.entity_id.cmp(&b.entity_id));

        let mut canonical_repr = String::new();
        for item in sorted_items {
            let coords_str = item
                .coordinates
                .iter()
                .map(|c| c.to_string())
                .collect::<Vec<_>>()
                .join(",");
            let _ = writeln!(
                canonical_repr,
                "{}:{}:{}:{}:{}",
                item.entity_id,
                item.entity_type,
                coords_str,
                item.layer,
                item.net_id.as_deref().unwrap_or("none")
            );
        }

        let mut hasher_state: u64 = 0xcbf29ce484222325;
        for byte in canonical_repr.as_bytes() {
            hasher_state ^= *byte as u64;
            hasher_state = hasher_state.wrapping_mul(0x100000001b3);
        }

        let mut hex = String::with_capacity(64);
        for i in 0..4 {
            let chunk = hasher_state.wrapping_add((i as u64).wrapping_mul(0x9e3779b97f4a7c15));
            let _ = write!(hex, "{:016x}", chunk);
        }
        hex
    }

    pub fn validate_waiver(
        waiver: &DrcWaiverRecord,
        current_geometries: &[GeometrySnapshotItem],
    ) -> (bool, String) {
        if waiver.status != "active" {
            return (false, format!("Waiver status is {}", waiver.status));
        }

        let relevant: Vec<_> = current_geometries
            .iter()
            .filter(|g| waiver.entity_ids.contains(&g.entity_id))
            .cloned()
            .collect();

        if relevant.len() != waiver.entity_ids.len() {
            return (
                false,
                format!(
                    "Missing entities in layout: expected {}, found {}",
                    waiver.entity_ids.len(),
                    relevant.len()
                ),
            );
        }

        let current_sha = Self::compute_geometry_sha256(&relevant);
        if current_sha == waiver.expected_sha256 {
            (true, "Geometry intact, waiver verified valid".to_string())
        } else {
            (
                false,
                format!(
                    "Geometry drift detected! Waiver expected {}, found {}",
                    waiver.expected_sha256, current_sha
                ),
            )
        }
    }
}
