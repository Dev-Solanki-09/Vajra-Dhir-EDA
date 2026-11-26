use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use vd_ir::model::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PickAndPlaceRecord {
    pub refdes: String,
    pub val: String,
    pub package: String,
    pub pos_x_mm: f64,
    pub pos_y_mm: f64,
    pub rotation_deg: f64,
    pub side: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeederSlotAssignment {
    pub slot_number: usize,
    pub package_family: String,
    pub tape_width_mm: u32,
    pub parts_assigned: Vec<String>, // list of RefDes assigned to this feeder
}

pub struct PnpGenerator;

impl PnpGenerator {
    pub fn generate_centroids(entities: &[HardwareEntity]) -> Vec<PickAndPlaceRecord> {
        let mut records = Vec::new();

        for entity in entities {
            if let HardwareEntity::Component {
                refdes,
                value_str,
                package_name,
                x_nm,
                y_nm,
                rot_mdeg,
                side,
                ..
            } = entity
            {
                records.push(PickAndPlaceRecord {
                    refdes: refdes.clone(),
                    val: value_str.clone(),
                    package: package_name.clone(),
                    pos_x_mm: *x_nm as f64 / 1_000_000.0,
                    pos_y_mm: *y_nm as f64 / 1_000_000.0,
                    rotation_deg: *rot_mdeg as f64 / 1000.0,
                    side: side.clone(),
                });
            }
        }

        // Deterministic sort: Side then RefDes
        records.sort_by(|a, b| a.side.cmp(&b.side).then(a.refdes.cmp(&b.refdes)));
        records
    }

    pub fn to_csv(records: &[PickAndPlaceRecord]) -> String {
        let mut csv = String::from("RefDes,Val,Package,PosX_mm,PosY_mm,Rot_deg,Side\n");
        for r in records {
            csv.push_str(&format!(
                "{},{},{},{:.4},{:.4},{:.1},{}\n",
                r.refdes, r.val, r.package, r.pos_x_mm, r.pos_y_mm, r.rotation_deg, r.side
            ));
        }
        csv
    }

    pub fn optimize_feeders(records: &[PickAndPlaceRecord]) -> Vec<FeederSlotAssignment> {
        let mut package_groups: BTreeMap<String, Vec<String>> = BTreeMap::new();

        for r in records {
            let key = format!("{}:{}", r.package, r.val);
            package_groups.entry(key).or_default().push(r.refdes.clone());
        }

        let mut assignments = Vec::new();

        for (slot, (pkg_val, refs)) in (1..).zip(package_groups) {
            let parts: Vec<&str> = pkg_val.split(':').collect();
            let pkg = parts[0];

            let tape_width = match pkg {
                p if p.contains("0402") || p.contains("0603") || p.contains("0805") => 8,
                p if p.contains("SOT-23") || p.contains("SOIC-8") => 12,
                p if p.contains("QFN") || p.contains("TQFP") => 16,
                _ => 8,
            };

            assignments.push(FeederSlotAssignment {
                slot_number: slot,
                package_family: pkg.to_string(),
                tape_width_mm: tape_width,
                parts_assigned: refs,
            });
        }

        assignments
    }
}
