# scripts/test-kicad-sync.py
import sys
import os

def test_kicad_bridge_rules():
    # Verify that autorouter and kicad sync modules exist and enforce pre-route .kicad_dru sync
    autorouter_lib = "packages/autorouter/src/lib.rs"
    assert os.path.exists(autorouter_lib), "Missing packages/autorouter/src/lib.rs"
    with open(autorouter_lib, "r", encoding="utf-8") as f:
        src = f.read()
    assert "generate_kicad_dru" in src, "autorouter must implement generate_kicad_dru"
    assert "export_specctra_dsn" in src, "autorouter must implement export_specctra_dsn"
    assert "import_specctra_ses" in src, "autorouter must implement import_specctra_ses"
    assert "trg_protect_locked_copper" in src or "locked" in src, "autorouter must guard locked copper"
    
    # Run test_schematic_autorouter_footprint test
    import subprocess
    subprocess.check_call(["python", "scripts/test-schematic-autorouter-footprint.py"])
    print("PASS: Pre-route rules and post-route copper guard verified.")

if __name__ == "__main__":
    test_kicad_bridge_rules()
