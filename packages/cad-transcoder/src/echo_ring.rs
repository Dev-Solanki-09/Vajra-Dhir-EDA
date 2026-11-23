use std::collections::HashMap;
use std::time::{Duration, Instant};

pub const DEFAULT_SUPPRESSION_WINDOW: Duration = Duration::from_secs(5);

pub struct EchoSuppressionRing {
    window: Duration,
    records: HashMap<String, Instant>,
}

impl EchoSuppressionRing {
    pub fn new() -> Self {
        Self {
            window: DEFAULT_SUPPRESSION_WINDOW,
            records: HashMap::new(),
        }
    }

    pub fn with_window(window: Duration) -> Self {
        Self {
            window,
            records: HashMap::new(),
        }
    }

    /// Record a file write originated by Vajra-Dhīr EDA.
    pub fn record_write(&mut self, sha256_hex: &str) {
        self.prune();
        self.records.insert(sha256_hex.to_string(), Instant::now());
    }

    /// Check whether a file change event should be suppressed because it matches
    /// a self-originated write within the suppression window (default 5.0 seconds).
    pub fn should_suppress(&mut self, sha256_hex: &str) -> bool {
        self.prune();
        if let Some(recorded_at) = self.records.get(sha256_hex) {
            if recorded_at.elapsed() <= self.window {
                return true;
            }
        }
        false
    }

    /// Prune expired entries older than the suppression window.
    pub fn prune(&mut self) {
        let window = self.window;
        self.records.retain(|_, timestamp| timestamp.elapsed() <= window);
    }

    pub fn active_records_count(&self) -> usize {
        self.records.len()
    }
}

impl Default for EchoSuppressionRing {
    fn default() -> Self {
        Self::new()
    }
}
