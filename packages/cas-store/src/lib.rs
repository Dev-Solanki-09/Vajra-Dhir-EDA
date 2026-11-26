use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs;
use std::io::Cursor;
use std::path::PathBuf;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum CasError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Integrity error: {0}")]
    Integrity(String),
    #[error("Invalid URI: {0}")]
    InvalidUri(String),
}

pub struct CasStore {
    root_dir: PathBuf,
    pinned_digests: HashSet<String>,
}

impl CasStore {
    pub fn new(root_dir: impl Into<PathBuf>) -> Self {
        let root = root_dir.into();
        Self {
            root_dir: root,
            pinned_digests: HashSet::new(),
        }
    }

    pub fn compute_sha256(data: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(data);
        format!("{:x}", hasher.finalize())
    }

    fn path_for_digest(&self, digest: &str) -> Result<PathBuf, CasError> {
        if digest.len() < 4 {
            return Err(CasError::InvalidUri("Digest too short".to_string()));
        }
        let p0 = &digest[0..2];
        let p1 = &digest[2..4];
        Ok(self.root_dir.join("sha256").join(p0).join(p1).join(digest))
    }

    pub fn put_bytes(&self, data: &[u8]) -> Result<String, CasError> {
        let digest = Self::compute_sha256(data);
        let dest = self.path_for_digest(&digest)?;

        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)?;
        }

        if !dest.exists() {
            fs::write(&dest, data)?;
        }

        Ok(format!("cas://sha256/{}", digest))
    }

    pub fn get_bytes(&self, uri: &str) -> Result<Vec<u8>, CasError> {
        let digest = uri
            .strip_prefix("cas://sha256/")
            .ok_or_else(|| CasError::InvalidUri(format!("Malformed CAS URI: {}", uri)))?;

        let path = self.path_for_digest(digest)?;
        if !path.exists() {
            return Err(CasError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("CAS artifact not found: {}", digest),
            )));
        }

        let data = fs::read(&path)?;
        let computed = Self::compute_sha256(&data);
        if computed != digest {
            return Err(CasError::Integrity(format!(
                "CAS corrupt: expected {}, got {}",
                digest, computed
            )));
        }

        Ok(data)
    }

    pub fn pin_digest(&mut self, digest: &str) {
        self.pinned_digests.insert(digest.to_string());
    }

    pub fn is_pinned(&self, digest: &str) -> bool {
        self.pinned_digests.contains(digest)
    }

    /// Stores compressed zstd payload at sha256/<p0>/<p1>/<digest>.zst keyed by raw SHA-256.
    pub fn put_bytes_zst(&self, data: &[u8]) -> Result<String, CasError> {
        let digest = Self::compute_sha256(data);
        let raw_path = self.path_for_digest(&digest)?;
        let zst_path = raw_path.with_extension("zst");
        if let Some(parent) = zst_path.parent() {
            fs::create_dir_all(parent)?;
        }
        if !zst_path.exists() {
            let compressed = zstd::encode_all(Cursor::new(data), zstd::DEFAULT_COMPRESSION_LEVEL)?;
            let tmp_path = zst_path.with_extension("zst.tmp");
            fs::write(&tmp_path, &compressed)?;
            fs::rename(&tmp_path, &zst_path)?;
        }
        Ok(format!("cas+zst://sha256/{}", digest))
    }

    /// Reads and decompresses a zstd CAS artifact while verifying raw SHA-256 digest.
    pub fn get_bytes_zst(&self, uri: &str) -> Result<Vec<u8>, CasError> {
        let digest = uri
            .strip_prefix("cas+zst://sha256/")
            .ok_or_else(|| CasError::InvalidUri(format!("Malformed zstd CAS URI: {}", uri)))?;
        let zst_path = self.path_for_digest(digest)?.with_extension("zst");
        if !zst_path.exists() {
            return Err(CasError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("Compressed CAS artifact not found: {}", digest),
            )));
        }
        let compressed = fs::read(&zst_path)?;
        let data = zstd::decode_all(Cursor::new(compressed))?;
        let computed = Self::compute_sha256(&data);
        if computed != digest {
            return Err(CasError::Integrity(format!(
                "CAS corrupt after zstd decode: expected {}, got {}",
                digest, computed
            )));
        }
        Ok(data)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cas_put_get_integrity() {
        let tmp = std::env::temp_dir().join("vd_cas_test");
        let mut store = CasStore::new(&tmp);

        let payload = b"Vajra-Dhir Hardware Artifact";
        let uri = store.put_bytes(payload).unwrap();
        assert!(uri.starts_with("cas://sha256/"));

        let retrieved = store.get_bytes(&uri).unwrap();
        assert_eq!(retrieved, payload);

        let digest = uri.strip_prefix("cas://sha256/").unwrap();
        store.pin_digest(digest);
        assert!(store.is_pinned(digest));
    }

    #[test]
    fn test_cas_zstd_put_get_integrity() {
        let tmp = std::env::temp_dir().join("vd_cas_zstd_test");
        let store = CasStore::new(&tmp);

        let payload = b"Vajra-Dhir Hardware Snapshot Payload Repeated Geometry Buffer ".repeat(8);
        let uri = store.put_bytes_zst(&payload).expect("put_bytes_zst failed");
        assert!(uri.starts_with("cas+zst://sha256/"));

        let decoded = store.get_bytes_zst(&uri).expect("get_bytes_zst failed");
        assert_eq!(decoded, payload);
    }
}
