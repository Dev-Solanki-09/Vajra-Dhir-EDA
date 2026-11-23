PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA temp_store = MEMORY;
PRAGMA application_id = 0x56444952; -- 'VDIR'
PRAGMA user_version = 1;

-- ============================================================================
-- 1. PROJECT, DLP GOVERNANCE & REPRODUCIBILITY LOCK
-- ============================================================================
CREATE TABLE projects (
    id                  TEXT PRIMARY KEY,              -- UUIDv7
    name                TEXT NOT NULL,
    domain              TEXT NOT NULL CHECK(domain IN ('pcb','ic_digital','ic_analog','ic_photonic','fpga','electrical_power','multidomain')),
    dlp_class           TEXT NOT NULL DEFAULT 'PRIVATE_CLOUD_OK'
                        CHECK(dlp_class IN ('PUBLIC_OPEN','PRIVATE_CLOUD_OK','NDA_AIRGAPPED')),
    autonomy_level      TEXT NOT NULL DEFAULT 'L3_GATE_COPILOT'
                        CHECK(autonomy_level IN ('L1_MANUAL_ASSIST','L2_STEP_COPILOT','L3_GATE_COPILOT','L4_SUPERVISED_AUTO','L5_FULL_AUTO')),
    current_gate        TEXT NOT NULL DEFAULT 'G0_INIT',
    target_fab_or_pdk   TEXT NOT NULL,                 -- e.g. 'jlcpcb_4l_7628', 'sky130A', 'ihp_sg13g2'
    max_bom_cost_usd    REAL,
    ambient_temp_min_c  REAL NOT NULL DEFAULT 0.0,
    ambient_temp_max_c  REAL NOT NULL DEFAULT 50.0,
    spec_contract_json  TEXT NOT NULL,                 -- Gate 1 locked JSON requirements
    rev_lamport         INTEGER NOT NULL DEFAULT 1,
    created_at_utc      TEXT NOT NULL,
    updated_at_utc      TEXT NOT NULL
);

CREATE TABLE hw_lock (
    lock_id             TEXT PRIMARY KEY,              -- UUIDv7
    project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    tool_or_artifact    TEXT NOT NULL,                 -- 'pack-2a', 'jlcparts-db', 'sky130A', 'cubo:usb_pd_buck_3v3_3a'
    version_semver      TEXT NOT NULL,
    oci_or_file_sha256  TEXT NOT NULL,
    rng_seed            INTEGER NOT NULL DEFAULT 42,
    license_spdx        TEXT NOT NULL,
    pinned_at_utc       TEXT NOT NULL,
    UNIQUE(project_id, tool_or_artifact)
);

-- ============================================================================
-- 2. MULTI-BOARD / DIE TOPOLOGY & STACKUP
-- ============================================================================
CREATE TABLE boards (
    id                  TEXT PRIMARY KEY,              -- UUIDv7
    project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,                 -- 'main_pcb', 'sensor_flex', 'die_top'
    board_kind          TEXT NOT NULL CHECK(board_kind IN ('rigid_pcb','flex_fpc','rigid_flex','ic_die','control_panel')),
    outline_polygon_nm  TEXT NOT NULL,                 -- JSON array of [x_nm, y_nm] closed ring
    thickness_nm        INTEGER NOT NULL DEFAULT 1600000,
    layer_count         INTEGER NOT NULL DEFAULT 4,
    provenance          TEXT NOT NULL CHECK(provenance IN ('human','agent','cubo','import','compiler')),
    locked              INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1)),
    lock_owner          TEXT,
    rev_lamport         INTEGER NOT NULL DEFAULT 1,
    deleted             INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1))
);

CREATE TABLE stackup_layers (
    id                  TEXT PRIMARY KEY,              -- UUIDv7
    board_id            TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    layer_index         INTEGER NOT NULL,              -- 0 = top outer
    canonical_name      TEXT NOT NULL,                 -- 'F.Cu','In1.Cu','In2.Cu','B.Cu','met1','met2'
    layer_role          TEXT NOT NULL CHECK(layer_role IN ('signal','plane_gnd','plane_pwr','mixed','dielectric','soldermask','silkscreen','metal_ic','poly_ic')),
    thickness_nm        INTEGER NOT NULL,
    material            TEXT NOT NULL,                 -- 'FR4_7628','Copper_1oz','SiO2'
    dk_er               REAL,                          -- Relative permittivity (dielectric layers)
    df_tand             REAL,                          -- Loss tangent
    copper_roughness_nm INTEGER,                       -- Huray / Hammerstad RMS roughness
    UNIQUE(board_id, layer_index)
);

