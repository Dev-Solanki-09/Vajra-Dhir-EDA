//! Pure-MIT Integer `i64` Nanometer 3D STEP/MCAD Clearance DRC (`vd-cad-geom`).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Box3dNm {
    pub id: String,
    pub min: [i64; 3],
    pub max: [i64; 3],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mcad3dViolation {
    pub pcb_id: String,
    pub enclosure_id: String,
    pub clearance_nm: i64,
    pub required_clearance_nm: i64,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mcad3dClearanceReport {
    pub passed: bool,
    pub checked_pairs: usize,
    pub violations: Vec<Mcad3dViolation>,
}

pub struct Mcad3dClearanceEngine;

impl Mcad3dClearanceEngine {
    fn axis_gap(min_a: i64, max_a: i64, min_b: i64, max_b: i64) -> i64 {
        if max_a < min_b {
            min_b - max_a
        } else if max_b < min_a {
            min_a - max_b
        } else {
            // Overlapping axis -> negative penetration depth
            -((max_a.min(max_b)) - (min_a.max(min_b)))
        }
    }

    /// Evaluates exact integer 3D AABB clearance between PCB components and enclosure walls.
    pub fn check_clearances(
        pcb_boxes: &[Box3dNm],
        enclosure_walls: &[Box3dNm],
        min_clearance_nm: i64,
    ) -> Mcad3dClearanceReport {
        let mut violations = Vec::new();
        let mut checked_pairs = 0usize;

        for p in pcb_boxes {
            for e in enclosure_walls {
                checked_pairs += 1;
                let gx = Self::axis_gap(p.min[0], p.max[0], e.min[0], e.max[0]);
                let gy = Self::axis_gap(p.min[1], p.max[1], e.min[1], e.max[1]);
                let gz = Self::axis_gap(p.min[2], p.max[2], e.min[2], e.max[2]);

                if gx <= 0 && gy <= 0 && gz <= 0 {
                    let penetration = gx.max(gy).max(gz);
                    violations.push(Mcad3dViolation {
                        pcb_id: p.id.clone(),
                        enclosure_id: e.id.clone(),
                        clearance_nm: penetration,
                        required_clearance_nm: min_clearance_nm,
                        kind: "MCAD_3D_INTERFERENCE".to_string(),
                    });
                    continue;
                }

                let dx = gx.max(0) as i128;
                let dy = gy.max(0) as i128;
                let dz = gz.max(0) as i128;
                let dist_sq = dx * dx + dy * dy + dz * dz;
                let req = min_clearance_nm.max(0) as i128;
                if dist_sq < req * req {
                    let approx_nm = (dist_sq as f64).sqrt().round() as i64;
                    violations.push(Mcad3dViolation {
                        pcb_id: p.id.clone(),
                        enclosure_id: e.id.clone(),
                        clearance_nm: approx_nm,
                        required_clearance_nm: min_clearance_nm,
                        kind: "MCAD_3D_CLEARANCE_LOW".to_string(),
                    });
                }
            }
        }

        Mcad3dClearanceReport {
            passed: violations.is_empty(),
            checked_pairs,
            violations,
        }
    }
}
