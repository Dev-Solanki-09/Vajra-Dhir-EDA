/**
 * Vajra-Dhīr EDA — HW-IR Canonical TypeScript Definitions
 * 
 * Invariants:
 *  - EntityId: UUIDv7 string
 *  - Nm: Signed integer nanometers (1 mm = 1,000,000 nm)
 *  - Mdeg: Millidegrees [0, 360000)
 */

export type EntityId = string;
export type Nm = number;
export type Mdeg = number;

export type Provenance = 'human' | 'agent' | 'cubo' | 'import' | 'compiler';

export interface LockGuard {
  locked: boolean;
  provenance: Provenance;
  lock_owner?: string;
  lock_reason?: string;
}

export interface HardwareEntityMeta {
  id: EntityId;
  board_id: EntityId;
  lock: LockGuard;
  rev_lamport: number;
  deleted: boolean;
}

export interface ComponentEntity {
  entity_type: 'component';
  meta: HardwareEntityMeta;
  refdes: string;
  value_str: string;
  mpn?: string;
  package_name: string;
  footprint_ref: string;
  symbol_ref: string;
  functional_group: string;
  x_nm: Nm;
  y_nm: Nm;
  rot_mdeg: Mdeg;
  side: 'top' | 'bottom';
  courtyard_w_nm: Nm;
  courtyard_h_nm: Nm;
  height_nm: Nm;
  power_diss_mw: number;
  params: Record<string, unknown>;
  datasheet_citation_id?: EntityId;
}

export interface NetEntity {
  entity_type: 'net';
  meta: HardwareEntityMeta;
  name: string;
  net_class_id: EntityId;
  signal_role: string;
  nominal_voltage_v?: number;
  diff_pair_mate_id?: EntityId;
}

export interface TraceEntity {
  entity_type: 'trace';
  meta: HardwareEntityMeta;
  net_id: EntityId;
  layer_name: string;
  x1_nm: Nm;
  y1_nm: Nm;
  x2_nm: Nm;
  y2_nm: Nm;
  width_nm: Nm;
  arc_mid?: [Nm, Nm];
}

export interface ViaEntity {
  entity_type: 'via';
  meta: HardwareEntityMeta;
  net_id: EntityId;
  x_nm: Nm;
  y_nm: Nm;
  drill_nm: Nm;
  diameter_nm: Nm;
  start_layer: string;
  end_layer: string;
  via_kind: 'through' | 'blind' | 'buried' | 'microvia' | 'thermal' | 'stitch_gnd' | 'backdrill';
}

export interface CopperZoneEntity {
  entity_type: 'copper_zone';
  meta: HardwareEntityMeta;
  net_id?: EntityId;
  layer_name: string;
  zone_kind: 'pour' | 'keepout_copper' | 'keepout_via' | 'keepout_comp' | 'antenna_keepout' | 'smps_hotloop' | 'flex_bend';
  polygon_nm: Array<[Nm, Nm]>;
  priority: number;
  clearance_nm: Nm;
  thermal_relief: boolean;
}

export type HardwareEntity =
  | ComponentEntity
  | NetEntity
  | TraceEntity
  | ViaEntity
  | CopperZoneEntity;

export interface ElectricalConstraint {
  id: EntityId;
  project_id: EntityId;
  requirement_uid?: string;
  constraint_kind: string;
  target_entity_id: EntityId;
  expression: unknown;
  severity: 'error' | 'warning';
  lock: LockGuard;
  rev_lamport: number;
}

export type HardwarePatchOp =
  | { op: 'UPSERT_ENTITY'; entity: HardwareEntity }
  | { op: 'MOVE_COMPONENT'; component_id: EntityId; x_nm: Nm; y_nm: Nm; rot_mdeg: Mdeg; side: 'top' | 'bottom' }
  | { op: 'DELETE_ENTITY'; entity_type: string; entity_id: EntityId }
  | { op: 'BIND_PIN_NET'; pin_id: EntityId; net_id?: EntityId }
  | { op: 'SWAP_PINS'; pin_a_id: EntityId; pin_b_id: EntityId; sync_firmware: boolean }
  | { op: 'SET_LOCK'; entity_type: string; entity_id: EntityId; locked: boolean; reason?: string }
  | { op: 'UPSERT_CONSTRAINT'; constraint: ElectricalConstraint }
  | { op: 'SYNC_FIRMWARE_PIN'; mcu_component_id: EntityId; pin_id: EntityId; peripheral_instance: string; signal_alias: string; gpio_mode: string };

export interface HardwarePatch {
  patch_id: EntityId;
  project_id: EntityId;
  actor_kind: Provenance;
  actor_id: string;
  lamport_ts: number;
  forward_ops: HardwarePatchOp[];
  inverse_ops: HardwarePatchOp[];
  otel_trace_id?: string;
}