-- ============================================================================
-- 3. ZERO-HALLUCINATION CRYPTOGRAPHIC DATASHEET EVIDENCE LEDGER
-- ============================================================================
CREATE TABLE datasheet_documents (
    pdf_sha256          TEXT PRIMARY KEY,              -- Strictly local cache reference; NO PDF bytes stored in Git
    mpn                 TEXT NOT NULL,
    manufacturer        TEXT NOT NULL,
    doc_kind            TEXT NOT NULL CHECK(doc_kind IN ('datasheet','errata','appnote','package_drawing','pdk_manual')),
    source_url          TEXT,
    page_count          INTEGER NOT NULL,
    local_rel_path      TEXT NOT NULL,                 -- Relative to user local ~/.vajradhir/datasheets/
    ingested_at_utc     TEXT NOT NULL
);

CREATE TABLE datasheet_citations (
    id                  TEXT PRIMARY KEY,              -- UUIDv7
    pdf_sha256          TEXT NOT NULL REFERENCES datasheet_documents(pdf_sha256),
    page_num            INTEGER NOT NULL CHECK(page_num >= 1),
    bbox_norm_json      TEXT NOT NULL,                 -- [x0, y0, x1, y1] normalized 0.0..1.0
    crop_png_sha256     TEXT NOT NULL,                 -- Hash of 300-600 dpi audit crop
    extracted_fact_json TEXT NOT NULL,                 -- Structured typed pin/limit table
    verified_by_auditor TEXT NOT NULL,                 -- Auditor run ID or 'human:<uid>'
    verified_at_utc     TEXT NOT NULL
);

-- ============================================================================
-- 4. COMPONENTS, PINS & NETS (CORE SEMANTIC + PHYSICAL GRAPH)
-- ============================================================================
CREATE TABLE net_classes (
    id                  TEXT PRIMARY KEY,              -- UUIDv7
    board_id            TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,                 -- 'Default','PWR_3V3','USB_DIFF_90','RF_50OHM','MAINS_230V'
    trace_width_nm      INTEGER NOT NULL,
    min_width_nm        INTEGER NOT NULL,
    clearance_nm        INTEGER NOT NULL,
    via_drill_nm        INTEGER NOT NULL,
    via_diameter_nm     INTEGER NOT NULL,
    diff_pair_width_nm  INTEGER,
    diff_pair_gap_nm    INTEGER,
    target_z0_ohm       REAL,
    target_zdiff_ohm    REAL,
    max_skew_ps         REAL,
    max_current_ma      REAL,
    working_voltage_v   REAL NOT NULL DEFAULT 5.0,
    creepage_nm         INTEGER,                       -- IPC-2221 / IEC 62368
    provenance          TEXT NOT NULL CHECK(provenance IN ('human','agent','cubo','import','compiler')),
    locked              INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1)),
    rev_lamport         INTEGER NOT NULL DEFAULT 1,
    UNIQUE(board_id, name)
);

