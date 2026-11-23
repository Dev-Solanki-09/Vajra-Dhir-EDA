# scripts/test-vscode-extension.py
import json
import os
import sys

def test_extension_manifest_and_csp():
    pkg_path = "apps/vscode-extension/package.json"
    assert os.path.exists(pkg_path), "apps/vscode-extension/package.json must exist"
    with open(pkg_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    assert data["name"] == "vajra-dhir-vscode"
    assert "customEditors" in data["contributes"]
    editors = data["contributes"]["customEditors"]
    assert any(e["viewType"] == "vajradhir.pcbEditor" for e in editors)
    assert any(e["viewType"] == "vajradhir.schematicEditor" for e in editors)
    
    # Check extension.ts for strict CSP
    ext_ts = "apps/vscode-extension/src/extension.ts"
    assert os.path.exists(ext_ts), "apps/vscode-extension/src/extension.ts must exist"
    with open(ext_ts, "r", encoding="utf-8") as f:
        ts_content = f.read()
    assert "connect-src 'none'" in ts_content, "Strict CSP connect-src 'none' must be enforced in webview"
    assert "vajradhir.pcbEditor" in ts_content, "pcbEditor registration required"
    assert "vajradhir.schematicEditor" in ts_content, "schematicEditor registration required"
    
    print("PASS: VS Code Extension manifest, custom editor registration, and strict CSP verified.")

if __name__ == "__main__":
    test_extension_manifest_and_csp()
