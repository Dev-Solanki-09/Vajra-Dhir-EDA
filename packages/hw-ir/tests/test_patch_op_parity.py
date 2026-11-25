#!/usr/bin/env python3
"""F-05 parity regression guard for the canonical HW-IR kernel mirrors.

The kernel defines one patch vocabulary. It is mirrored, by hand, in four
places. Nothing enforced agreement, which is how F-05 drifted in the first
place. This test parses the shipped source files (it does not import or build
them) and fails on any disagreement:

    packages/hw-ir/src/model.rs    enum HardwarePatchOp  -> op discriminants
    packages/hw-ir/ts/types.ts     HardwarePatchOp union -> op discriminants
    packages/hw-ir/src/model.rs    enum Provenance      -> actor kinds
    packages/hw-ir/ts/types.ts     Provenance union     -> actor kinds
    packages/hw-ir/schema/*.sql    provenance CHECK     -> actor kinds

Run: python packages/hw-ir/tests/test_patch_op_parity.py
Exit 0 when every mirror agrees, 1 with a printed diff otherwise.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
IR = ROOT / "packages" / "hw-ir"


def _braced_block(text: str, header: str) -> str:
    """Return the body between the first '{' after `header` and its match."""
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


def _until_next_export(text: str, header: str) -> str:
    """Return text from `header` to the next top-level `export` declaration."""
    m = re.search(header, text)
    if not m:
        raise AssertionError(f"header not found: {header}")
    rest = text[m.end():]
    stop = rest.find("\nexport ")
    return rest if stop == -1 else rest[:stop]


def _screaming_snake(pascal: str) -> str:
    """UpsertEntity -> UPSERT_ENTITY, BindPinNet -> BIND_PIN_NET."""
    words = re.findall(r"[A-Z][a-z0-9]*|[A-Z]+(?![a-z])", pascal)
    return "_".join(w.upper() for w in words)


def rust_patch_ops(text: str) -> set:
    body = _braced_block(text, r"pub enum HardwarePatchOp")
    ops = set()
    for line in body.splitlines():
        m = re.match(r"\s{4}([A-Z][A-Za-z0-9]*)\s*[{,]", line)
        if m:
            ops.add(_screaming_snake(m.group(1)))
    return ops


def ts_patch_ops(text: str) -> set:
    body = _until_next_export(text, r"export type HardwarePatchOp\s*=")
    return set(re.findall(r"op:\s*'([A-Z0-9_]+)'", body))


def rust_provenance(text: str) -> set:
    body = _braced_block(text, r"pub enum Provenance")
    return {
        m.group(1).lower()
        for m in re.finditer(r"^\s{4}([A-Z][A-Za-z0-9]*),", body, re.MULTILINE)
    }


def ts_provenance(text: str) -> set:
    m = re.search(r"export type Provenance\s*=\s*([^;]+);", text)
    if not m:
        raise AssertionError("TS Provenance union not found")
    return set(re.findall(r"'([a-z_]+)'", m.group(1)))


def sql_provenance_checks(text: str) -> list:
    """Every `provenance ... CHECK(provenance IN (...))` domain in a schema."""
    return [
        set(re.findall(r"'([a-z_]+)'", m.group(1)))
        for m in re.finditer(
            r"provenance\s+TEXT\s+NOT NULL\s+CHECK\(provenance IN \(([^)]*)\)\)", text
        )
    ]


def _selftest() -> None:
    """Prove the parsers work and that they detect a real mismatch."""
    rust = (
        "pub enum HardwarePatchOp {\n"
        "    UpsertEntity { entity: u8 },\n"
        "    DeleteEntity { id: u8 },\n"
        "}"
    )
    ts = (
        "export type HardwarePatchOp =\n"
        "  | { op: 'UPSERT_ENTITY'; entity: number }\n"
        ";\n"
        "export interface Next {}\n"
    )
    assert rust_patch_ops(rust) == {"UPSERT_ENTITY", "DELETE_ENTITY"}
    assert ts_patch_ops(ts) == {"UPSERT_ENTITY"}
    assert rust_patch_ops(rust) != ts_patch_ops(ts), "drift must be detectable"

    assert _screaming_snake("SyncFirmwarePin") == "SYNC_FIRMWARE_PIN"
    assert _screaming_snake("BindPinNet") == "BIND_PIN_NET"
    assert _screaming_snake("UpsertConstraint") == "UPSERT_CONSTRAINT"

    rust_actor = "pub enum Provenance {\n    Human,\n    Import,\n}"
    ts_actor = "export type Provenance = 'human' | 'import';"
    assert rust_provenance(rust_actor) == ts_provenance(ts_actor) == {"human", "import"}


def main() -> int:
    _selftest()

    model = (IR / "src" / "model.rs").read_text(encoding="utf-8")
    types = (IR / "ts" / "types.ts").read_text(encoding="utf-8")

    rust_ops, ts_ops = rust_patch_ops(model), ts_patch_ops(types)
    rust_actor, ts_actor = rust_provenance(model), ts_provenance(types)

    problems = []

    if rust_ops != ts_ops:
        problems.append(
            "HardwarePatchOp drift: rust-only=%s ts-only=%s"
            % (sorted(rust_ops - ts_ops), sorted(ts_ops - rust_ops))
        )
    if "UPSERT_ENTITY" not in rust_ops or "UPSERT_ENTITY" not in ts_ops:
        problems.append("UPSERT_ENTITY missing from one side of the mirror")

    if rust_actor != ts_actor:
        problems.append(
            "Provenance drift: rust-only=%s ts-only=%s"
            % (sorted(rust_actor - ts_actor), sorted(ts_actor - rust_actor))
        )
    if "import" not in rust_actor:
        problems.append("'import' actor kind missing from Rust Provenance")

    sql_files = sorted((IR / "schema").glob("*.sql"))
    for path in sql_files:
        for idx, domain in enumerate(sql_provenance_checks(path.read_text(encoding="utf-8"))):
            if domain != rust_actor:
                problems.append(
                    "%s provenance CHECK #%d drift: sql-only=%s missing=%s"
                    % (path.name, idx + 1, sorted(domain - rust_actor), sorted(rust_actor - domain))
                )

    if problems:
        print("FAIL patch-op / actor parity")
        for p in problems:
            print("  -", p)
        return 1

    print(
        "PASS patch-op parity: %d ops [%s]; actor kinds [%s]; %d SQL domain(s)"
        % (
            len(rust_ops),
            ", ".join(sorted(rust_ops)),
            ", ".join(sorted(rust_actor)),
            sum(len(sql_provenance_checks(p.read_text(encoding="utf-8"))) for p in sql_files),
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
