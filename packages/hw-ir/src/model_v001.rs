use serde::{Deserialize, Serialize};

pub type EntityId = String; // Immutable UUIDv7
pub type Nm = i64;          // Signed integer nanometers (1 mm = 1_000_000 nm)
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

impl Provenance {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Human => "human",
            Self::Agent => "agent",
            Self::Cubo => "cubo",
            Self::Import => "import",
            Self::Compiler => "compiler",
        }
    }

    pub fn from_db(s: &str) -> Self {
        match s {
            "human" => Self::Human,
            "agent" => Self::Agent,
            "cubo" => Self::Cubo,
            "import" => Self::Import,
            _ => Self::Compiler,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectMeta {
    pub id: EntityId,
    pub name: String,
    pub domain: String,
    pub dlp_class: String,
    pub autonomy_level: String,
    pub current_gate: String,
    pub target_fab_or_pdk: String,
    pub max_bom_cost_usd: f64,
    pub ambient_temp_max_c: f64,
    pub rev_lamport: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoardMeta {
    pub id: EntityId,
    pub project_id: EntityId,
    pub name: String,
    pub width_nm: Nm,
    pub height_nm: Nm,
    pub thickness_nm: Nm,
    pub layer_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComponentRecord {
    pub id: EntityId,
    pub board_id: EntityId,
    pub refdes: String,
    pub value_str: String,
    pub mpn: String,
    pub package_name: String,
    pub footprint_ref: String,
    pub functional_group: String,
    pub x_nm: Nm,
    pub y_nm: Nm,
    pub rot_mdeg: Mdeg,
    pub side: String,
    pub courtyard_w_nm: Nm,
    pub courtyard_h_nm: Nm,
    pub power_diss_mw: f64,
    pub unit_cost_usd: f64,
    pub params_json: String,
    pub provenance: Provenance,
    pub locked: bool,
    pub lock_owner: Option<String>,
    pub lock_reason: Option<String>,
    pub rev_lamport: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetRecord {
    pub id: EntityId,
    pub board_id: EntityId,
    pub name: String,
    pub net_class_id: EntityId,
    pub signal_role: String,
    pub nominal_voltage_v: f64,
    pub is_high_speed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraceRecord {
    pub id: EntityId,
    pub board_id: EntityId,
    pub net_id: EntityId,
    pub layer_name: String,
    pub x1_nm: Nm,
    pub y1_nm: Nm,
    pub x2_nm: Nm,
    pub y2_nm: Nm,
    pub width_nm: Nm,
    pub provenance: Provenance,
    pub locked: bool,
    pub rev_lamport: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViaRecord {
    pub id: EntityId,
    pub board_id: EntityId,
    pub net_id: EntityId,
    pub x_nm: Nm,
    pub y_nm: Nm,
    pub drill_nm: Nm,
    pub diameter_nm: Nm,
    pub start_layer: String,
    pub end_layer: String,
    pub via_kind: String,
    pub provenance: Provenance,
    pub locked: bool,
    pub rev_lamport: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PinmuxRecord {
    pub id: EntityId,
    pub mcu_refdes: String,
    pub pin_number: String,
    pub peripheral_instance: String,
    pub signal_alias: String,
    pub gpio_mode: String,
    pub locked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatchLogEntry {
    pub seq_id: i64,
    pub patch_id: EntityId,
    pub actor_kind: Provenance,
    pub actor_id: String,
    pub lamport_ts: i64,
    pub summary: String,
    pub undone: bool,
    pub applied_at_utc: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoardSnapshot {
    pub project: ProjectMeta,
    pub board: BoardMeta,
    pub components: Vec<ComponentRecord>,
    pub nets: Vec<NetRecord>,
    pub traces: Vec<TraceRecord>,
    pub vias: Vec<ViaRecord>,
    pub pinmux: Vec<PinmuxRecord>,
    pub patches: Vec<PatchLogEntry>,
    pub total_bom_usd: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum HardwarePatchOp {
    MoveComponent {
        component_id: EntityId,
        x_nm: Nm,
        y_nm: Nm,
        rot_mdeg: Mdeg,
        side: String,
    },
    SetLock {
        entity_type: String,
        entity_id: EntityId,
        locked: bool,
        reason: Option<String>,
    },
    AddTrace {
        trace: TraceRecord,
    },
    SoftDeleteTrace {
        trace_id: EntityId,
    },
    RestoreTrace {
        trace_id: EntityId,
    },
    AddVia {
        via: ViaRecord,
    },
    SoftDeleteVia {
        via_id: EntityId,
    },
    RestoreVia {
        via_id: EntityId,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatchRequest {
    pub expected_lamport: Option<i64>,
    pub actor_kind: Provenance,
    pub actor_id: String,
    pub summary: String,
    pub ops: Vec<HardwarePatchOp>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatchResponse {
    pub applied: bool,
    pub patch_id: EntityId,
    pub new_lamport: i64,
    pub error_code: Option<String>,
    pub message: String,
}
