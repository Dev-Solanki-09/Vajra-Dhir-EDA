# packages/cubo-engine/src/verifier.py
"""
Ed25519 Cryptographic Verification for Signed Open-CUBO Hardware Blocks.
Guarantees supply-chain integrity: only signed, certified blocks can be auto-instantiated.
"""

import base64
from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.exceptions import InvalidSignature
from typing import Tuple

def generate_keypair() -> Tuple[bytes, bytes]:
    """Generates a fresh (private_bytes, public_bytes) pair for signing CUBOs."""
    priv = ed25519.Ed25519PrivateKey.generate()
    pub = priv.public_key()
    return priv.private_bytes_raw(), pub.public_bytes_raw()

def sign_manifest(manifest_bytes: bytes, private_key_raw: bytes) -> str:
    """Signs manifest data bytes and returns base64-encoded signature."""
    priv = ed25519.Ed25519PrivateKey.from_private_bytes(private_key_raw)
    signature = priv.sign(manifest_bytes)
    return base64.b64encode(signature).decode("ascii")

def verify_manifest_signature(manifest_bytes: bytes, signature_b64: str, public_key_raw: bytes) -> bool:
    """Verifies that the manifest signature is authentic using the Ed25519 public key."""
    try:
        pub = ed25519.Ed25519PublicKey.from_public_bytes(public_key_raw)
        sig = base64.b64decode(signature_b64)
        pub.verify(sig, manifest_bytes)
        return True
    except (InvalidSignature, Exception):
        return False
