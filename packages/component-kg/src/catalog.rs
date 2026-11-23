use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum JlcPartTier {
    Basic,    // Free reel setup ($0 swap fee)
    Preferred,// Low-cost fee
    Extended, // $3.00 setup fee per line item
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JlcCatalogPart {
    pub lcsc_part: String,        // e.g. "C1525"
    pub mpn: String,              // e.g. "0402WGF1002TCE"
    pub manufacturer: String,     // e.g. "UNI-ROYAL"
    pub package_name: String,     // e.g. "0402"
    pub category: String,        // e.g. "Resistors", "Capacitors"
    pub value_str: String,        // e.g. "10k"
    pub tier: JlcPartTier,
    pub stock: u32,
    pub price_usd_at_1k: f64,
    pub description: String,
}

pub struct ComponentCatalog {
    parts: Vec<JlcCatalogPart>,
}

impl ComponentCatalog {
    pub fn new_with_golden_catalog() -> Self {
        let parts = vec![
            // Basic Resistors (0402)
            JlcCatalogPart {
                lcsc_part: "C25076".into(),
                mpn: "0402WGF1002TCE".into(),
                manufacturer: "UNI-ROYAL".into(),
                package_name: "0402".into(),
                category: "Resistors".into(),
                value_str: "10k".into(),
                tier: JlcPartTier::Basic,
                stock: 1250000,
                price_usd_at_1k: 0.0012,
                description: "10k Ohm ±1% 1/16W 0402 Chip Resistor".into(),
            },
            JlcCatalogPart {
                lcsc_part: "C25087".into(),
                mpn: "0402WGF1001TCE".into(),
                manufacturer: "UNI-ROYAL".into(),
                package_name: "0402".into(),
                category: "Resistors".into(),
                value_str: "1k".into(),
                tier: JlcPartTier::Basic,
                stock: 980000,
                price_usd_at_1k: 0.0012,
                description: "1k Ohm ±1% 1/16W 0402 Chip Resistor".into(),
            },
            // Basic Capacitors (0402 & 0603)
            JlcCatalogPart {
                lcsc_part: "C1525".into(),
                mpn: "CL05A106MQ5NUNC".into(),
                manufacturer: "Samsung".into(),
                package_name: "0402".into(),
                category: "Capacitors".into(),
                value_str: "10uF 6.3V X5R".into(),
                tier: JlcPartTier::Basic,
                stock: 450000,
                price_usd_at_1k: 0.0065,
                description: "10uF ±20% 6.3V X5R 0402 MLCC".into(),
            },
            JlcCatalogPart {
                lcsc_part: "C14663".into(),
                mpn: "CC0603KRX7R9BB104".into(),
                manufacturer: "Yageo".into(),
                package_name: "0603".into(),
                category: "Capacitors".into(),
                value_str: "100nF 50V X7R".into(),
                tier: JlcPartTier::Basic,
                stock: 2100000,
                price_usd_at_1k: 0.0028,
                description: "100nF ±10% 50V X7R 0603 MLCC".into(),
            },
            // Basic Synchronous Buck IC
            JlcCatalogPart {
                lcsc_part: "C84333".into(),
                mpn: "TPS54302DDCR".into(),
                manufacturer: "Texas Instruments".into(),
                package_name: "SOT-23-6".into(),
                category: "Power Management".into(),
                value_str: "TPS54302 4.5V-28V 3A".into(),
                tier: JlcPartTier::Basic,
                stock: 85000,
                price_usd_at_1k: 0.58,
                description: "4.5V to 28V Input, 3A Step-Down Converter".into(),
            },
            // Basic USB-PD Sink Controller
            JlcCatalogPart {
                lcsc_part: "C967646".into(),
                mpn: "CH224K".into(),
                manufacturer: "WCH".into(),
                package_name: "ESSOP-10".into(),
                category: "Interface".into(),
                value_str: "CH224K USB-PD".into(),
                tier: JlcPartTier::Basic,
                stock: 140000,
                price_usd_at_1k: 0.22,
                description: "USB Type-C PD Decoy & Sink Fast Charge Protocol Controller".into(),
            },
        ];

        Self { parts }
    }

    /// Find basic part equivalent for an existing component to eliminate the $3 setup fee.
    pub fn find_basic_replacement(
        &self,
        category: &str,
        value_str: &str,
        package: &str,
    ) -> Option<&JlcCatalogPart> {
        self.parts.iter().find(|p| {
            p.tier == JlcPartTier::Basic
                && p.category.eq_ignore_ascii_case(category)
                && p.package_name.eq_ignore_ascii_case(package)
                && p.value_str.eq_ignore_ascii_case(value_str)
        })
    }

    pub fn search(&self, query: &str) -> Vec<&JlcCatalogPart> {
        let q = query.to_lowercase();
        self.parts
            .iter()
            .filter(|p| {
                p.mpn.to_lowercase().contains(&q)
                    || p.lcsc_part.to_lowercase().contains(&q)
                    || p.value_str.to_lowercase().contains(&q)
                    || p.description.to_lowercase().contains(&q)
            })
            .collect()
    }
}
