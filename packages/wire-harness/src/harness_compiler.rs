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

    /// Clean-room MIT parser for WireViz-schema YAML harness specs (connectors/cables/connections).
    pub fn parse_yaml_and_compile(harness_name: &str, yaml_text: &str) -> HarnessAssemblyReport {
        #[derive(Default)]
        struct TempCable {
            gauge: Option<AwgGauge>,
            length_m: f64,
            colors: Vec<Iec60757Color>,
        }
        let mut section = "";
        let mut cur_id = String::new();
        let mut conn_pins: std::collections::BTreeMap<String, (String, usize)> = std::collections::BTreeMap::new();
        let mut cables: std::collections::BTreeMap<String, TempCable> = std::collections::BTreeMap::new();
        let mut conn_order: Vec<String> = Vec::new();
        let mut wires_out: Vec<HarnessWire> = Vec::new();
        let mut pending_from: Option<String> = None;
        let mut pending_cable: Option<String> = None;

        let parse_awg = |raw: &str| -> AwgGauge {
            if raw.contains("18") { AwgGauge::Awg18 }
            else if raw.contains("20") { AwgGauge::Awg20 }
            else if raw.contains("22") { AwgGauge::Awg22 }
            else if raw.contains("26") { AwgGauge::Awg26 }
            else if raw.contains("28") { AwgGauge::Awg28 }
            else if raw.contains("30") { AwgGauge::Awg30 }
            else { AwgGauge::Awg24 }
        };
        let parse_color = |code: &str| -> Iec60757Color {
            match code.trim() {
                "BK" => Iec60757Color::Black,
                "BN" => Iec60757Color::Brown,
                "RD" => Iec60757Color::Red,
                "OG" => Iec60757Color::Orange,
                "YL" | "YE" => Iec60757Color::Yellow,
                "GN" => Iec60757Color::Green,
                "BU" => Iec60757Color::Blue,
                "VT" => Iec60757Color::Violet,
                "GY" => Iec60757Color::Grey,
                _ => Iec60757Color::White,
            }
        };

        for raw in yaml_text.lines() {
            let trimmed = raw.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                continue;
            }
            let indent = raw.len() - raw.trim_start().len();
            if indent == 0 && trimmed.ends_with(':') {
                section = match trimmed.trim_end_matches(':') {
                    "connectors" => "connectors",
                    "cables" => "cables",
                    "connections" => "connections",
                    _ => "",
                };
                cur_id.clear();
                continue;
            }
            match section {
                "connectors" => {
                    if indent == 2 && trimmed.ends_with(':') {
                        cur_id = trimmed.trim_end_matches(':').to_string();
                        conn_order.push(cur_id.clone());
                        conn_pins.entry(cur_id.clone()).or_insert_with(|| (String::from("GENERIC"), 0));
                    } else if let Some((k, v)) = trimmed.split_once(':') {
                        if let Some(entry) = conn_pins.get_mut(&cur_id) {
                            let val = v.trim();
                            match k.trim() {
                                "type" => entry.0 = val.to_string(),
                                "pins" => {
                                    let count = val.trim_matches(&['[', ']'][..]).split(',').filter(|s| !s.trim().is_empty()).count();
                                    entry.1 = count;
                                }
                                _ => {}
                            }
                        }
                    }
                }
                "cables" => {
                    if indent == 2 && trimmed.ends_with(':') {
                        cur_id = trimmed.trim_end_matches(':').to_string();
                        cables.entry(cur_id.clone()).or_default();
                    } else if let Some((k, v)) = trimmed.split_once(':') {
                        if let Some(cab) = cables.get_mut(&cur_id) {
                            let val = v.trim();
                            match k.trim() {
                                "gauge" => cab.gauge = Some(parse_awg(val)),
                                "length" => cab.length_m = val.parse::<f64>().unwrap_or(0.25),
                                "colors" => {
                                    cab.colors = val.trim_matches(&['[', ']'][..]).split(',').map(parse_color).collect();
                                }
                                _ => {}
                            }
                        }
                    }
                }
                "connections" => {
                    if trimmed.starts_with("- ") {
                        let item = trimmed.trim_start_matches("- ").trim();
                        if let Some((node, _pins)) = item.split_once(':') {
                            let node_name = node.trim().to_string();
                            if cables.contains_key(&node_name) {
                                pending_cable = Some(node_name);
                            } else if pending_from.is_none() {
                                pending_from = Some(node_name);
                            } else if let (Some(from_c), Some(cab_name)) = (pending_from.take(), pending_cable.take()) {
                                if let Some(cab) = cables.get(&cab_name) {
                                    let pin_cnt = conn_pins.get(&from_c).map(|v| v.1).unwrap_or(1).max(cab.colors.len());
                                    let len_mm = (cab.length_m * 1000.0).max(1.0);
                                    let gauge = cab.gauge.unwrap_or(AwgGauge::Awg24);
                                    for p in 1..=pin_cnt {
                                        let color = cab.colors.get(p - 1).copied().unwrap_or(Iec60757Color::White);
                                        wires_out.push(HarnessWire {
                                            signal_name: format!("{}_{}", cab_name, p),
                                            from_connector: from_c.clone(),
                                            from_pin: p,
                                            to_connector: node_name.clone(),
                                            to_pin: p,
                                            gauge,
                                            color,
                                            length_mm: len_mm,
                                            rated_current_a: 1.0,
                                            is_twisted_pair: false,
                                            pair_partner_signal: None,
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
                _ => {}
            }
        }

        let connectors: Vec<HarnessConnector> = conn_order
            .into_iter()
            .filter_map(|id| {
                conn_pins.get(&id).map(|(mpn, pc)| HarnessConnector {
                    designator: id,
                    mpn: mpn.clone(),
                    pin_count: *pc,
                })
            })
            .collect();

        Self::compile(harness_name, &connectors, &wires_out)
    }

    /// Exports a pure-MIT clean-room SVG wiring diagram.
    pub fn export_svg(report: &HarnessAssemblyReport) -> String {
        let h = 100 + (report.wiring_table.len() * 28);
        let mut svg = format!(
            r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 {}" width="100%" style="background:#0B0E14;font-family:sans-serif;">"#,
            h
        );
        svg.push_str(&format!(
            r#"<text x="20" y="30" fill="#E6EDF7" font-size="14">Harness: {} ({} wires)</text>"#,
            report.harness_name, report.total_wires_count
        ));
        for (i, w) in report.wiring_table.iter().enumerate() {
            let y = 64 + (i * 28);
            svg.push_str(&format!(
                r#"<line x1="120" y1="{}" x2="540" y2="{}" stroke="#3B82F6" stroke-width="2"/><text x="20" y="{}" fill="#94A3B8" font-size="11">{}</text><text x="555" y="{}" fill="#E6EDF7" font-size="11">{} [{}] {:.0}mm</text>"#,
                y, y, y + 4, w.from_endpoint, y + 4, w.to_endpoint, w.color_code, w.cut_length_mm
            ));
        }
        svg.push_str("</svg>");
        svg
    }

    /// Exports deterministic CSV cut-list for automated crimp/cut machinery.
    pub fn export_cut_list_csv(report: &HarnessAssemblyReport) -> String {
        let mut csv = String::from("index,signal,color,cut_length_mm,strip_length_mm,from,to,resistance_ohm\n");
        for w in &report.wiring_table {
            csv.push_str(&format!(
                "{},{},{},{:.1},{:.1},{},{},{:.4}\n",
                w.wire_index,
                w.signal_name,
                w.color_code,
                w.cut_length_mm,
                w.strip_length_mm,
                w.from_endpoint,
                w.to_endpoint,
                w.calculated_resistance_ohms
            ));
        }
        csv
    }
}
