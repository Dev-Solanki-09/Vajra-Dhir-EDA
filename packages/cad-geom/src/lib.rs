//! # Vajra-Dhīr EDA — Manual CAD Perfection Geometry Engine
//!
//! Provides R-Tree spatial acceleration for clearance/collision detection,
//! integer 2D polygon boolean operations, and coupled differential pair trajectory generation.

pub mod bool2d;
pub mod diff_pair;
pub mod spatial;

pub use bool2d::{BoolGeomError, IntPoint2D, PolygonBooleanEngine};
pub use diff_pair::{CoupledDiffPairTrajectory, DifferentialPairEngine};
pub use spatial::{CadSpatialIndex, GeomPoint, SpatialElement, SpatialKind};
