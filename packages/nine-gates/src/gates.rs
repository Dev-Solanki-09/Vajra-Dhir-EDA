use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub enum GateStage {
    G1SpecLock = 1,
    G2SchematicFormal = 2,
    G3PhysicsSanity = 3,
    G4PlacementSolved = 4,
    G5RoutingComplete = 5,
    G6PhysicalDrc = 6,
    G7SignalPowerIntegrity = 7,
    G8ManufacturingCam = 8,
    G9BenchHil = 9,
}

impl GateStage {
    pub fn name(&self) -> &'static str {
        match self {
            GateStage::G1SpecLock => "G1_SPEC_LOCK",
            GateStage::G2SchematicFormal => "G2_SCHEMATIC_FORMAL",
            GateStage::G3PhysicsSanity => "G3_PHYSICS_SANITY",
            GateStage::G4PlacementSolved => "G4_PLACEMENT_SOLVED",
            GateStage::G5RoutingComplete => "G5_ROUTING_COMPLETE",
            GateStage::G6PhysicalDrc => "G6_PHYSICAL_DRC",
            GateStage::G7SignalPowerIntegrity => "G7_SIGNAL_POWER_INTEGRITY",
            GateStage::G8ManufacturingCam => "G8_MANUFACTURING_CAM",
            GateStage::G9BenchHil => "G9_BENCH_HIL",
        }
    }

    pub fn next(&self) -> Option<GateStage> {
        match self {
            GateStage::G1SpecLock => Some(GateStage::G2SchematicFormal),
            GateStage::G2SchematicFormal => Some(GateStage::G3PhysicsSanity),
            GateStage::G3PhysicsSanity => Some(GateStage::G4PlacementSolved),
            GateStage::G4PlacementSolved => Some(GateStage::G5RoutingComplete),
            GateStage::G5RoutingComplete => Some(GateStage::G6PhysicalDrc),
            GateStage::G6PhysicalDrc => Some(GateStage::G7SignalPowerIntegrity),
            GateStage::G7SignalPowerIntegrity => Some(GateStage::G8ManufacturingCam),
            GateStage::G8ManufacturingCam => Some(GateStage::G9BenchHil),
            GateStage::G9BenchHil => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GateVerdict {
    pub gate: GateStage,
    pub passed: bool,
    pub timestamp_utc: String,
    pub auditor_id: String,
    pub evidence_hash: String,
    pub metrics: BTreeMap<String, f64>,
    pub findings: Vec<String>,
    pub recovery_recommendations: Vec<String>,
}
