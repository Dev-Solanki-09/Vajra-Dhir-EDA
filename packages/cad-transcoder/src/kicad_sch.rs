use crate::sexpr::SExpr;
use std::collections::BTreeMap;
use vd_ir::model::*;

#[derive(Debug, Clone)]
pub struct KiCadSchComponent {
    pub refdes: String,
    pub value: String,
    pub footprint: String,
    pub lib_id: String,
    pub x_mils: f64,
    pub y_mils: f64,
    pub rot_deg: f64,
}

pub struct KiCadSchTranscoder;

impl KiCadSchTranscoder {
    /// Extract component declarations from a .kicad_sch S-Expression tree.
    pub fn extract_components(sch_ast: &[SExpr]) -> Vec<KiCadSchComponent> {
        let mut components = Vec::new();

        for root in sch_ast {
            if let SExpr::List(root_items) = root {
                for item in root_items {
                    if let SExpr::List(sym_items) = item
                        && sym_items.first().and_then(|t| match t {
                            SExpr::Atom(s) => Some(s.as_str()),
                            _ => None,
                        }) == Some("symbol")
                        && let Some(comp) = parse_symbol_block(sym_items)
                    {
                        components.push(comp);
                    }
                }
            }
        }

        components
    }

    /// Convert a KiCadSchComponent into a canonical HW-IR Component entity.
    pub fn to_hw_ir(
        comp: &KiCadSchComponent,
        board_id: &str,
    ) -> HardwareEntity {
        // KiCad schematic coordinates in mils to nanometers: 1 mil = 25,400 nm
        let x_nm = (comp.x_mils * 25_400.0).round() as Nm;
        let y_nm = (comp.y_mils * 25_400.0).round() as Nm;
        let rot_mdeg = ((comp.rot_deg * 1000.0) as Mdeg).rem_euclid(360000);

        HardwareEntity::Component {
            meta: HardwareEntityMeta {
                id: uuid::Uuid::now_v7().to_string(),
                board_id: board_id.to_string(),
                lock: LockGuard {
                    locked: false,
                    provenance: Provenance::Import,
                    lock_owner: None,
                    lock_reason: None,
                },
                rev_lamport: 1,
                deleted: false,
            },
            refdes: comp.refdes.clone(),
            value_str: comp.value.clone(),
            mpn: None,
            package_name: comp.footprint.clone(),
            footprint_ref: comp.footprint.clone(),
            symbol_ref: comp.lib_id.clone(),
            functional_group: "schematic_import".into(),
            x_nm,
            y_nm,
            rot_mdeg,
            side: "top".into(),
            courtyard_w_nm: 2_000_000,
            courtyard_h_nm: 2_000_000,
            height_nm: 1_000_000,
            power_diss_mw: 0.0,
            params: BTreeMap::new(),
            datasheet_citation_id: None,
        }
    }
}

fn parse_symbol_block(items: &[SExpr]) -> Option<KiCadSchComponent> {
    let mut lib_id = String::new();
    let mut refdes = String::new();
    let mut value = String::new();
    let mut footprint = String::new();
    let mut x_mils = 0.0;
    let mut y_mils = 0.0;
    let mut rot_deg = 0.0;

    for item in items {
        if let SExpr::List(prop_items) = item
            && let Some(tag) = prop_items.first().and_then(|t| match t {
                SExpr::Atom(s) => Some(s.as_str()),
                _ => None,
            })
        {
            match tag {
                "lib_id" if prop_items.len() >= 2 => {
                    if let SExpr::StringLit(ref s) | SExpr::Atom(ref s) = prop_items[1] {
                        lib_id = s.clone();
                    }
                }
                "at" if prop_items.len() >= 3 => {
                    if let SExpr::Atom(ref x_str) = prop_items[1] {
                        x_mils = x_str.parse().unwrap_or(0.0);
                    }
                    if let SExpr::Atom(ref y_str) = prop_items[2] {
                        y_mils = y_str.parse().unwrap_or(0.0);
                    }
                    if prop_items.len() >= 4
                        && let SExpr::Atom(ref r_str) = prop_items[3]
                    {
                        rot_deg = r_str.parse().unwrap_or(0.0);
                    }
                }
                "property" if prop_items.len() >= 3 => {
                    let prop_name = match &prop_items[1] {
                        SExpr::StringLit(s) | SExpr::Atom(s) => s.as_str(),
                        _ => "",
                    };
                    let prop_val = match &prop_items[2] {
                        SExpr::StringLit(s) | SExpr::Atom(s) => s.clone(),
                        _ => String::new(),
                    };

                    match prop_name {
                        "Reference" => refdes = prop_val,
                        "Value" => value = prop_val,
                        "Footprint" => footprint = prop_val,
                        _ => {}
                    }
                }
                _ => {}
            }
        }
    }

    if !refdes.is_empty() {
        Some(KiCadSchComponent {
            refdes,
            value,
            footprint,
            lib_id,
            x_mils,
            y_mils,
            rot_deg,
        })
    } else {
        None
    }
}
