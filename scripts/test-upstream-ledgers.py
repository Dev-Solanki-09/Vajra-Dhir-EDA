#!/usr/bin/env python3
"""
scripts/test-upstream-ledgers.py
Offline verification for Phase G4:
- Validates scripts/import-upstream-stack.sh deny-list & URL hygiene (zero forbidden clones)
- Validates public vendor/MANIFEST.json attribution & privacy firewall (no rewrite_target/study_notes)
- Validates docs/LICENSE_EXCEPTIONS.md coverage (elkjs, occt-import-js, surfer removal, KiKit Ring-2, serde_kicad_sexpr drop)
- Validates spec-derived golden DATA fixtures under tests/fixtures/
"""

import json
import os
import re
import shutil
import subprocess
import sys

FORBIDDEN_TERMS = [
    "PyMuPDF",
    "KiBot",
    "Konnect",
    "Part-DB-server",
    "pypsa-app",
    "OpenModelica",
    "surfer-project/surfer",
    "serde_kicad_sexpr",
]


def _require(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(msg)


def test_import_script_firewall() -> None:
    path = "scripts/import-upstream-stack.sh"
    _require(os.path.isfile(path), f"Missing {path}")
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()

    _require("--dry-run" in text, "import-upstream-stack.sh missing --dry-run mode")
    _require("FORBIDDEN_PATTERN" in text, "import-upstream-stack.sh missing FORBIDDEN_PATTERN")

    urls = re.findall(r'"(https://[^"]+)"', text)
    _require(len(urls) >= 150, f"Expected >= 150 curated upstream URLs, got {len(urls)}")
    for u in urls:
        for bad in FORBIDDEN_TERMS:
            _require(bad.lower() not in u.lower(), f"Forbidden repo URL found in importer: {u}")

    git_bash = r"C:\Program Files\Git\bin\bash.exe"
    bash_bin = git_bash if os.path.isfile(git_bash) else shutil.which("bash")
    # Never invoke Windows System32 WSL shim (slow / boots VM on low-spec hosts)
    if bash_bin and "system32" not in bash_bin.lower():
        res = subprocess.run(
            [bash_bin, path, "--dry-run", "--all"],
            capture_output=True,
            text=True,
            timeout=15,
        )
        _require(res.returncode == 0, f"import-upstream-stack.sh --dry-run --all failed: {res.stderr}")
        _require("[DRY-RUN]" in res.stdout, "Expected [DRY-RUN] markers in dry-run output")


def test_public_manifest() -> None:
    path = "vendor/MANIFEST.json"
    _require(os.path.isfile(path), f"Missing public ledger {path}")
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    entries = data.get("entries")
    _require(isinstance(entries, list) and len(entries) >= 15, "vendor/MANIFEST.json entries must be non-empty list")
    valid_classes = {"ring1-dep", "ring2-subprocess", "exception-isolated"}
    seen_names = set()
    for e in entries:
        for k in ("name", "url", "license", "class", "purpose"):
            _require(bool(e.get(k)), f"MANIFEST entry missing {k}: {e}")
        _require(e["class"] in valid_classes, f"Invalid MANIFEST class {e['class']} on {e['name']}")
        _require("rewrite_target" not in e and "study_notes" not in e, f"Privacy breach in MANIFEST: {e['name']}")
        for bad in FORBIDDEN_TERMS:
            _require(
                bad.lower() not in e["name"].lower() and bad.lower() not in e["url"].lower(),
                f"Forbidden entry in public MANIFEST: {e['name']}",
            )
        seen_names.add(e["name"])

    _require("elkjs" in seen_names, "Public MANIFEST missing elkjs (EPL-2.0 exception-isolated)")
    _require("occt-import-js" in seen_names, "Public MANIFEST missing occt-import-js (LGPL-2.1-OCCT exception-isolated)")
    _require("KiKit" in seen_names, "Public MANIFEST missing KiKit (ring2-subprocess)")


def test_license_exceptions_doc() -> None:
    path = "docs/LICENSE_EXCEPTIONS.md"
    _require(os.path.isfile(path), f"Missing {path}")
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()

    for required in ("elkjs", "EPL-2.0", "occt-import-js", "LGPL-2.1", "surfer", "EUPL-1.2", "KiKit", "serde_kicad_sexpr"):
        _require(required in text, f"docs/LICENSE_EXCEPTIONS.md missing required clause: {required}")


def test_golden_fixtures() -> None:
    expected_files = [
        "tests/fixtures/panelizer/spec_panel_2x2.json",
        "tests/fixtures/wire-harness/spec_harness.yml",
        "tests/fixtures/wire-harness/spec_harness_expected.json",
        "tests/fixtures/pcb-diff/rev_a_rev_b_diff.json",
        "tests/fixtures/rs274x/sample_pad_flash.gbr",
        "tests/fixtures/rs274x/expected_primitives.json",
    ]
    for p in expected_files:
        _require(os.path.isfile(p), f"Missing golden fixture: {p}")

    with open("tests/fixtures/panelizer/spec_panel_2x2.json", "r", encoding="utf-8") as f:
        panel = json.load(f)
    _require(panel.get("provenance") == "spec-derived", "Panelizer fixture must be labeled spec-derived")
    _require(panel["panel_matrix"] == [2, 2], "Panelizer fixture must specify 2x2 matrix")

    with open("tests/fixtures/rs274x/expected_primitives.json", "r", encoding="utf-8") as f:
        rs = json.load(f)
    _require(rs.get("provenance") == "spec-derived", "RS-274X fixture must be labeled spec-derived")
    _require(rs.get("expected_flashes", 0) >= 2, "RS-274X fixture must record expected flashes")


if __name__ == "__main__":
    test_import_script_firewall()
    test_public_manifest()
    test_license_exceptions_doc()
    test_golden_fixtures()
    print("PASS: G4 upstream importer firewall, public MANIFEST, LICENSE_EXCEPTIONS.md, and spec-derived fixtures verified.")
