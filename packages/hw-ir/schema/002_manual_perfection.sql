PRAGMA foreign_keys = ON;
PRAGMA user_version = 2;

-- 1. ASSEMBLY BUILD VARIANTS (Multiple SKUs from 1 Design: Standard / Industrial / Lite)
CREATE TABLE variants (
    id                  TEXT PRIMARY KEY,              -- UUIDv7
    project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,                 -- 'Base','Industrial_-40C','No_WiFi_Lite'
    description         TEXT,
    is_default          INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0,1)),
    UNIQUE(project_id, name)
);

CREATE TABLE variant_overrides (
    variant_id          TEXT NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
    component_id        TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
    dnp_override        INTEGER CHECK(dnp_override IN (0,1)),
    override_mpn        TEXT,
    override_value_str  TEXT,
    PRIMARY KEY(variant_id, component_id)
);

-- 2. MULTI-CHANNEL LAYOUT ROOMS (Route 1 Channel -> Replicate Identically to Channels 2..N)
CREATE TABLE layout_rooms (
    id                  TEXT PRIMARY KEY,              -- UUIDv7
    board_id            TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    room_group          TEXT NOT NULL,                 -- 'bms_cell_channel', 'motor_phase'
    channel_index       INTEGER NOT NULL,
    is_template         INTEGER NOT NULL DEFAULT 0 CHECK(is_template IN (0,1)),
    origin_x_nm         INTEGER NOT NULL,
    origin_y_nm         INTEGER NOT NULL,
    rot_mdeg            INTEGER NOT NULL DEFAULT 0,
    polygon_nm_json     TEXT NOT NULL,
    locked              INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1)),
    UNIQUE(board_id, room_group, channel_index)
);

CREATE TRIGGER IF NOT EXISTS trg_protect_locked_layout_rooms_upd
BEFORE UPDATE ON layout_rooms
FOR EACH ROW
WHEN OLD.locked = 1
BEGIN
    SELECT CASE
        WHEN (SELECT actor_kind FROM _tx_actor_ctx LIMIT 1) != 'human'
        THEN RAISE(ABORT, 'KERNEL_LOCK_VIOLATION: layout_room is human-locked and cannot be modified by non-human actor')
    END;
END;

CREATE TRIGGER IF NOT EXISTS trg_protect_locked_layout_rooms_del
BEFORE DELETE ON layout_rooms
FOR EACH ROW
WHEN OLD.locked = 1
BEGIN
    SELECT CASE
        WHEN (SELECT actor_kind FROM _tx_actor_ctx LIMIT 1) != 'human'
        THEN RAISE(ABORT, 'KERNEL_LOCK_VIOLATION: layout_room is human-locked and cannot be deleted by non-human actor')
    END;
END;

-- 3. CRYPTOGRAPHICALLY SIGNED, GEOMETRY-HASH-BOUND DRC WAIVERS
-- Auto-invalidates the millisecond any waived copper/component moves by >= 1 nm!
CREATE TABLE drc_waivers (
    id                  TEXT PRIMARY KEY,              -- UUIDv7
    project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    rule_code           TEXT NOT NULL,                 -- 'clearance','shorting_items','courtyard_overlap'
    entity_ids_json     TEXT NOT NULL,                 -- Sorted UUIDv7 array
    geometry_sha256     TEXT NOT NULL,                 -- SHA-256 of exact entity coordinates & net bindings at signoff
    waived_by           TEXT NOT NULL,                 -- Engineer email / GPG key fingerprint
    justification       TEXT NOT NULL,                 -- e.g. 'Intentional RF 50-ohm net-tie bridge'
    signature_ed25519   TEXT NOT NULL,
    created_at_utc      TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','invalidated_geom_changed','revoked'))
);

-- 4. CUSTOM PADSTACKS (Thermal Paste Windowpanes, Polygon Pads, Blind/Buried/Back-Drill Vias)
CREATE TABLE padstacks (
    id                  TEXT PRIMARY KEY,              -- UUIDv7
    project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,                 -- 'QFN56_EP_3x3_Windowpane', 'uVia_L1_L2'
    pad_kind            TEXT NOT NULL CHECK(pad_kind IN ('smd','thru_hole','npth','via_stack','custom_poly')),
    layer_shapes_json   TEXT NOT NULL,                 -- Per-layer copper polygon/rect/circle + anti-pad
    paste_apertures_json TEXT,                         -- Stencil windowpane grid (e.g. 65% coverage)
    mask_expansion_nm   INTEGER NOT NULL DEFAULT 50000,
    drill_pairs_json    TEXT,                          -- [[start_layer, end_layer, drill_nm, backdrill_stop]]
    UNIQUE(project_id, name)
);

-- 5. SAVED SELECTION FILTER QUERIES & DRAFTSMAN FABRICATION DRAWINGS
CREATE TABLE selection_queries (
    id                  TEXT PRIMARY KEY,
    project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,                 -- 'Thin Power Traces'
    query_expr          TEXT NOT NULL                  -- "NetClass == 'PWR_3V3' && Width < 400000"
);

CREATE TABLE fab_drawings (
    id                  TEXT PRIMARY KEY,
    board_id            TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    sheet_title         TEXT NOT NULL,                 -- 'FAB-01 Fabrication Drawing', 'ASSY-01 Top Assembly'
    ipc_class           TEXT NOT NULL DEFAULT 'IPC-6012 Class 2',
    annotations_json    TEXT NOT NULL,                 -- Parametric dimensions anchored to HW-IR UUIDs
    title_block_json    TEXT NOT NULL,                 -- Rev, DrawnBy, ApprovedBy, Scale, FabNotes
    rev_lamport         INTEGER NOT NULL DEFAULT 1
);
