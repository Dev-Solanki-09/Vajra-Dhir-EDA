//! Optional Clean-Room MIT SKiDL / KiCad Netlist S-Expression Importer (`vd-transcoder`).

use crate::sexpr::SExpr;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkidlComponent {
    pub refdes: String,
    pub value: String,
    pub footprint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkidlNet {
    pub name: String,
    pub nodes: Vec<(String, String)>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkidlImportedNetlist {
    pub source_tool: String,
    pub components: Vec<SkidlComponent>,
    pub nets: Vec<SkidlNet>,
}

pub fn parse_skidl_sexpr_netlist(input: &str) -> Result<SkidlImportedNetlist, String> {
    let expr = SExpr::parse(input).map_err(|e| format!("SKiDL S-expr parse error: {e:?}"))?;
    let mut components = Vec::new();
    let mut nets = Vec::new();

    if let Some(comp_list) = expr.find_child("components") {
        for c in comp_list.find_children("comp") {
            let refdes = c.get_attr("ref").unwrap_or("U?").to_string();
            let value = c.get_attr("value").unwrap_or("UNSPEC").to_string();
            let footprint = c.get_attr("footprint").unwrap_or("SMD").to_string();
            components.push(SkidlComponent { refdes, value, footprint });
        }
    }
    if let Some(net_list) = expr.find_child("nets") {
        for n in net_list.find_children("net") {
            let name = n.get_attr("name").unwrap_or("UNCONNECTED").to_string();
            let mut nodes = Vec::new();
            for node in n.find_children("node") {
                let r = node.get_attr("ref").unwrap_or("").to_string();
                let p = node.get_attr("pin").unwrap_or("").to_string();
                nodes.push((r, p));
            }
            nets.push(SkidlNet { name, nodes });
        }
    }

    Ok(SkidlImportedNetlist {
        source_tool: "skidl-netlist-mit".to_string(),
        components,
        nets,
    })
}
