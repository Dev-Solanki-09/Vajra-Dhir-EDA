PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA temp_store = MEMORY;
PRAGMA application_id = 0x56444952; -- 'VDIR'
PRAGMA user_version = 1;

CREATE TABLE IF NOT EXISTS projects (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    domain              TEXT NOT NULL CHECK(domain IN ('pcb','ic_digital','ic_analog','fpga','electrical_power','multidomain')),
    dlp_class           TEXT NOT NULL DEFAULT 'NDA_AIRGAPPED'
                        CHECK(dlp_class IN ('PUBLIC_OPEN','PRIVATE_CLOUD_OK','NDA_AIRGAPPED')),
    autonomy_level      TEXT NOT NULL DEFAULT 'L3_GATE_COPILOT'
                        CHECK(autonomy_level IN ('L1_MANUAL_ASSIST','L2_STEP_COPILOT','L3_GATE_COPILOT','L4_SUPERVISED_AUTO','L5_FULL_AUTO')),
    current_gate        TEXT NOT NULL DEFAULT 'G2_ARCH_SYMBOLIC',
    target_fab_or_pdk   TEXT NOT NULL,
    max_bom_cost_usd    REAL NOT NULL DEFAULT 25.0,
    ambient_temp_max_c  REAL NOT NULL DEFAULT 40.0,
    rev_lamport         INTEGER NOT NULL DEFAULT 1,
    created_at_utc      TEXT NOT NULL,
    updated_at_utc      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS boards (
    id                  TEXT PRIMARY KEY,
    project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    board_kind          TEXT NOT NULL DEFAULT 'rigid_pcb',
    width_nm            INTEGER NOT NULL,
    height_nm           INTEGER NOT NULL,
    thickness_nm        INTEGER NOT NULL DEFAULT 1600000,
    layer_count         INTEGER NOT NULL DEFAULT 4,
    provenance          TEXT NOT NULL CHECK(provenance IN ('human','agent','cubo','import','compiler')),
    locked              INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1)),
    rev_lamport         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS net_classes (
    id                  TEXT PRIMARY KEY,
    board_id            TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    trace_width_nm      INTEGER NOT NULL,
    min_width_nm        INTEGER NOT NULL,
    clearance_nm        INTEGER NOT NULL,
    via_drill_nm        INTEGER NOT NULL,
    via_diameter_nm     INTEGER NOT NULL,
    working_voltage_v   REAL NOT NULL DEFAULT 5.0,
    UNIQUE(board_id, name)
);

CREATE TABLE IF NOT EXISTS components (
    id                  TEXT PRIMARY KEY,
    board_id            TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    refdes              TEXT NOT NULL,
    value_str           TEXT NOT NULL,
    mpn                 TEXT NOT NULL,
    package_name        TEXT NOT NULL,
    footprint_ref       TEXT NOT NULL,
    functional_group    TEXT NOT NULL DEFAULT 'general',
    x_nm                INTEGER NOT NULL,
    y_nm                INTEGER NOT NULL,
    rot_mdeg            INTEGER NOT NULL DEFAULT 0 CHECK(rot_mdeg >= 0 AND rot_mdeg < 360000),
    side                TEXT NOT NULL DEFAULT 'top' CHECK(side IN ('top','bottom')),
    courtyard_w_nm      INTEGER NOT NULL,
    courtyard_h_nm      INTEGER NOT NULL,
    power_diss_mw       REAL NOT NULL DEFAULT 0.0,
    unit_cost_usd       REAL NOT NULL DEFAULT 0.0,
    params_json         TEXT NOT NULL DEFAULT '{}',
    provenance          TEXT NOT NULL CHECK(provenance IN ('human','agent','cubo','import','compiler')),
    locked              INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1)),
    lock_owner          TEXT,
    lock_reason         TEXT,
    rev_lamport         INTEGER NOT NULL DEFAULT 1,
    deleted             INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1)),
    UNIQUE(board_id, refdes)
);

CREATE TABLE IF NOT EXISTS nets (
    id                  TEXT PRIMARY KEY,
    board_id            TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    net_class_id        TEXT NOT NULL REFERENCES net_classes(id),
    signal_role         TEXT NOT NULL DEFAULT 'generic',
    nominal_voltage_v   REAL NOT NULL DEFAULT 0.0,
    is_high_speed       INTEGER NOT NULL DEFAULT 0 CHECK(is_high_speed IN (0,1)),
    provenance          TEXT NOT NULL CHECK(provenance IN ('human','agent','cubo','import','compiler')),
    locked              INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1)),
    rev_lamport         INTEGER NOT NULL DEFAULT 1,
    UNIQUE(board_id, name)
);

CREATE TABLE IF NOT EXISTS traces (
    id                  TEXT PRIMARY KEY,
    board_id            TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    net_id              TEXT NOT NULL REFERENCES nets(id) ON DELETE CASCADE,
    layer_name          TEXT NOT NULL,
    x1_nm               INTEGER NOT NULL,
    y1_nm               INTEGER NOT NULL,
    x2_nm               INTEGER NOT NULL,
    y2_nm               INTEGER NOT NULL,
    width_nm            INTEGER NOT NULL CHECK(width_nm > 0),
    provenance          TEXT NOT NULL CHECK(provenance IN ('human','agent','cubo','import','compiler')),
    locked              INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1)),
    lock_owner          TEXT,
    rev_lamport         INTEGER NOT NULL DEFAULT 1,
    deleted             INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1))
);