CREATE TABLE components (
    id                  TEXT PRIMARY KEY,              -- UUIDv7
    board_id            TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    refdes              TEXT NOT NULL,                 -- 'U1','R12','C4'
    value_str           TEXT NOT NULL,                 -- '10uF 16V X7R 0603'
    mpn                 TEXT,
    lcsc_part           TEXT,
    manufacturer        TEXT,
    package_name        TEXT NOT NULL,                 -- 'QFN-56-1EP_7x7mm_P0.4mm'
    footprint_ref       TEXT NOT NULL,                 -- 'Package_DFN_QFN:QFN-56-1EP_7x7mm'
    symbol_ref          TEXT NOT NULL,
    cubo_instance_id    TEXT,                          -- Non-null if instantiated from Open-CUBO
    functional_group    TEXT NOT NULL DEFAULT 'general', -- 'power','mcu','comms','sensor','connector','rf'
    x_nm                INTEGER NOT NULL DEFAULT 0,
    y_nm                INTEGER NOT NULL DEFAULT 0,
    rot_mdeg            INTEGER NOT NULL DEFAULT 0 CHECK(rot_mdeg >= 0 AND rot_mdeg < 360000),
    side                TEXT NOT NULL DEFAULT 'top' CHECK(side IN ('top','bottom')),
    courtyard_w_nm      INTEGER NOT NULL DEFAULT 0,
    courtyard_h_nm      INTEGER NOT NULL DEFAULT 0,
    height_nm           INTEGER NOT NULL DEFAULT 0,
    sch_sheet_name      TEXT NOT NULL DEFAULT 'root',
    sch_x_nm            INTEGER NOT NULL DEFAULT 0,
    sch_y_nm            INTEGER NOT NULL DEFAULT 0,
    sch_unit            INTEGER NOT NULL DEFAULT 1,
    power_diss_mw       REAL NOT NULL DEFAULT 0.0,
    r_theta_ja_c_w      REAL,
    tj_max_c            REAL,
    unit_cost_usd       REAL,
    is_basic_part       INTEGER NOT NULL DEFAULT 0 CHECK(is_basic_part IN (0,1)),
    dnp                 INTEGER NOT NULL DEFAULT 0 CHECK(dnp IN (0,1)),
    params_json         TEXT NOT NULL DEFAULT '{}',
    datasheet_citation_id TEXT REFERENCES datasheet_citations(id),
    provenance          TEXT NOT NULL CHECK(provenance IN ('human','agent','cubo','import','compiler')),
    locked              INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1)),
    lock_owner          TEXT,
    lock_reason         TEXT,
    rev_lamport         INTEGER NOT NULL DEFAULT 1,
    deleted             INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1)),
    UNIQUE(board_id, refdes)
);

CREATE TABLE component_pins (
    id                  TEXT PRIMARY KEY,              -- UUIDv7
    component_id        TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
    pin_number          TEXT NOT NULL,                 -- '1','A12','EP'
    pin_name            TEXT NOT NULL,                 -- 'VDD_3V3','GPIO4_SPI_MOSI','SW'
    elec_type           TEXT NOT NULL CHECK(elec_type IN ('input','output','bidirectional','tri_state','passive','power_in','power_out','open_collector','open_emitter','no_connect')),
    v_abs_max_v         REAL,
    v_abs_min_v         REAL,
    v_ih_min_v          REAL,
    v_il_max_v          REAL,
    v_oh_min_v          REAL,
    v_ol_max_v          REAL,
    i_max_ma            REAL,
    pad_offset_x_nm     INTEGER NOT NULL DEFAULT 0,
    pad_offset_y_nm     INTEGER NOT NULL DEFAULT 0,
    is_strapping_pin    INTEGER NOT NULL DEFAULT 0 CHECK(is_strapping_pin IN (0,1)),
    datasheet_citation_id TEXT REFERENCES datasheet_citations(id),
    UNIQUE(component_id, pin_number)
);

CREATE TABLE nets (
    id                  TEXT PRIMARY KEY,              -- UUIDv7
    board_id            TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,                 -- 'GND','+3V3','USB_D_P','I2C0_SDA'
    net_class_id        TEXT NOT NULL REFERENCES net_classes(id),
    signal_role         TEXT NOT NULL DEFAULT 'generic'
                        CHECK(signal_role IN ('generic','power_rail','gnd_ref','switch_node','clock','diff_pos','diff_neg','rf_50','analog_low_noise','i2c_sda','i2c_scl','spi','uart_tx','uart_rx','reset','bootstrap')),
    nominal_voltage_v   REAL,
    diff_pair_mate_id   TEXT REFERENCES nets(id),
    is_high_speed       INTEGER NOT NULL DEFAULT 0 CHECK(is_high_speed IN (0,1)),
    provenance          TEXT NOT NULL CHECK(provenance IN ('human','agent','cubo','import','compiler')),
    locked              INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1)),
    rev_lamport         INTEGER NOT NULL DEFAULT 1,
    deleted             INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1)),
    UNIQUE(board_id, name)
);

