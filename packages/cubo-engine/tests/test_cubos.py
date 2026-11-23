# packages/cubo-engine/tests/test_cubos.py
import os
import sys
import tomllib
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src")))

from verifier import generate_keypair, sign_manifest, verify_manifest_signature
from cubo_manifest import CuboManifest
from atopile_bridge import parse_ato_source, compile_ato_to_hw_ir_patches

def test_ed25519_signing_and_verification():
    priv, pub = generate_keypair()
    manifest_bytes = b'{"cubo": {"id": "test_block", "tier": 1}}'
    sig = sign_manifest(manifest_bytes, priv)
    assert verify_manifest_signature(manifest_bytes, sig, pub) is True
    
    # Tampered data must fail verification
    tampered_bytes = b'{"cubo": {"id": "test_block", "tier": 2}}'
    assert verify_manifest_signature(tampered_bytes, sig, pub) is False
    print("[PASS] Ed25519 signing and verification verified.")

def test_all_5_reference_cubos_manifests():
    cubo_dir = os.path.join(os.path.dirname(__file__), "..", "cubos")
    cubo_ids = [
        "usb_pd_buck_3v3_3a",
        "esp32s3_core",
        "stm32g4_core",
        "can_fd_transceiver",
        "i2c_sensor_bme280"
    ]
    for cid in cubo_ids:
        c_path = os.path.join(cubo_dir, cid, "cubo.toml")
        ato_path = os.path.join(cubo_dir, cid, "circuit.ato")
        assert os.path.exists(c_path), f"Missing cubo.toml for {cid}"
        assert os.path.exists(ato_path), f"Missing circuit.ato for {cid}"
        
        with open(c_path, "rb") as f:
            data = tomllib.load(f)
            
        manifest = CuboManifest(**data)
        assert manifest.cubo.id == cid
        assert manifest.cubo.tier == 1
        
        with open(ato_path, "r", encoding="utf-8") as f:
            ato_text = f.read()
            
        block = parse_ato_source(ato_text)
        assert len(block.signals) > 0
        assert len(block.components) > 0
        
        patches = compile_ato_to_hw_ir_patches(block, "018e0000-0000-7000-8000-000000000001")
        assert len(patches) == len(block.signals) + len(block.components)
        
    print(f"[PASS] All {len(cubo_ids)} Open-CUBO manifests and Atopile compilations verified.")

if __name__ == "__main__":
    test_ed25519_signing_and_verification()
    test_all_5_reference_cubos_manifests()
    print("ALL CUBO-ENGINE TESTS PASSED CLEANLY.")
