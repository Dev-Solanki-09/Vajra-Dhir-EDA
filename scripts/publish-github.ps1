[CmdletBinding()]
param (
    [string]$RepoName = "vajra-dhir-eda"
)

$ErrorActionPreference = "Stop"
$Desc = "Open-source autonomous & manual Hardware/Software Co-Design IDE (PCB, Firmware, FPGA, IC) — Rust HW-IR, WebGPU, MCP v2, ACP & KiCad 10"

Write-Host "=== 1. Pre-Publish Security & Integrity Audit ===" -ForegroundColor Cyan
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Error "Install GitHub CLI (gh) first: https://cli.github.com"
}
gh auth status
node scripts/check-spdx-firewall.mjs
node scripts/verify-all.mjs

Write-Host "=== 2. Confirm Public Publish ===" -ForegroundColor Yellow
$confirmation = Read-Host "Create PUBLIC repo '$RepoName' and push 'main'? Type PUBLISH to continue"
if ($confirmation -ne "PUBLISH") {
    Write-Host "Aborted." -ForegroundColor Red
    exit 0
}

# Ensure git branch main
git branch -M main

# Check if commit exists
$head = git rev-parse --verify HEAD 2>$null
if (-not $head) {
    git add -A
    git commit -s -m "docs(architecture): publish frozen VD-SAD-001 Rev 2.0 specification & Milestone 1 contracts"
}

Write-Host "=== 3. Create Public Repository & Push via gh CLI ===" -ForegroundColor Cyan
gh repo create $RepoName --public --source=. --remote=origin --push --description $Desc

$Owner = (gh api user -q .login).Trim()
$FullRepo = "$Owner/$RepoName"

Write-Host "=== 4. Configure Topics, Discussions & Clean Settings ===" -ForegroundColor Cyan
gh repo edit $FullRepo `
    --enable-issues `
    --enable-discussions `
    --enable-wiki=false `
    --add-topic eda `
    --add-topic pcb `
    --add-topic kicad `
    --add-topic hardware `
    --add-topic asic `
    --add-topic rust `
    --add-topic webgpu `
    --add-topic mcp `
    --add-topic open-source-hardware `
    --add-topic ai-agents

gh api -X PATCH "repos/$FullRepo" -f web_commit_signoff_required=true

Write-Host "=== 5. Tag & Publish v0.1.0-architecture Release ===" -ForegroundColor Cyan
git tag -a v0.1.0-architecture -m "Vajra-Dhīr EDA — Frozen Architecture Standard (VD-SAD-001 Rev 2.0)"
git push origin v0.1.0-architecture
gh release create v0.1.0-architecture `
    --repo $FullRepo `
    --title "v0.1.0-architecture — Frozen VD-SAD-001 Specification & Milestone 1 Launch" `
    --notes "Initial public architecture release of Vajra-Dhīr EDA. Includes frozen industrial specification (VD-SAD-001 Rev 2.0), canonical SQLite WAL HW-IR DDL with human-lock triggers, MCP v2 / WorkerContract JSON schemas, STRIDE + OWASP Agentic AI threat model, and Milestone 1 roadmap."

Write-Host "=== 6. Live Repository Ready ===" -ForegroundColor Green
Write-Host "LIVE AT: https://github.com/$FullRepo" -ForegroundColor Green
