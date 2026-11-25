#!/usr/bin/env python3
"""Register the semantic 3-way hardware merge driver in a Git repository.

F-06: the three artifacts that make the driver work were never tied together.
`.gitattributes` binds `*.vd-ir.jsonl` to the attribute driver id `hwir`, but
Git only runs a driver whose id is registered as `merge.<id>.driver`, and no
such registration existed anywhere. The executable is the `[[bin]]` this crate
builds (`hw-merge`). After this script runs, all three agree:

    .gitattributes   *.vd-ir.jsonl merge=hwir
    git config       merge.hwir.driver = "hw-merge %O %A %B"
    Cargo.toml       [[bin]] name = "hw-merge"

Git's merge-driver placeholders: %O base, %A ours (also the output file),
%B theirs. `hw-merge` takes them positionally and writes the merged result to
%A by default, which matches the driver contract.

Usage:
    python packages/hw-merge/register_merge_driver.py [--repo PATH]

Idempotent: re-running overwrites the two local config keys. It never touches
global config, so a clone only ever changes when someone runs it on purpose.
"""

import argparse
import re
import subprocess
import sys
from pathlib import Path

GITATTRIBUTES_REL = ".gitattributes"
CARGO_TOML_REL = Path("packages") / "hw-merge" / "Cargo.toml"
DRIVER_NAME = "Vajra-Dhir semantic 3-way hardware merge"


def parse_attribute_id(gitattributes_text: str) -> str:
    """Extract the merge driver id bound to *.vd-ir.jsonl."""
    m = re.search(
        r"^\*\.vd-ir\.jsonl\s+merge=([A-Za-z0-9_.-]+)",
        gitattributes_text,
        re.MULTILINE,
    )
    if not m:
        raise ValueError("no '*.vd-ir.jsonl merge=<id>' binding in .gitattributes")
    return m.group(1)


def parse_bin_name(cargo_toml_text: str) -> str:
    """Extract the [[bin]] name the crate actually builds."""
    section = re.search(r"^\[\[bin\]\]\s*$(.*?)(?=^\[|\Z)", cargo_toml_text, re.MULTILINE | re.DOTALL)
    if not section:
        raise ValueError("no [[bin]] section in Cargo.toml")
    m = re.search(r'^name\s*=\s*"([^"]+)"', section.group(1), re.MULTILINE)
    if not m:
        raise ValueError("no name in [[bin]] section")
    return m.group(1)


def driver_command(bin_name: str) -> str:
    if not bin_name or re.search(r"\s", bin_name):
        raise ValueError(f"binary name must be a bare command: {bin_name!r}")
    return f"{bin_name} %O %A %B"


def _git(repo: Path, *args: str) -> str:
    proc = subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if proc.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {proc.stderr.strip()}")
    return proc.stdout.strip()


def register(repo: Path, attribute_id: str, bin_name: str) -> None:
    _git(repo, "config", "--local", f"merge.{attribute_id}.name", DRIVER_NAME)
    _git(repo, "config", "--local", f"merge.{attribute_id}.driver", driver_command(bin_name))


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--repo", default=".", help="repository root (default: .)")
    args = parser.parse_args(argv)

    repo = Path(args.repo).resolve()
    attribute_id = parse_attribute_id((repo / GITATTRIBUTES_REL).read_text(encoding="utf-8"))
    bin_name = parse_bin_name((repo / CARGO_TOML_REL).read_text(encoding="utf-8"))

    register(repo, attribute_id, bin_name)
    print(f"registered merge.{attribute_id}.driver = {driver_command(bin_name)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
