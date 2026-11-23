# scripts/test-quarantine.py
import tomllib
import os
import sys

def test_quarantine():
    with open("Cargo.toml", "rb") as f:
        cargo = tomllib.load(f)
    members = cargo.get("workspace", {}).get("members", [])
    
    # Milestone 2/3 packages must be isolated or gated
    docker_path = os.path.join("docker", "docker-compose.workers.yml")
    assert os.path.exists(docker_path), f"docker-compose.workers.yml must be located in docker/ directory (found: {os.path.exists(docker_path)})"
    
    with open(docker_path, "r", encoding="utf-8") as f:
        content = f.read()
    assert "runtime: runsc" in content, "docker-compose.workers.yml must enforce gVisor (runtime: runsc)"
    assert "pack-2a-pcb-physics" in content, "Worker pack must match contract enum (pack-2a-pcb-physics)"
    assert "pack-2b-virtual-hil" in content, "Worker pack must match contract enum (pack-2b-virtual-hil)"
    assert "pack-2c-silicon-ic" in content, "Worker pack must match contract enum (pack-2c-silicon-ic)"
    
    print("PASS: Quarantine and container location verified.")

if __name__ == "__main__":
    test_quarantine()
