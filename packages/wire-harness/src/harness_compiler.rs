use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AwgGauge {
    Awg18,
    Awg20,
    Awg22,
    Awg24,
    Awg26,
    Awg28,
    Awg30,
}

impl AwgGauge {
    /// Nominal copper conductor cross-sectional area in mm^2
    pub fn area_mm2(&self) -> f64 {
        match self {
            AwgGauge::Awg18 => 0.823,
            AwgGauge::Awg20 => 0.518,
            AwgGauge::Awg22 => 0.326,
            AwgGauge::Awg24 => 0.205,
            AwgGauge::Awg26 => 0.129,
            AwgGauge::Awg28 => 0.081,
            AwgGauge::Awg30 => 0.051,
        }
    }

    /// Nominal resistance in ohms per meter at 20°C
    pub fn resistance_ohms_per_m(&self) -> f64 {
        match self {
            AwgGauge::Awg18 => 0.0210,
            AwgGauge::Awg20 => 0.0333,
            AwgGauge::Awg22 => 0.0530,
            AwgGauge::Awg24 => 0.0842,
            AwgGauge::Awg26 => 0.1339,
            AwgGauge::Awg28 => 0.2129,
            AwgGauge::Awg30 => 0.3385,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Iec60757Color {
    Black,  // BK
    Brown,  // BN
    Red,    // RD
    Orange, // OG
    Yellow, // YE
    Green,  // GN
    Blue,   // BU
    Violet, // VT
    Grey,   // GY
    White,  // WH
}

impl Iec60757Color {
    pub fn code(&self) -> &'static str {
        match self {
            Iec60757Color::Black => "BK",
            Iec60757Color::Brown => "BN",
            Iec60757Color::Red => "RD",
            Iec60757Color::Orange => "OG",
            Iec60757Color::Yellow => "YE",
            Iec60757Color::Green => "GN",
            Iec60757Color::Blue => "BU",
            Iec60757Color::Violet => "VT",
            Iec60757Color::Grey => "GY",
            Iec60757Color::White => "WH",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HarnessConnector {
    pub designator: String, // e.g. "J1"
    pub mpn: String,        // e.g. "JST-PH-4P"
    pub pin_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HarnessWire {
    pub signal_name: String,
    pub from_connector: String,
    pub from_pin: usize,
    pub to_connector: String,
    pub to_pin: usize,
    pub gauge: AwgGauge,
    pub color: Iec60757Color,
    pub length_mm: f64,
    pub rated_current_a: f64,
    pub is_twisted_pair: bool,
    pub pair_partner_signal: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WiringCutRecord {
    pub wire_index: usize,
    pub signal_name: String,
    pub gauge: AwgGauge,
    pub color_code: String,
    pub cut_length_mm: f64,
    pub strip_length_mm: f64,
    pub from_endpoint: String,
    pub to_endpoint: String,
    pub calculated_resistance_ohms: f64,
    pub voltage_drop_mv: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HarnessAssemblyReport {
    pub harness_name: String,
    pub total_wires_count: usize,
    pub connectors_count: usize,
    pub total_copper_mass_g: f64,
    pub wiring_table: Vec<WiringCutRecord>,
    pub bom_lines: Vec<String>,
}

pub struct WireHarnessCompiler;

impl WireHarnessCompiler {
    /// Compiles declarative harness specifications into manufacturing cut-lists and electrical verification tables.
    pub fn compile(
        harness_name: &str,
        connectors: &[HarnessConnector],
        wires: &[HarnessWire],
    ) -> HarnessAssemblyReport {
        let mut wiring_table = Vec::new();
        let mut total_copper_vol_mm3 = 0.0;

        for (idx, w) in wires.iter().enumerate() {
            let length_m = w.length_mm / 1000.0;
            let resistance_ohms = w.gauge.resistance_ohms_per_m() * length_m;
            let v_drop_mv = w.rated_current_a * resistance_ohms * 1000.0;

            let area_mm2 = w.gauge.area_mm2();
            total_copper_vol_mm3 += area_mm2 * w.length_mm;

            wiring_table.push(WiringCutRecord {
                wire_index: idx + 1,
                signal_name: w.signal_name.clone(),
                gauge: w.gauge,
                color_code: w.color.code().to_string(),
                cut_length_mm: w.length_mm + 10.0, // 10mm cutting margin
                strip_length_mm: 3.5,              // standard 3.5mm strip length
                from_endpoint: format!("{}:{}", w.from_connector, w.from_pin),
                to_endpoint: format!("{}:{}", w.to_connector, w.to_pin),
                calculated_resistance_ohms: resistance_ohms,
                voltage_drop_mv: v_drop_mv,
            });
        }

        // Density of copper = 8.96 g/cm3 = 0.00896 g/mm3
        let total_copper_mass_g = total_copper_vol_mm3 * 0.00896;

        let mut bom_lines = Vec::new();
        for conn in connectors {
            bom_lines.push(format!("Connector: {} ({}), {} pins", conn.designator, conn.mpn, conn.pin_count));
        }
        bom_lines.push(format!("Wires: {} discrete conductors, {:.1} g net copper", wires.len(), total_copper_mass_g));

        HarnessAssemblyReport {
            harness_name: harness_name.to_string(),
            total_wires_count: wires.len(),
            connectors_count: connectors.len(),
            total_copper_mass_g,
            wiring_table,
            bom_lines,
        }
    }
}
