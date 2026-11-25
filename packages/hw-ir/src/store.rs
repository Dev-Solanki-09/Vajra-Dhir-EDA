use crate::model::*;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use sha2::{Digest, Sha256};
use std::path::Path;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum HwIrError {
    #[error("Database error: {0}")]
    Sqlite(#[from] rusqlite::Error),

    #[error("Serialization error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Kernel lock violation: {0}")]
    LockViolation(String),

    #[error("Entity not found: {0}")]
    NotFound(String),

    #[error("Invalid patch: {0}")]
    InvalidPatch(String),

    #[error("Migration error: {0}")]
    Migration(String),
}

impl From<HwIrError> for String {
    fn from(err: HwIrError) -> Self {
        err.to_string()
    }
}

pub struct HwIrStore {
    conn: Connection,
}

impl HwIrStore {
    pub const INIT_SQL: &'static str = include_str!("../schema/001_init.sql");
    pub const PERFECTION_SQL: &'static str = include_str!("../schema/002_manual_perfection.sql");

    /// Open an in-memory SQLite HW-IR database with all migrations applied.
    pub fn open_in_memory() -> Result<Self, HwIrError> {
        let conn = Connection::open_in_memory()?;
        let mut store = Self { conn };
        store.migrate()?;
        Ok(store)
    }

    /// Open a file-backed SQLite HW-IR database with all migrations applied.
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self, HwIrError> {
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA synchronous = NORMAL; PRAGMA temp_store = MEMORY;")?;
        let mut store = Self { conn };
        store.migrate()?;
        Ok(store)
    }

    /// Run initialization and migration schemas.
    pub fn migrate(&mut self) -> Result<(), HwIrError> {
        self.conn.execute_batch(Self::INIT_SQL).map_err(|e| {
            HwIrError::Migration(format!("Failed to execute 001_init.sql: {}", e))
        })?;
        self.conn.execute_batch(Self::PERFECTION_SQL).map_err(|e| {
            HwIrError::Migration(format!("Failed to execute 002_manual_perfection.sql: {}", e))
        })?;
        Ok(())
    }

    /// Borrow the underlying raw Connection.
    pub fn connection(&self) -> &Connection {
        &self.conn
    }

    /// Mutably borrow the underlying raw Connection.
    pub fn connection_mut(&mut self) -> &mut Connection {
        &mut self.conn
    }

    /// Set the current transaction actor context.
    pub fn set_actor_context(
        &self,
        actor: Provenance,
        allow_override: bool,
    ) -> Result<(), HwIrError> {
        let actor_str = actor.to_string();
        let override_val = if allow_override { 1 } else { 0 };
        let mut stmt = self.conn.prepare_cached(
            "UPDATE _tx_actor_ctx SET actor_kind = ?1, allow_lock_override = ?2 WHERE singleton = 1;",
        )?;
        stmt.execute(params![actor_str, override_val])?;
        Ok(())
    }

    /// Execute a closure inside a transaction with the given actor context.
    pub fn with_actor_transaction<F, R>(
        &mut self,
        actor: Provenance,
        allow_override: bool,
        f: F,
    ) -> Result<R, HwIrError>
    where
        F: FnOnce(&Transaction) -> Result<R, HwIrError>,
    {
        let tx = self.conn.transaction()?;
        let actor_str = actor.to_string();
        let override_val = if allow_override { 1 } else { 0 };
        tx.execute(
            "UPDATE _tx_actor_ctx SET actor_kind = ?1, allow_lock_override = ?2 WHERE singleton = 1;",
            params![actor_str, override_val],
        )?;

        let result = f(&tx);

        match result {
            Ok(val) => {
                tx.commit()?;
                Ok(val)
            }
            Err(e) => {
                let _ = tx.rollback();
                // Map SQLite failure from lock trigger to LockViolation
                if let HwIrError::Sqlite(rusqlite::Error::SqliteFailure(_, Some(ref msg))) = e {
                    if msg.contains("KERNEL_LOCK_VIOLATION") {
                        return Err(HwIrError::LockViolation(msg.clone()));
                    }
                }
                Err(e)
            }
        }
    }

    /// Apply an atomic HardwarePatch to the database.
    /// If inverse_ops is empty, automatic inverse ops are computed where possible.
    pub fn apply_patch(&mut self, patch: &HardwarePatch) -> Result<(), HwIrError> {
        let forward_ops = &patch.forward_ops;
        let actor_kind = patch.actor_kind;
        let patch_id = &patch.patch_id;
        let project_id = &patch.project_id;
        let actor_id = &patch.actor_id;
        let lamport_ts = patch.lamport_ts;
        let otel_trace_id = patch.otel_trace_id.as_deref();
        let now = chrono_now_iso();

        self.with_actor_transaction(actor_kind, false, |tx| {
            let mut calculated_inverses = Vec::new();

            for op in forward_ops {
                let inverse = apply_single_op(tx, op)?;
                calculated_inverses.push(inverse);
            }

            let inverse_to_store = if !patch.inverse_ops.is_empty() {
                &patch.inverse_ops
            } else {
                &calculated_inverses
            };

            let fwd_json = serde_json::to_string(forward_ops)?;
            let inv_json = serde_json::to_string(inverse_to_store)?;

            tx.execute(
                "DELETE FROM hardware_patches WHERE project_id = ?1 AND undone = 1;",
                params![project_id],
            )?;

            tx.execute(
                "INSERT INTO hardware_patches (
                    patch_id, project_id, actor_kind, actor_id,
                    lamport_ts, forward_ops_json, inverse_ops_json,
                    undone, otel_trace_id, applied_at_utc
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8, ?9);",
                params![
                    patch_id,
                    project_id,
                    actor_kind.to_string(),
                    actor_id,
                    lamport_ts,
                    fwd_json,
                    inv_json,
                    otel_trace_id,
                    now
                ],
            )?;

            Ok(())
        })
    }

    /// Undo the most recent non-undone patch for a given project.
    pub fn undo_last_patch(&mut self, project_id: &str) -> Result<Option<String>, HwIrError> {
        let query = "SELECT patch_id, inverse_ops_json, actor_kind, actor_id, lamport_ts 
                     FROM hardware_patches 
                     WHERE project_id = ?1 AND undone = 0 
                     ORDER BY seq_id DESC LIMIT 1;";

        let row_opt = self.conn.query_row(query, params![project_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, u64>(4)?,
            ))
        }).optional()?;

        if let Some((patch_id, inv_json, _, _, _)) = row_opt {
            let inverse_ops: Vec<HardwarePatchOp> = serde_json::from_str(&inv_json)?;

            // Apply inverse ops as human to ensure complete undo capability
            self.with_actor_transaction(Provenance::Human, true, |tx| {
                for op in &inverse_ops {
                    apply_single_op(tx, op)?;
                }
                tx.execute(
                    "UPDATE hardware_patches SET undone = 1 WHERE patch_id = ?1;",
                    params![patch_id],
                )?;
                Ok(())
            })?;

            Ok(Some(patch_id))
        } else {
            Ok(None)
        }
    }

    /// Undo the most recent non-undone patch while strictly honoring fail-closed locks for the given actor.
    pub fn undo_last_patch_checked(
        &mut self,
        project_id: &str,
        actor: Provenance,
    ) -> Result<Option<String>, HwIrError> {
        let query = "SELECT patch_id, inverse_ops_json
                     FROM hardware_patches
                     WHERE project_id = ?1 AND undone = 0
                     ORDER BY seq_id DESC LIMIT 1;";
        let row_opt = self
            .conn
            .query_row(query, params![project_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .optional()?;

        if let Some((patch_id, inv_json)) = row_opt {
            let inverse_ops: Vec<HardwarePatchOp> = serde_json::from_str(&inv_json)?;
            self.with_actor_transaction(actor, false, |tx| {
                for op in &inverse_ops {
                    apply_single_op(tx, op)?;
                }
                tx.execute(
                    "UPDATE hardware_patches SET undone = 1 WHERE patch_id = ?1;",
                    params![patch_id],
                )?;
                Ok(())
            })?;
            Ok(Some(patch_id))
        } else {
            Ok(None)
        }
    }

    /// Redo the earliest undone patch (Ctrl+Shift+Z) while strictly honoring fail-closed locks.
    pub fn redo_last_patch(
        &mut self,
        project_id: &str,
        actor: Provenance,
    ) -> Result<Option<String>, HwIrError> {
        let query = "SELECT patch_id, forward_ops_json
                     FROM hardware_patches
                     WHERE project_id = ?1 AND undone = 1
                     ORDER BY seq_id ASC LIMIT 1;";
        let row_opt = self
            .conn
            .query_row(query, params![project_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .optional()?;

        if let Some((patch_id, fwd_json)) = row_opt {
            let forward_ops: Vec<HardwarePatchOp> = serde_json::from_str(&fwd_json)?;
            self.with_actor_transaction(actor, false, |tx| {
                for op in &forward_ops {
                    apply_single_op(tx, op)?;
                }
                tx.execute(
                    "UPDATE hardware_patches SET undone = 0 WHERE patch_id = ?1;",
                    params![patch_id],
                )?;
                Ok(())
            })?;
            Ok(Some(patch_id))
        } else {
            Ok(None)
        }
    }

    /// Execute SQLite WAL checkpoint ladder: PASSIVE every 250 patches, TRUNCATE on idle.
    pub fn checkpoint_wal_ladder(&self, patch_count: usize, idle: bool) -> Result<(), HwIrError> {
        if idle {
            self.conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
        } else if patch_count > 0 && patch_count % 250 == 0 {
            self.conn.execute_batch("PRAGMA wal_checkpoint(PASSIVE);")?;
        }
        Ok(())
    }

    /// Compute a deterministic SHA-256 fingerprint of the current board/design state.
    pub fn compute_design_hash(&self, project_id: &str) -> Result<String, HwIrError> {
        let mut hasher = Sha256::new();

        // 1. Boards
        let mut stmt = self.conn.prepare(
            "SELECT id, name, board_kind, outline_polygon_nm, thickness_nm, layer_count, locked 
             FROM boards WHERE project_id = ?1 AND deleted = 0 ORDER BY id ASC;",
        )?;
        let board_rows = stmt.query_map(params![project_id], |r| {
            Ok(format!(
                "{}:{}:{}:{}:{}:{}:{}",
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, i64>(4)?,
                r.get::<_, i32>(5)?,
                r.get::<_, i32>(6)?
            ))
        })?;
        for b in board_rows {
            hasher.update(b?.as_bytes());
            hasher.update(b"\n");
        }

        // 2. Components
        let mut stmt = self.conn.prepare(
            "SELECT c.id, c.refdes, c.value_str, c.footprint_ref, c.x_nm, c.y_nm, c.rot_mdeg, c.side, c.locked 
             FROM components c 
             JOIN boards b ON c.board_id = b.id 
             WHERE b.project_id = ?1 AND c.deleted = 0 
             ORDER BY c.id ASC;",
        )?;
        let comp_rows = stmt.query_map(params![project_id], |r| {
            Ok(format!(
                "{}:{}:{}:{}:{}:{}:{}:{}:{}",
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, i64>(4)?,
                r.get::<_, i64>(5)?,
                r.get::<_, i32>(6)?,
                r.get::<_, String>(7)?,
                r.get::<_, i32>(8)?
            ))
        })?;
        for c in comp_rows {
            hasher.update(c?.as_bytes());
            hasher.update(b"\n");
        }

        // 3. Nets
        let mut stmt = self.conn.prepare(
            "SELECT n.id, n.name, n.net_class_id, n.signal_role, n.locked 
             FROM nets n 
             JOIN boards b ON n.board_id = b.id 
             WHERE b.project_id = ?1 AND n.deleted = 0 
             ORDER BY n.id ASC;",
        )?;
        let net_rows = stmt.query_map(params![project_id], |r| {
            Ok(format!(
                "{}:{}:{}:{}:{}",
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, i32>(4)?
            ))
        })?;
        for n in net_rows {
            hasher.update(n?.as_bytes());
            hasher.update(b"\n");
        }

        // 4. Traces
        let mut stmt = self.conn.prepare(
            "SELECT t.id, t.net_id, t.layer_name, t.x1_nm, t.y1_nm, t.x2_nm, t.y2_nm, t.width_nm, t.locked 
             FROM traces t 
             JOIN boards b ON t.board_id = b.id 
             WHERE b.project_id = ?1 AND t.deleted = 0 
             ORDER BY t.id ASC;",
        )?;
        let trace_rows = stmt.query_map(params![project_id], |r| {
            Ok(format!(
                "{}:{}:{}:{}:{}:{}:{}:{}:{}",
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, i64>(3)?,
                r.get::<_, i64>(4)?,
                r.get::<_, i64>(5)?,
                r.get::<_, i64>(6)?,
                r.get::<_, i64>(7)?,
                r.get::<_, i32>(8)?
            ))
        })?;
        for t in trace_rows {
            hasher.update(t?.as_bytes());
            hasher.update(b"\n");
        }

        let hash_bytes = hasher.finalize();
        Ok(format!("{:x}", hash_bytes))
    }
}

fn chrono_now_iso() -> String {
    // Standard ISO-8601 UTC timestamp format
    let now = std::time::SystemTime::now();
    let duration = now
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();
    format!("{}-01-01T00:00:00Z", 1970 + secs / 31536000) // Deterministic fallback or ISO
}

fn apply_single_op(
    tx: &Transaction,
    op: &HardwarePatchOp,
) -> Result<HardwarePatchOp, HwIrError> {
    match op {
        HardwarePatchOp::UpsertEntity { entity } => match entity {
            HardwareEntity::Component {
                meta,
                refdes,
                value_str,
                mpn,
                package_name,
                footprint_ref,
                symbol_ref,
                functional_group,
                x_nm,
                y_nm,
                rot_mdeg,
                side,
                courtyard_w_nm,
                courtyard_h_nm,
                height_nm,
                power_diss_mw,
                params,
                datasheet_citation_id,
            } => {
                let params_json = serde_json::to_string(params)?;
                let locked_val = if meta.lock.locked { 1 } else { 0 };
                let deleted_val = if meta.deleted { 1 } else { 0 };

                // Fetch previous state for inverse if exists
                let prev = tx
                    .query_row(
                        "SELECT id, board_id, refdes, value_str, mpn, package_name, footprint_ref, 
                                symbol_ref, functional_group, x_nm, y_nm, rot_mdeg, side, 
                                courtyard_w_nm, courtyard_h_nm, height_nm, power_diss_mw, 
                                params_json, datasheet_citation_id, provenance, locked, lock_owner, 
                                lock_reason, rev_lamport, deleted 
                         FROM components WHERE id = ?1;",
                        params![meta.id],
                        |r| {
                            let prov_str: String = r.get(19)?;
                            let prov = prov_str.parse().unwrap_or(Provenance::Human);
                            Ok(HardwareEntity::Component {
                                meta: HardwareEntityMeta {
                                    id: r.get(0)?,
                                    board_id: r.get(1)?,
                                    lock: LockGuard {
                                        locked: r.get::<_, i32>(20)? == 1,
                                        provenance: prov,
                                        lock_owner: r.get(21)?,
                                        lock_reason: r.get(22)?,
                                    },
                                    rev_lamport: r.get(23)?,
                                    deleted: r.get::<_, i32>(24)? == 1,
                                },
                                refdes: r.get(2)?,
                                value_str: r.get(3)?,
                                mpn: r.get(4)?,
                                package_name: r.get(5)?,
                                footprint_ref: r.get(6)?,
                                symbol_ref: r.get(7)?,
                                functional_group: r.get(8)?,
                                x_nm: r.get(9)?,
                                y_nm: r.get(10)?,
                                rot_mdeg: r.get(11)?,
                                side: r.get(12)?,
                                courtyard_w_nm: r.get(13)?,
                                courtyard_h_nm: r.get(14)?,
                                height_nm: r.get(15)?,
                                power_diss_mw: r.get(16)?,
                                params: serde_json::from_str(&r.get::<_, String>(17)?).unwrap_or_default(),
                                datasheet_citation_id: r.get(18)?,
                            })
                        },
                    )
                    .optional()?;

                tx.execute(
                    "INSERT INTO components (
                        id, board_id, refdes, value_str, mpn, package_name,
                        footprint_ref, symbol_ref, functional_group, x_nm, y_nm,
                        rot_mdeg, side, courtyard_w_nm, courtyard_h_nm, height_nm,
                        power_diss_mw, params_json, datasheet_citation_id,
                        provenance, locked, lock_owner, lock_reason, rev_lamport, deleted
                    ) VALUES (
                        ?1, ?2, ?3, ?4, ?5, ?6,
                        ?7, ?8, ?9, ?10, ?11,
                        ?12, ?13, ?14, ?15, ?16,
                        ?17, ?18, ?19,
                        ?20, ?21, ?22, ?23, ?24, ?25
                    )
                    ON CONFLICT(id) DO UPDATE SET
                        refdes = excluded.refdes,
                        value_str = excluded.value_str,
                        mpn = excluded.mpn,
                        package_name = excluded.package_name,
                        footprint_ref = excluded.footprint_ref,
                        symbol_ref = excluded.symbol_ref,
                        functional_group = excluded.functional_group,
                        x_nm = excluded.x_nm,
                        y_nm = excluded.y_nm,
                        rot_mdeg = excluded.rot_mdeg,
                        side = excluded.side,
                        courtyard_w_nm = excluded.courtyard_w_nm,
                        courtyard_h_nm = excluded.courtyard_h_nm,
                        height_nm = excluded.height_nm,
                        power_diss_mw = excluded.power_diss_mw,
                        params_json = excluded.params_json,
                        datasheet_citation_id = excluded.datasheet_citation_id,
                        locked = excluded.locked,
                        lock_owner = excluded.lock_owner,
                        lock_reason = excluded.lock_reason,
                        rev_lamport = excluded.rev_lamport,
                        deleted = excluded.deleted;",
                    params![
                        meta.id,
                        meta.board_id,
                        refdes,
                        value_str,
                        mpn,
                        package_name,
                        footprint_ref,
                        symbol_ref,
                        functional_group,
                        x_nm,
                        y_nm,
                        rot_mdeg,
                        side,
                        courtyard_w_nm,
                        courtyard_h_nm,
                        height_nm,
                        power_diss_mw,
                        params_json,
                        datasheet_citation_id,
                        meta.lock.provenance.to_string(),
                        locked_val,
                        meta.lock.lock_owner,
                        meta.lock.lock_reason,
                        meta.rev_lamport,
                        deleted_val,
                    ],
                )?;

                Ok(match prev {
                    Some(old_entity) => HardwarePatchOp::UpsertEntity { entity: old_entity },
                    None => HardwarePatchOp::DeleteEntity {
                        entity_type: "component".into(),
                        entity_id: meta.id.clone(),
                    },
                })
            }
            HardwareEntity::Net {
                meta,
                name,
                net_class_id,
                signal_role,
                nominal_voltage_v,
                diff_pair_mate_id,
            } => {
                let locked_val = if meta.lock.locked { 1 } else { 0 };
                let deleted_val = if meta.deleted { 1 } else { 0 };

                tx.execute(
                    "INSERT INTO nets (
                        id, board_id, name, net_class_id, signal_role,
                        nominal_voltage_v, diff_pair_mate_id,
                        provenance, locked, rev_lamport, deleted
                    ) VALUES (
                        ?1, ?2, ?3, ?4, ?5,
                        ?6, ?7,
                        ?8, ?9, ?10, ?11
                    )
                    ON CONFLICT(id) DO UPDATE SET
                        name = excluded.name,
                        net_class_id = excluded.net_class_id,
                        signal_role = excluded.signal_role,
                        nominal_voltage_v = excluded.nominal_voltage_v,
                        diff_pair_mate_id = excluded.diff_pair_mate_id,
                        locked = excluded.locked,
                        rev_lamport = excluded.rev_lamport,
                        deleted = excluded.deleted;",
                    params![
                        meta.id,
                        meta.board_id,
                        name,
                        net_class_id,
                        signal_role,
                        nominal_voltage_v,
                        diff_pair_mate_id,
                        meta.lock.provenance.to_string(),
                        locked_val,
                        meta.rev_lamport,
                        deleted_val,
                    ],
                )?;

                Ok(HardwarePatchOp::DeleteEntity {
                    entity_type: "net".into(),
                    entity_id: meta.id.clone(),
                })
            }
            HardwareEntity::Trace {
                meta,
                net_id,
                layer_name,
                x1_nm,
                y1_nm,
                x2_nm,
                y2_nm,
                width_nm,
                arc_mid,
            } => {
                let locked_val = if meta.lock.locked { 1 } else { 0 };
                let deleted_val = if meta.deleted { 1 } else { 0 };
                let (arc_x, arc_y) = match arc_mid {
                    Some((x, y)) => (Some(*x), Some(*y)),
                    None => (None, None),
                };

                tx.execute(
                    "INSERT INTO traces (
                        id, board_id, net_id, layer_name,
                        x1_nm, y1_nm, x2_nm, y2_nm, width_nm,
                        arc_mid_x_nm, arc_mid_y_nm,
                        provenance, locked, lock_owner, rev_lamport, deleted
                    ) VALUES (
                        ?1, ?2, ?3, ?4,
                        ?5, ?6, ?7, ?8, ?9,
                        ?10, ?11,
                        ?12, ?13, ?14, ?15, ?16
                    )
                    ON CONFLICT(id) DO UPDATE SET
                        net_id = excluded.net_id,
                        layer_name = excluded.layer_name,
                        x1_nm = excluded.x1_nm,
                        y1_nm = excluded.y1_nm,
                        x2_nm = excluded.x2_nm,
                        y2_nm = excluded.y2_nm,
                        width_nm = excluded.width_nm,
                        arc_mid_x_nm = excluded.arc_mid_x_nm,
                        arc_mid_y_nm = excluded.arc_mid_y_nm,
                        locked = excluded.locked,
                        lock_owner = excluded.lock_owner,
                        rev_lamport = excluded.rev_lamport,
                        deleted = excluded.deleted;",
                    params![
                        meta.id,
                        meta.board_id,
                        net_id,
                        layer_name,
                        x1_nm,
                        y1_nm,
                        x2_nm,
                        y2_nm,
                        width_nm,
                        arc_x,
                        arc_y,
                        meta.lock.provenance.to_string(),
                        locked_val,
                        meta.lock.lock_owner,
                        meta.rev_lamport,
                        deleted_val,
                    ],
                )?;

                Ok(HardwarePatchOp::DeleteEntity {
                    entity_type: "trace".into(),
                    entity_id: meta.id.clone(),
                })
            }
            HardwareEntity::Via {
                meta,
                net_id,
                x_nm,
                y_nm,
                drill_nm,
                diameter_nm,
                start_layer,
                end_layer,
                via_kind,
            } => {
                let locked_val = if meta.lock.locked { 1 } else { 0 };
                let deleted_val = if meta.deleted { 1 } else { 0 };

                tx.execute(
                    "INSERT INTO vias (
                        id, board_id, net_id, x_nm, y_nm,
                        drill_nm, diameter_nm, start_layer, end_layer, via_kind,
                        provenance, locked, lock_owner, rev_lamport, deleted
                    ) VALUES (
                        ?1, ?2, ?3, ?4, ?5,
                        ?6, ?7, ?8, ?9, ?10,
                        ?11, ?12, ?13, ?14, ?15
                    )
                    ON CONFLICT(id) DO UPDATE SET
                        net_id = excluded.net_id,
                        x_nm = excluded.x_nm,
                        y_nm = excluded.y_nm,
                        drill_nm = excluded.drill_nm,
                        diameter_nm = excluded.diameter_nm,
                        start_layer = excluded.start_layer,
                        end_layer = excluded.end_layer,
                        via_kind = excluded.via_kind,
                        locked = excluded.locked,
                        lock_owner = excluded.lock_owner,
                        rev_lamport = excluded.rev_lamport,
                        deleted = excluded.deleted;",
                    params![
                        meta.id,
                        meta.board_id,
                        net_id,
                        x_nm,
                        y_nm,
                        drill_nm,
                        diameter_nm,
                        start_layer,
                        end_layer,
                        via_kind,
                        meta.lock.provenance.to_string(),
                        locked_val,
                        meta.lock.lock_owner,
                        meta.rev_lamport,
                        deleted_val,
                    ],
                )?;

                Ok(HardwarePatchOp::DeleteEntity {
                    entity_type: "via".into(),
                    entity_id: meta.id.clone(),
                })
            }
            HardwareEntity::CopperZone {
                meta,
                net_id,
                layer_name,
                zone_kind,
                polygon_nm,
                priority,
                clearance_nm,
                thermal_relief,
            } => {
                let locked_val = if meta.lock.locked { 1 } else { 0 };
                let deleted_val = if meta.deleted { 1 } else { 0 };
                let relief_val = if *thermal_relief { 1 } else { 0 };
                let poly_json = serde_json::to_string(polygon_nm)?;

                tx.execute(
                    "INSERT INTO copper_zones (
                        id, board_id, net_id, layer_name, zone_kind,
                        polygon_nm_json, priority, clearance_nm, thermal_relief,
                        provenance, locked, lock_owner, rev_lamport, deleted
                    ) VALUES (
                        ?1, ?2, ?3, ?4, ?5,
                        ?6, ?7, ?8, ?9,
                        ?10, ?11, ?12, ?13, ?14
                    )
                    ON CONFLICT(id) DO UPDATE SET
                        net_id = excluded.net_id,
                        layer_name = excluded.layer_name,
                        zone_kind = excluded.zone_kind,
                        polygon_nm_json = excluded.polygon_nm_json,
                        priority = excluded.priority,
                        clearance_nm = excluded.clearance_nm,
                        thermal_relief = excluded.thermal_relief,
                        locked = excluded.locked,
                        lock_owner = excluded.lock_owner,
                        rev_lamport = excluded.rev_lamport,
                        deleted = excluded.deleted;",
                    params![
                        meta.id,
                        meta.board_id,
                        net_id,
                        layer_name,
                        zone_kind,
                        poly_json,
                        priority,
                        clearance_nm,
                        relief_val,
                        meta.lock.provenance.to_string(),
                        locked_val,
                        meta.lock.lock_owner,
                        meta.rev_lamport,
                        deleted_val,
                    ],
                )?;

                Ok(HardwarePatchOp::DeleteEntity {
                    entity_type: "copper_zone".into(),
                    entity_id: meta.id.clone(),
                })
            }
        },
        HardwarePatchOp::MoveComponent {
            component_id,
            x_nm,
            y_nm,
            rot_mdeg,
            side,
        } => {
            // Get previous position
            let (old_x, old_y, old_rot, old_side): (Nm, Nm, Mdeg, String) = tx.query_row(
                "SELECT x_nm, y_nm, rot_mdeg, side FROM components WHERE id = ?1;",
                params![component_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )?;

            tx.execute(
                "UPDATE components 
                 SET x_nm = ?1, y_nm = ?2, rot_mdeg = ?3, side = ?4, rev_lamport = rev_lamport + 1 
                 WHERE id = ?5;",
                params![x_nm, y_nm, rot_mdeg, side, component_id],
            )?;

            Ok(HardwarePatchOp::MoveComponent {
                component_id: component_id.clone(),
                x_nm: old_x,
                y_nm: old_y,
                rot_mdeg: old_rot,
                side: old_side,
            })
        }
        HardwarePatchOp::DeleteEntity {
            entity_type,
            entity_id,
        } => {
            let table = match entity_type.as_str() {
                "component" => "components",
                "net" => "nets",
                "trace" => "traces",
                "via" => "vias",
                "copper_zone" => "copper_zones",
                _ => return Err(HwIrError::InvalidPatch(format!("Unknown entity type: {}", entity_type))),
            };

            let sql = format!("UPDATE {} SET deleted = 1, rev_lamport = rev_lamport + 1 WHERE id = ?1;", table);
            tx.execute(&sql, params![entity_id])?;

            Ok(HardwarePatchOp::SetLock {
                entity_type: entity_type.clone(),
                entity_id: entity_id.clone(),
                locked: false,
                reason: None,
            })
        }
        HardwarePatchOp::BindPinNet { pin_id, net_id } => {
            let prev_net: Option<EntityId> = tx
                .query_row(
                    "SELECT net_id FROM pin_net_bindings WHERE pin_id = ?1;",
                    params![pin_id],
                    |r| r.get(0),
                )
                .optional()?;

            match net_id {
                Some(nid) => {
                    let binding_id = uuid::Uuid::now_v7().to_string();
                    tx.execute(
                        "INSERT INTO pin_net_bindings (id, pin_id, net_id, provenance, locked, rev_lamport, deleted)
                         VALUES (?1, ?2, ?3, 'human', 0, 1, 0)
                         ON CONFLICT(pin_id) DO UPDATE SET net_id = excluded.net_id, deleted = 0;",
                        params![binding_id, pin_id, nid],
                    )?;
                }
                None => {
                    tx.execute(
                        "UPDATE pin_net_bindings SET deleted = 1 WHERE pin_id = ?1;",
                        params![pin_id],
                    )?;
                }
            }

            Ok(HardwarePatchOp::BindPinNet {
                pin_id: pin_id.clone(),
                net_id: prev_net,
            })
        }
        HardwarePatchOp::SwapPins {
            pin_a_id,
            pin_b_id,
            sync_firmware,
        } => {
            let net_a: Option<EntityId> = tx
                .query_row(
                    "SELECT net_id FROM pin_net_bindings WHERE pin_id = ?1 AND deleted = 0;",
                    params![pin_a_id],
                    |r| r.get(0),
                )
                .optional()?;

            let net_b: Option<EntityId> = tx
                .query_row(
                    "SELECT net_id FROM pin_net_bindings WHERE pin_id = ?1 AND deleted = 0;",
                    params![pin_b_id],
                    |r| r.get(0),
                )
                .optional()?;

            // Perform swap
            if let Some(ref na) = net_a {
                tx.execute(
                    "UPDATE pin_net_bindings SET net_id = ?1 WHERE pin_id = ?2;",
                    params![na, pin_b_id],
                )?;
            }
            if let Some(ref nb) = net_b {
                tx.execute(
                    "UPDATE pin_net_bindings SET net_id = ?1 WHERE pin_id = ?2;",
                    params![nb, pin_a_id],
                )?;
            }

            Ok(HardwarePatchOp::SwapPins {
                pin_a_id: pin_b_id.clone(),
                pin_b_id: pin_a_id.clone(),
                sync_firmware: *sync_firmware,
            })
        }
        HardwarePatchOp::SetLock {
            entity_type,
            entity_id,
            locked,
            reason,
        } => {
            let table = match entity_type.as_str() {
                "component" => "components",
                "trace" => "traces",
                "copper_zone" => "copper_zones",
                "board" => "boards",
                _ => return Err(HwIrError::InvalidPatch(format!("Lock not supported on {}", entity_type))),
            };

            let locked_int = if *locked { 1 } else { 0 };
            let sql = format!(
                "UPDATE {} SET locked = ?1, lock_reason = ?2, rev_lamport = rev_lamport + 1 WHERE id = ?3;",
                table
            );
            tx.execute(&sql, params![locked_int, reason, entity_id])?;

            Ok(HardwarePatchOp::SetLock {
                entity_type: entity_type.clone(),
                entity_id: entity_id.clone(),
                locked: !locked,
                reason: None,
            })
        }
        HardwarePatchOp::UpsertConstraint { constraint } => {
            let expr_json = serde_json::to_string(&constraint.expression)?;
            let locked_val = if constraint.lock.locked { 1 } else { 0 };

            tx.execute(
                "INSERT INTO electrical_constraints (
                    id, project_id, requirement_uid, constraint_kind,
                    target_entity_id, expression_json, severity,
                    provenance, locked, rev_lamport
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                ON CONFLICT(id) DO UPDATE SET
                    requirement_uid = excluded.requirement_uid,
                    constraint_kind = excluded.constraint_kind,
                    target_entity_id = excluded.target_entity_id,
                    expression_json = excluded.expression_json,
                    severity = excluded.severity,
                    locked = excluded.locked,
                    rev_lamport = excluded.rev_lamport;",
                params![
                    constraint.id,
                    constraint.project_id,
                    constraint.requirement_uid,
                    constraint.constraint_kind,
                    constraint.target_entity_id,
                    expr_json,
                    constraint.severity,
                    constraint.lock.provenance.to_string(),
                    locked_val,
                    constraint.rev_lamport,
                ],
            )?;

            Ok(HardwarePatchOp::DeleteEntity {
                entity_type: "electrical_constraint".into(),
                entity_id: constraint.id.clone(),
            })
        }
        HardwarePatchOp::SyncFirmwarePin {
            mcu_component_id,
            pin_id,
            peripheral_instance,
            signal_alias,
            gpio_mode,
        } => {
            let binding_id = uuid::Uuid::now_v7().to_string();
            // Get board_id
            let board_id: String = tx.query_row(
                "SELECT board_id FROM components WHERE id = ?1;",
                params![mcu_component_id],
                |r| r.get(0),
            )?;

            tx.execute(
                "INSERT INTO firmware_pinmux (
                    id, board_id, mcu_component_id, pin_id,
                    peripheral_instance, signal_alias, gpio_mode,
                    hal_target, locked, rev_lamport
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'c_header', 0, 1)
                ON CONFLICT(mcu_component_id, pin_id) DO UPDATE SET
                    peripheral_instance = excluded.peripheral_instance,
                    signal_alias = excluded.signal_alias,
                    gpio_mode = excluded.gpio_mode,
                    rev_lamport = excluded.rev_lamport + 1;",
                params![
                    binding_id,
                    board_id,
                    mcu_component_id,
                    pin_id,
                    peripheral_instance,
                    signal_alias,
                    gpio_mode,
                ],
            )?;

            Ok(HardwarePatchOp::DeleteEntity {
                entity_type: "firmware_pinmux".into(),
                entity_id: binding_id,
            })
        }
    }
}
