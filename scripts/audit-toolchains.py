# scripts/audit-toolchains.py
import os
import shutil
import sys
import subprocess


def _parse_semver(raw: str) -> tuple[int, int, int]:
    parts = [int(p) for p in raw.strip().lstrip("v").split(".")[:3]]
    while len(parts) < 3:
        parts.append(0)
    return (parts[0], parts[1], parts[2])


def test_toolchain_audit():
    strict = "--strict" in sys.argv or os.environ.get("CI", "").lower() == "true"
    tools = ["python", "node", "uv"]
    missing = [t for t in tools if not shutil.which(t)]
    if missing:
        print(f"FAIL: Missing required toolchain binaries: {missing}")
        sys.exit(1)

    # Check Python version >= 3.14 per AGENTS.md
    py_ver = sys.version_info
    assert (py_ver.major, py_ver.minor) >= (3, 14), f"Python >= 3.14 required, got {py_ver}"

    # Check Node target floor >= 26.13.1 per AGENTS.md (warn locally on Node >= 20 unless --strict / CI=true)
    node_out = subprocess.check_output(["node", "-v"]).decode().strip()
    node_ver = _parse_semver(node_out)
    assert node_ver[0] >= 20, f"Node >= 20 minimum host baseline required, got {node_out}"
    if node_ver < (26, 13, 1):
        msg = f"WARN: Local Node {node_out} is below AGENTS.md target floor >= v26.13.1 (enforced in CI/--strict)."
        if strict:
            raise AssertionError(msg.replace("WARN:", "FAIL:"))
        print(msg)

    print("PASS: Toolchain baseline verified (python, node, uv present).")


if __name__ == "__main__":
    test_toolchain_audit()
