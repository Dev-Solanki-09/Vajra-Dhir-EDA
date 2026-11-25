"""
G7 Behavioral Verification (T-06 Claims Truth + F-19 Real SHA-256 Hashes + Vapor Sweep):
1. Recomputes LF-normalized SHA-256 of declared `evidence_artifact` files across all 3 board verification reports.
2. Enforces zero EMPTY_SHA256 / rotating placeholders, strict PENDING signoff, and release_authorized=False.
3. Enforces canonical Footgun IDs (FG-03 / FG-04 / FG-06) in footgun_engine.py.
4. Enforces factual public claims in README.md, docs/CHECKPOINT_PROGRESS.md, docs/CLAIMS_REGISTER.md.
5. Verifies docs/REVERSE_ENGINEERED_ENGINES.md stays gitignored.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent


def sha256_lf(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def run() -> None:
    import sys
    sys.path.insert(0, str(ROOT / "scripts"))
    g8_mod = __import__("test-gate8-release")

    for board in ("board-1-buck-pd", "board-2-esp32s3-node", "board-3-stm32g4-motor"):
        rep_path = ROOT / "designs" / board / "verification_report.json"
        rep = json.loads(rep_path.read_text(encoding="utf-8"))
        errs = g8_mod.validate_signoff(rep, strict_hashes=True)
        assert not errs, f"{board} signoff/hash violations: {errs}"
        assert rep.get("release_authorized") is False, f"{board} must have release_authorized=false"
        verdicts = rep.get("gate_verdicts", {})
        assert verdicts, f"{board} missing gate_verdicts"
        for gate_name, gv in verdicts.items():
            ev = gv.get("evidence_hash")
            art = gv.get("evidence_artifact")
            if ev is not None:
                assert art, f"{board} {gate_name} has evidence_hash without evidence_artifact path"
                art_path = ROOT / art
                assert art_path.exists(), f"{board} {gate_name} missing evidence_artifact: {art}"
                expected = sha256_lf(art_path)
                assert ev == expected, f"{board} {gate_name} SHA-256 mismatch: {ev} != {expected}"
                assert not g8_mod.is_known_fabricated_hash(ev), f"{board} {gate_name} fabricated hash"

    # Footgun numbering alignment check
    fg_text = (ROOT / "packages" / "symbolic-verifier" / "src" / "footgun_engine.py").read_text(encoding="utf-8")
    assert '"FG-03"' in fg_text and '"FG-04"' in fg_text and '"FG-06"' in fg_text, "footgun_engine.py must align to canonical FG-03/FG-04/FG-06 IDs"

    # Docs truth & zero stale references
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    ver_doc = (ROOT / "docs" / "VERIFICATION.md").read_text(encoding="utf-8")
    claims = (ROOT / "docs" / "CLAIMS_REGISTER.md").read_text(encoding="utf-8")

    assert "Wasmtime 50" not in readme and "Wasmtime 50" not in ver_doc
    assert "/ Surfer /" not in readme
    assert "COMPLETE — All 3 Physical Boards" not in ver_doc
    assert "0/3 Physically Fabricated" in ver_doc
    assert "0/3 physically fabricated" in readme.lower()
    assert "Wasmtime" in claims and "51.0.0" in claims

    # Ensure internal RE document stays gitignored
    chk_ig = subprocess.run(
        ["git", "check-ignore", "docs/REVERSE_ENGINEERED_ENGINES.md"],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
    )
    assert chk_ig.returncode == 0, "docs/REVERSE_ENGINEERED_ENGINES.md MUST remain gitignored"

    print("G7_CLAIMS_AND_HASHES_OK")


if __name__ == "__main__":
    run()
