import json
import pathlib
import sys

failed = False
targets = list(pathlib.Path("schemas").glob("*.json")) + [pathlib.Path("budget.json")]

for jf in targets:
    if jf.exists():
        try:
            data = json.loads(jf.read_text(encoding="utf-8"))
            print(f"VALID JSON: {jf}")
        except Exception as e:
            print(f"INVALID JSON: {jf} -> {e}")
            failed = True

if failed:
    sys.exit(1)
print("PASS: All JSON schemas and budget.json are valid JSON")
