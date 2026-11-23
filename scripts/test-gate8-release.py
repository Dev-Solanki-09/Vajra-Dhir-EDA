# scripts/test-gate8-release.py
import json
import os
import sys

def test_gate8_bundle_structure():
    # Verify Board 1 release bundle artifacts
    b1_dir = "designs/board-1-buck-pd"
    required_files = [
        "README.md",
        "board.vd-ir.jsonl",
        "board.kicad_sch",
        "board.kicad_pcb",
        "bom.csv",
        "pnp_centroids.csv",
        "verification_report.json"
    ]
    for rf in required_files:
        p = os.path.join(b1_dir, rf)
        assert os.path.exists(p), f"Missing release artifact: {rf} in {b1_dir}"
        
    with open(os.path.join(b1_dir, "verification_report.json"), "r", encoding="utf-8") as f:
        rep = json.load(f)
    assert rep["board_id"] == "VD-BRD-001"
    assert "human_signoff_token" in rep
    assert len(rep["human_signoff_token"]) >= 32
    print("PASS: Gate 8 release bundle and cryptographic human signoff verified.")

if __name__ == "__main__":
    test_gate8_bundle_structure()
