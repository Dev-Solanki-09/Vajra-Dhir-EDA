# scripts/test-gate8-release.py
"""Gate 8 release gate — fail-closed human signoff verification.

Semantics (never fabricate a signoff):
- Release bundle artifacts must exist.
- A bundle with no token MUST declare signoff PENDING.
- A token, if present, must be >= 32 chars.
- A bundle marked released/signed WITHOUT a valid token is a hard failure.
"""
import json
import os
import sys

B1_DIR = "designs/board-1-buck-pd"
REQUIRED_FILES = [
    "README.md",
    "board.vd-ir.jsonl",
    "board.kicad_sch",
    "board.kicad_pcb",
    "bom.csv",
    "pnp_centroids.csv",
    "verification_report.json",
]
MIN_TOKEN_LEN = 32


def validate_signoff(rep: dict) -> list[str]:
    """Return a list of fail-closed violations for a verification report."""
    errors: list[str] = []
    signoff = rep.get("human_signoff") or {}
    token = signoff.get("token")
    status = str(signoff.get("status", "")).upper()
    released = bool(rep.get("release_authorized")) or status == "SIGNED"

    if token is not None:
        if not isinstance(token, str) or len(token) < MIN_TOKEN_LEN:
            errors.append(f"human_signoff.token present but shorter than {MIN_TOKEN_LEN} chars")
    if released and not token:
        errors.append("bundle claims release/signed status without a human signoff token")
    if not token and status != "PENDING":
        errors.append(f"no token, so signoff status must be PENDING (got {status or 'MISSING'})")
    if released and rep.get("release_status") == "NOT_RELEASED_PENDING_HUMAN_SIGNOFF":
        errors.append("release_authorized contradicts release_status")
    return errors


def test_gate8_bundle_structure() -> None:
    for rf in REQUIRED_FILES:
        p = os.path.join(B1_DIR, rf)
        assert os.path.exists(p), f"Missing release artifact: {rf} in {B1_DIR}"

    with open(os.path.join(B1_DIR, "verification_report.json"), "r", encoding="utf-8") as f:
        rep = json.load(f)

    assert rep["board_id"] == "VD-BRD-001"
    errors = validate_signoff(rep)
    assert not errors, "Gate 8 fail-closed violations: " + "; ".join(errors)
    print("PASS: Gate 8 release bundle present; human signoff explicitly PENDING (fail-closed).")


def test_gate8_rejects_fabricated_signoff() -> None:
    """The gate must FAIL when a bundle pretends to be signed without a token."""
    signed_without_token = {
        "release_authorized": True,
        "human_signoff": {"status": "SIGNED", "token": None},
    }
    assert validate_signoff(signed_without_token), "signed bundle without token must be rejected"

    short_token = {"human_signoff": {"status": "PENDING", "token": "deadbeef"}}
    assert validate_signoff(short_token), "token shorter than 32 chars must be rejected"

    unsigned_but_not_pending = {"human_signoff": {"status": "APPROVED", "token": None}}
    assert validate_signoff(unsigned_but_not_pending), "tokenless non-PENDING status must be rejected"

    valid = {"release_authorized": True, "human_signoff": {"status": "SIGNED", "token": "f" * 32}}
    assert not validate_signoff(valid), "a valid 32+ char token must pass"
    print("PASS: Gate 8 rejects fabricated/absent signoff and accepts a valid token.")


if __name__ == "__main__":
    test_gate8_bundle_structure()
    test_gate8_rejects_fabricated_signoff()
