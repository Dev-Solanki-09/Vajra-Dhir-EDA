//! # Vajra-Dhīr EDA — Canonical Hardware Intermediate Representation (HW-IR)
//!
//! Provides the SQLite WAL-backed single source of truth for all schematic, layout,
//! constraint, and firmware pinmux models, with kernel-level human-lock protection triggers
//! and deterministic atomic `HardwarePatch` undo/redo journal.

pub mod model;
pub mod model_v001;
pub mod store;

pub use model::*;
pub use model_v001::{
    BoardMeta, BoardSnapshot, ComponentRecord, NetRecord, PatchLogEntry, PatchRequest,
    PatchResponse, PinmuxRecord, ProjectMeta, TraceRecord, ViaRecord,
};
pub use store::{HwIrError, HwIrStore};
