//! Vajra-Dhīr EDA — IPC-7351B Footprint Synthesizer (`vd-footprint-synth`)
//!
//! Synthesizes mathematically compliant land patterns according to IPC-7351B standards:
//! - Density Level A: Maximum Material Condition (Most - wave solder / high reliability)
//! - Density Level B: Nominal Material Condition (Nominal - standard reflow)
//! - Density Level C: Least Material Condition (Least - high-density / portable)
//!
//! Generates valid KiCad 10 `.kicad_mod` S-expressions with courtyard, silkscreen, and fabrication layers.

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum FootprintError {
    #[error("Invalid component dimensions: {0}")]
    InvalidDimensions(String),
    #[error("Unsupported package style: {0}")]
    UnsupportedPackage(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DensityLevel {
    /// Level A: Most Material Condition (protyping, military, high shock, wave)
    Most,
    /// Level B: Nominal Material Condition (standard reflow SMT)
    Nominal,
    /// Level C: Least Material Condition (ultra-dense, handheld, HDI)
    Least,
}

#[derive(Debug, Clone, Copy)]
pub struct IpcGoals {
    pub toe_nm: i64,      // JT
    pub heel_nm: i64,     // JH
    pub side_nm: i64,     // JS
    pub courtyard_nm: i64,// CE
}

impl DensityLevel {
    pub fn chip_goals(&self) -> IpcGoals {
        match self {
            DensityLevel::Most => IpcGoals {
                toe_nm: 550_000,
                heel_nm: 0,
                side_nm: 50_000,
                courtyard_nm: 500_000,
            },
            DensityLevel::Nominal => IpcGoals {
                toe_nm: 350_000,
                heel_nm: 0,
                side_nm: 0,
                courtyard_nm: 250_000,
            },
            DensityLevel::Least => IpcGoals {
                toe_nm: 150_000,
                heel_nm: 0,
                side_nm: -50_000,
                courtyard_nm: 120_000,
            },
        }
    }

    pub fn gullwing_goals(&self) -> IpcGoals {
        match self {
            DensityLevel::Most => IpcGoals {
                toe_nm: 550_000,
                heel_nm: 450_000,
                side_nm: 50_000,
                courtyard_nm: 500_000,
            },
            DensityLevel::Nominal => IpcGoals {
                toe_nm: 350_000,
                heel_nm: 350_000,
                side_nm: 30_000,
                courtyard_nm: 250_000,
            },
            DensityLevel::Least => IpcGoals {
                toe_nm: 150_000,
                heel_nm: 250_000,
                side_nm: 10_000,
                courtyard_nm: 120_000,
            },
        }
    }

    pub fn nolead_goals(&self) -> IpcGoals {
        match self {
            DensityLevel::Most => IpcGoals {
                toe_nm: 400_000,
                heel_nm: 0,
                side_nm: -40_000,
                courtyard_nm: 500_000,
            },
            DensityLevel::Nominal => IpcGoals {
                toe_nm: 300_000,
                heel_nm: 0,
                side_nm: -40_000,
                courtyard_nm: 250_000,
            },
            DensityLevel::Least => IpcGoals {
                toe_nm: 200_000,
                heel_nm: 0,
                side_nm: -40_000,
                courtyard_nm: 120_000,
            },
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratedPad {
    pub number: String,
    pub x_nm: i64,
    pub y_nm: i64,
    pub width_nm: i64,
    pub height_nm: i64,
    pub is_thermal_pad: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratedFootprint {
    pub name: String,
    pub pads: Vec<GeneratedPad>,
    pub courtyard_bbox_nm: (i64, i64, i64, i64), // (x1, y1, x2, y2)
    pub body_width_nm: i64,
    pub body_length_nm: i64,
    pub density: DensityLevel,
}

pub struct FootprintSynthesizer;

impl FootprintSynthesizer {
    /// Synthesizes a 2-terminal SMD Chip component (0402, 0603, 0805, 1206)
    pub fn synthesize_chip(
        name: &str,
        body_length_nm: i64, // L
        body_width_nm: i64,  // W
        terminal_nm: i64,    // T (terminal band length)
        density: DensityLevel,
    ) -> Result<GeneratedFootprint, FootprintError> {
        if body_length_nm <= 0 || body_width_nm <= 0 || terminal_nm <= 0 {
            return Err(FootprintError::InvalidDimensions("Dimensions must be positive".into()));
        }

        let goals = density.chip_goals();
        let s_nm = body_length_nm - 2 * terminal_nm; // spacing between terminals

        // IPC-7351B Equations:
        // Z = L + 2 * JT
        // G = S - 2 * JH
        // X = W + 2 * JS
        // Pad Length Y = (Z - G) / 2
        // Pad Center-to-Center C = (Z + G) / 2
        let z_nm = body_length_nm + 2 * goals.toe_nm;
        let g_nm = s_nm - 2 * goals.heel_nm;
        let pad_x_nm = (body_width_nm + 2 * goals.side_nm).max(200_000);
        let pad_y_nm = ((z_nm - g_nm) / 2).max(200_000);
        let c_nm = (z_nm + g_nm) / 2;

        let pads = vec![
            GeneratedPad {
                number: "1".into(),
                x_nm: -c_nm / 2,
                y_nm: 0,
                width_nm: pad_y_nm, // Along X
                height_nm: pad_x_nm, // Along Y
                is_thermal_pad: false,
            },
            GeneratedPad {
                number: "2".into(),
                x_nm: c_nm / 2,
                y_nm: 0,
                width_nm: pad_y_nm,
                height_nm: pad_x_nm,
                is_thermal_pad: false,
            },
        ];

        let crt_x = (z_nm / 2) + goals.courtyard_nm;
        let crt_y = (pad_x_nm / 2) + goals.courtyard_nm;

        Ok(GeneratedFootprint {
            name: name.to_string(),
            pads,
            courtyard_bbox_nm: (-crt_x, -crt_y, crt_x, crt_y),
            body_width_nm,
            body_length_nm,
            density,
        })
    }

    /// Synthesizes a QFN/DFN package with perimeter pads and optional central thermal pad
    #[allow(clippy::too_many_arguments)]
    pub fn synthesize_qfn(
        name: &str,
        pin_count: u32,
        body_size_nm: i64,
        pitch_nm: i64,
        lead_width_nm: i64,
        lead_length_nm: i64,
        thermal_pad_size_nm: Option<i64>,
        density: DensityLevel,
    ) -> Result<GeneratedFootprint, FootprintError> {
        if !pin_count.is_multiple_of(4) || pin_count == 0 {
            return Err(FootprintError::InvalidDimensions("QFN pin count must be multiple of 4".into()));
        }

        let goals = density.nolead_goals();
        let pad_len_nm = lead_length_nm + goals.toe_nm + goals.heel_nm;
        let pad_w_nm = lead_width_nm + 2 * goals.side_nm;

        let pins_per_side = pin_count / 4;
        let span_nm = body_size_nm / 2 + goals.toe_nm - (pad_len_nm / 2);

        let mut pads = Vec::new();
        let mut pin_idx = 1;

        // Side 1: Left (pointing out toward -X)
        let half_span_y = ((pins_per_side as i64 - 1) * pitch_nm) / 2;
        for i in 0..pins_per_side {
            let y = half_span_y - (i as i64 * pitch_nm);
            pads.push(GeneratedPad {
                number: pin_idx.to_string(),
                x_nm: -span_nm,
                y_nm: y,
                width_nm: pad_len_nm,
                height_nm: pad_w_nm,
                is_thermal_pad: false,
            });
            pin_idx += 1;
        }

        // Side 2: Bottom (pointing out toward +Y)
        let half_span_x = ((pins_per_side as i64 - 1) * pitch_nm) / 2;
        for i in 0..pins_per_side {
            let x = -half_span_x + (i as i64 * pitch_nm);
            pads.push(GeneratedPad {
                number: pin_idx.to_string(),
                x_nm: x,
                y_nm: span_nm,
                width_nm: pad_w_nm,
                height_nm: pad_len_nm,
                is_thermal_pad: false,
            });
            pin_idx += 1;
        }

        // Side 3: Right (pointing out toward +X)
        for i in 0..pins_per_side {
            let y = -half_span_y + (i as i64 * pitch_nm);
            pads.push(GeneratedPad {
                number: pin_idx.to_string(),
                x_nm: span_nm,
                y_nm: y,
                width_nm: pad_len_nm,
                height_nm: pad_w_nm,
                is_thermal_pad: false,
            });
            pin_idx += 1;
        }

        // Side 4: Top (pointing out toward -Y)
        for i in 0..pins_per_side {
            let x = half_span_x - (i as i64 * pitch_nm);
            pads.push(GeneratedPad {
                number: pin_idx.to_string(),
                x_nm: x,
                y_nm: -span_nm,
                width_nm: pad_w_nm,
                height_nm: pad_len_nm,
                is_thermal_pad: false,
            });
            pin_idx += 1;
        }

        // Central thermal pad (Pin 0 or EP)
        if let Some(t_size) = thermal_pad_size_nm {
            pads.push(GeneratedPad {
                number: "EP".into(),
                x_nm: 0,
                y_nm: 0,
                width_nm: t_size,
                height_nm: t_size,
                is_thermal_pad: true,
            });
        }

        let crt = (body_size_nm / 2) + goals.courtyard_nm;
        Ok(GeneratedFootprint {
            name: name.to_string(),
            pads,
            courtyard_bbox_nm: (-crt, -crt, crt, crt),
            body_width_nm: body_size_nm,
            body_length_nm: body_size_nm,
            density,
        })
    }

    /// Exports generated footprint as KiCad 10 `.kicad_mod` S-expression
    pub fn export_kicad10_mod(fp: &GeneratedFootprint) -> String {
        let mut out = String::new();
        out.push_str(&format!("(footprint \"{}\"\n", fp.name));
        out.push_str("  (version 20240108)\n");
        out.push_str("  (generator \"vajra-dhir-footprint-synth\")\n");
        out.push_str("  (generator_version \"0.1.0\")\n");
        out.push_str("  (layer \"F.Cu\")\n");
        out.push_str(&format!("  (descr \"IPC-7351B generated footprint ({:?} density)\")\n", fp.density));
        out.push_str("  (tags \"IPC-7351B SMD\")\n");

        // Text properties
        out.push_str("  (property \"Reference\" \"REF**\" (at 0 -2.5 0) (layer \"F.SilkS\") (effects (font (size 1 1) (thickness 0.15))))\n");
        out.push_str(&format!(
            "  (property \"Value\" \"{}\" (at 0 2.5 0) (layer \"F.Fab\") (effects (font (size 1 1) (thickness 0.15))))\n",
            fp.name
        ));

        // Courtyard
        let (x1, y1, x2, y2) = fp.courtyard_bbox_nm;
        let x1_mm = x1 as f64 / 1_000_000.0;
        let y1_mm = y1 as f64 / 1_000_000.0;
        let x2_mm = x2 as f64 / 1_000_000.0;
        let y2_mm = y2 as f64 / 1_000_000.0;
        out.push_str(&format!(
            "  (fp_rect (start {:.3} {:.3}) (end {:.3} {:.3}) (stroke (width 0.05) (type default)) (fill none) (layer \"F.CrtYd\"))\n",
            x1_mm, y1_mm, x2_mm, y2_mm
        ));

        // Pin 1 Silk Indicator
        out.push_str("  (fp_circle (center -1.5 -1.5) (end -1.35 -1.5) (stroke (width 0.12) (type solid)) (fill solid) (layer \"F.SilkS\"))\n");

        // SMD Pads
        for pad in &fp.pads {
            let px = pad.x_nm as f64 / 1_000_000.0;
            let py = pad.y_nm as f64 / 1_000_000.0;
            let pw = pad.width_nm as f64 / 1_000_000.0;
            let ph = pad.height_nm as f64 / 1_000_000.0;

            if pad.is_thermal_pad {
                out.push_str(&format!(
                    "  (pad \"{}\" smd rect (at {:.3} {:.3}) (size {:.3} {:.3}) (layers \"F.Cu\" \"F.Paste\" \"F.Mask\"))\n",
                    pad.number, px, py, pw, ph
                ));
            } else {
                out.push_str(&format!(
                    "  (pad \"{}\" smd roundrect (at {:.3} {:.3}) (size {:.3} {:.3}) (layers \"F.Cu\" \"F.Paste\" \"F.Mask\") (roundrect_rratio 0.25))\n",
                    pad.number, px, py, pw, ph
                ));
            }
        }

        out.push_str(")\n");
        out
    }
}