CREATE TABLE pin_net_bindings (
    id                  TEXT PRIMARY KEY,              -- UUIDv7
    pin_id              TEXT NOT NULL REFERENCES component_pins(id) ON DELETE CASCADE,
    net_id              TEXT NOT NULL REFERENCES nets(id) ON DELETE CASCADE,
    provenance          TEXT NOT NULL CHECK(provenance IN ('human','agent','cubo','import','compiler')),
    locked              INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1)),
    rev_lamport         INTEGER NOT NULL DEFAULT 1,
    deleted             INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1)),
    UNIQUE(pin_id)
);

-- ============================================================================
-- 5. PHYSICAL COPPER GEOMETRY & MCAD KEEPOUTS
-- ============================================================================
CREATE TABLE traces (
    id                  TEXT PRIMARY KEY,              -- UUIDv7
    board_id            TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    net_id              TEXT NOT NULL REFERENCES nets(id) ON DELETE CASCADE,
    layer_name          TEXT NOT NULL,
    x1_nm               INTEGER NOT NULL,
    y1_nm               INTEGER NOT NULL,
    x2_nm               INTEGER NOT NULL,
    y2_nm               INTEGER NOT NULL,
    width_nm            INTEGER NOT NULL CHECK(width_nm > 0),
    arc_mid_x_nm        INTEGER,                       -- NULL = straight segment
    arc_mid_y_nm        INTEGER,
    provenance          TEXT NOT NULL CHECK(provenance IN ('human','agent','cubo','import','compiler')),
    locked              INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1)),
    lock_owner          TEXT,
    rev_lamport         INTEGER NOT NULL DEFAULT 1,
    deleted             INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1))
);

CREATE TABLE vias (
    id                  TEXT PRIMARY KEY,              -- UUIDv7
    board_id            TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    net_id              TEXT NOT NULL REFERENCES nets(id) ON DELETE CASCADE,
    x_nm                INTEGER NOT NULL,
    y_nm                INTEGER NOT NULL,
    drill_nm            INTEGER NOT NULL CHECK(drill_nm > 0),
    diameter_nm         INTEGER NOT NULL CHECK(diameter_nm > drill_nm),
    start_layer         TEXT NOT NULL,
    end_layer           TEXT NOT NULL,
    via_kind            TEXT NOT NULL DEFAULT 'through' CHECK(via_kind IN ('through','blind','buried','microvia','thermal','stitch_gnd','backdrill')),
    provenance          TEXT NOT NULL CHECK(provenance IN ('human','agent','cubo','import','compiler')),
    locked              INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1)),
    lock_owner          TEXT,
    rev_lamport         INTEGER NOT NULL DEFAULT 1,
    deleted             INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1))
);

CREATE TABLE copper_zones (
    id                  TEXT PRIMARY KEY,              -- UUIDv7
    board_id            TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    net_id              TEXT REFERENCES nets(id) ON DELETE CASCADE,
    layer_name          TEXT NOT NULL,
    zone_kind           TEXT NOT NULL CHECK(zone_kind IN ('pour','keepout_copper','keepout_via','keepout_comp','antenna_keepout','smps_hotloop','flex_bend')),
    polygon_nm_json     TEXT NOT NULL,
    priority            INTEGER NOT NULL DEFAULT 0,
    clearance_nm        INTEGER NOT NULL DEFAULT 200000,
    thermal_relief      INTEGER NOT NULL DEFAULT 1 CHECK(thermal_relief IN (0,1)),
    provenance          TEXT NOT NULL CHECK(provenance IN ('human','agent','cubo','import','compiler')),
    locked              INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1)),
    lock_owner          TEXT,
    rev_lamport         INTEGER NOT NULL DEFAULT 1,
    deleted             INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1))
);

CREATE TABLE mcad_keepouts (
    id                  TEXT PRIMARY KEY,              -- UUIDv7
    board_id            TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    side                TEXT NOT NULL CHECK(side IN ('top','bottom','both')),
    polygon_nm_json     TEXT NOT NULL,
    max_height_nm       INTEGER NOT NULL,
    step_source_sha256  TEXT,
    locked              INTEGER NOT NULL DEFAULT 1 CHECK(locked IN (0,1)),
    rev_lamport         INTEGER NOT NULL DEFAULT 1
);

