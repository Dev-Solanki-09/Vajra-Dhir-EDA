-- DuckDB Component Knowledge Graph Schema
-- Zero-Hallucination Parametric Curves & Datasheet Quarantine Ledger

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
