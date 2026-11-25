use thiserror::Error;
use vd_ir::model::{Mdeg, Nm};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EagleElement {
    pub name: String,
    pub package: String,
    pub value: String,
    pub x_nm: Nm,
    pub y_nm: Nm,
    pub rot_mdeg: Mdeg,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EagleWire {
    pub signal: String,
    pub layer: String,
    pub x1_nm: Nm,
    pub y1_nm: Nm,
    pub x2_nm: Nm,
    pub y2_nm: Nm,
    pub width_nm: Nm,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EagleBoard {
    pub elements: Vec<EagleElement>,
    pub wires: Vec<EagleWire>,
}

#[derive(Debug, Error)]
pub enum EagleParseError {
    #[error("Malformed EAGLE XML attribute: {0}")]
    MalformedAttribute(String),
}

pub struct EagleBoardParser;

impl EagleBoardParser {
    /// Clean-room MIT parser for EAGLE 6.x+ XML board files into signed i64 nm & i32 mdeg.
    pub fn parse(xml: &str) -> Result<EagleBoard, EagleParseError> {
        let mut elements = Vec::new();
        let mut wires = Vec::new();
        let mut current_signal = String::from("UNCONNECTED");

        for raw in xml.lines() {
            let line = raw.trim();
            if line.starts_with("<element ") {
                let name = extract_attr(line, "name").unwrap_or_default();
                let package = extract_attr(line, "package").unwrap_or_default();
                let value = extract_attr(line, "value").unwrap_or_default();
                let x_nm = parse_mm_to_nm(extract_attr(line, "x").as_deref().unwrap_or("0"))?;
                let y_nm = parse_mm_to_nm(extract_attr(line, "y").as_deref().unwrap_or("0"))?;
                let rot_mdeg = parse_eagle_rot(extract_attr(line, "rot").as_deref().unwrap_or("R0"));
                elements.push(EagleElement {
                    name,
                    package,
                    value,
                    x_nm,
                    y_nm,
                    rot_mdeg,
                });
            } else if line.starts_with("<signal ") {
                current_signal = extract_attr(line, "name").unwrap_or_else(|| "UNCONNECTED".into());
            } else if line.starts_with("</signal>") {
                current_signal = String::from("UNCONNECTED");
            } else if line.starts_with("<wire ") {
                let layer = extract_attr(line, "layer").unwrap_or_else(|| "1".into());
                let x1_nm = parse_mm_to_nm(extract_attr(line, "x1").as_deref().unwrap_or("0"))?;
                let y1_nm = parse_mm_to_nm(extract_attr(line, "y1").as_deref().unwrap_or("0"))?;
                let x2_nm = parse_mm_to_nm(extract_attr(line, "x2").as_deref().unwrap_or("0"))?;
                let y2_nm = parse_mm_to_nm(extract_attr(line, "y2").as_deref().unwrap_or("0"))?;
                let width_nm = parse_mm_to_nm(extract_attr(line, "width").as_deref().unwrap_or("0.2"))?;
                wires.push(EagleWire {
                    signal: current_signal.clone(),
                    layer,
                    x1_nm,
                    y1_nm,
                    x2_nm,
                    y2_nm,
                    width_nm,
                });
            }
        }

        Ok(EagleBoard { elements, wires })
    }
}

fn extract_attr(tag: &str, key: &str) -> Option<String> {
    let needle = format!("{}=\"", key);
    let start = tag.find(&needle)? + needle.len();
    let end = tag[start..].find('"')? + start;
    Some(tag[start..end].to_string())
}

fn parse_mm_to_nm(raw: &str) -> Result<Nm, EagleParseError> {
    let v = raw
        .parse::<f64>()
        .map_err(|_| EagleParseError::MalformedAttribute(raw.to_string()))?;
    Ok((v * 1_000_000.0).round() as Nm)
}

fn parse_eagle_rot(raw: &str) -> Mdeg {
    let digits: String = raw
        .chars()
        .skip_while(|c| !c.is_ascii_digit() && *c != '-')
        .collect();
    let deg = digits.parse::<f64>().unwrap_or(0.0);
    ((deg * 1000.0).round() as Mdeg).rem_euclid(360_000)
}
