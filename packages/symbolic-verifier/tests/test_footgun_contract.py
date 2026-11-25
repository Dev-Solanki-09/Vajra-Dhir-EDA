#!/usr/bin/env python3
"""F-07 contract guard for the canonical footgun engine.

F-07 as filed claimed FG-05's message advertises 900-11000 while the check
enforces [1000, 10000]. That range exists nowhere in the shipped source: FG-05
is `check_split_plane_crossing`, a boolean predicate on whether a trace crosses
a void in its reference plane. This test pins that truth so the phantom range
cannot be reintroduced, and it pins the one numeric footgun limit that does
exist (FG-04 decoupling, 2.00 mm) to its message, so message and check cannot
drift apart the way F-07 described.

Run: python packages/symbolic-verifier/tests/test_footgun_contract.py
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "packages" / "symbolic-verifier" / "src" / "footguns.rs"

CANONICAL = {
    "FG-01": "Fg01MlccDcBiasCollapse",
    "FG-02": "Fg02InductorSaturation",
    "FG-03": "Fg03FloatingCmosInputs",
    "FG-04": "Fg04MissingDecouplingCaps",
    "FG-05": "Fg05SplitGroundCrossing",
    "FG-06": "Fg06I2cPullupRiseTime",
    "FG-07": "Fg07ReversePolarityThermal",
    "FG-08": "Fg08McuBootStrapping",
    "FG-09": "Fg09CrystalLoadCapMismatch",
    "FG-10": "Fg10ThermalJunctionExceedance",
}

PHANTOM_RANGE = {900, 1000, 10000, 11000}
DECOUPLING_LIMIT_NM = 2_000_000


def _braced_block(text: str, header: str) -> str:
    m = re.search(header, text)
    if not m:
        raise AssertionError(f"header not found: {header}")
    start = text.index("{", m.start())
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return text[start + 1:i]
    raise AssertionError(f"unbalanced braces after: {header}")


def fn_body(text: str, name: str) -> str:
    m = re.search(r"pub fn " + re.escape(name) + r"\b", text)
    if not m:
        raise AssertionError(f"function not found: {name}")
    start = text.index("{", m.end())
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return text[start + 1:i]
    raise AssertionError(f"unbalanced braces in: {name}")


def int_literals(text: str) -> set:
    """Integer literals in code only, ignoring string contents and identifiers like Z0."""
    code = re.sub(r'"(?:\\.|[^"\\])*"', '""', text)
    code = re.sub(r"'(?:\\.|[^'\\])'", "''", code)
    return {int(tok.replace("_", "")) for tok in re.findall(r"(?<![\w])\d[\d_]*(?![\w])", code)}


def footgun_kinds(text: str) -> dict:
    body = _braced_block(text, r"pub enum FootgunKind")
    return {
        f"FG-{m.group(1)}": f"Fg{m.group(1)}{m.group(2)}"
        for m in re.finditer(r"^\s{4}Fg(\d{2})([A-Za-z0-9]+),", body, re.MULTILINE)
    }


def audit(text: str) -> list:
    problems = []

    kinds = footgun_kinds(text)
    if kinds != CANONICAL:
        problems.append(
            "FootgunKind drift: missing=%s extra=%s renamed=%s"
            % (
                sorted(set(CANONICAL) - set(kinds)),
                sorted(set(kinds) - set(CANONICAL)),
                {k: (kinds[k], CANONICAL[k]) for k in CANONICAL if k in kinds and kinds[k] != CANONICAL[k]},
            )
        )

    fg05 = fn_body(text, "check_split_plane_crossing")
    if "Fg05SplitGroundCrossing" not in fg05:
        problems.append("FG-05 check does not emit Fg05SplitGroundCrossing")
    if "crosses_void_plane" not in fg05:
        problems.append("FG-05 check is not keyed on the boolean crosses_void_plane")
    phantom = sorted(int_literals(fg05) & PHANTOM_RANGE)
    if phantom:
        problems.append(f"FG-05 body reintroduced the phantom range literals {phantom}")

    decoupling = fn_body(text, "check_decoupling_distance")
    threshold = re.search(r"max_allowed_distance_nm\s*:\s*Nm\s*=\s*([\d_]+)", decoupling)
    if not threshold:
        problems.append("FG-04 threshold constant not found")
    elif int(threshold.group(1).replace("_", "")) != DECOUPLING_LIMIT_NM:
        problems.append(
            f"FG-04 threshold {threshold.group(1)} disagrees with documented 2.00 mm"
        )
    if "2.00 mm" not in decoupling:
        problems.append("FG-04 message does not state the enforced 2.00 mm limit")

    return problems


def test_canonical_contract_holds() -> None:
    problems = audit(SOURCE.read_text(encoding="utf-8"))
    assert problems == [], "\n".join(problems)


def test_fg05_is_boolean_not_range() -> None:
    body = fn_body(SOURCE.read_text(encoding="utf-8"), "check_split_plane_crossing")
    assert int_literals(body) == set(), f"FG-05 should have no numeric limit, found {int_literals(body)}"
    assert "if crosses_void_plane" in body


def test_mutations_are_detected() -> None:
    source = SOURCE.read_text(encoding="utf-8")
    assert audit(source) == [], "baseline must be clean before mutation checks"

    threshold = audit(source.replace("2_000_000", "2_500_000"))
    assert any("FG-04 threshold" in p for p in threshold), threshold

    marker = "if crosses_void_plane {"
    injected = source[: source.index(marker)] + "let phantom = 11_000;\n            " + source[source.index(marker):]
    assert any("phantom range" in p for p in audit(injected))


def main() -> int:
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failures = 0
    for test in tests:
        try:
            test()
            print(f"PASS {test.__name__}")
        except AssertionError as exc:
            failures += 1
            print(f"FAIL {test.__name__}: {exc}")
    print(f"{len(tests) - failures}/{len(tests)} passed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
