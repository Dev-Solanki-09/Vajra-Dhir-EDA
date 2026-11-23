# packages/kg-brain/tests/test_kg_brain.py
import duckdb
import hashlib
import os
import sys

# Ensure package src is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src")))

from datasheet_quarantine import (
    get_quarantine_path,
    store_datasheet,
    extract_page_crop_png
)
from jlcparts_optimizer import (
    ComponentSpec,
    calculate_bom_manufacturing_cost,
    choose_optimal_component
)

def test_duckdb_schema_initialization():
    con = duckdb.connect(":memory:")
    with open("packages/kg-brain/src/kg_init.sql", "r", encoding="utf-8") as f:
        con.execute(f.read())
    tables = [r[0] for r in con.execute("SHOW TABLES").fetchall()]
    assert "components" in tables
    assert "mlcc_dc_bias_curves" in tables
    assert "inductor_sat_curves" in tables
    assert "datasheet_crops" in tables
    print("[PASS] DuckDB schema initialized successfully.")

def test_sha256_datasheet_quarantine():
    sample_bytes = b"%PDF-1.7 Test Datasheet Content"
    expected_hash = hashlib.sha256(sample_bytes).hexdigest()
    path = get_quarantine_path(sample_bytes)
    assert expected_hash in path
    assert path.endswith(".pdf")
    
    # Test storage
    stored_path = store_datasheet(sample_bytes)
    assert os.path.exists(stored_path)
    with open(stored_path, "rb") as f:
        assert f.read() == sample_bytes
    print("[PASS] Datasheet quarantine storage and path verified.")

def test_jlcparts_feeder_optimization():
    # Candidate 1: Extended part $0.02, Feeder fee $3.00
    comp_ext = ComponentSpec(
        mpn="CL10A106KP8NNNC",
        category="Capacitor",
        package="0603",
        unit_price_usd=0.02,
        is_basic=False
    )
    # Candidate 2: Basic part $0.035, Feeder fee $0.00
    comp_basic = ComponentSpec(
        mpn="CL10A106MQ8NNNC",
        category="Capacitor",
        package="0603",
        unit_price_usd=0.035,
        is_basic=True
    )
    
    # For small quantity (e.g. 10 boards), Basic part should win because extended fee adds $3.00
    # 10 * 0.02 + 3.00 = $3.20
    # 10 * 0.035 + 0.00 = $0.35
    optimal_small = choose_optimal_component([comp_ext, comp_basic], quantity=10)
    assert optimal_small.is_basic == True
    assert optimal_small.mpn == "CL10A106MQ8NNNC"
    
    cost_summary = calculate_bom_manufacturing_cost([optimal_small], {optimal_small.mpn: 10})
    assert cost_summary["feeder_fees_total_usd"] == 0.0
    assert cost_summary["total_manufacturing_cost_usd"] == 0.35
    print("[PASS] JLCPCB feeder optimization verified.")

if __name__ == "__main__":
    test_duckdb_schema_initialization()
    test_sha256_datasheet_quarantine()
    test_jlcparts_feeder_optimization()
    print("ALL KG-BRAIN TESTS PASSED CLEANLY.")
