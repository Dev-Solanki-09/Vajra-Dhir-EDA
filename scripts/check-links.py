import pathlib
import re
import sys

LINK_PATTERN = re.compile(r"\[([^\]]+)\]\(([^)#]+)(?:#[^)]*)?\)")

md_files = [pathlib.Path("README.md")] + list(pathlib.Path("docs").glob("*.md"))
broken_links = []

for mf in md_files:
    if not mf.exists():
        continue
    content = mf.read_text(encoding="utf-8")
    for match in LINK_PATTERN.finditer(content):
        link_target = match.group(2).strip()
        # Skip external URLs or anchor-only links
        if link_target.startswith("http://") or link_target.startswith("https://") or link_target.startswith("mailto:"):
            continue
        if link_target.startswith("#"):
            continue

        target_path = (mf.parent / link_target).resolve()
        # If relative to repo root
        repo_target_path = (pathlib.Path(".") / link_target).resolve()

        if not target_path.exists() and not repo_target_path.exists():
            # Check if it's an issue template link
            if "issues/new" in link_target or "discussions" in link_target:
                continue
            broken_links.append(f"{mf}: Broken link -> '{link_target}'")

if broken_links:
    print(f"FAILED: Found {len(broken_links)} broken relative links:")
    for b in broken_links:
        print(f"  {b}")
    sys.exit(1)
else:
    print("PASS: Zero broken relative links across README.md and docs/.")