-- ============================================================================
-- 6. MULTI-BOARD HARNESSES, CONSTRAINTS & FIRMWARE PINMUX BINDINGS
-- ============================================================================
CREATE TABLE system_harnesses (
    id                  TEXT PRIMARY KEY,              -- UUIDv7
    project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    harness_kind        TEXT NOT NULL CHECK(harness_kind IN ('wire_cable','fpc_ribbon','board_to_board')),
    spec_yaml           TEXT NOT NULL,
    rev_lamport         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE harness_wires (
    id                  TEXT PRIMARY KEY,              -- UUIDv7
    harness_id          TEXT NOT NULL REFERENCES system_harnesses(id) ON DELETE CASCADE,
    from_pin_id         TEXT NOT NULL REFERENCES component_pins(id),
    to_pin_id           TEXT NOT NULL REFERENCES component_pins(id),
    wire_gauge_awg      INTEGER,
    wire_color_iec      TEXT,
    max_current_ma      REAL,
    polarity_verified   INTEGER NOT NULL DEFAULT 0 CHECK(polarity_verified IN (0,1))
);

CREATE TABLE electrical_constraints (
    id                  TEXT PRIMARY KEY,              -- UUIDv7
    project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    requirement_uid     TEXT,
    constraint_kind     TEXT NOT NULL CHECK(constraint_kind IN ('voltage_rail','ripple_max','impedance','length_match','thermal_max','derating','creepage','timing_slack','pinmux_rule','custom_expr')),
    target_entity_id    TEXT NOT NULL,
    expression_json     TEXT NOT NULL,
    severity            TEXT NOT NULL DEFAULT 'error' CHECK(severity IN ('error','warning')),
    last_eval_status    TEXT NOT NULL DEFAULT 'pending' CHECK(last_eval_status IN ('pending','pass','fail')),
    last_eval_value     TEXT,
    provenance          TEXT NOT NULL CHECK(provenance IN ('human','agent','cubo','import','compiler')),
    locked              INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1)),
    rev_lamport         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE firmware_pinmux (
    id                  TEXT PRIMARY KEY,              -- UUIDv7
    board_id            TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    mcu_component_id    TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
    pin_id              TEXT NOT NULL REFERENCES component_pins(id) ON DELETE CASCADE,
    peripheral_instance TEXT NOT NULL,                 -- 'I2C1','SPI2','TIM1_CH1','ADC1_IN4'
    signal_alias        TEXT NOT NULL,                 -- 'PIN_IMU_SDA','PIN_BUCK_PWM'
    gpio_mode           TEXT NOT NULL,                 -- 'AF4_OD_PU','OUTPUT_PP','ANALOG'
    hal_target          TEXT NOT NULL CHECK(hal_target IN ('c_header','zephyr_dts','rust_embassy','espidf_sdkconfig')),
    locked              INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1)),
    rev_lamport         INTEGER NOT NULL DEFAULT 1,
    UNIQUE(mcu_component_id, pin_id)
);

-- ============================================================================
-- 7. ATOMIC PATCH JOURNAL, EXTERNAL ID BRIDGE & GATE AUDIT LEDGER
-- ============================================================================
CREATE TABLE hardware_patches (
    seq_id              INTEGER PRIMARY KEY AUTOINCREMENT,
    patch_id            TEXT NOT NULL UNIQUE,          -- UUIDv7
    project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    actor_kind          TEXT NOT NULL CHECK(actor_kind IN ('human','agent','compiler','import')),
    actor_id            TEXT NOT NULL,
    lamport_ts          INTEGER NOT NULL,
    forward_ops_json    TEXT NOT NULL,                 -- JSON array of HardwarePatchOp
    inverse_ops_json    TEXT NOT NULL,                 -- Exact inverse for O(1) Undo/Redo
    undone              INTEGER NOT NULL DEFAULT 0 CHECK(undone IN (0,1)),
    otel_trace_id       TEXT,
    applied_at_utc      TEXT NOT NULL
);

