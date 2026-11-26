use thiserror::Error;
use vd_ir::model::Nm;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GerberUnit {
    Millimeters,
    Inches,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GerberApertureKind {
    Circle { diameter_nm: Nm },
    Rectangle { width_nm: Nm, height_nm: Nm },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GerberAperture {
    pub d_code: u32,
    pub kind: GerberApertureKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GerberOpKind {
    Draw,
    Move,
    Flash,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GerberOperation {
    pub d_code: u32,
    pub op: GerberOpKind,
    pub x_nm: Nm,
    pub y_nm: Nm,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GerberDocument {
    pub unit: GerberUnit,
    pub int_digits: u8,
    pub dec_digits: u8,
    pub file_function: Option<String>,
    pub apertures: Vec<GerberAperture>,
    pub operations: Vec<GerberOperation>,
}

#[derive(Debug, Error)]
pub enum GerberError {
    #[error("Invalid Gerber format specification: {0}")]
    InvalidFormat(String),

    #[error("Invalid Gerber coordinate token: {0}")]
    InvalidCoord(String),
}

pub struct GerberParser;

impl GerberParser {
    /// Parses a clean-room Ucamco RS-274X / X2 Gerber byte stream into i64 nanometers.
    pub fn parse(input: &str) -> Result<GerberDocument, GerberError> {
        let mut unit = GerberUnit::Millimeters;
        let mut int_digits: u8 = 4;
        let mut dec_digits: u8 = 6;
        let mut file_function: Option<String> = None;
        let mut apertures = Vec::new();
        let mut operations = Vec::new();
        let mut current_d_code: u32 = 10;
        let mut cur_x: Nm = 0;
        let mut cur_y: Nm = 0;

        for raw_line in input.lines() {
            let line = raw_line.trim();
            if line.is_empty() || line.starts_with("G04") {
                continue;
            }
            if line.starts_with("%TF.FileFunction,") {
                let inner = line
                    .trim_start_matches("%TF.FileFunction,")
                    .trim_end_matches("%")
                    .trim_end_matches('*');
                file_function = Some(inner.to_string());
                continue;
            }
            if line.starts_with("%FSLA") {
                if let Some(xpos) = line.find('X') {
                    let bytes = line.as_bytes();
                    if xpos + 2 < bytes.len()
                        && bytes[xpos + 1].is_ascii_digit()
                        && bytes[xpos + 2].is_ascii_digit()
                    {
                        int_digits = bytes[xpos + 1] - b'0';
                        dec_digits = bytes[xpos + 2] - b'0';
                    }
                }
                continue;
            }
            if line.starts_with("%MOMM") {
                unit = GerberUnit::Millimeters;
                continue;
            }
            if line.starts_with("%MOIN") {
                unit = GerberUnit::Inches;
                continue;
            }
            if line.starts_with("%ADD") {
                let body = line.trim_start_matches("%ADD").trim_end_matches("%").trim_end_matches('*');
                if let Some((code_part, rest)) = body.split_once(',') {
                    let kind_char = code_part.chars().last().unwrap_or('C');
                    let code_digits: String = code_part.chars().take_while(|c| c.is_ascii_digit()).collect();
                    let d_code = code_digits
                        .parse::<u32>()
                        .map_err(|_| GerberError::InvalidFormat(line.to_string()))?;
                    let scale = if unit == GerberUnit::Millimeters { 1_000_000.0 } else { 25_400_000.0 };
                    let kind = if kind_char == 'R' {
                        let (w_s, h_s) = rest
                            .split_once('X')
                            .ok_or_else(|| GerberError::InvalidFormat(line.to_string()))?;
                        let w = (w_s.parse::<f64>().map_err(|_| GerberError::InvalidFormat(line.to_string()))? * scale).round() as Nm;
                        let h = (h_s.parse::<f64>().map_err(|_| GerberError::InvalidFormat(line.to_string()))? * scale).round() as Nm;
                        GerberApertureKind::Rectangle { width_nm: w, height_nm: h }
                    } else {
                        let d = (rest.parse::<f64>().map_err(|_| GerberError::InvalidFormat(line.to_string()))? * scale).round() as Nm;
                        GerberApertureKind::Circle { diameter_nm: d }
                    };
                    apertures.push(GerberAperture { d_code, kind });
                }
                continue;
            }
            if line.starts_with('D') && line.ends_with('*') && !line.contains('X') && !line.contains('Y') {
                let digits = line.trim_start_matches('D').trim_end_matches('*');
                if let Ok(code) = digits.parse::<u32>()
                    && code >= 10
                {
                    current_d_code = code;
                }
                continue;
            }
            if line == "M02*" {
                break;
            }
            if (line.contains('X') || line.contains('Y')) && line.ends_with('*') {
                let body = line.trim_end_matches('*');
                let (coord_part, d_op) = if let Some((c, d)) = body.rsplit_once('D') {
                    (c, d)
                } else {
                    continue;
                };
                if let Some(x_idx) = coord_part.find('X') {
                    let x_tail = &coord_part[x_idx + 1..];
                    let x_str = match x_tail.find('Y') {
                        Some(y_rel) => &x_tail[..y_rel],
                        None => x_tail,
                    };
                    cur_x = parse_gerber_coord(x_str, dec_digits, unit)?;
                }
                if let Some(y_idx) = coord_part.find('Y') {
                    let y_str = &coord_part[y_idx + 1..];
                    cur_y = parse_gerber_coord(y_str, dec_digits, unit)?;
                }
                let op = match d_op {
                    "01" | "1" => GerberOpKind::Draw,
                    "02" | "2" => GerberOpKind::Move,
                    "03" | "3" => GerberOpKind::Flash,
                    _ => continue,
                };
                operations.push(GerberOperation {
                    d_code: current_d_code,
                    op,
                    x_nm: cur_x,
                    y_nm: cur_y,
                });
            }
        }

        Ok(GerberDocument {
            unit,
            int_digits,
            dec_digits,
            file_function,
            apertures,
            operations,
        })
    }
}

fn parse_gerber_coord(token: &str, dec_digits: u8, unit: GerberUnit) -> Result<Nm, GerberError> {
    let raw = token
        .parse::<i64>()
        .map_err(|_| GerberError::InvalidCoord(token.to_string()))?;
    let unit_nm: f64 = match unit {
        GerberUnit::Millimeters => 1_000_000.0,
        GerberUnit::Inches => 25_400_000.0,
    };
    let denom = 10f64.powi(dec_digits as i32);
    Ok(((raw as f64 / denom) * unit_nm).round() as Nm)
}

pub struct GerberPlotter;

impl GerberPlotter {
    /// Emits a deterministic RS-274X / X2 ASCII stream from GerberDocument.
    pub fn emit(doc: &GerberDocument) -> String {
        let mut out = String::new();
        if let Some(ref func) = doc.file_function {
            out.push_str(&format!("%TF.FileFunction,{}*%\n", func));
        }
        out.push_str(&format!("%FSLAX{}{}Y{}{}*%\n", doc.int_digits, doc.dec_digits, doc.int_digits, doc.dec_digits));
        out.push_str(match doc.unit {
            GerberUnit::Millimeters => "%MOMM*%\n",
            GerberUnit::Inches => "%MOIN*%\n",
        });
        let scale = match doc.unit {
            GerberUnit::Millimeters => 1_000_000.0,
            GerberUnit::Inches => 25_400_000.0,
        };
        for ap in &doc.apertures {
            match ap.kind {
                GerberApertureKind::Circle { diameter_nm } => {
                    out.push_str(&format!("%ADD{}C,{:.6}*%\n", ap.d_code, diameter_nm as f64 / scale));
                }
                GerberApertureKind::Rectangle { width_nm, height_nm } => {
                    out.push_str(&format!(
                        "%ADD{}R,{:.6}X{:.6}*%\n",
                        ap.d_code,
                        width_nm as f64 / scale,
                        height_nm as f64 / scale
                    ));
                }
            }
        }
        let mult = 10f64.powi(doc.dec_digits as i32);
        let mut active_d: Option<u32> = None;
        for op in &doc.operations {
            if active_d != Some(op.d_code) {
                out.push_str(&format!("D{}*\n", op.d_code));
                active_d = Some(op.d_code);
            }
            let x_raw = ((op.x_nm as f64 / scale) * mult).round() as i64;
            let y_raw = ((op.y_nm as f64 / scale) * mult).round() as i64;
            let d_op = match op.op {
                GerberOpKind::Draw => "01",
                GerberOpKind::Move => "02",
                GerberOpKind::Flash => "03",
            };
            out.push_str(&format!("X{}Y{}D{}*\n", x_raw, y_raw, d_op));
        }
        out.push_str("M02*\n");
        out
    }
}
