use axum::{
    extract::State,
    http::{HeaderValue, Method, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    net::SocketAddr,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tower_http::cors::CorsLayer;
use vd_cad_geom::{GeomKind, InteractiveSpatialKernel, LiveDrcHit, SnapResult, SpatialItem};
use vd_hw_ir::{
    model::{self, HardwareEntity, HardwareEntityMeta, HardwarePatch, LockGuard},
    model_v001::{
        BoardMeta, BoardSnapshot, ComponentRecord, HardwarePatchOp, NetRecord, Nm, PatchLogEntry,
        PatchRequest, PatchResponse, PinmuxRecord, ProjectMeta, Provenance, TraceRecord, ViaRecord,
    },
    store::{HwIrError, HwIrStore},
};

const DEFAULT_PROJECT_ID: &str = "VD-BRD-001";
const DEFAULT_BOARD_ID: &str = "board-main";

fn to_core_prov(p: Provenance) -> model::Provenance {
    match p {
        Provenance::Human => model::Provenance::Human,
        Provenance::Agent => model::Provenance::Agent,
        Provenance::Cubo => model::Provenance::Cubo,
        Provenance::Import => model::Provenance::Import,
        Provenance::Compiler => model::Provenance::Compiler,
    }
}

fn seed_reference_board_if_empty(store: &mut HwIrStore) -> Result<(), HwIrError> {
    let count: i64 = store
        .connection()
        .query_row("SELECT COUNT(*) FROM projects", [], |r| r.get(0))?;
    if count > 0 {
        return Ok(());
    }
    store.with_actor_transaction(model::Provenance::Human, true, |tx| {
        tx.execute(
            "INSERT INTO projects (id, name, domain, dlp_class, autonomy_level, current_gate, target_fab_or_pdk, max_bom_cost_usd, ambient_temp_min_c, ambient_temp_max_c, spec_contract_json, rev_lamport, created_at_utc, updated_at_utc)
             VALUES (?1, 'Golden Buck MCU', 'pcb', 'PRIVATE_CLOUD_OK', 'L3_GATE_COPILOT', 'G2_SCHEMA', 'jlcpcb_4l_7628', 15.0, 0.0, 70.0, '{}', 1, '2026-11-26T00:00:00Z', '2026-11-26T00:00:00Z')",
            rusqlite::params![DEFAULT_PROJECT_ID],
        )?;
        tx.execute(
            "INSERT INTO boards (id, project_id, name, board_kind, outline_polygon_nm, thickness_nm, layer_count, provenance, locked, rev_lamport, deleted)
             VALUES (?1, ?2, 'main_pcb', 'rigid_pcb', '[[0,0],[60000000,0],[60000000,40000000],[0,40000000]]', 1600000, 4, 'human', 0, 1, 0)",
            rusqlite::params![DEFAULT_BOARD_ID, DEFAULT_PROJECT_ID],
        )?;
        tx.execute(
            "INSERT INTO net_classes (id, board_id, name, trace_width_nm, min_width_nm, clearance_nm, via_drill_nm, via_diameter_nm, provenance, locked, rev_lamport)
             VALUES ('nc-default', ?1, 'Default', 250000, 150000, 200000, 300000, 600000, 'human', 0, 1)",
            rusqlite::params![DEFAULT_BOARD_ID],
        )?;
        tx.execute(
            "INSERT INTO nets (id, board_id, name, net_class_id, signal_role, nominal_voltage_v, is_high_speed, provenance, locked, rev_lamport, deleted)
             VALUES ('net-3v3', ?1, '+3V3', 'nc-default', 'power_rail', 3.3, 0, 'human', 0, 1, 0)",
            rusqlite::params![DEFAULT_BOARD_ID],
        )?;
        tx.execute(
            "INSERT INTO components (id, board_id, refdes, value_str, mpn, package_name, footprint_ref, symbol_ref, functional_group, x_nm, y_nm, rot_mdeg, side, courtyard_w_nm, courtyard_h_nm, height_nm, power_diss_mw, unit_cost_usd, params_json, provenance, locked, rev_lamport, deleted)
             VALUES ('comp-u2', ?1, 'U2', 'TPS54302', 'TPS54302DDCR', 'SOT-23-6', 'Package_TO_SOT_SMD:SOT-23-6', 'Regulator_Switching:TPS54302', 'power', 22000000, 20000000, 0, 'top', 3600000, 3200000, 1600000, 250.0, 1.1, '{}', 'human', 1, 1, 0)",
            rusqlite::params![DEFAULT_BOARD_ID],
        )?;
        tx.execute(
            "INSERT INTO components (id, board_id, refdes, value_str, mpn, package_name, footprint_ref, symbol_ref, functional_group, x_nm, y_nm, rot_mdeg, side, courtyard_w_nm, courtyard_h_nm, height_nm, power_diss_mw, unit_cost_usd, params_json, provenance, locked, rev_lamport, deleted)
             VALUES ('comp-j1', ?1, 'J1', 'USB_C', 'CH224K', 'USB-C-16P', 'Connector_USB:USB_C_Receptacle', 'Connector:USB_C', 'usb_pd', 8000000, 20000000, 0, 'top', 9000000, 7500000, 3200000, 50.0, 0.85, '{}', 'human', 1, 1, 0)",
            rusqlite::params![DEFAULT_BOARD_ID],
        )?;
        Ok(())
    })
}

fn load_snapshot(store: &HwIrStore) -> Result<BoardSnapshot, HwIrError> {
    let conn = store.connection();
    let project = conn.query_row(
        "SELECT id, name, domain, dlp_class, autonomy_level, current_gate, target_fab_or_pdk, COALESCE(max_bom_cost_usd, 0.0), ambient_temp_max_c, rev_lamport FROM projects LIMIT 1",
        [],
        |r| {
            Ok(ProjectMeta {
                id: r.get(0)?,
                name: r.get(1)?,
                domain: r.get(2)?,
                dlp_class: r.get(3)?,
                autonomy_level: r.get(4)?,
                current_gate: r.get(5)?,
                target_fab_or_pdk: r.get(6)?,
                max_bom_cost_usd: r.get(7)?,
                ambient_temp_max_c: r.get(8)?,
                rev_lamport: r.get(9)?,
            })
        },
    )?;

    let board = conn.query_row(
        "SELECT id, project_id, name, thickness_nm, layer_count FROM boards WHERE project_id = ?1 AND deleted = 0 LIMIT 1",
        rusqlite::params![&project.id],
        |r| {
            Ok(BoardMeta {
                id: r.get(0)?,
                project_id: r.get(1)?,
                name: r.get(2)?,
                width_nm: 60_000_000,
                height_nm: 40_000_000,
                thickness_nm: r.get(3)?,
                layer_count: r.get(4)?,
            })
        },
    )?;

    let mut comp_stmt = conn.prepare(
        "SELECT id, board_id, refdes, value_str, COALESCE(mpn, ''), package_name, footprint_ref, functional_group, x_nm, y_nm, rot_mdeg, side, courtyard_w_nm, courtyard_h_nm, power_diss_mw, COALESCE(unit_cost_usd, 0.0), params_json, provenance, locked, lock_owner, lock_reason, rev_lamport FROM components WHERE board_id = ?1 AND deleted = 0",
    )?;
    let components = comp_stmt
        .query_map(rusqlite::params![&board.id], |r| {
            let prov_s: String = r.get(17)?;
            Ok(ComponentRecord {
                id: r.get(0)?,
                board_id: r.get(1)?,
                refdes: r.get(2)?,
                value_str: r.get(3)?,
                mpn: r.get(4)?,
                package_name: r.get(5)?,
                footprint_ref: r.get(6)?,
                functional_group: r.get(7)?,
                x_nm: r.get(8)?,
                y_nm: r.get(9)?,
                rot_mdeg: r.get(10)?,
                side: r.get(11)?,
                courtyard_w_nm: r.get(12)?,
                courtyard_h_nm: r.get(13)?,
                power_diss_mw: r.get(14)?,
                unit_cost_usd: r.get(15)?,
                params_json: r.get(16)?,
                provenance: Provenance::from_db(&prov_s),
                locked: r.get::<_, i64>(18)? != 0,
                lock_owner: r.get(19)?,
                lock_reason: r.get(20)?,
                rev_lamport: r.get(21)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut net_stmt = conn.prepare(
        "SELECT id, board_id, name, net_class_id, signal_role, COALESCE(nominal_voltage_v, 0.0), is_high_speed FROM nets WHERE board_id = ?1 AND deleted = 0",
    )?;
    let nets = net_stmt
        .query_map(rusqlite::params![&board.id], |r| {
            Ok(NetRecord {
                id: r.get(0)?,
                board_id: r.get(1)?,
                name: r.get(2)?,
                net_class_id: r.get(3)?,
                signal_role: r.get(4)?,
                nominal_voltage_v: r.get(5)?,
                is_high_speed: r.get::<_, i64>(6)? != 0,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut trace_stmt = conn.prepare(
        "SELECT id, board_id, net_id, layer_name, x1_nm, y1_nm, x2_nm, y2_nm, width_nm, provenance, locked, rev_lamport FROM traces WHERE board_id = ?1 AND deleted = 0",
    )?;
    let traces = trace_stmt
        .query_map(rusqlite::params![&board.id], |r| {
            let prov_s: String = r.get(9)?;
            Ok(TraceRecord {
                id: r.get(0)?,
                board_id: r.get(1)?,
                net_id: r.get(2)?,
                layer_name: r.get(3)?,
                x1_nm: r.get(4)?,
                y1_nm: r.get(5)?,
                x2_nm: r.get(6)?,
                y2_nm: r.get(7)?,
                width_nm: r.get(8)?,
                provenance: Provenance::from_db(&prov_s),
                locked: r.get::<_, i64>(10)? != 0,
                rev_lamport: r.get(11)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut via_stmt = conn.prepare(
        "SELECT id, board_id, net_id, x_nm, y_nm, drill_nm, diameter_nm, start_layer, end_layer, via_kind, provenance, locked, rev_lamport FROM vias WHERE board_id = ?1 AND deleted = 0",
    )?;
    let vias = via_stmt
        .query_map(rusqlite::params![&board.id], |r| {
            let prov_s: String = r.get(10)?;
            Ok(ViaRecord {
                id: r.get(0)?,
                board_id: r.get(1)?,
                net_id: r.get(2)?,
                x_nm: r.get(3)?,
                y_nm: r.get(4)?,
                drill_nm: r.get(5)?,
                diameter_nm: r.get(6)?,
                start_layer: r.get(7)?,
                end_layer: r.get(8)?,
                via_kind: r.get(9)?,
                provenance: Provenance::from_db(&prov_s),
                locked: r.get::<_, i64>(11)? != 0,
                rev_lamport: r.get(12)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut pin_stmt = conn.prepare(
        "SELECT fp.id, c.refdes, cp.pin_number, fp.peripheral_instance, fp.signal_alias, fp.gpio_mode, fp.locked
         FROM firmware_pinmux fp
         JOIN components c ON c.id = fp.mcu_component_id
         JOIN component_pins cp ON cp.id = fp.pin_id
         WHERE fp.board_id = ?1",
    )?;
    let pinmux = pin_stmt
        .query_map(rusqlite::params![&board.id], |r| {
            Ok(PinmuxRecord {
                id: r.get(0)?,
                mcu_refdes: r.get(1)?,
                pin_number: r.get(2)?,
                peripheral_instance: r.get(3)?,
                signal_alias: r.get(4)?,
                gpio_mode: r.get(5)?,
                locked: r.get::<_, i64>(6)? != 0,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut patch_stmt = conn.prepare(
        "SELECT seq_id, patch_id, actor_kind, actor_id, lamport_ts, undone, applied_at_utc FROM hardware_patches WHERE project_id = ?1 ORDER BY seq_id DESC LIMIT 50",
    )?;
    let patches = patch_stmt
        .query_map(rusqlite::params![&project.id], |r| {
            let actor_s: String = r.get(2)?;
            Ok(PatchLogEntry {
                seq_id: r.get(0)?,
                patch_id: r.get(1)?,
                actor_kind: Provenance::from_db(&actor_s),
                actor_id: r.get(3)?,
                lamport_ts: r.get(4)?,
                summary: String::new(),
                undone: r.get::<_, i64>(5)? != 0,
                applied_at_utc: r.get(6)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let total_bom_usd = components.iter().map(|c| c.unit_cost_usd).sum();
    Ok(BoardSnapshot {
        project,
        board,
        components,
        nets,
        traces,
        vias,
        pinmux,
        patches,
        total_bom_usd,
    })
}

fn apply_patch_req(store: &mut HwIrStore, req: &PatchRequest) -> Result<PatchResponse, HwIrError> {
    let snap = load_snapshot(store)?;
    let new_lamport = (snap.project.rev_lamport + 1).max(1);
    let patch_id = uuid::Uuid::now_v7().to_string();
    let core_actor = to_core_prov(req.actor_kind);

    let mut core_ops = Vec::with_capacity(req.ops.len());
    for op in &req.ops {
        match op {
            HardwarePatchOp::MoveComponent {
                component_id,
                x_nm,
                y_nm,
                rot_mdeg,
                side,
            } => core_ops.push(model::HardwarePatchOp::MoveComponent {
                component_id: component_id.clone(),
                x_nm: *x_nm,
                y_nm: *y_nm,
                rot_mdeg: *rot_mdeg,
                side: side.clone(),
            }),
            HardwarePatchOp::SetLock {
                entity_type,
                entity_id,
                locked,
                reason,
            } => core_ops.push(model::HardwarePatchOp::SetLock {
                entity_type: entity_type.clone(),
                entity_id: entity_id.clone(),
                locked: *locked,
                reason: reason.clone(),
            }),
            HardwarePatchOp::AddTrace { trace } => {
                core_ops.push(model::HardwarePatchOp::UpsertEntity {
                    entity: HardwareEntity::Trace {
                        meta: HardwareEntityMeta {
                            id: trace.id.clone(),
                            board_id: trace.board_id.clone(),
                            lock: LockGuard {
                                locked: trace.locked,
                                provenance: to_core_prov(trace.provenance),
                                lock_owner: None,
                                lock_reason: None,
                            },
                            rev_lamport: new_lamport as u64,
                            deleted: false,
                        },
                        net_id: trace.net_id.clone(),
                        layer_name: trace.layer_name.clone(),
                        x1_nm: trace.x1_nm,
                        y1_nm: trace.y1_nm,
                        x2_nm: trace.x2_nm,
                        y2_nm: trace.y2_nm,
                        width_nm: trace.width_nm,
                        arc_mid: None,
                    },
                })
            }
            HardwarePatchOp::SoftDeleteTrace { trace_id } => {
                core_ops.push(model::HardwarePatchOp::DeleteEntity {
                    entity_type: "trace".into(),
                    entity_id: trace_id.clone(),
                })
            }
            HardwarePatchOp::AddVia { via } => core_ops.push(model::HardwarePatchOp::UpsertEntity {
                entity: HardwareEntity::Via {
                    meta: HardwareEntityMeta {
                        id: via.id.clone(),
                        board_id: via.board_id.clone(),
                        lock: LockGuard {
                            locked: via.locked,
                            provenance: to_core_prov(via.provenance),
                            lock_owner: None,
                            lock_reason: None,
                        },
                        rev_lamport: new_lamport as u64,
                        deleted: false,
                    },
                    net_id: via.net_id.clone(),
                    x_nm: via.x_nm,
                    y_nm: via.y_nm,
                    drill_nm: via.drill_nm,
                    diameter_nm: via.diameter_nm,
                    start_layer: via.start_layer.clone(),
                    end_layer: via.end_layer.clone(),
                    via_kind: via.via_kind.clone(),
                },
            }),
            HardwarePatchOp::SoftDeleteVia { via_id } => {
                core_ops.push(model::HardwarePatchOp::DeleteEntity {
                    entity_type: "via".into(),
                    entity_id: via_id.clone(),
                })
            }
            HardwarePatchOp::RestoreTrace { trace_id } => {
                store.with_actor_transaction(core_actor, false, |tx| {
                    tx.execute(
                        "UPDATE traces SET deleted = 0 WHERE id = ?1",
                        rusqlite::params![trace_id],
                    )?;
                    Ok(())
                })?;
            }
            HardwarePatchOp::RestoreVia { via_id } => {
                store.with_actor_transaction(core_actor, false, |tx| {
                    tx.execute(
                        "UPDATE vias SET deleted = 0 WHERE id = ?1",
                        rusqlite::params![via_id],
                    )?;
                    Ok(())
                })?;
            }
        }
    }

    if !core_ops.is_empty() {
        store.apply_patch(&HardwarePatch {
            patch_id: patch_id.clone(),
            project_id: snap.project.id.clone(),
            actor_kind: core_actor,
            actor_id: req.actor_id.clone(),
            lamport_ts: new_lamport as u64,
            forward_ops: core_ops,
            inverse_ops: Vec::new(),
            otel_trace_id: None,
        })?;
    }

    store.with_actor_transaction(core_actor, true, |tx| {
        tx.execute(
            "UPDATE projects SET rev_lamport = ?1 WHERE id = ?2",
            rusqlite::params![new_lamport, &snap.project.id],
        )?;
        Ok(())
    })?;

    Ok(PatchResponse {
        applied: true,
        patch_id,
        new_lamport,
        error_code: None,
        message: req.summary.clone(),
    })
}

fn undo_req(store: &mut HwIrStore) -> Result<i64, HwIrError> {
    let snap = load_snapshot(store)?;
    store.undo_last_patch(&snap.project.id)?;
    let next = load_snapshot(store)?.project.rev_lamport;
    Ok(next)
}

fn redo_req(store: &mut HwIrStore) -> Result<i64, HwIrError> {
    let snap = load_snapshot(store)?;
    store.redo_last_patch(&snap.project.id, model::Provenance::Human)?;
    let next = load_snapshot(store)?.project.rev_lamport;
    Ok(next)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct BudgetConfig {
    session_hard_cap_usd: f64,
    usd_to_inr_rate: f64,
    fab_surcharges_usd: FabSurcharges,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct FabSurcharges {
    jlcpcb_4l_base: f64,
    drill_below_0_20mm_hdi: f64,
    trace_below_0_10mm_4mil: f64,
}

impl Default for BudgetConfig {
    fn default() -> Self {
        Self {
            session_hard_cap_usd: 5.0,
            usd_to_inr_rate: 84.5,
            fab_surcharges_usd: FabSurcharges {
                jlcpcb_4l_base: 7.0,
                drill_below_0_20mm_hdi: 48.0,
                trace_below_0_10mm_4mil: 22.0,
            },
        }
    }
}

struct AppState {
    store: Mutex<HwIrStore>,
    budget: BudgetConfig,
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    version: &'static str,
    bind_addr: &'static str,
    rev_lamport: i64,
    dlp_class: String,
    budget: BudgetConfig,
}

#[derive(Debug, Deserialize)]
struct SnapReq {
    x_nm: Nm,
    y_nm: Nm,
    grid_nm: Nm,
    layer: String,
}

#[derive(Debug, Deserialize)]
struct RoutePreviewReq {
    start_x_nm: Nm,
    start_y_nm: Nm,
    end_x_nm: Nm,
    end_y_nm: Nm,
    layer: String,
    net_id: String,
    width_nm: Nm,
    diagonal_first: bool,
}

#[derive(Debug, Serialize)]
struct RoutePreviewRes {
    points_nm: Vec<(Nm, Nm)>,
    length_mm: f64,
    delay_ps: f64,
    drc_hits: Vec<LiveDrcHit>,
    fab_surcharge_alert: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AgentSimReq {
    component_id: String,
    dx_nm: Nm,
    dy_nm: Nm,
}

#[derive(Debug, Serialize)]
struct VerificationItem {
    code: String,
    severity: String,
    passed: bool,
    entity_ids: Vec<String>,
    message: String,
    remediation: String,
}

#[derive(Debug, Serialize)]
struct VerifyReport {
    passed: bool,
    error_count: usize,
    warning_count: usize,
    smps_duty_cycle: f64,
    smps_l_min_uh: f64,
    smps_delta_il_a: f64,
    smps_i_sat_req_a: f64,
    smps_ripple_mvpp: f64,
    ipc2152_min_trace_mm: f64,
    checks: Vec<VerificationItem>,
}

fn build_spatial_kernel(snap: &BoardSnapshot) -> InteractiveSpatialKernel {
    let mut items = Vec::new();
    for c in &snap.components {
        items.push(SpatialItem {
            entity_id: c.id.clone(),
            net_id: None,
            layer: if c.side == "top" { "F.Cu".into() } else { "B.Cu".into() },
            kind: GeomKind::Pad,
            x1: c.x_nm,
            y1: c.y_nm,
            x2: c.x_nm,
            y2: c.y_nm,
            half_width_nm: 400_000,
            locked: c.locked,
        });
    }
    for t in &snap.traces {
        items.push(SpatialItem {
            entity_id: t.id.clone(),
            net_id: Some(t.net_id.clone()),
            layer: t.layer_name.clone(),
            kind: GeomKind::TraceSeg,
            x1: t.x1_nm,
            y1: t.y1_nm,
            x2: t.x2_nm,
            y2: t.y2_nm,
            half_width_nm: t.width_nm / 2,
            locked: t.locked,
        });
    }
    for v in &snap.vias {
        items.push(SpatialItem {
            entity_id: v.id.clone(),
            net_id: Some(v.net_id.clone()),
            layer: "*".into(),
            kind: GeomKind::Via,
            x1: v.x_nm,
            y1: v.y_nm,
            x2: v.x_nm,
            y2: v.y_nm,
            half_width_nm: v.diameter_nm / 2,
            locked: v.locked,
        });
    }
    InteractiveSpatialKernel::bulk_load(items)
}

fn run_deterministic_verify(snap: &BoardSnapshot) -> VerifyReport {
    let mut checks = Vec::new();

    // 1. Courtyard overlap check (exact i64 nm AABB)
    for i in 0..snap.components.len() {
        for j in (i + 1)..snap.components.len() {
            let (a, b) = (&snap.components[i], &snap.components[j]);
            if a.side != b.side {
                continue;
            }
            let ox = (a.courtyard_w_nm + b.courtyard_w_nm) / 2 - (a.x_nm - b.x_nm).abs();
            let oy = (a.courtyard_h_nm + b.courtyard_h_nm) / 2 - (a.y_nm - b.y_nm).abs();
            if ox > 0 && oy > 0 {
                checks.push(VerificationItem {
                    code: "DRC-COURTYARD".into(),
                    severity: "error".into(),
                    passed: false,
                    entity_ids: vec![a.id.clone(), b.id.clone()],
                    message: format!("Courtyard overlap between {} and {}", a.refdes, b.refdes),
                    remediation: "Separate components so courtyards clear by >= 0.25 mm".into(),
                });
            }
        }
    }

    // 2. FG-10: Decoupling cap C2 proximity to buck IC U2 (<= 6.5 mm)
    if let (Some(u2), Some(c2)) = (
        snap.components.iter().find(|c| c.refdes == "U2"),
        snap.components.iter().find(|c| c.refdes == "C2"),
    ) {
        let dist_mm = (((u2.x_nm - c2.x_nm) as f64).hypot((u2.y_nm - c2.y_nm) as f64)) / 1_000_000.0;
        let ok = dist_mm <= 6.5;
        checks.push(VerificationItem {
            code: "FG-10".into(),
            severity: if ok { "info".into() } else { "error".into() },
            passed: ok,
            entity_ids: vec![u2.id.clone(), c2.id.clone()],
            message: format!("HF input decoupling C2 -> U2 distance = {dist_mm:.2} mm (limit 6.50 mm)"),
            remediation: "Place C2 within 6.5 mm of U2 VIN/GND loop".into(),
        });
    }

    // 3. SMPS hot-loop distance U2 -> L1 (<= 11.0 mm)
    if let (Some(u2), Some(l1)) = (
        snap.components.iter().find(|c| c.refdes == "U2"),
        snap.components.iter().find(|c| c.refdes == "L1"),
    ) {
        let dist_mm = (((u2.x_nm - l1.x_nm) as f64).hypot((u2.y_nm - l1.y_nm) as f64)) / 1_000_000.0;
        let ok = dist_mm <= 11.0;
        checks.push(VerificationItem {
            code: "SMPS-HOTLOOP".into(),
            severity: if ok { "info".into() } else { "warning".into() },
            passed: ok,
            entity_ids: vec![u2.id.clone(), l1.id.clone()],
            message: format!("Switch-node span U2 -> L1 = {dist_mm:.2} mm (target <= 11.0 mm)"),
            remediation: "Keep SW copper compact between U2 and L1 to minimize radiated EMI".into(),
        });
    }

    // 4. Board boundary containment check
    for c in &snap.components {
        let hw = c.courtyard_w_nm / 2;
        let hh = c.courtyard_h_nm / 2;
        if c.x_nm - hw < 0
            || c.x_nm + hw > snap.board.width_nm
            || c.y_nm - hh < 0
            || c.y_nm + hh > snap.board.height_nm
        {
            checks.push(VerificationItem {
                code: "DRC-EDGE".into(),
                severity: "error".into(),
                passed: false,
                entity_ids: vec![c.id.clone()],
                message: format!("Component {} protrudes outside board outline", c.refdes),
                remediation: "Move component inside 60.0 x 40.0 mm board boundary".into(),
            });
        }
    }

    // 5. FG-01 USB-C PD sink present
    let has_pd = snap.components.iter().any(|c| c.functional_group == "usb_pd");
    checks.push(VerificationItem {
        code: "FG-01".into(),
        severity: if has_pd { "info".into() } else { "error".into() },
        passed: has_pd,
        entity_ids: snap
            .components
            .iter()
            .filter(|c| c.functional_group == "usb_pd")
            .map(|c| c.id.clone())
            .collect(),
        message: if has_pd {
            "USB-C CC1/CC2 managed by CH224K PD sink IC".into()
        } else {
            "USB-C CC pins lack 5.1k pulldown or PD IC".into()
        },
        remediation: "Keep CH224K or dual 5.1k 1% pulldowns on CC1/CC2".into(),
    });

    // Analytical TPS54302 12V -> 3.3V / 3A @ 400kHz physics check
    let (vin, vout, iout, fsw, l_uh, c_eff_uf, esr_ohm) = (12.0_f64, 3.3, 3.0, 400_000.0, 10.0, 24.0, 0.010);
    let duty = vout / vin;
    let l_min_uh = ((vout * (1.0 - duty)) / (fsw * 0.30 * iout)) * 1e6;
    let delta_il = (vout * (1.0 - duty)) / (fsw * l_uh * 1e-6);
    let i_sat_req = (iout + delta_il / 2.0) * 1.25;
    let ripple_mvpp = ((delta_il / (8.0 * fsw * c_eff_uf * 1e-6)) + (delta_il * esr_ohm)) * 1000.0;
    // IPC-2152 (2009) universal chart still-air baseline for 1 oz (1.378 mil) external trace at ΔT = 10 °C:
    // anchor points [100 mil² -> 2.70 A, 200 mil² -> 4.10 A], log-log interpolated for iout = 3.0 A.
    let (a0, a1, i0, i1) = (100.0_f64, 200.0_f64, 2.70_f64, 4.10_f64);
    let t = (iout.ln() - i0.ln()) / (i1.ln() - i0.ln());
    let area_mil2 = (a0.ln() + t * (a1.ln() - a0.ln())).exp();
    let ipc2152_min_trace_mm = (area_mil2 / 1.378) * 0.0254;

    let error_count = checks.iter().filter(|c| !c.passed && c.severity == "error").count();
    let warning_count = checks.iter().filter(|c| !c.passed && c.severity == "warning").count();

    VerifyReport {
        passed: error_count == 0,
        error_count,
        warning_count,
        smps_duty_cycle: (duty * 1000.0).round() / 1000.0,
        smps_l_min_uh: (l_min_uh * 100.0).round() / 100.0,
        smps_delta_il_a: (delta_il * 1000.0).round() / 1000.0,
        smps_i_sat_req_a: (i_sat_req * 100.0).round() / 100.0,
        smps_ripple_mvpp: (ripple_mvpp * 100.0).round() / 100.0,
        ipc2152_min_trace_mm: (ipc2152_min_trace_mm * 1000.0).round() / 1000.0,
        checks,
    }
}

async fn get_health(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let guard = match state.store.lock() {
        Ok(g) => g,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Store lock poisoned").into_response(),
    };
    match load_snapshot(&guard) {
        Ok(snap) => Json(HealthResponse {
            version: "0.0.5",
            bind_addr: "127.0.0.1:41900",
            rev_lamport: snap.project.rev_lamport,
            dlp_class: snap.project.dlp_class,
            budget: state.budget.clone(),
        })
        .into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn get_board(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let guard = match state.store.lock() {
        Ok(g) => g,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Store lock poisoned").into_response(),
    };
    match load_snapshot(&guard) {
        Ok(snap) => Json(snap).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn post_patch(
    State(state): State<Arc<AppState>>,
    Json(req): Json<PatchRequest>,
) -> impl IntoResponse {
    let mut guard = match state.store.lock() {
        Ok(g) => g,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Store lock poisoned").into_response(),
    };
    match apply_patch_req(&mut guard, &req) {
        Ok(res) => (StatusCode::OK, Json(res)).into_response(),
        Err(HwIrError::LockViolation(msg)) => (
            StatusCode::CONFLICT,
            Json(PatchResponse {
                applied: false,
                patch_id: String::new(),
                new_lamport: 0,
                error_code: Some("KERNEL_LOCK_VIOLATION".into()),
                message: msg,
            }),
        )
            .into_response(),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(PatchResponse {
                applied: false,
                patch_id: String::new(),
                new_lamport: 0,
                error_code: Some("VD-IR-ERROR".into()),
                message: e.to_string(),
            }),
        )
            .into_response(),
    }
}

async fn post_agent_sim(
    State(state): State<Arc<AppState>>,
    Json(req): Json<AgentSimReq>,
) -> impl IntoResponse {
    let mut guard = match state.store.lock() {
        Ok(g) => g,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Store lock poisoned").into_response(),
    };
    let snap = match load_snapshot(&guard) {
        Ok(s) => s,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };
    let Some(comp) = snap.components.iter().find(|c| c.id == req.component_id) else {
        return (StatusCode::NOT_FOUND, "Component not found").into_response();
    };
    let patch_req = PatchRequest {
        expected_lamport: Some(snap.project.rev_lamport),
        actor_kind: Provenance::Agent,
        actor_id: "vd-agent-placer".into(),
        summary: format!("Agent optimization move on {}", comp.refdes),
        ops: vec![HardwarePatchOp::MoveComponent {
            component_id: comp.id.clone(),
            x_nm: comp.x_nm + req.dx_nm,
            y_nm: comp.y_nm + req.dy_nm,
            rot_mdeg: comp.rot_mdeg,
            side: comp.side.clone(),
        }],
    };
    match apply_patch_req(&mut guard, &patch_req) {
        Ok(res) => (StatusCode::OK, Json(res)).into_response(),
        Err(HwIrError::LockViolation(msg)) => (
            StatusCode::CONFLICT,
            Json(PatchResponse {
                applied: false,
                patch_id: String::new(),
                new_lamport: snap.project.rev_lamport,
                error_code: Some("KERNEL_LOCK_VIOLATION".into()),
                message: msg,
            }),
        )
            .into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
    }
}

async fn post_undo(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let mut guard = match state.store.lock() {
        Ok(g) => g,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Store lock poisoned").into_response(),
    };
    match undo_req(&mut guard) {
        Ok(lamport) => (StatusCode::OK, Json(serde_json::json!({ "new_lamport": lamport }))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
    }
}

async fn post_redo(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let mut guard = match state.store.lock() {
        Ok(g) => g,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Store lock poisoned").into_response(),
    };
    match redo_req(&mut guard) {
        Ok(lamport) => (StatusCode::OK, Json(serde_json::json!({ "new_lamport": lamport }))).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
    }
}

async fn post_snap(State(state): State<Arc<AppState>>, Json(req): Json<SnapReq>) -> impl IntoResponse {
    let guard = match state.store.lock() {
        Ok(g) => g,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Store lock poisoned").into_response(),
    };
    let snap = match load_snapshot(&guard) {
        Ok(s) => s,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };
    let kernel = build_spatial_kernel(&snap);
    let res: SnapResult = kernel.magnetic_snap(req.x_nm, req.y_nm, req.grid_nm, 1_200_000, &req.layer);
    Json(res).into_response()
}

async fn post_route_preview(
    State(state): State<Arc<AppState>>,
    Json(req): Json<RoutePreviewReq>,
) -> impl IntoResponse {
    let guard = match state.store.lock() {
        Ok(g) => g,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Store lock poisoned").into_response(),
    };
    let snap = match load_snapshot(&guard) {
        Ok(s) => s,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };
    let kernel = build_spatial_kernel(&snap);
    let points = InteractiveSpatialKernel::solve_45deg_posture(
        req.start_x_nm,
        req.start_y_nm,
        req.end_x_nm,
        req.end_y_nm,
        req.diagonal_first,
    );
    let mut total_nm = 0.0_f64;
    let mut hits = Vec::new();
    for seg in points.windows(2) {
        let (ax, ay) = seg[0];
        let (bx, by) = seg[1];
        total_nm += ((bx - ax) as f64).hypot((by - ay) as f64);
        hits.extend(kernel.check_segment_live_drc(
            &req.net_id, &req.layer, ax, ay, bx, by, req.width_nm, 200_000,
        ));
    }
    let length_mm = total_nm / 1_000_000.0;
    let er_eff: f64 = if req.layer == "F.Cu" || req.layer == "B.Cu" { 3.2 } else { 4.4 };
    let delay_ps = (length_mm * er_eff.sqrt()) / 0.299792458;
    let fab_alert = if req.width_nm < 100_000 {
        Some(format!(
            "Trace <0.10mm triggers fab surcharge (+${:.0})",
            state.budget.fab_surcharges_usd.trace_below_0_10mm_4mil
        ))
    } else {
        None
    };

    Json(RoutePreviewRes {
        points_nm: points,
        length_mm: (length_mm * 1000.0).round() / 1000.0,
        delay_ps: (delay_ps * 100.0).round() / 100.0,
        drc_hits: hits,
        fab_surcharge_alert: fab_alert,
    })
    .into_response()
}

async fn post_verify(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let guard = match state.store.lock() {
        Ok(g) => g,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Store lock poisoned").into_response(),
    };
    match load_snapshot(&guard) {
        Ok(snap) => Json(run_deterministic_verify(&snap)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn get_export_kicad(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let guard = match state.store.lock() {
        Ok(g) => g,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Store lock poisoned".into_response()).into_response(),
    };
    let snap = match load_snapshot(&guard) {
        Ok(s) => s,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    let mut out = String::from(
        "(kicad_pcb (version 20261030) (generator \"vajra-dhir-eda\") (generator_version \"0.0.2\")\n  (general (thickness 1.6))\n",
    );
    let w_mm = snap.board.width_nm as f64 / 1_000_000.0;
    let h_mm = snap.board.height_nm as f64 / 1_000_000.0;
    out.push_str(&format!(
        "  (gr_rect (start 0 0) (end {w_mm:.3} {h_mm:.3}) (layer \"Edge.Cuts\") (stroke (width 0.15) (type solid)))\n"
    ));
    for (idx, net) in snap.nets.iter().enumerate() {
        out.push_str(&format!("  (net {} \"{}\")\n", idx + 1, net.name));
    }
    for c in &snap.components {
        let x = c.x_nm as f64 / 1_000_000.0;
        let y = c.y_nm as f64 / 1_000_000.0;
        let rot = c.rot_mdeg as f64 / 1000.0;
        let layer = if c.side == "top" { "F.Cu" } else { "B.Cu" };
        let lock_kw = if c.locked { " (locked yes)" } else { "" };
        out.push_str(&format!(
            "  (footprint \"{}\" (layer \"{}\") (uuid \"{}\") (at {x:.3} {y:.3} {rot:.1}){lock_kw}\n    (property \"Reference\" \"{}\")\n    (property \"Value\" \"{}\")\n  )\n",
            c.footprint_ref, layer, c.id, c.refdes, c.value_str
        ));
    }
    for t in &snap.traces {
        let x1 = t.x1_nm as f64 / 1_000_000.0;
        let y1 = t.y1_nm as f64 / 1_000_000.0;
        let x2 = t.x2_nm as f64 / 1_000_000.0;
        let y2 = t.y2_nm as f64 / 1_000_000.0;
        let w = t.width_nm as f64 / 1_000_000.0;
        out.push_str(&format!(
            "  (segment (start {x1:.3} {y1:.3}) (end {x2:.3} {y2:.3}) (width {w:.3}) (layer \"{}\") (uuid \"{}\"))\n",
            t.layer_name, t.id
        ));
    }
    for v in &snap.vias {
        let x = v.x_nm as f64 / 1_000_000.0;
        let y = v.y_nm as f64 / 1_000_000.0;
        let d = v.diameter_nm as f64 / 1_000_000.0;
        let dr = v.drill_nm as f64 / 1_000_000.0;
        out.push_str(&format!(
            "  (via (at {x:.3} {y:.3}) (size {d:.3}) (drill {dr:.3}) (layers \"{}\" \"{}\") (uuid \"{}\"))\n",
            v.start_layer, v.end_layer, v.id
        ));
    }
    out.push_str(")\n");
    ([(axum::http::header::CONTENT_TYPE, "text/plain; charset=utf-8")], out).into_response()
}

async fn get_export_firmware_pins(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let guard = match state.store.lock() {
        Ok(g) => g,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Store lock poisoned".into_response()).into_response(),
    };
    let snap = match load_snapshot(&guard) {
        Ok(s) => s,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };
    let mut h = format!(
        "/* AUTO-GENERATED BY VAJRA-DHIR EDA v0.0.2 (HW-IR rev={}) — DO NOT HAND-EDIT */\n#pragma once\n#include <stdint.h>\n\n",
        snap.project.rev_lamport
    );
    for r in &snap.pinmux {
        h.push_str(&format!(
            "#define {}_PIN     \"{}\"\n#define {}_PERIPH  \"{}\"\n#define {}_MODE    \"{}\"\n\n",
            r.signal_alias, r.pin_number, r.signal_alias, r.peripheral_instance, r.signal_alias, r.gpio_mode
        ));
    }
    ([(axum::http::header::CONTENT_TYPE, "text/plain; charset=utf-8")], h).into_response()
}

#[tokio::main]
async fn main() {
    let db_dir = PathBuf::from(".vd-dev");
    let _ = fs::create_dir_all(&db_dir);
    let db_path = db_dir.join("prototype-v0.0.1.vd.db");

    let mut store = HwIrStore::open(&db_path).expect("Failed to open SQLite WAL HW-IR database");
    seed_reference_board_if_empty(&mut store)
        .expect("Failed to seed VD-BRD-001 reference board");

    let budget: BudgetConfig = fs::read_to_string("budget.json")
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    let state = Arc::new(AppState {
        store: Mutex::new(store),
        budget,
    });

    let cors = CorsLayer::new()
        .allow_origin(HeaderValue::from_static("http://127.0.0.1:5173"))
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([axum::http::header::CONTENT_TYPE]);

    let app = Router::new()
        .route("/api/v1/health", get(get_health))
        .route("/api/v1/board", get(get_board))
        .route("/api/v1/patch", post(post_patch))
        .route("/api/v1/agent-simulate-move", post(post_agent_sim))
        .route("/api/v1/undo", post(post_undo))
        .route("/api/v1/redo", post(post_redo))
        .route("/api/v1/snap", post(post_snap))
        .route("/api/v1/route-preview", post(post_route_preview))
        .route("/api/v1/verify", post(post_verify))
        .route("/api/v1/export/kicad-pcb", get(get_export_kicad))
        .route("/api/v1/export/firmware-pins", get(get_export_firmware_pins))
        .layer(cors)
        .with_state(state);

    // Strictly loopback 127.0.0.1 (zero inbound external ports)
    let addr = SocketAddr::from(([127, 0, 0, 1], 41900));
    println!("Vajra-Dhīr EDA v0.0.2 daemon listening strictly on http://{addr}");
    println!("SQLite WAL HW-IR database: {}", db_path.display());

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Failed to bind 127.0.0.1:41900");
    axum::serve(listener, app).await.expect("Daemon server error");
}
