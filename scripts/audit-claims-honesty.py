# scripts/audit-claims-honesty.py
import sys

def test_claims():
    with open("docs/CLAIMS_REGISTER.md", "r", encoding="utf-8") as f:
        content = f.read()
    
    # Must NOT claim physical fabrication complete for Milestone 1 boards
    if "All 3 Physical Boards Certified & Verified" in content or "3/3 Fabricated" in content:
        print("FAIL: False physical fabrication claims found in CLAIMS_REGISTER.md")
        sys.exit(1)
        
    assert "Software Reference Blueprints (0/3 Physically Fabricated)" in content or \
           "Software Reference Blueprints — 0/3 Physically Fabricated" in content or \
           "0/3 physically fabricated" in content, \
        "Must declare boards as Software Reference Blueprints — 0/3 Physically Fabricated"
    print("PASS: Claims register verified 100% honest.")

if __name__ == "__main__":
    test_claims()
