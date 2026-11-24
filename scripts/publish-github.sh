#!/usr/bin/env bash
set -euo pipefail

REPO_NAME="${1:-vajra-dhir-eda}"
DESC="Open-source autonomous & manual Hardware/Software Co-Design IDE (PCB, Firmware, FPGA, IC) — Rust HW-IR, WebGPU, MCP v2, ACP & KiCad 10"

echo "=== 1. Pre-Publish Security & Integrity Audit ==="
command -v gh >/dev/null || { echo "Install GitHub CLI (gh) first: https://cli.github.com"; exit 1; }
gh auth status
bash scripts/hooks/vd-guard.sh

if git grep -nE '(/Users/[a-zA-Z0-9._-]+|C:\\Users\\[a-zA-Z0-9._-]+|sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{20,})' -- . ':!scripts/publish-github.sh' ':!scripts/publish-github.ps1'; then
  echo "BLOCKED: Detected local user path or secret pattern!" >&2
  exit 1
fi

echo "=== 2. Confirm Public Publish ==="
read -rp "Create PUBLIC repo '${REPO_NAME}' and push 'main'? Type PUBLISH to continue: " CONFIRM
[ "$CONFIRM" = "PUBLISH" ] || { echo "Aborted."; exit 0; }

# Ensure initial signed-off commit exists
if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
  git branch -M main
  git add -A
  git commit -s -m "docs(architecture): publish frozen VD-SAD-001 Rev 2.0 specification & Milestone 1 contracts"
fi

echo "=== 3. Create Public Repository & Push via gh CLI ==="
gh repo create "$REPO_NAME" \
  --public \
  --source=. \
  --remote=origin \
  --push \
  --description "$DESC"

OWNER="$(gh api user -q .login)"
FULL_REPO="${OWNER}/${REPO_NAME}"

echo "=== 4. Configure Topics, Discussions, Web Commit Signoff & Clean Settings ==="
gh repo edit "$FULL_REPO" \
  --enable-issues \
  --enable-discussions \
  --enable-wiki=false \
  --add-topic eda \
  --add-topic pcb \
  --add-topic kicad \
  --add-topic hardware \
  --add-topic asic \
  --add-topic rust \
  --add-topic webgpu \
  --add-topic mcp \
  --add-topic open-source-hardware \
  --add-topic ai-agents

# Enable mandatory web commit signoff (DCO support in GitHub Web UI)
gh api -X PATCH "repos/${FULL_REPO}" -f web_commit_signoff_required=true >/dev/null

echo "=== 5. Apply GitHub Repository Ruleset on 'main' ==="
gh api -X POST "repos/${FULL_REPO}/rulesets" --input - <<'EOF' >/dev/null
{
  "name": "main-industrial-protection",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "pull_request", "parameters": { "required_approving_review_count": 0, "dismiss_stale_reviews_on_push": true } },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [{ "context": "SQLite DDL, Schemas, DCO & License Firewall" }]
      }
    }
  ]
}
EOF

echo "=== 6. Tag & Publish v0.0.1 Release ==="
git tag -a v0.0.1 -m "Vajra-Dhīr EDA — Frozen Architecture Standard (VD-SAD-001 Rev 2.0)"
git push origin v0.0.1
gh release create v0.0.1 \
  --repo "$FULL_REPO" \
  --title "v0.0.1 — Frozen VD-SAD-001 Specification & Milestone 1 Launch" \
  --notes "Initial public architecture release of **Vajra-Dhīr EDA**. Includes frozen industrial specification (\`VD-SAD-001 Rev 2.0\`), canonical SQLite WAL \`HW-IR\` DDL with human-lock triggers, MCP v2 / WorkerContract JSON schemas, STRIDE + OWASP Agentic AI threat model, and Milestone 1 (\`T1.01\`–\`T1.20\`) roadmap."

echo "=== 7. Watch First CI Run Turn Green ==="
gh run watch --repo "$FULL_REPO" || true
echo "LIVE AT: https://github.com/${FULL_REPO}"
