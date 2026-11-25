//! # Vajra-Dhīr EDA — KiCad 10 Transcoder & 3-Channel Bridge
//!
//! Provides deterministic S-Expression parsing/generation for KiCad 10 schemas,
//! IPC bridge abstractions, and the 5-second SHA-256 echo suppression ring.

pub mod eagle_xml;
pub mod echo_ring;
pub mod kicad_sch;
pub mod rs274x;
pub mod sexpr;

pub use eagle_xml::{EagleBoard, EagleBoardParser, EagleElement, EagleParseError, EagleWire};
pub use echo_ring::{EchoSuppressionRing, DEFAULT_SUPPRESSION_WINDOW};
pub use kicad_sch::{KiCadSchComponent, KiCadSchTranscoder};
pub use rs274x::{
    GerberAperture, GerberApertureKind, GerberDocument, GerberError, GerberOpKind, GerberOperation,
    GerberParser, GerberPlotter, GerberUnit,
};
pub use sexpr::{SExpr, SExprError};
