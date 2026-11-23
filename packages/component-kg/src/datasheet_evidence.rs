use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatasheetFactCitation {
    pub id: String,                     // UUIDv7
    pub pdf_sha256: String,            // SHA-256 of the local PDF file
    pub mpn: String,
    pub manufacturer: String,
    pub page_number: u32,
    pub bbox_norm: [f64; 4],           // [x0, y0, x1, y1] normalized (0.0..1.0)
    pub extracted_fact_json: serde_json::Value,
    pub verified_by: String,           // e.g. "auditor:dual_context" or "human:engineer"
    pub verified_at_utc: String,
}

impl DatasheetFactCitation {
    /// Compute the cryptographic evidence hash linking the PDF, page, bounding box, and fact.
    pub fn compute_citation_hash(&self) -> String {
        let mut hasher = Sha256::new();
        hasher.update(self.pdf_sha256.as_bytes());
        hasher.update(self.mpn.as_bytes());
        hasher.update(&self.page_number.to_le_bytes());
        hasher.update(format!("{:?}", self.bbox_norm).as_bytes());
        hasher.update(self.extracted_fact_json.to_string().as_bytes());
        format!("{:x}", hasher.finalize())
    }
}