CREATE TABLE IF NOT EXISTS vias (
    id                  TEXT PRIMARY KEY,
    board_id            TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    net_id              TEXT NOT NULL REFERENCES nets(id) ON DELETE CASCADE,
    x_nm                INTEGER NOT NULL,
    y_nm                INTEGER NOT NULL,
    drill_nm            INTEGER NOT NULL CHECK(drill_nm > 0),
    diameter_nm         INTEGER NOT NULL CHECK(diameter_nm > drill_nm),
    start_layer         TEXT NOT NULL,
    end_layer           TEXT NOT NULL,
    via_kind            TEXT NOT NULL DEFAULT 'through',
    provenance          TEXT NOT NULL CHECK(provenance IN ('human','agent','cubo','import','compiler')),
    locked              INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1)),
    lock_owner          TEXT,
    rev_lamport         INTEGER NOT NULL DEFAULT 1,
    deleted             INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1))
);

CREATE TABLE IF NOT EXISTS firmware_pinmux (
    id                  TEXT PRIMARY KEY,
    board_id            TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    mcu_refdes          TEXT NOT NULL,
    pin_number          TEXT NOT NULL,
    peripheral_instance TEXT NOT NULL,
    signal_alias        TEXT NOT NULL,
    gpio_mode           TEXT NOT NULL,
    locked              INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1))
);

CREATE TABLE IF NOT EXISTS hardware_patches (
    seq_id              INTEGER PRIMARY KEY AUTOINCREMENT,
    patch_id            TEXT NOT NULL UNIQUE,
    project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    actor_kind          TEXT NOT NULL CHECK(actor_kind IN ('human','agent','compiler','import')),
    actor_id            TEXT NOT NULL,
    lamport_ts          INTEGER NOT NULL,
    summary             TEXT NOT NULL,
    forward_ops_json    TEXT NOT NULL,
    inverse_ops_json    TEXT NOT NULL,
    undone              INTEGER NOT NULL DEFAULT 0 CHECK(undone IN (0,1)),
    applied_at_utc      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS _tx_actor_ctx (
    singleton           INTEGER PRIMARY KEY CHECK(singleton = 1),
    actor_kind          TEXT NOT NULL CHECK(actor_kind IN ('human','agent','compiler','import')),
    allow_lock_override INTEGER NOT NULL DEFAULT 0 CHECK(allow_lock_override IN (0,1))
);
INSERT OR IGNORE INTO _tx_actor_ctx(singleton, actor_kind, allow_lock_override) VALUES (1, 'human', 0);

-- FAIL-CLOSED KERNEL HUMAN-LOCK TRIGGERS
CREATE TRIGGER IF NOT EXISTS trg_protect_locked_components_upd
BEFORE UPDATE ON components
WHEN OLD.locked = 1
 AND (SELECT actor_kind FROM _tx_actor_ctx WHERE singleton = 1) != 'human'
 AND (SELECT allow_lock_override FROM _tx_actor_ctx WHERE singleton = 1) = 0
BEGIN
    SELECT RAISE(ABORT, 'KERNEL_LOCK_VIOLATION: Non-human actor cannot mutate human-locked component');
END;

CREATE TRIGGER IF NOT EXISTS trg_protect_locked_components_del
BEFORE DELETE ON components
WHEN OLD.locked = 1
 AND (SELECT actor_kind FROM _tx_actor_ctx WHERE singleton = 1) != 'human'
 AND (SELECT allow_lock_override FROM _tx_actor_ctx WHERE singleton = 1) = 0
BEGIN
    SELECT RAISE(ABORT, 'KERNEL_LOCK_VIOLATION: Non-human actor cannot delete human-locked component');
END;

CREATE TRIGGER IF NOT EXISTS trg_protect_locked_traces_upd
BEFORE UPDATE ON traces
WHEN OLD.locked = 1
 AND (SELECT actor_kind FROM _tx_actor_ctx WHERE singleton = 1) != 'human'
 AND (SELECT allow_lock_override FROM _tx_actor_ctx WHERE singleton = 1) = 0
BEGIN
    SELECT RAISE(ABORT, 'KERNEL_LOCK_VIOLATION: Non-human actor cannot mutate human-locked trace');
END;

CREATE TRIGGER IF NOT EXISTS trg_protect_locked_vias_upd
BEFORE UPDATE ON vias
WHEN OLD.locked = 1
 AND (SELECT actor_kind FROM _tx_actor_ctx WHERE singleton = 1) != 'human'
 AND (SELECT allow_lock_override FROM _tx_actor_ctx WHERE singleton = 1) = 0
BEGIN
    SELECT RAISE(ABORT, 'KERNEL_LOCK_VIOLATION: Non-human actor cannot mutate human-locked via');
END;
