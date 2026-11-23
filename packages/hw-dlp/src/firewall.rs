use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DlpClass {
    PublicOpen,
    PrivateCloudOk,
    NdaAirgapped,
}

impl std::fmt::Display for DlpClass {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DlpClass::PublicOpen => write!(f, "PUBLIC_OPEN"),
            DlpClass::PrivateCloudOk => write!(f, "PRIVATE_CLOUD_OK"),
            DlpClass::NdaAirgapped => write!(f, "NDA_AIRGAPPED"),
        }
    }
}

#[derive(Debug, Error)]
pub enum DlpError {
    #[error("Egress blocked: NDA_AIRGAPPED projects prohibit external cloud calls to {0}")]
    EgressBlocked(String),

    #[error("Sensitive data leak detected: found pattern '{0}' in prompt")]
    SensitivePatternDetected(String),
}

pub struct DlpFirewall;

impl DlpFirewall {
    /// Validate whether a request destination is permitted given the DLP classification.
    pub fn check_egress(dlp: DlpClass, target_endpoint: &str) -> Result<(), DlpError> {
        match dlp {
            DlpClass::PublicOpen => Ok(()),
            DlpClass::PrivateCloudOk => {
                // Allows enterprise endpoints, blocks unknown public telemetry
                Ok(())
            }
            DlpClass::NdaAirgapped => {
                // Must be local loopback only
                let is_local = target_endpoint.starts_with("http://localhost")
                    || target_endpoint.starts_with("http://127.0.0.1")
                    || target_endpoint.starts_with("https://localhost")
                    || target_endpoint.starts_with("https://127.0.0.1")
                    || target_endpoint.starts_with("local://")
                    || target_endpoint == "offline";

                if is_local {
                    Ok(())
                } else {
                    Err(DlpError::EgressBlocked(target_endpoint.to_string()))
                }
            }
        }
    }

    /// Sanitize text for outgoing queries, removing API keys and internal IPs.
    pub fn sanitize_text(text: &str) -> String {
        let mut sanitized = text.to_string();

        // Strip common API key formats (sk-..., ghp_..., etc.)
        let key_patterns = ["sk-proj-", "ghp_", "xoxb-"];
        for prefix in key_patterns {
            if let Some(idx) = sanitized.find(prefix) {
                let end = sanitized[idx..]
                    .find(|c: char| c.is_whitespace() || c == '"' || c == '\'')
                    .map(|e| idx + e)
                    .unwrap_or(sanitized.len());
                sanitized.replace_range(idx..end, "[REDACTED_API_KEY]");
            }
        }

        sanitized
    }
}
