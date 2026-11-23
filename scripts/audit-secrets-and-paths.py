import pathlib
import sys
import re

PATTERNS = [
    re.compile(r"sk-[a-zA-Z0-9]{20,}"),
    re.compile(r"ghp_[a-zA-Z0-9]{20,}"),
    re.compile(r"github_pat_[a-zA-Z0-9_]{20,}"),
    re.compile(r"AIza[0-9A-Za-z-_]{35}"),
    re.compile(r"C:\\Users\\[a-zA-Z0-9._-]+"),
]

IGNORED_DIRS = {".git", ".venv", "node_modules", "target", "dist", "prompt-and-skills", "prompt and skill"}
IGNORED_FILES = {"audit-secrets-and-paths.py", "publish-github.sh", "publish-github.ps1"}

violations = []

for p in pathlib.Path(".").rglob("*"):
    if not p.is_file():
        continue
    parts = set(p.parts)
    if parts.intersection(IGNORED_DIRS):
        continue
    if p.name in IGNORED_FILES:
        continue

    try:
        content = p.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        continue

    for line_num, line in enumerate(content.splitlines(), start=1):
        for pat in PATTERNS:
            if pat.search(line):
                # Check if it's the redacted placeholder
                if "[REDACTED_API_KEY]" in line or "sk-proj-..." in line:
                    continue
                violations.append(f"{p}:{line_num} -> {line.strip()[:100]}")

if violations:
    print(f"FAILED: Found {len(violations)} secret or local path pattern matches:")
    for v in violations:
        print(f"  {v}")
    sys.exit(1)
else:
    print("PASS: Zero leaked personal paths, secrets, or tokens found across repository.")
