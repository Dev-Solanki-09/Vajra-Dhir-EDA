import pathlib
import sys

errors = []
for pdf in pathlib.Path(".").rglob("*.pdf"):
    # Ignore virtualenvs or node_modules or docs/public-examples
    p_str = str(pdf).replace("\\", "/")
    if ".venv" in p_str or "node_modules" in p_str or "target" in p_str:
        continue
    if not p_str.startswith("docs/public-examples"):
        errors.append(f"COPYRIGHT_PDF_GUARD: {p_str}")

if errors:
    print("\n".join(errors))
    sys.exit(1)

print("PASS: Zero unauthorized PDFs in repository")
