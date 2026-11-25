#!/usr/bin/env python3
"""F-06 regression guard for the semantic 3-way merge driver wiring.

Three artifacts must agree for `git merge` to run `hw-merge` on *.vd-ir.jsonl:
the attribute id in `.gitattributes`, the `merge.<id>.driver` registration, and
the `[[bin]]` name the crate builds. This test checks the first two agree with
the third, then proves Git actually invokes a driver registered under that id
by forcing a real 3-way conflict in a throwaway repository.

The driver binary is not built here (a linker may be unavailable); a stub
driver that honours the %O/%A/%B contract stands in, so the test covers the
registration mechanics that F-06 is about. Merge semantics live in
`merge_test.rs`.

Run: python packages/hw-merge/tests/test_merge_driver_registration.py
"""

import importlib.util
import subprocess
import sys
import tempfile
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "packages" / "hw-merge" / "register_merge_driver.py"

STUB_DRIVER = """import pathlib
import sys

base, ours, theirs = (pathlib.Path(p).read_text(encoding="utf-8") for p in sys.argv[1:4])
pathlib.Path({marker!r}).write_text("|".join(sys.argv[1:4]), encoding="utf-8")
pathlib.Path(sys.argv[2]).write_text(base + ours + theirs, encoding="utf-8")
"""


def load_module():
    spec = importlib.util.spec_from_file_location("register_merge_driver", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def git(repo, *args, check=True):
    proc = subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if check and proc.returncode != 0:
        raise AssertionError(f"git {' '.join(args)} failed ({proc.returncode}): {proc.stderr}")
    return proc


def init_repo(repo: Path) -> None:
    if git(repo, "init", "-b", "main", check=False).returncode != 0:
        git(repo, "init")
        git(repo, "branch", "-m", "main")
    git(repo, "config", "--local", "user.email", "worker@example.invalid")
    git(repo, "config", "--local", "user.name", "T-03 worker")
    git(repo, "config", "--local", "commit.gpgsign", "false")


def test_artifacts_agree() -> None:
    module = load_module()
    attribute_id = module.parse_attribute_id(
        (ROOT / ".gitattributes").read_text(encoding="utf-8")
    )
    bin_name = module.parse_bin_name(
        (ROOT / "packages" / "hw-merge" / "Cargo.toml").read_text(encoding="utf-8")
    )

    assert attribute_id == "hwir", f"attribute id drifted: {attribute_id}"
    assert bin_name == "hw-merge", f"crate binary drifted: {bin_name}"
    assert module.driver_command(bin_name) == "hw-merge %O %A %B"
    assert f'name = "{bin_name}"' in (
        ROOT / "packages" / "hw-merge" / "Cargo.toml"
    ).read_text(encoding="utf-8")


def test_cli_registers_local_config() -> None:
    with tempfile.TemporaryDirectory() as td:
        repo = Path(td)
        init_repo(repo)
        (repo / ".gitattributes").write_text(
            "*.vd-ir.jsonl merge=hwir text eol=lf\n", encoding="utf-8"
        )
        (repo / "packages" / "hw-merge").mkdir(parents=True)
        (repo / "packages" / "hw-merge" / "Cargo.toml").write_text(
            '[package]\nname = "vd-merge"\n\n[[bin]]\nname = "hw-merge"\npath = "src/main.rs"\n',
            encoding="utf-8",
        )

        proc = subprocess.run(
            [sys.executable, str(SCRIPT), "--repo", str(repo)],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        assert proc.returncode == 0, proc.stderr

        driver = git(repo, "config", "--local", "merge.hwir.driver").stdout.strip()
        assert driver == "hw-merge %O %A %B", driver
        assert git(repo, "config", "--local", "merge.hwir.name").stdout.strip()


def test_conflict_invokes_registered_driver() -> None:
    with tempfile.TemporaryDirectory() as td:
        repo = Path(td)
        init_repo(repo)

        marker = repo / "driver_invoked.txt"
        stub = repo / "stub_driver.py"
        stub.write_text(STUB_DRIVER.format(marker=str(marker)), encoding="utf-8")

        (repo / ".gitattributes").write_text(
            "*.vd-ir.jsonl merge=hwir text eol=lf\n", encoding="utf-8"
        )
        target = repo / "board.vd-ir.jsonl"
        target.write_text('{"id":"base"}\n', encoding="utf-8")
        git(repo, "add", "-A")
        git(repo, "commit", "-m", "base")

        git(repo, "checkout", "-b", "theirs")
        target.write_text('{"id":"theirs"}\n', encoding="utf-8")
        git(repo, "commit", "-am", "theirs")

        git(repo, "checkout", "main")
        target.write_text('{"id":"ours"}\n', encoding="utf-8")
        git(repo, "commit", "-am", "ours")

        attribute_id = load_module().parse_attribute_id(
            (repo / ".gitattributes").read_text(encoding="utf-8")
        )
        git(
            repo,
            "config",
            "--local",
            f"merge.{attribute_id}.driver",
            f'"{sys.executable}" "{stub.as_posix()}" %O %A %B',
        )

        merged = git(repo, "merge", "--no-edit", "theirs", check=False)
        assert merged.returncode == 0, (
            "git merge failed, so the registered driver was not used:\n"
            f"stdout={merged.stdout}\nstderr={merged.stderr}"
        )
        assert marker.exists(), "registered merge driver was never invoked"

        # Git passes %O/%A/%B as transient .merge_file_* paths and deletes them
        # once the driver returns, so assert on arity, not on existence.
        args = marker.read_text(encoding="utf-8").split("|")
        assert len(args) == 3 and all(args), args

        result = target.read_text(encoding="utf-8")
        for token in ("base", "ours", "theirs"):
            assert token in result, f"{token} missing from driver output: {result!r}"


def main() -> int:
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failures = 0
    for test in tests:
        try:
            test()
            print(f"PASS {test.__name__}")
        except Exception:
            failures += 1
            print(f"FAIL {test.__name__}")
            traceback.print_exc()
    print(f"{len(tests) - failures}/{len(tests)} passed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
