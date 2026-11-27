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

CREATE TRIGGER IF NOT EXISTS trg_protect_locked_traces_del
BEFORE DELETE ON traces
WHEN OLD.locked = 1
 AND (SELECT actor_kind FROM _tx_actor_ctx WHERE singleton = 1) != 'human'
 AND (SELECT allow_lock_override FROM _tx_actor_ctx WHERE singleton = 1) = 0
BEGIN
    SELECT RAISE(ABORT, 'KERNEL_LOCK_VIOLATION: Non-human actor cannot delete human-locked trace');
END;

CREATE TRIGGER IF NOT EXISTS trg_protect_locked_vias_upd
BEFORE UPDATE ON vias
WHEN OLD.locked = 1
 AND (SELECT actor_kind FROM _tx_actor_ctx WHERE singleton = 1) != 'human'
 AND (SELECT allow_lock_override FROM _tx_actor_ctx WHERE singleton = 1) = 0
BEGIN
    SELECT RAISE(ABORT, 'KERNEL_LOCK_VIOLATION: Non-human actor cannot mutate human-locked via');
END;

CREATE TRIGGER IF NOT EXISTS trg_protect_locked_vias_del
BEFORE DELETE ON vias
WHEN OLD.locked = 1
 AND (SELECT actor_kind FROM _tx_actor_ctx WHERE singleton = 1) != 'human'
 AND (SELECT allow_lock_override FROM _tx_actor_ctx WHERE singleton = 1) = 0
BEGIN
    SELECT RAISE(ABORT, 'KERNEL_LOCK_VIOLATION: Non-human actor cannot delete human-locked via');
END;

CREATE TABLE IF NOT EXISTS component_pins (
    id                  TEXT PRIMARY KEY,
    component_id        TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
    pin_number          TEXT NOT NULL,
    pin_name            TEXT NOT NULL,
    elec_type           TEXT NOT NULL DEFAULT 'passive',
    max_voltage_v       REAL,
    min_voltage_v       REAL,
    x_offset_nm         INTEGER NOT NULL DEFAULT 0,
    y_offset_nm         INTEGER NOT NULL DEFAULT 0,
    UNIQUE(component_id, pin_number)
);

CREATE TABLE IF NOT EXISTS pin_net_bindings (
    id                  TEXT PRIMARY KEY,
    pin_id              TEXT NOT NULL REFERENCES component_pins(id) ON DELETE CASCADE,
    net_id              TEXT NOT NULL REFERENCES nets(id) ON DELETE CASCADE,
    provenance          TEXT NOT NULL CHECK(provenance IN ('human','agent','cubo','import','compiler')),
    locked              INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1)),
    rev_lamport         INTEGER NOT NULL DEFAULT 1,
    UNIQUE(pin_id)
);

CREATE TABLE IF NOT EXISTS copper_zones (
    id                  TEXT PRIMARY KEY,
    board_id            TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    net_id              TEXT REFERENCES nets(id) ON DELETE CASCADE,
    layer_name          TEXT NOT NULL,
    zone_kind           TEXT NOT NULL DEFAULT 'pour',
    polygon_nm_json     TEXT NOT NULL,
    clearance_nm        INTEGER NOT NULL DEFAULT 200000,
    provenance          TEXT NOT NULL CHECK(provenance IN ('human','agent','cubo','import','compiler')),
    locked              INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1)),
    rev_lamport         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS mcad_keepouts (
    id                  TEXT PRIMARY KEY,
    board_id            TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    side                TEXT NOT NULL DEFAULT 'top',
    polygon_nm_json     TEXT NOT NULL,
    max_height_nm       INTEGER NOT NULL DEFAULT 10000000,
    locked              INTEGER NOT NULL DEFAULT 1 CHECK(locked IN (0,1)),
    rev_lamport         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS electrical_constraints (
    id                  TEXT PRIMARY KEY,
    project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    constraint_kind     TEXT NOT NULL,
    target_entity_id    TEXT NOT NULL,
    expression_json     TEXT NOT NULL,
    severity            TEXT NOT NULL DEFAULT 'error',
    provenance          TEXT NOT NULL DEFAULT 'human',
    locked              INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1)),
    rev_lamport         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS layout_rooms (
    id                  TEXT PRIMARY KEY,
    board_id            TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    polygon_nm_json     TEXT NOT NULL,
    provenance          TEXT NOT NULL DEFAULT 'human',
    locked              INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1)),
    rev_lamport         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS variants (
    id                  TEXT PRIMARY KEY,
    project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    description         TEXT NOT NULL DEFAULT '',
    UNIQUE(project_id, name)
);

CREATE TABLE IF NOT EXISTS variant_overrides (
    id                  TEXT PRIMARY KEY,
    variant_id          TEXT NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
    component_id        TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
    dnp                 INTEGER NOT NULL DEFAULT 0 CHECK(dnp IN (0,1)),
    override_value      TEXT,
    override_mpn        TEXT,
    UNIQUE(variant_id, component_id)
);

