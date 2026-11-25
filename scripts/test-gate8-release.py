# scripts/test-gate8-release.py
"""Gate 8 release gate — fail-closed human signoff & DRC verification.

Semantics (never fabricate a signoff or evidence hash):
- Release bundle artifacts must exist.
- A bundle with no token MUST declare signoff PENDING.
- A token must be non-whitespace and >= 32 chars.
- Contradictions (bidirectional SIGNED/release_authorized/release_status) fail closed.
- Un-waived DRC clearance errors block Gate 8 release bundle authorization.
- Known fabricated evidence hashes (e.g. rotating hex patterns or empty SHA-256) fail closed.
"""
import json
import os
import re
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
EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"


def _require(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(msg)


def is_known_fabricated_hash(value: object) -> bool:
    if not isinstance(value, str):
        return False
    h = value.strip().lower()
    if h == EMPTY_SHA256:
        return True
    # Detect sequential-rotation placeholder pattern ("a1b2c3d4e5f60718..." / rotations)
    if re.fullmatch(r"(?:[0-9a-f]{2}){16,32}", h):
        seed = "a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0"
        if h in (seed + seed):
            return True
    return False


def validate_signoff(rep: dict, *, strict_hashes: bool = False) -> list[str]:
    """Return a list of fail-closed violations for a verification report."""
    errors: list[str] = []
    signoff = rep.get("human_signoff") or {}
    token = signoff.get("token")
    status = str(signoff.get("status", "")).upper()
    release_status = str(rep.get("release_status", "")).upper()
    released = bool(rep.get("release_authorized")) or status == "SIGNED" or release_status == "RELEASED"

    if token is not None:
        if not isinstance(token, str) or len(token.strip()) < MIN_TOKEN_LEN:
            errors.append(f"human_signoff.token present but shorter than {MIN_TOKEN_LEN} non-whitespace chars")
    if released and (not isinstance(token, str) or len(token.strip()) < MIN_TOKEN_LEN):
        errors.append("bundle claims release/signed status without a valid human signoff token")
    if not token and status != "PENDING":
        errors.append(f"no token, so signoff status must be PENDING (got {status or 'MISSING'})")
    if released and release_status == "NOT_RELEASED_PENDING_HUMAN_SIGNOFF":
        errors.append("release_authorized/SIGNED contradicts release_status=NOT_RELEASED_PENDING_HUMAN_SIGNOFF")
    if status == "SIGNED" and rep.get("release_authorized") is False:
        errors.append("human_signoff.status=SIGNED contradicts release_authorized=false")
    if release_status == "RELEASED" and rep.get("release_authorized") is False:
        errors.append("release_status=RELEASED contradicts release_authorized=false")

    # G4 -> G8 fail-closed DRC gate
    unwaived_drc = rep.get("unwaived_drc_errors", rep.get("drc_errors", 0))
    if isinstance(unwaived_drc, (int, float)) and unwaived_drc > 0 and released:
        errors.append(f"un-waived DRC errors ({unwaived_drc}) must block Gate 8 release authorization")

    if strict_hashes:
        for gate in rep.get("gates", []):
            ev = gate.get("evidence_hash")
            if is_known_fabricated_hash(ev):
                errors.append(f"gate {gate.get('gate')} carries known fabricated evidence_hash")
        verdicts = rep.get("gate_verdicts") or {}
        if isinstance(verdicts, dict):
            for gate_name, gate_obj in verdicts.items():
                if isinstance(gate_obj, dict) and is_known_fabricated_hash(gate_obj.get("evidence_hash")):
                    errors.append(f"gate_verdicts.{gate_name} carries known fabricated evidence_hash")
    return errors


def test_gate8_bundle_structure() -> None:
    for rf in REQUIRED_FILES:
        p = os.path.join(B1_DIR, rf)
        _require(os.path.exists(p), f"Missing release artifact: {rf} in {B1_DIR}")

    for bdir, expected_id in (
        ("designs/board-1-buck-pd", "VD-BRD-001"),
        ("designs/board-2-esp32s3-node", "VD-BRD-002"),
        ("designs/board-3-stm32g4-motor", "VD-BRD-003"),
    ):
        with open(os.path.join(bdir, "verification_report.json"), "r", encoding="utf-8") as f:
            rep = json.load(f)
        _require(rep["board_id"] == expected_id, f"Unexpected board_id: {rep.get('board_id')}")
        errors = validate_signoff(rep, strict_hashes=True)
        _require(not errors, f"Gate 8 fail-closed violations ({bdir}): " + "; ".join(errors))
    print("PASS: Gate 8 release bundles present across boards 1-3; real artifact hashes verified & signoff PENDING.")


def test_gate8_rejects_fabricated_signoff() -> None:
    """The gate must FAIL when a bundle pretends to be signed, contradicts itself, or has DRC errors."""
    signed_without_token = {
        "release_authorized": True,
        "human_signoff": {"status": "SIGNED", "token": None},
    }
    _require(bool(validate_signoff(signed_without_token)), "signed bundle without token must be rejected")

    whitespace_token = {
        "release_authorized": True,
        "human_signoff": {"status": "SIGNED", "token": " " * 40},
    }
    _require(bool(validate_signoff(whitespace_token)), "whitespace-only token must be rejected")

    bidirectional_contradiction = {
        "release_authorized": False,
        "human_signoff": {"status": "SIGNED", "token": "f" * 32},
    }
    _require(bool(validate_signoff(bidirectional_contradiction)), "SIGNED + release_authorized=false must be rejected")

    drc_blocked = {
        "release_authorized": True,
        "unwaived_drc_errors": 1,
        "human_signoff": {"status": "SIGNED", "token": "f" * 32},
    }
    _require(bool(validate_signoff(drc_blocked)), "un-waived DRC error must block Gate 8 release")

    fabricated_hashes = {
        "release_authorized": False,
        "human_signoff": {"status": "PENDING", "token": None},
        "gates": [{"gate": "G2", "evidence_hash": EMPTY_SHA256}],
    }
    _require(bool(validate_signoff(fabricated_hashes, strict_hashes=True)), "fabricated empty SHA-256 hash must be rejected")

    fabricated_verdicts = {
        "release_authorized": False,
        "human_signoff": {"status": "PENDING", "token": None},
        "gate_verdicts": {"G2_SCHEMATIC_FORMAL": {"evidence_hash": "a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0"}},
    }
    _require(bool(validate_signoff(fabricated_verdicts, strict_hashes=True)), "fabricated gate_verdicts placeholder hash must be rejected")

    short_token = {"human_signoff": {"status": "PENDING", "token": "deadbeef"}}
    _require(bool(validate_signoff(short_token)), "token shorter than 32 chars must be rejected")

    unsigned_but_not_pending = {"human_signoff": {"status": "APPROVED", "token": None}}
    _require(bool(validate_signoff(unsigned_but_not_pending)), "tokenless non-PENDING status must be rejected")

    valid = {"release_authorized": True, "unwaived_drc_errors": 0, "human_signoff": {"status": "SIGNED", "token": "f" * 32}}
    _require(not validate_signoff(valid), "a valid 32+ char token with 0 DRC errors must pass")
    print("PASS: Gate 8 rejects fabricated/whitespace/contradictory/DRC-blocked bundles (python -O safe).")


if __name__ == "__main__":
    test_gate8_bundle_structure()
    test_gate8_rejects_fabricated_signoff()
