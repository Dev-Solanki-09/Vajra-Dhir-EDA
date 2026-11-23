use rstar::{RTree, RTreeObject, AABB};
use serde::{Deserialize, Serialize};

pub type Nm = i64;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GeomKind {
    Pad,
    TraceSeg,
    Via,
    Courtyard,
    Keepout,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpatialItem {
    pub entity_id: String,
    pub net_id: Option<String>,
    pub layer: String,
    pub kind: GeomKind,
    pub x1: Nm,
    pub y1: Nm,
    pub x2: Nm,
    pub y2: Nm,
    pub half_width_nm: Nm,
    pub locked: bool,
}

impl RTreeObject for SpatialItem {
    type Envelope = AABB<[Nm; 2]>;
    fn envelope(&self) -> Self::Envelope {
        let min_x = self.x1.min(self.x2) - self.half_width_nm;
        let max_x = self.x1.max(self.x2) + self.half_width_nm;
        let min_y = self.y1.min(self.y2) - self.half_width_nm;
        let max_y = self.y1.max(self.y2) + self.half_width_nm;
        AABB::from_corners([min_x, min_y], [max_x, max_y])
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapResult {
    pub x_nm: Nm,
    pub y_nm: Nm,
    pub snap_kind: String,
    pub target_entity_id: Option<String>,
    pub target_net_id: Option<String>,
    pub smart_guide_x: Option<Nm>,
    pub smart_guide_y: Option<Nm>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveDrcHit {
    pub obstacle_id: String,
    pub obstacle_kind: GeomKind,
    pub clearance_actual_nm: Nm,
    pub clearance_required_nm: Nm,
    pub obstacle_locked: bool,
}

pub struct InteractiveSpatialKernel {
    tree: RTree<SpatialItem>,
}

impl InteractiveSpatialKernel {
    pub fn new() -> Self {
        Self {
            tree: RTree::new(),
        }
    }

    pub fn bulk_load(items: Vec<SpatialItem>) -> Self {
        Self {
            tree: RTree::bulk_load(items),
        }
    }

    pub fn insert(&mut self, item: SpatialItem) {
        self.tree.insert(item);
    }

    pub fn len(&self) -> usize {
        self.tree.size()
    }

    pub fn is_empty(&self) -> bool {
        self.tree.size() == 0
    }

    pub fn hit_test_disambiguate(
        &self,
        x_nm: Nm,
        y_nm: Nm,
        pick_radius_nm: Nm,
        active_layer: &str,
    ) -> Vec<SpatialItem> {
        let query = AABB::from_corners(
            [x_nm - pick_radius_nm, y_nm - pick_radius_nm],
            [x_nm + pick_radius_nm, y_nm + pick_radius_nm],
        );
        let mut hits: Vec<SpatialItem> = self
            .tree
            .locate_in_envelope_intersecting(&query)
            .filter(|item| {
                item.layer == active_layer || item.layer == "*" || item.kind == GeomKind::Via
            })
            .filter(|item| {
                point_to_segment_dist_nm(x_nm, y_nm, item.x1, item.y1, item.x2, item.y2)
                    <= item.half_width_nm + pick_radius_nm
            })
            .cloned()
            .collect();

        hits.sort_by_key(|h| match h.kind {
            GeomKind::Pad => 0,
            GeomKind::Via => 1,
            GeomKind::TraceSeg => 2,
            GeomKind::Courtyard => 3,
            GeomKind::Keepout => 4,
        });
        hits
    }

    pub fn magnetic_snap(
        &self,
        raw_x: Nm,
        raw_y: Nm,
        grid_nm: Nm,
        snap_radius_nm: Nm,
        active_layer: &str,
    ) -> SnapResult {
        let query = AABB::from_corners(
            [raw_x - snap_radius_nm, raw_y - snap_radius_nm],
            [raw_x + snap_radius_nm, raw_y + snap_radius_nm],
        );
        let mut best: Option<(i32, i128, SnapResult)> = None;

        for item in self.tree.locate_in_envelope_intersecting(&query) {
            if item.layer != active_layer && item.layer != "*" && item.kind != GeomKind::Via {
                continue;
            }
            let candidates: Vec<(i32, &str, Nm, Nm)> = match item.kind {
                GeomKind::Pad | GeomKind::Via => vec![(0, "pad_center", item.x1, item.y1)],
                GeomKind::TraceSeg => vec![
                    (1, "trace_endpoint", item.x1, item.y1),
                    (1, "trace_endpoint", item.x2, item.y2),
                    (2, "midpoint", (item.x1 + item.x2) / 2, (item.y1 + item.y2) / 2),
                ],
                _ => vec![],
            };
            for (prio, kind, cx, cy) in candidates {
                let dx = (raw_x - cx) as i128;
                let dy = (raw_y - cy) as i128;
                let d2 = dx * dx + dy * dy;
                if d2 <= (snap_radius_nm as i128).pow(2) {
                    let take = match &best {
                        None => true,
                        Some((bp, bd2, _)) => (prio, d2) < (*bp, *bd2),
                    };
                    if take {
                        best = Some((
                            prio,
                            d2,
                            SnapResult {
                                x_nm: cx,
                                y_nm: cy,
                                snap_kind: kind.into(),
                                target_entity_id: Some(item.entity_id.clone()),
                                target_net_id: item.net_id.clone(),
                                smart_guide_x: Some(cx),
                                smart_guide_y: Some(cy),
                            },
                        ));
                    }
                }
            }
        }

        if let Some((_, _, res)) = best {
            return res;
        }

        let gx = if grid_nm > 0 {
            ((raw_x as f64 / grid_nm as f64).round() as Nm) * grid_nm
        } else {
            raw_x
        };
        let gy = if grid_nm > 0 {
            ((raw_y as f64 / grid_nm as f64).round() as Nm) * grid_nm
        } else {
            raw_y
        };

        SnapResult {
            x_nm: gx,
            y_nm: gy,
            snap_kind: "grid".into(),
            target_entity_id: None,
            target_net_id: None,
            smart_guide_x: None,
            smart_guide_y: None,
        }
    }

    pub fn solve_45deg_posture(
        x0: Nm,
        y0: Nm,
        x1: Nm,
        y1: Nm,
        diagonal_first: bool,
    ) -> Vec<(Nm, Nm)> {
        let dx = x1 - x0;
        let dy = y1 - y0;
        let adx = dx.abs();
        let ady = dy.abs();
        if adx == 0 || ady == 0 || adx == ady {
            return vec![(x0, y0), (x1, y1)];
        }
        let diag = adx.min(ady);
        let sx = dx.signum();
        let sy = dy.signum();
        let knee = if diagonal_first {
            (x0 + sx * diag, y0 + sy * diag)
        } else if adx > ady {
            (x1 - sx * diag, y0)
        } else {
            (x0, y1 - sy * diag)
        };
        vec![(x0, y0), knee, (x1, y1)]
    }

    pub fn check_segment_live_drc(
        &self,
        active_net_id: &str,
        layer: &str,
        x1: Nm,
        y1: Nm,
        x2: Nm,
        y2: Nm,
        trace_width_nm: Nm,
        min_clearance_nm: Nm,
    ) -> Vec<LiveDrcHit> {
        let hw = trace_width_nm / 2;
        let margin = hw + min_clearance_nm + 500_000;
        let env = AABB::from_corners(
            [x1.min(x2) - margin, y1.min(y2) - margin],
            [x1.max(x2) + margin, y1.max(y2) + margin],
        );

        let mut hits = Vec::new();
        for obs in self.tree.locate_in_envelope_intersecting(&env) {
            if obs.layer != layer && obs.layer != "*" && obs.kind != GeomKind::Via {
                continue;
            }
            if obs.net_id.as_deref() == Some(active_net_id) && obs.kind != GeomKind::Keepout {
                continue;
            }
            let dist_center =
                segment_to_segment_dist_nm(x1, y1, x2, y2, obs.x1, obs.y1, obs.x2, obs.y2);
            let actual_gap = dist_center - hw - obs.half_width_nm;
            if actual_gap < min_clearance_nm {
                hits.push(LiveDrcHit {
                    obstacle_id: obs.entity_id.clone(),
                    obstacle_kind: obs.kind,
                    clearance_actual_nm: actual_gap,
                    clearance_required_nm: min_clearance_nm,
                    obstacle_locked: obs.locked,
                });
            }
        }
        hits
    }
}

impl Default for InteractiveSpatialKernel {
    fn default() -> Self {
        Self::new()
    }
}

pub fn point_to_segment_dist_nm(px: Nm, py: Nm, x1: Nm, y1: Nm, x2: Nm, y2: Nm) -> Nm {
    let vx = (x2 - x1) as f64;
    let vy = (y2 - y1) as f64;
    let wx = (px - x1) as f64;
    let wy = (py - y1) as f64;
    let len2 = vx * vx + vy * vy;
    let t = if len2 < 1.0 {
        0.0
    } else {
        (wx * vx + wy * vy) / len2
    }
    .clamp(0.0, 1.0);
    let dx = px as f64 - (x1 as f64 + t * vx);
    let dy = py as f64 - (y1 as f64 + t * vy);
    dx.hypot(dy).round() as Nm
}

pub fn segment_to_segment_dist_nm(
    ax1: Nm,
    ay1: Nm,
    ax2: Nm,
    ay2: Nm,
    bx1: Nm,
    by1: Nm,
    bx2: Nm,
    by2: Nm,
) -> Nm {
    let orient = |px: Nm, py: Nm, qx: Nm, qy: Nm, rx: Nm, ry: Nm| -> i128 {
        ((qx - px) as i128) * ((ry - py) as i128) - ((qy - py) as i128) * ((rx - px) as i128)
    };
    let o1 = orient(ax1, ay1, ax2, ay2, bx1, by1).signum();
    let o2 = orient(ax1, ay1, ax2, ay2, bx2, by2).signum();
    let o3 = orient(bx1, by1, bx2, by2, ax1, ay1).signum();
    let o4 = orient(bx1, by1, bx2, by2, ax2, ay2).signum();
    if o1 != o2 && o3 != o4 {
        return 0;
    }
    point_to_segment_dist_nm(ax1, ay1, bx1, by1, bx2, by2)
        .min(point_to_segment_dist_nm(ax2, ay2, bx1, by1, bx2, by2))
        .min(point_to_segment_dist_nm(bx1, by1, ax1, ay1, ax2, ay2))
        .min(point_to_segment_dist_nm(bx2, by2, ax1, ay1, ax2, ay2))
}
