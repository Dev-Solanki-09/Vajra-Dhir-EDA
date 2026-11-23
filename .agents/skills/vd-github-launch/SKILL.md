---
name: vd-github-launch
description: End-to-end open-source GitHub repository polish, anti-vaporware audit, community-health scaffolding, Day-0 green CI verification, visual branding, and safe gh CLI publishing for Vajra-Dhīr EDA. Trigger when preparing to publish, release, or polish the repository on GitHub.
---

# Vajra-Dhīr EDA — Industrial GitHub Launch & Polish Protocol

Execute all 6 phases strictly in order. Never skip Phase 4 audits. Never run `git push` or `gh repo create --public` without explicit human confirmation in Phase 5.

## Phase 1: Anti-Vaporware & Structural Completeness Audit
Verify the repository delivers real, inspectable engineering artifacts—not vague prose:
1. Ensure the following canonical files exist and are internally consistent (identical field names, `i64` nm units, UUIDv7 IDs, 12 MCP verbs, 9 Gates, Nov 2026 CVE pins):
   - `README.md` (with explicit "Project Status: Architecture Frozen · Milestone 1 Build" banner)
   - `docs/VD-SAD-001-ARCHITECTURE.md` (frozen master standard)
   - `docs/ADDENDUM_01_PRODUCTION_ESSENTIALS.md`
   - `docs/AGENT_KNOWLEDGE_UPDATE_2026_11.md`
   - `docs/THREAT_MODEL.md` & `docs/CLAIMS_REGISTER.md` (with verification dates)
   - `packages/hw-ir/schema/001_init.sql` & `002_manual_perfection.sql`
   - `schemas/mcp-v2-12verbs.json`, `schemas/worker_contract.v1.json`, `schemas/hw-plugin.v1.json`
   - `budget.json`, `AGENTS.md`, `.mcp.json`, `scripts/hooks/vd-guard.sh`
2. Strip ALL hype adjectives ("ultimate", "godly", "omniscient", "100x revolutionary") from public-facing Markdown. Replace every superlative with concrete falsifiable engineering claims (e.g., "`i64` nm coordinates", "`< 1 ms` `rstar` lookup", "3 real fabricated PCBs before Ring 2").

## Phase 2: Visual Identity & Community Health Scaffolding
Create or verify every open-source institutional file:
1. **Adaptive Dark/Light Branding:** Place `assets/banner-dark.svg` (Silicon Darkroom `#0B0E14`) and `assets/banner-light.svg` (Cleanroom Daylight `#F8FAFC`) rendered via HTML `<picture>` with `prefers-color-scheme` media queries (never deprecated `#gh-dark-mode-only` alone).
2. **Governance & Legal Hygiene:**
   - `LICENSE` (MIT License for Ring 1 Core; explicit `NOTICE` documenting Ring 2 OCI GPL isolation)
   - `CONTRIBUTING.md` (DCO `git commit -s` requirement, RFC workflow, local test commands)
   - `CODE_OF_CONDUCT.md` (Contributor Covenant v2.1)
   - `SECURITY.md` (GitHub Private Vulnerability Reporting, 90-day CVD SLA, NDA airgap notes)
   - `GOVERNANCE.md` & `TRADEMARK.md`
   - `CHANGELOG.md` (Keep a Changelog format starting with `v0.1.0-architecture`)
   - `.github/CODEOWNERS`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/FUNDING.yml`
   - `.github/ISSUE_TEMPLATE/` YAML forms: `config.yml`, `rfc_architecture.yml`, `bug_report.yml`, `open_cubo_proposal.yml`
   - `.gitignore` (explicitly excluding `*.pdf` outside `docs/public-examples/`, `.env*`, `*.vd.db*`, `target/`, `node_modules/`, `.venv/`)

## Phase 3: Day-0 Green CI Workflow
Install `.github/workflows/ci-spec-integrity.yml` enforcing 6 real automated gates on every push and PR:
1. **SQLite DDL & Lock-Trigger Proof:** Execute `001_init.sql` + `002_manual_perfection.sql` in `sqlite3 :memory:` and prove `trg_protect_locked_components_upd` aborts an unauthorized agent update.
2. **JSON Schema Validation:** Validate every `.json` file under `schemas/` and `budget.json` using Python `jsonschema`.
3. **DCO Signoff Check (In-Repo PR Workflow):** Verify every PR commit contains a `Signed-off-by:` trailer (since GitHub Rulesets do not enforce DCO natively).
4. **Copyright & License Firewall:** Fail on any committed vendor `.pdf`, forbidden AGPL/NC references in Ring 1, or vulnerable Nov 2026 CVE pins (`wasmtime < 50`, `react < 19.3.1`).
5. **Secret Scan:** Run `gitleaks` across full commit history.
6. **Markdown Internal Link Check:** Verify zero broken relative links inside `README.md` and `docs/`.

## Phase 4: Pre-Push Local Hard Audit Gate (Fail Closed)
Run ALL local checks before touching GitHub:
1. Run `scripts/hooks/vd-guard.sh` and `gitleaks detect --source . --no-git` — MUST exit `0`.
2. Grep the entire tree for leaked personal local paths (`/Users/`, `/home/`, `C:\Users\`, API key prefixes `sk-`, `ghp_`, `AIza`) — MUST return 0 matches.
3. Execute the SQLite in-memory DDL + trigger test and JSON schema validation locally — MUST pass 100%.
4. Render `README.md` and verify every relative image/doc link resolves to an exact file path on disk.
5. Verify every commit uses `git commit -s` (DCO signoff).

## Phase 5: Human-Gated GitHub Publish & Hardening (`gh` CLI)
STOP and display a clean pre-flight summary (repo name, visibility, file count, commit message, CI checks passed) and ask the human to type `CONFIRM PUBLISH`.
Only after explicit confirmation:
1. Verify `gh auth status`.
2. Create public repo & push `main` via `scripts/publish-github.sh`:
   - Set concise description and 10 high-signal GitHub topics (`eda`, `pcb`, `kicad`, `hardware`, `asic`, `rust`, `webgpu`, `mcp`, `open-source-hardware`, `ai-agents`).
   - Enable GitHub Discussions, enable Issues, disable empty Wiki (docs live in Git), enable Web Commit Signoff.
   - Configure GitHub Repository Ruleset on `main` (block force pushes, block deletion, require PR + `Spec & Security CI` status check).
   - Tag `v0.1.0-architecture` and publish a structured GitHub Release summarizing the frozen `VD-SAD-001` blueprint and Milestone 1 entry points.
3. Poll `gh run watch` until the live GitHub Actions workflow turns **GREEN** and print the live repo URL.

## Phase 6: Community Launch Kit
Generate (into `docs/launch/`, gitignored or optional):
1. A `1280x640` GitHub Social Preview SVG/PNG (`assets/social-preview.svg`) for Repo Settings → Social Preview.
2. A pinned Welcome Discussion post inviting hardware/Rust/KiCad contributors to Milestone 1 (`T1.01`–`T1.20`).
3. Concise, zero-hype technical launch notes tailored for **Hacker News (`Show HN`)**, **Reddit (`r/PrintedCircuitBoard`, `r/ECE`, `r/rust`)**, and **X / LinkedIn**.
