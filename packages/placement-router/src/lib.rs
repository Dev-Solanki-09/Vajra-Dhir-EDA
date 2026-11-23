//! # Vajra-Dhīr EDA — Component Placement & Simulated Annealing Engine
//!
//! Provides multi-threaded, deterministic simulated annealing placement optimizing
//! Half-Perimeter Wire Length (HPWL), overlap minimization, keepout avoidance,
//! and thermal distribution while strictly respecting human locks.

pub mod placer;

pub use placer::{
    KeepoutZone, PlacementMetrics, PlacerComponent, PlacerConfig, PlacerNet, PlacerPin,
    SimulatedAnnealingPlacer,
};
