# scripts/audit-toolchains.py
import shutil
import sys
import subprocess

def test_toolchain_audit():
    tools = ["python", "node", "uv"]
    missing = [t for t in tools if not shutil.which(t)]
    if missing:
        print(f"FAIL: Missing required toolchain binaries: {missing}")
        sys.exit(1)
    
    # Check Python version >= 3.10
    py_ver = sys.version_info
    assert py_ver.major == 3 and py_ver.minor >= 10, f"Python >= 3.10 required, got {py_ver}"
    
    # Check Node version >= 20
    node_out = subprocess.check_output(["node", "-v"]).decode().strip()
    node_major = int(node_out.lstrip("v").split(".")[0])
    assert node_major >= 20, f"Node >= 20 required, got {node_out}"
    
    print("PASS: Toolchain baseline verified (python, node, uv present).")

if __name__ == "__main__":
    test_toolchain_audit()
