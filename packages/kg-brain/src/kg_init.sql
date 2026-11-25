-- DuckDB Component Knowledge Graph Schema
-- Zero-Hallucination Parametric Curves, Pre-Made Modules & Datasheet Quarantine Ledger

CREATE TABLE IF NOT EXISTS components (
    mpn VARCHAR PRIMARY KEY,
    manufacturer VARCHAR NOT NULL,
    package VARCHAR NOT NULL,
    description VARCHAR,
    category VARCHAR NOT NULL DEFAULT 'passive',
    basic_part BOOLEAN DEFAULT FALSE,
    stock_count INTEGER DEFAULT 0,
    price_usd DOUBLE DEFAULT 0.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mlcc_dc_bias_curves (
    mpn VARCHAR REFERENCES components(mpn),
    v_applied DOUBLE NOT NULL,
    c_eff_uf DOUBLE NOT NULL,
    c_nom_uf DOUBLE NOT NULL,
    PRIMARY KEY (mpn, v_applied)
);

CREATE TABLE IF NOT EXISTS inductor_sat_curves (
    mpn VARCHAR REFERENCES components(mpn),
    i_dc_a DOUBLE NOT NULL,
    l_eff_uh DOUBLE NOT NULL,
    l_nom_uh DOUBLE NOT NULL,
    PRIMARY KEY (mpn, i_dc_a)
);

CREATE TABLE IF NOT EXISTS datasheet_crops (
    crop_id VARCHAR PRIMARY KEY,
    pdf_sha256 VARCHAR NOT NULL,
    page_num INTEGER NOT NULL,
    bbox_json VARCHAR NOT NULL,
    crop_png_path VARCHAR NOT NULL,
    verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Extended Prompt 7 Knowledge Graph tables (jlcparts + easyeda2kicad + JLC2KiCadLib)
CREATE TABLE IF NOT EXISTS kg_parts (
    lcsc_id VARCHAR PRIMARY KEY,
    mpn VARCHAR NOT NULL,
    manufacturer VARCHAR NOT NULL,
    category VARCHAR NOT NULL,
    package VARCHAR NOT NULL,
    description VARCHAR NOT NULL,
    feeder_type VARCHAR NOT NULL DEFAULT 'Extended',
    stock_qty INTEGER NOT NULL DEFAULT 0,
    price_usd DOUBLE NOT NULL DEFAULT 0.0,
    v_max DOUBLE NOT NULL DEFAULT 5.0,
    i_max_a DOUBLE NOT NULL DEFAULT 0.5,
    c_nom_uf DOUBLE,
    l_nom_uh DOUBLE,
    r_ohm DOUBLE,
    pwr_rating_w DOUBLE DEFAULT 0.1,
    tj_max_c DOUBLE DEFAULT 125.0,
    theta_ja_c_w DOUBLE DEFAULT 60.0,
    symbol_ref VARCHAR NOT NULL,
    footprint_ref VARCHAR NOT NULL,
    step_model_ref VARCHAR NOT NULL DEFAULT '',
    is_module BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS kg_pins (
    mpn VARCHAR NOT NULL,
    pin_num VARCHAR NOT NULL,
    pin_name VARCHAR NOT NULL,
    electrical_type VARCHAR NOT NULL,
    v_max DOUBLE NOT NULL DEFAULT 3.6,
    tol_3v3_only BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (mpn, pin_num)
);

CREATE TABLE IF NOT EXISTS kg_pinmux_matrix (
    mpn VARCHAR NOT NULL,
    pin_name VARCHAR NOT NULL,
    alt_func VARCHAR NOT NULL,
    peripheral VARCHAR NOT NULL,
    PRIMARY KEY (mpn, pin_name, alt_func)
);

CREATE TABLE IF NOT EXISTS kg_mlcc_dcbias_curves (
    mpn VARCHAR NOT NULL,
    v_dc DOUBLE NOT NULL,
    c_eff_uf DOUBLE NOT NULL,
    c_nom_uf DOUBLE NOT NULL,
    derating_pct DOUBLE NOT NULL,
    PRIMARY KEY (mpn, v_dc)
);

CREATE TABLE IF NOT EXISTS kg_inductor_isat_curves (
    mpn VARCHAR NOT NULL,
    i_dc_a DOUBLE NOT NULL,
    l_eff_uh DOUBLE NOT NULL,
    l_nom_uh DOUBLE NOT NULL,
    temp_rise_c DOUBLE NOT NULL DEFAULT 15.0,
    PRIMARY KEY (mpn, i_dc_a)
);

CREATE TABLE IF NOT EXISTS kg_mosfet_curves (
    mpn VARCHAR NOT NULL,
    v_gs_v DOUBLE NOT NULL,
    rds_on_mohm DOUBLE NOT NULL,
    id_max_a DOUBLE NOT NULL,
    PRIMARY KEY (mpn, v_gs_v)
);

CREATE TABLE IF NOT EXISTS kg_silicon_errata (
    mpn VARCHAR NOT NULL,
    erratum_id VARCHAR NOT NULL,
    severity VARCHAR NOT NULL,
    summary VARCHAR NOT NULL,
    PRIMARY KEY (mpn, erratum_id)
);

CREATE TABLE IF NOT EXISTS kg_modules (
    module_id VARCHAR PRIMARY KEY,
    mpn VARCHAR NOT NULL,
    name VARCHAR NOT NULL,
    role VARCHAR NOT NULL,
    rails_json VARCHAR NOT NULL,
    footprint_ref VARCHAR NOT NULL,
    step_model_ref VARCHAR NOT NULL
);
