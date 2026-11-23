//! # Vajra-Dhīr EDA — Manual CAD Perfection Geometry Engine
//!
//! Provides R-Tree spatial acceleration for clearance/collision detection,
//! integer 2D polygon boolean operations, coupled differential pair trajectory generation,
//! interactive magnetic snapping, Figma-style smart guides, length-tuning meanders,
//! teardrop fillets, QFN paste windowpaning, multi-channel room replication,
//! and geometry-hash-bound DRC waivers.

pub mod bool2d;
pub mod diff_pair;
pub mod drc_waiver_guard;
pub mod interactive_router;
pub mod length_tuning;
pub mod room_replication;
pub mod spatial;
pub mod teardrops;
pub mod windowpaning;

pub use bool2d::{BoolGeomError, IntPoint2D, PolygonBooleanEngine};
pub use diff_pair::{CoupledDiffPairTrajectory, DifferentialPairEngine};
pub use drc_waiver_guard::{DrcWaiverGuard, DrcWaiverRecord, GeometrySnapshotItem};
pub use interactive_router::{
    GeomKind, InteractiveSpatialKernel, LiveDrcHit, SnapResult, SpatialItem,
};
pub use length_tuning::{LengthTuningEngine, MeanderParams, MeanderStyle, TunedTraceResult};
pub use room_replication::{
    ReplicatedComponent, ReplicatedRoomResult, ReplicatedTrace, RoomReplicationEngine,
};
pub use spatial::{CadSpatialIndex, GeomPoint, SpatialElement, SpatialKind};
pub use teardrops::{TeardropEngine, TeardropFillet, TeardropParams};
pub use windowpaning::{WindowpaneAperture, WindowpaneGrid, WindowpaningEngine};
