use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub type EntityId = String; // UUIDv7
pub type Nm = i64;          // Signed integer nanometers
pub type Mdeg = i32;        // Millidegrees [0, 360000)

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Provenance {
    Human,
    Agent,
    Cubo,
    Import,
    Compiler,
}

impl std::fmt::Display for Provenance {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Provenance::Human => write!(f, "human"),
            Provenance::Agent => write!(f, "agent"),
            Provenance::Cubo => write!(f, "cubo"),
            Provenance::Import => write!(f, "import"),
            Provenance::Compiler => write!(f, "compiler"),
        }
    }
}

impl std::str::FromStr for Provenance {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "human" => Ok(Provenance::Human),
            "agent" => Ok(Provenance::Agent),
            "cubo" => Ok(Provenance::Cubo),
            "import" => Ok(Provenance::Import),
            "compiler" => Ok(Provenance::Compiler),
            _ => Err(format!("Unknown provenance: {}", s)),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LockGuard {
    pub locked: bool,
    pub provenance: Provenance,
    pub lock_owner: Option<String>,
    pub lock_reason: Option<String>,
}

impl LockGuard {
    pub fn can_mutate(&self, actor: Provenance, explicit_human_override: bool) -> Result<(), LockViolation> {
        if !self.locked || actor == Provenance::Human || explicit_human_override {
            Ok(())
        } else {
            Err(LockViolation {
                locked_by: self.lock_owner.clone().unwrap_or_else(|| "human".into()),
                attempted_by: actor,
                reason: self.lock_reason.clone(),
            })
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LockViolation {
    pub locked_by: String,
    pub attempted_by: Provenance,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HardwareEntityMeta {
    pub id: EntityId,
    pub board_id: EntityId,
    pub lock: LockGuard,
    pub rev_lamport: u64,
    pub deleted: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "entity_type", rename_all = "snake_case")]
pub enum HardwareEntity {
    Component {
        meta: HardwareEntityMeta,
        refdes: String,
        value_str: String,
        mpn: Option<String>,
        package_name: String,
        footprint_ref: String,
        symbol_ref: String,
        functional_group: String,
        x_nm: Nm,
        y_nm: Nm,
        rot_mdeg: Mdeg,
        side: String,
        courtyard_w_nm: Nm,
        courtyard_h_nm: Nm,
        height_nm: Nm,
        power_diss_mw: f64,
        params: BTreeMap<String, serde_json::Value>,
        datasheet_citation_id: Option<EntityId>,
    },
    Net {
        meta: HardwareEntityMeta,
        name: String,
        net_class_id: EntityId,
        signal_role: String,
        nominal_voltage_v: Option<f64>,
        diff_pair_mate_id: Option<EntityId>,
    },
    Trace {
        meta: HardwareEntityMeta,
        net_id: EntityId,
        layer_name: String,
        x1_nm: Nm,
        y1_nm: Nm,
        x2_nm: Nm,
        y2_nm: Nm,
        width_nm: Nm,
        arc_mid: Option<(Nm, Nm)>,
    },
    Via {
        meta: HardwareEntityMeta,
        net_id: EntityId,
        x_nm: Nm,
        y_nm: Nm,
        drill_nm: Nm,
        diameter_nm: Nm,
        start_layer: String,
        end_layer: String,
        via_kind: String,
    },
    CopperZone {
        meta: HardwareEntityMeta,
        net_id: Option<EntityId>,
        layer_name: String,
        zone_kind: String,
        polygon_nm: Vec<(Nm, Nm)>,
        priority: i32,
        clearance_nm: Nm,
        thermal_relief: bool,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ElectricalConstraint {
    pub id: EntityId,
    pub project_id: EntityId,
    pub requirement_uid: Option<String>,
    pub constraint_kind: String,
    pub target_entity_id: EntityId,
    pub expression: serde_json::Value,
    pub severity: String,
    pub lock: LockGuard,
    pub rev_lamport: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum HardwarePatchOp {
    UpsertEntity {
        entity: HardwareEntity,
    },
    MoveComponent {
        component_id: EntityId,
        x_nm: Nm,
        y_nm: Nm,
        rot_mdeg: Mdeg,
        side: String,
    },
    DeleteEntity {
        entity_type: String,
        entity_id: EntityId,
    },
    BindPinNet {
        pin_id: EntityId,
        net_id: Option<EntityId>,
    },
    SwapPins {
        pin_a_id: EntityId,
        pin_b_id: EntityId,
        sync_firmware: bool,
    },
    SetLock {
        entity_type: String,
        entity_id: EntityId,
        locked: bool,
        reason: Option<String>,
    },
    UpsertConstraint {
        constraint: ElectricalConstraint,
    },
    SyncFirmwarePin {
        mcu_component_id: EntityId,
        pin_id: EntityId,
        peripheral_instance: String,
        signal_alias: String,
        gpio_mode: String,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HardwarePatch {
    pub patch_id: EntityId,
    pub project_id: EntityId,
    pub actor_kind: Provenance,
    pub actor_id: String,
    pub lamport_ts: u64,
    pub forward_ops: Vec<HardwarePatchOp>,
    pub inverse_ops: Vec<HardwarePatchOp>,
    pub otel_trace_id: Option<String>,
}
