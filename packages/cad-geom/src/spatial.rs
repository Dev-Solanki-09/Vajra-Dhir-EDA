use rstar::{AABB, PointDistance, RTree, RTreeObject};
use serde::{Deserialize, Serialize};

pub type Nm = i64;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct GeomPoint {
    pub x: Nm,
    pub y: Nm,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SpatialKind {
    Pad,
    TraceSegment,
    Via,
    ComponentCourtyard,
    Keepout,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SpatialElement {
    pub id: String,
    pub net_id: Option<String>,
    pub layer: String,
    pub kind: SpatialKind,
    pub min_x: Nm,
    pub min_y: Nm,
    pub max_x: Nm,
    pub max_y: Nm,
}

impl RTreeObject for SpatialElement {
    type Envelope = AABB<[Nm; 2]>;

    fn envelope(&self) -> Self::Envelope {
        AABB::from_corners([self.min_x, self.min_y], [self.max_x, self.max_y])
    }
}

impl PointDistance for SpatialElement {
    fn distance_2(&self, point: &[Nm; 2]) -> Nm {
        let px = point[0];
        let py = point[1];

        let dx = if px < self.min_x {
            self.min_x - px
        } else if px > self.max_x {
            px - self.max_x
        } else {
            0
        };

        let dy = if py < self.min_y {
            self.min_y - py
        } else if py > self.max_y {
            py - self.max_y
        } else {
            0
        };

        dx * dx + dy * dy
    }
}

pub struct CadSpatialIndex {
    tree: RTree<SpatialElement>,
}

impl CadSpatialIndex {
    pub fn new() -> Self {
        Self {
            tree: RTree::new(),
        }
    }

    pub fn insert(&mut self, element: SpatialElement) {
        self.tree.insert(element);
    }

    pub fn len(&self) -> usize {
        self.tree.size()
    }

    pub fn is_empty(&self) -> bool {
        self.tree.size() == 0
    }

    /// Query all elements whose bounding boxes intersect the given rectangular window.
    pub fn query_window(
        &self,
        min_x: Nm,
        min_y: Nm,
        max_x: Nm,
        max_y: Nm,
    ) -> Vec<&SpatialElement> {
        let envelope = AABB::from_corners([min_x, min_y], [max_x, max_y]);
        self.tree.locate_in_envelope(&envelope).collect()
    }

    /// Find elements on the same layer belonging to a DIFFERENT net that violate the clearance distance.
    pub fn find_clearance_violations(
        &self,
        element: &SpatialElement,
        clearance_nm: Nm,
    ) -> Vec<&SpatialElement> {
        let expanded_envelope = AABB::from_corners(
            [element.min_x - clearance_nm, element.min_y - clearance_nm],
            [element.max_x + clearance_nm, element.max_y + clearance_nm],
        );

        self.tree
            .locate_in_envelope(&expanded_envelope)
            .filter(|other| {
                if other.id == element.id {
                    return false;
                }
                if other.layer != element.layer {
                    return false;
                }
                // Elements of the same net do not violate electrical clearance unless courtyard
                if element.kind != SpatialKind::ComponentCourtyard
                    && other.kind != SpatialKind::ComponentCourtyard
                    && element.net_id.is_some()
                    && element.net_id == other.net_id
                {
                    return false;
                }
                true
            })
            .collect()
    }
}

impl Default for CadSpatialIndex {
    fn default() -> Self {
        Self::new()
    }
}
