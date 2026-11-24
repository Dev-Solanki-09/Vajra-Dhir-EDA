# TICKET T-02 · Wave 2 · CI Repair & Real Verification Jobs

| Field | Value |
|---|---|
| Owner | WORKER-GEMINI (Antigravity) |
| Worktree | `D:\project-gemini` |
| Branch | `feat/worker-gemini` |
| Status | **QUEUED — start only after T-01 merges (needs committed lockfiles) and orchestrator rebases your worktree** |
| Handoff | `.ai-sync/handoffs/T-02-gemini.md` |

## Mission
1. Diagnose GitHub Actions `startup_failure` (both workflows at baseline `88b58bf`, runs 45362084138 / 45362081793, zero jobs). Use `gh run view <id> --json ...` / `gh api` read-only. If root cause is repository Settings (Actions policy, SHA-pinning requirement, runner access), document the EXACT admin checklist for the user — do not guess it as fact.
2. Rewrite `.github/workflows/ci-spec-integrity.yml` + `ci-license-evalops.yml`:
   - Full 40-char SHA pins for ALL third-party actions with inline version comments; verify each SHA exists upstream (current `actions.lock` entries for setup-node/rust-toolchain were reported nonexistent — re-verify, don't trust).
   - Enforce `.github/workflows/actions.lock` via a new checker script `scripts/check-actions-lock.mjs` (must fail on a deliberately wrong SHA — include that negative test).
   - Minimal `permissions: contents: read` at workflow level; `concurrency` cancel-superseded; `workflow_dispatch`.
   - Real jobs: Rust fmt/clippy `-D warnings`/test (pinned toolchain per policy — verify availability, record deviations); Node frozen `pnpm install --frozen-lockfile` + typecheck + build + tests per maintained app/package; Python locked install + suite.
   - Replace the `json.loads`-only "schema validation" step with REAL JSON Schema validation + negative fixtures.
   - Stable required-check job names; document them in the handoff for branch protection.
3. Keep DCO check, PDF/AGPL guard, secrets audit steps (fix, don't delete).

## WRITE_SCOPE
`.github/workflows/**`, `scripts/check-actions-lock.mjs` (new), `scripts/audit-toolchains.py` (only if pin verification requires), `schemas/` fixtures (new test fixtures only), `.ai-sync/handoffs/T-02-gemini.md`.

## CONTRACT
No `continue-on-error`/`|| true`/empty jobs as fake green; least privilege; fork PRs get no secrets; offline $0 tests; no push/PR without orchestrator+user approval (prepare everything branch-ready; the orchestrator requests the push).

## VERIFY_CMD
```
actionlint .github/workflows/*.yml   (install actionlint if absent; record how)
node scripts/check-actions-lock.mjs
<negative test: wrong SHA must fail>
```
GitHub-side proof (run URL + exact SHA) happens after user-approved push — mark that part PENDING-HUMAN in handoff.