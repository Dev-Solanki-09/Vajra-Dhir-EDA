# scripts/test-python-workspace.py
import tomllib
import sys
import os

def test_py_workspace():
    if not os.path.exists("pyproject.toml"):
        print("FAIL: Missing root pyproject.toml")
        sys.exit(1)
        
    with open("pyproject.toml", "rb") as f:
        data = tomllib.load(f)
    
    deps = data.get("project", {}).get("dependencies", [])
    banned = ["fitz", "pymupdf", "kibot", "part-db", "pypsa-app"]
    for b in banned:
        for d in deps:
            assert b not in d.lower(), f"Banned AGPL dependency detected: {d}"
            
    required = ["z3-solver", "sympy", "pint", "control", "duckdb", "pypdfium2", "pdfplumber", "pydantic"]
    for r in required:
        assert any(r in d for d in deps), f"Missing required spine dependency: {r}"
        
    # Check members in workspace
    members = data.get("tool", {}).get("uv", {}).get("workspace", {}).get("members", [])
    expected_members = ["packages/kg-brain", "packages/cubo-engine", "packages/symbolic-verifier"]
    for em in expected_members:
        assert em in members, f"Missing workspace member: {em}"
        assert os.path.exists(os.path.join(em, "pyproject.toml")), f"Missing pyproject.toml in {em}"
        
    print("PASS: Python neuro-symbolic workspace verified clean and complete.")

if __name__ == "__main__":
    test_py_workspace()