CREATE TABLE IF NOT EXISTS drc_waivers (
    id                  TEXT PRIMARY KEY,
    board_id            TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    rule_id             TEXT NOT NULL,
    entity_id           TEXT NOT NULL,
    reason              TEXT NOT NULL,
    waived_by           TEXT NOT NULL DEFAULT 'human',
    created_at_utc      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS padstacks (
    id                  TEXT PRIMARY KEY,
    board_id            TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    shape               TEXT NOT NULL DEFAULT 'rect',
    width_nm            INTEGER NOT NULL,
    height_nm           INTEGER NOT NULL,
    drill_nm            INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS selection_queries (
    id                  TEXT PRIMARY KEY,
    project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    query_expr          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fab_drawings (
    id                  TEXT PRIMARY KEY,
    board_id            TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    title               TEXT NOT NULL,
    notes_json          TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS schema_migrations (
    version             INTEGER PRIMARY KEY,
    applied_at_utc      TEXT NOT NULL
);
INSERT OR IGNORE INTO schema_migrations(version, applied_at_utc) VALUES (1, '2026-11-27T00:00:00Z');

CREATE TRIGGER IF NOT EXISTS trg_protect_locked_boards_upd
BEFORE UPDATE ON boards
WHEN OLD.locked = 1 AND (SELECT actor_kind FROM _tx_actor_ctx WHERE singleton = 1) != 'human' AND (SELECT allow_lock_override FROM _tx_actor_ctx WHERE singleton = 1) = 0
BEGIN SELECT RAISE(ABORT, 'KERNEL_LOCK_VIOLATION: Non-human actor cannot mutate human-locked board'); END;

CREATE TRIGGER IF NOT EXISTS trg_protect_locked_boards_del
BEFORE DELETE ON boards
WHEN OLD.locked = 1 AND (SELECT actor_kind FROM _tx_actor_ctx WHERE singleton = 1) != 'human' AND (SELECT allow_lock_override FROM _tx_actor_ctx WHERE singleton = 1) = 0
BEGIN SELECT RAISE(ABORT, 'KERNEL_LOCK_VIOLATION: Non-human actor cannot delete human-locked board'); END;

CREATE TRIGGER IF NOT EXISTS trg_protect_locked_nets_upd
BEFORE UPDATE ON nets
WHEN OLD.locked = 1 AND (SELECT actor_kind FROM _tx_actor_ctx WHERE singleton = 1) != 'human' AND (SELECT allow_lock_override FROM _tx_actor_ctx WHERE singleton = 1) = 0
BEGIN SELECT RAISE(ABORT, 'KERNEL_LOCK_VIOLATION: Non-human actor cannot mutate human-locked net'); END;

CREATE TRIGGER IF NOT EXISTS trg_protect_locked_nets_del
BEFORE DELETE ON nets
WHEN OLD.locked = 1 AND (SELECT actor_kind FROM _tx_actor_ctx WHERE singleton = 1) != 'human' AND (SELECT allow_lock_override FROM _tx_actor_ctx WHERE singleton = 1) = 0
BEGIN SELECT RAISE(ABORT, 'KERNEL_LOCK_VIOLATION: Non-human actor cannot delete human-locked net'); END;

CREATE TRIGGER IF NOT EXISTS trg_protect_locked_pin_net_bindings_upd
BEFORE UPDATE ON pin_net_bindings
WHEN OLD.locked = 1 AND (SELECT actor_kind FROM _tx_actor_ctx WHERE singleton = 1) != 'human' AND (SELECT allow_lock_override FROM _tx_actor_ctx WHERE singleton = 1) = 0
BEGIN SELECT RAISE(ABORT, 'KERNEL_LOCK_VIOLATION: Non-human actor cannot mutate human-locked pin_net_binding'); END;

CREATE TRIGGER IF NOT EXISTS trg_protect_locked_pin_net_bindings_del
BEFORE DELETE ON pin_net_bindings
WHEN OLD.locked = 1 AND (SELECT actor_kind FROM _tx_actor_ctx WHERE singleton = 1) != 'human' AND (SELECT allow_lock_override FROM _tx_actor_ctx WHERE singleton = 1) = 0
BEGIN SELECT RAISE(ABORT, 'KERNEL_LOCK_VIOLATION: Non-human actor cannot delete human-locked pin_net_binding'); END;

CREATE TRIGGER IF NOT EXISTS trg_protect_locked_copper_zones_upd
BEFORE UPDATE ON copper_zones
WHEN OLD.locked = 1 AND (SELECT actor_kind FROM _tx_actor_ctx WHERE singleton = 1) != 'human' AND (SELECT allow_lock_override FROM _tx_actor_ctx WHERE singleton = 1) = 0
BEGIN SELECT RAISE(ABORT, 'KERNEL_LOCK_VIOLATION: Non-human actor cannot mutate human-locked copper_zone'); END;

CREATE TRIGGER IF NOT EXISTS trg_protect_locked_copper_zones_del
BEFORE DELETE ON copper_zones
WHEN OLD.locked = 1 AND (SELECT actor_kind FROM _tx_actor_ctx WHERE singleton = 1) != 'human' AND (SELECT allow_lock_override FROM _tx_actor_ctx WHERE singleton = 1) = 0
BEGIN SELECT RAISE(ABORT, 'KERNEL_LOCK_VIOLATION: Non-human actor cannot delete human-locked copper_zone'); END;

CREATE TRIGGER IF NOT EXISTS trg_protect_locked_mcad_keepouts_upd
BEFORE UPDATE ON mcad_keepouts
WHEN OLD.locked = 1 AND (SELECT actor_kind FROM _tx_actor_ctx WHERE singleton = 1) != 'human' AND (SELECT allow_lock_override FROM _tx_actor_ctx WHERE singleton = 1) = 0
BEGIN SELECT RAISE(ABORT, 'KERNEL_LOCK_VIOLATION: Non-human actor cannot mutate human-locked mcad_keepout'); END;

CREATE TRIGGER IF NOT EXISTS trg_protect_locked_mcad_keepouts_del
BEFORE DELETE ON mcad_keepouts
WHEN OLD.locked = 1 AND (SELECT actor_kind FROM _tx_actor_ctx WHERE singleton = 1) != 'human' AND (SELECT allow_lock_override FROM _tx_actor_ctx WHERE singleton = 1) = 0
BEGIN SELECT RAISE(ABORT, 'KERNEL_LOCK_VIOLATION: Non-human actor cannot delete human-locked mcad_keepout'); END;

CREATE TRIGGER IF NOT EXISTS trg_protect_locked_electrical_constraints_upd
BEFORE UPDATE ON electrical_constraints
WHEN OLD.locked = 1 AND (SELECT actor_kind FROM _tx_actor_ctx WHERE singleton = 1) != 'human' AND (SELECT allow_lock_override FROM _tx_actor_ctx WHERE singleton = 1) = 0
BEGIN SELECT RAISE(ABORT, 'KERNEL_LOCK_VIOLATION: Non-human actor cannot mutate human-locked electrical_constraint'); END;

CREATE TRIGGER IF NOT EXISTS trg_protect_locked_electrical_constraints_del
BEFORE DELETE ON electrical_constraints
WHEN OLD.locked = 1 AND (SELECT actor_kind FROM _tx_actor_ctx WHERE singleton = 1) != 'human' AND (SELECT allow_lock_override FROM _tx_actor_ctx WHERE singleton = 1) = 0
BEGIN SELECT RAISE(ABORT, 'KERNEL_LOCK_VIOLATION: Non-human actor cannot delete human-locked electrical_constraint'); END;

CREATE TRIGGER IF NOT EXISTS trg_protect_locked_firmware_pinmux_upd
BEFORE UPDATE ON firmware_pinmux
WHEN OLD.locked = 1 AND (SELECT actor_kind FROM _tx_actor_ctx WHERE singleton = 1) != 'human' AND (SELECT allow_lock_override FROM _tx_actor_ctx WHERE singleton = 1) = 0
BEGIN SELECT RAISE(ABORT, 'KERNEL_LOCK_VIOLATION: Non-human actor cannot mutate human-locked firmware_pinmux'); END;

CREATE TRIGGER IF NOT EXISTS trg_protect_locked_firmware_pinmux_del
BEFORE DELETE ON firmware_pinmux
WHEN OLD.locked = 1 AND (SELECT actor_kind FROM _tx_actor_ctx WHERE singleton = 1) != 'human' AND (SELECT allow_lock_override FROM _tx_actor_ctx WHERE singleton = 1) = 0
BEGIN SELECT RAISE(ABORT, 'KERNEL_LOCK_VIOLATION: Non-human actor cannot delete human-locked firmware_pinmux'); END;

CREATE TRIGGER IF NOT EXISTS trg_protect_locked_layout_rooms_upd
BEFORE UPDATE ON layout_rooms
WHEN OLD.locked = 1 AND (SELECT actor_kind FROM _tx_actor_ctx WHERE singleton = 1) != 'human' AND (SELECT allow_lock_override FROM _tx_actor_ctx WHERE singleton = 1) = 0
BEGIN SELECT RAISE(ABORT, 'KERNEL_LOCK_VIOLATION: Non-human actor cannot mutate human-locked layout_room'); END;

CREATE TRIGGER IF NOT EXISTS trg_protect_locked_layout_rooms_del
BEFORE DELETE ON layout_rooms
WHEN OLD.locked = 1 AND (SELECT actor_kind FROM _tx_actor_ctx WHERE singleton = 1) != 'human' AND (SELECT allow_lock_override FROM _tx_actor_ctx WHERE singleton = 1) = 0
BEGIN SELECT RAISE(ABORT, 'KERNEL_LOCK_VIOLATION: Non-human actor cannot delete human-locked layout_room'); END;
