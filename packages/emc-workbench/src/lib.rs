use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProtectedBand {
    pub name: &'static str,
    pub min_freq_mhz: f64,
    pub max_freq_mhz: f64,
}

pub static CRITICAL_RF_BANDS: &[ProtectedBand] = &[
    ProtectedBand { name: "Wi-Fi 2.4 GHz / Bluetooth", min_freq_mhz: 2400.0, max_freq_mhz: 2483.5 },
    ProtectedBand { name: "GNSS / GPS L1", min_freq_mhz: 1573.374, max_freq_mhz: 1577.466 },
    ProtectedBand { name: "Cellular LTE B3 (Downlink)", min_freq_mhz: 1805.0, max_freq_mhz: 1880.0 },
    ProtectedBand { name: "Cellular LTE B7 (Downlink)", min_freq_mhz: 2620.0, max_freq_mhz: 2690.0 },
    ProtectedBand { name: "FM Broadcast Band", min_freq_mhz: 88.0, max_freq_mhz: 108.0 },
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HarmonicCollision {
    pub harmonic_order: u32,
    pub frequency_mhz: f64,
    pub victim_band: String,
    pub source_circuit: String,
    pub severity: &'static str,
    pub mitigation_tip: &'static str,
}

pub struct HarmonicMatrix;

impl HarmonicMatrix {
    pub fn scan_harmonics(source_circuit: &str, fundamental_freq_mhz: f64, max_order: u32) -> Vec<HarmonicCollision> {
        let mut collisions = Vec::new();

        for order in 1..=max_order {
            let f = fundamental_freq_mhz * (order as f64);
            for band in CRITICAL_RF_BANDS {
                if f >= band.min_freq_mhz && f <= band.max_freq_mhz {
                    collisions.push(HarmonicCollision {
                        harmonic_order: order,
                        frequency_mhz: f,
                        victim_band: band.name.to_string(),
                        source_circuit: source_circuit.to_string(),
                        severity: if order <= 5 { "HIGH" } else { "MEDIUM" },
                        mitigation_tip: if fundamental_freq_mhz < 5.0 {
                            "Enable SMPS spread-spectrum frequency dithering or add RC snubber."
                        } else {
                            "Add series damping resistor (22-33 ohm) on clock line or increase rise time."
                        },
                    });
                }
            }
        }

        collisions
    }
}

pub struct EsdPlacementAuditor;

impl EsdPlacementAuditor {
    pub const MAX_SAFE_DISTANCE_NM: i64 = 5_000_000; // 5.0 mm in nanometers

    pub fn audit_esd_distance(conn_x_nm: i64, conn_y_nm: i64, esd_x_nm: i64, esd_y_nm: i64) -> (bool, f64) {
        let dx = (conn_x_nm - esd_x_nm) as f64;
        let dy = (conn_y_nm - esd_y_nm) as f64;
        let dist_nm = (dx * dx + dy * dy).sqrt();
        let dist_mm = dist_nm * 1e-6;
        let is_compliant = dist_nm <= (Self::MAX_SAFE_DISTANCE_NM as f64);

        (is_compliant, dist_mm)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_harmonic_collision_detection() {
        // 40 MHz ESP32 crystal clock: 40 * 46 = 1840 MHz (LTE B3) and 40 * 60 = 2400 MHz (Wi-Fi)
        let collisions = HarmonicMatrix::scan_harmonics("ESP32_XTAL_40MHZ", 40.0, 65);
        assert!(!collisions.is_empty(), "Expected collision in RF bands");
        let wifi_hit = collisions
            .iter()
            .find(|c| c.harmonic_order == 60)
            .expect("Expected 60th harmonic collision in 2.4 GHz band");
        assert_eq!(wifi_hit.frequency_mhz, 2400.0);
    }

    #[test]
    fn test_esd_proximity_check() {
        // Connector at (5mm, 15mm), ESD diode at (8mm, 15mm) -> distance = 3mm (compliant)
        let (pass, dist_mm) = EsdPlacementAuditor::audit_esd_distance(5_000_000, 15_000_000, 8_000_000, 15_000_000);
        assert!(pass);
        assert!((dist_mm - 3.0).abs() < 1e-3);

        // ESD diode at 20mm -> 15mm distance (violation)
        let (fail, dist_mm2) = EsdPlacementAuditor::audit_esd_distance(5_000_000, 15_000_000, 20_000_000, 15_000_000);
        assert!(!fail);
        assert!((dist_mm2 - 15.0).abs() < 1e-3);
    }
}
