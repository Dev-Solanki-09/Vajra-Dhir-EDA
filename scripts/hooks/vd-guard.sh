#!/usr/bin/env bash
set -euo pipefail

# 1. Block vendor PDFs from entering Git (Copyright / Prompt-Injection Firewall)
if git diff --cached --name-only | grep -E '\.pdf$' | grep -vq '^docs/public-examples/'; then
  echo "BLOCKED: Vendor PDF staged for commit. Cache PDFs locally in ~/.vajradhir/datasheets/ via datasheet-lens." >&2
  exit 1
fi

# 2. Block forbidden AGPL / Non-Commercial dependencies in Ring 1 manifests
if git diff --cached -- Cargo.toml package.json pyproject.toml 'packages/*' 'apps/*' | grep -iE '\+(.*)(kibot|konnect|part-db|pypsa-app|openmodelica|pcbworld-weights)'; then
  echo "BLOCKED: Forbidden AGPL or Non-Commercial dependency detected in Ring 1 core!" >&2
  exit 1
fi

# 3. Enforce Nov 2026 Critical CVE Version Floors (Wasmtime >=50, React >=19.3.1)
if [ -f Cargo.toml ] && grep -E 'wasmtime\s*=\s*"?(2[0-9]|3[0-9]|4[0-7])\.' Cargo.toml >/dev/null; then
  echo "BLOCKED: Vulnerable Wasmtime (<50.0 / CVE-2026-115889). Pin wasmtime >= 50.0.0." >&2
  exit 1
fi
if [ -f package.json ] && grep -E '"react"\s*:\s*"[\^~]?19\.[0-2]\.' package.json >/dev/null; then
  echo "BLOCKED: Vulnerable React (<19.3.1 / CVE-2026-126187). Pin react >= 19.3.1." >&2
  exit 1
fi

# 4. Block new .unwrap() calls in Ring 1 Rust library crates
if git diff --cached -- 'packages/*/src/*.rs' | grep -E '^\+.*\.unwrap\(\)' | grep -v 'test'; then
  echo "BLOCKED: .unwrap() added in Ring 1 Rust library code. Return typed Result error." >&2
  exit 1
fi

# 5. Secret leak check (Zero Credentials in Git — Clouds-Against-Humanity Habit)
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks protect --staged --no-banner
fi

echo "vd-guard: ALL DETERMINISTIC INVARIANTS PASSED"
