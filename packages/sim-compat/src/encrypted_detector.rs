use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SpiceModelClassification {
    PlainTextStandard,
    EncryptedCadencePSpice,
    EncryptedLtspiceBinary,
    EncryptedHspice,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelScanResult {
    pub classification: SpiceModelClassification,
    pub is_encrypted: bool,
    pub detected_marker: Option<String>,
    pub requires_behavioral_fallback: bool,
    pub waveform_badge: Option<String>, // e.g. "[BEHAVIORAL-APPROX]"
}

pub struct EncryptedModelDetector;

impl EncryptedModelDetector {
    pub fn scan_deck(deck_content: &str) -> ModelScanResult {
        if deck_content.contains("$CDNENCSTART") {
            return ModelScanResult {
                classification: SpiceModelClassification::EncryptedCadencePSpice,
                is_encrypted: true,
                detected_marker: Some("$CDNENCSTART".into()),
                requires_behavioral_fallback: true,
                waveform_badge: Some("[BEHAVIORAL-APPROX]".into()),
            };
        }

        if deck_content.contains("** Encrypted") || deck_content.contains("?* LTspice Encrypted") {
            return ModelScanResult {
                classification: SpiceModelClassification::EncryptedLtspiceBinary,
                is_encrypted: true,
                detected_marker: Some("LTspice Encrypted Marker".into()),
                requires_behavioral_fallback: true,
                waveform_badge: Some("[BEHAVIORAL-APPROX]".into()),
            };
        }

        if deck_content.contains(".protect") && deck_content.contains(".unprotect") && deck_content.contains("#") {
            return ModelScanResult {
                classification: SpiceModelClassification::EncryptedHspice,
                is_encrypted: true,
                detected_marker: Some("HSPICE Encrypted Block".into()),
                requires_behavioral_fallback: true,
                waveform_badge: Some("[BEHAVIORAL-APPROX]".into()),
            };
        }

        ModelScanResult {
            classification: SpiceModelClassification::PlainTextStandard,
            is_encrypted: false,
            detected_marker: None,
            requires_behavioral_fallback: false,
            waveform_badge: None,
        }
    }
}