CREATE TABLE external_id_map (
    hwir_uuid           TEXT NOT NULL,
    entity_table        TEXT NOT NULL,
    external_system     TEXT NOT NULL CHECK(external_system IN ('kicad_sch','kicad_pcb','atopile','tscircuit','klayout_gds')),
    external_key        TEXT NOT NULL,
    last_sync_sha256    TEXT NOT NULL,
    PRIMARY KEY(hwir_uuid, external_system),
    UNIQUE(external_system, external_key)
);

CREATE TABLE gate_audit_ledger (
    id                  TEXT PRIMARY KEY,              -- UUIDv7
    project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    gate_id             TEXT NOT NULL,
    attempt_num         INTEGER NOT NULL,
    verdict             TEXT NOT NULL CHECK(verdict IN ('PASS','FAIL','ESCALATED_HUMAN')),
    deterministic_hash  TEXT NOT NULL,
    metrics_json        TEXT NOT NULL,
    auditor_report_json TEXT,
    otel_trace_id       TEXT NOT NULL,
    recorded_at_utc     TEXT NOT NULL
);

-- ============================================================================
-- 8. KERNEL-LEVEL HUMAN-LOCK PROTECTION TRIGGERS (HARD FAIL-CLOSED)
-- ============================================================================
CREATE TABLE _tx_actor_ctx (
    singleton           INTEGER PRIMARY KEY CHECK(singleton = 1),
    actor_kind          TEXT NOT NULL CHECK(actor_kind IN ('human','agent','compiler','import')),
    allow_lock_override INTEGER NOT NULL DEFAULT 0 CHECK(allow_lock_override IN (0,1))
);
INSERT INTO _tx_actor_ctx(singleton, actor_kind, allow_lock_override) VALUES (1, 'human', 0);

CREATE TRIGGER trg_protect_locked_components_upd
BEFORE UPDATE ON components
WHEN OLD.locked = 1
 AND (SELECT actor_kind FROM _tx_actor_ctx WHERE singleton = 1) != 'human'
 AND (SELECT allow_lock_override FROM _tx_actor_ctx WHERE singleton = 1) = 0
BEGIN
    SELECT RAISE(ABORT, 'KERNEL_LOCK_VIOLATION: Agent/compiler cannot mutate human-locked component');
END;

CREATE TRIGGER trg_protect_locked_traces_upd
BEFORE UPDATE ON traces
WHEN OLD.locked = 1
 AND (SELECT actor_kind FROM _tx_actor_ctx WHERE singleton = 1) != 'human'
 AND (SELECT allow_lock_override FROM _tx_actor_ctx WHERE singleton = 1) = 0
BEGIN
    SELECT RAISE(ABORT, 'KERNEL_LOCK_VIOLATION: Agent/compiler cannot mutate human-locked trace');
END;

CREATE TRIGGER trg_protect_locked_zones_upd
BEFORE UPDATE ON copper_zones
WHEN OLD.locked = 1
 AND (SELECT actor_kind FROM _tx_actor_ctx WHERE singleton = 1) != 'human'
 AND (SELECT allow_lock_override FROM _tx_actor_ctx WHERE singleton = 1) = 0
BEGIN
    SELECT RAISE(ABORT, 'KERNEL_LOCK_VIOLATION: Agent/compiler cannot mutate human-locked copper zone');
END;

-- ============================================================================
-- 9. PERFORMANCE INDEXES
-- ============================================================================
CREATE INDEX idx_components_board_group ON components(board_id, functional_group) WHERE deleted = 0;
CREATE INDEX idx_components_xy ON components(board_id, x_nm, y_nm) WHERE deleted = 0;
CREATE INDEX idx_pins_comp ON component_pins(component_id);
CREATE INDEX idx_bindings_net ON pin_net_bindings(net_id) WHERE deleted = 0;
CREATE INDEX idx_traces_board_net ON traces(board_id, net_id, layer_name) WHERE deleted = 0;
CREATE INDEX idx_vias_board_net ON vias(board_id, net_id) WHERE deleted = 0;
CREATE INDEX idx_patches_project_lamport ON hardware_patches(project_id, lamport_ts DESC);
CREATE INDEX idx_constraints_project ON electrical_constraints(project_id, last_eval_status);
