export type Nm = number; // Exact signed integer nanometers from HW-IR
export type UnitMode = "mm" | "mil" | "um";
export type ToolMode = "SELECT" | "ROUTE";

export interface ProjectMeta {
  id: string;
  name: string;
  dlp_class: "PUBLIC_OPEN" | "PRIVATE_CLOUD_OK" | "NDA_AIRGAPPED";
  autonomy_level: string;
  current_gate: string;
  target_fab_or_pdk: string;
  rev_lamport: number;
}

export interface BoardMeta {
  id: string;
  project_id: string;
  name: string;
  width_nm: Nm;
  height_nm: Nm;
  thickness_nm: Nm;
  layer_count: number;
}

export interface ComponentRecord {
  id: string;
  board_id: string;
  refdes: string;
  value_str: string;
  mpn: string;
  package_name: string;
  footprint_ref: string;
  functional_group: string;
  x_nm: Nm;
  y_nm: Nm;
  rot_mdeg: number;
  side: "top" | "bottom";
  courtyard_w_nm: Nm;
  courtyard_h_nm: Nm;
  power_diss_mw: number;
  unit_cost_usd: number;
  provenance: string;
  locked: boolean;
  lock_owner: string | null;
  lock_reason: string | null;
  rev_lamport: number;
}

export interface NetRecord {
  id: string;
  board_id: string;
  name: string;
  signal_role: string;
  nominal_voltage_v: number;
  is_high_speed: boolean;
}

export interface TraceRecord {
  id: string;
  board_id: string;
  net_id: string;
  layer_name: string;
  x1_nm: Nm;
  y1_nm: Nm;
  x2_nm: Nm;
  y2_nm: Nm;
  width_nm: Nm;
  provenance: string;
  locked: boolean;
  rev_lamport: number;
}

export interface ViaRecord {
  id: string;
  board_id: string;
  net_id: string;
  x_nm: Nm;
  y_nm: Nm;
  drill_nm: Nm;
  diameter_nm: Nm;
  start_layer: string;
  end_layer: string;
  via_kind: string;
  provenance: string;
  locked: boolean;
  rev_lamport: number;
}

export interface PatchLogEntry {
  seq_id: number;
  patch_id: string;
  actor_kind: string;
  actor_id: string;
  lamport_ts: number;
  summary: string;
  undone: boolean;
  applied_at_utc: string;
}

export type HardwarePatchOp =
  | { op: "MOVE_COMPONENT"; component_id: string; x_nm: Nm; y_nm: Nm; rot_mdeg?: number; side?: string }
  | { op: "SET_LOCK"; entity_type: string; entity_id: string; locked: boolean; reason?: string | null }
  | { op: "ADD_TRACE"; trace: TraceRecord }
  | { op: "ADD_VIA"; via: ViaRecord };

export interface BoardSnapshot {
  project: ProjectMeta;
  board: BoardMeta;
  components: ComponentRecord[];
  nets: NetRecord[];
  traces: TraceRecord[];
  vias: ViaRecord[];
  patches: PatchLogEntry[];
  total_bom_usd: number;
}

export interface RoutePreviewRes {
  points_nm: Array<[Nm, Nm]>;
  length_mm: number;
  delay_ps: number;
  drc_hits: Array<{ obstacle_id: string; clearance_actual_nm: Nm; clearance_required_nm: Nm }>;
  fab_surcharge_alert: string | null;
}

export interface VerificationItem {
  code: string;
  severity: string;
  passed: boolean;
  entity_ids: string[];
  message: string;
  remediation: string;
}

export interface VerifyReport {
  passed: boolean;
  error_count: number;
  warning_count: number;
  smps_duty_cycle: number;
  smps_l_min_uh: number;
  smps_delta_il_a: number;
  smps_i_sat_req_a: number;
  smps_ripple_mvpp: number;
  ipc2152_min_trace_mm: number;
  checks: VerificationItem[];
}
