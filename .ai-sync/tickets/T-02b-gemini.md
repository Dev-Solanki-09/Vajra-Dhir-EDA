# Ticket T-02b — CI Remediation (WORKER-GEMINI / Antigravity)

- **Status:** QUEUED (flips to READY when T-01 is merged and your worktree is rebased)
- **Worktree / branch:** `D:\project-gemini` · `feat/worker-gemini` (keep building on your commit `6d09fb3`)
- **Depends on:** T-01 merged (pnpm-lock.yaml + uv.lock must exist on main before frozen-install jobs can pass)
- **Supersedes:** T-02 acceptance. Your T-02 was AUDITED and RETURNED. Keep the good parts (40-char SHA pins — verified authentic upstream; `check-actions-lock.mjs` — passes fresh; DCO step; concurrency; minimal permissions). Fix the defects below.

## Orchestrator audit findings you MUST address (evidence-backed)

1. **FALSE root-cause claim.** "startup_failure caused by `pull_request:` null mapping / missing workflow_dispatch / nonexistent Node 26.13.1" is wrong:
   - Bare `pull_request:` (null) is VALID GitHub workflow syntax and cannot cause a zero-job startup_failure.
   - Missing `workflow_dispatch` only removes manual triggering.
   - **Node v26.13.1 EXISTS**: nodejs.org/dist index, released 2026-11-10, LTS "Lithium", security release (orchestrator-verified 2026-11-24). `actions/setup-node` can install any published dist version. Your downgrade to Node 22 is unauthorized and must be reverted.
   - Zero-job `startup_failure` typically means repo-level Actions policy/permissions/billing, or a workflow-file syntax error GitHub rejects at parse time. You produced NO `gh` evidence.
2. **Required build/test jobs missing.** Ticket demanded real Rust + Node + Python jobs. You shipped only license + cargo. No Node frozen-install/typecheck/build/test job, no Python job.
3. **Pseudo schema validation.** Step 3 of ci-spec-integrity.yml only does `json.loads` + `assert isinstance(dict)` + a string-key check on the negative fixture. That is NOT JSON Schema validation.
4. **Unpinned Rust toolchain.** `toolchain: stable` with no recorded deviation. Policy floor is Rust 1.100.0.
5. **Process violation.** T-02 was QUEUED behind T-01; you executed it early. Do not repeat: only execute tickets marked READY on the board.

## Tasks (order)

A. **Honest startup_failure diagnosis.** Run `gh run view <run-id> --json conclusion,event,headBranch` and `gh api repos/{owner}/{repo}/actions/runs/<id>` for the cited runs (45368509252, 45362081793). Paste RAW output into the handoff. If `gh` is unauthenticated or lacks access, write `ROOT CAUSE: UNKNOWN (no gh access)` plus an admin checklist (Actions enabled in repo settings? Actions permissions allow-all? fork-PR approval policy? billing/spending limit?). NEVER claim "resolved" without a green run or direct evidence.
B. **Node job** (new job `node-build-test` in ci-license-evalops.yml or a new workflow): pinned `actions/setup-node` SHA, `node-version: '26.13.1'`; enable pnpm via corepack (`corepack enable && corepack prepare pnpm@10 --activate`) or a SHA-pinned pnpm/action-setup added to actions.lock; then `pnpm install --frozen-lockfile`, TypeScript check (`pnpm -r exec tsc --noEmit` or repo's typecheck script), build, and `node --test` package tests. All must actually execute repo code.
C. **Python job** (new job `python-tests`): pinned `actions/setup-python` SHA, `python-version: '3.14'` (T-01 narrowed requires-python to >=3.14,<3.15 — approved); install uv (pinned version), `uv sync --frozen`, run the offline pytest suites (`uv run pytest packages -x -q` or the repo's documented test entry). Zero credentials, $0 API.
D. **Real JSON Schema validation.** Replace pseudo-step: `pip install jsonschema` (or add to requirements-ci.txt), load each `schemas/*.json`, validate a VALID fixture passes and `schemas/fixtures/invalid_project.json` raises `jsonschema.ValidationError` (assert the exception type, not string keys). Add a valid fixture if none exists.
E. **Rust toolchain pin.** Check `rustup` availability of `1.100.0` (e.g. `git ls-remote https://github.com/rust-lang/rust` tags or static.rust-lang.org dist). If available, pin `toolchain: 1.100.0`. If not, keep stable BUT record the deviation explicitly in the handoff with the availability-check output.
F. **Update actions.lock + checker** for any new actions; re-run negative SHA test (deliberately wrong SHA must exit 1).
G. **Required-check names.** List the final stable job names for branch protection in the handoff.

## WRITE_SCOPE (only these may change)
`.github/workflows/**`, `scripts/check-actions-lock.mjs`, `schemas/fixtures/**`, `requirements-ci.txt`, `.ai-sync/handoffs/T-02b-gemini.md`.

## READ_ONLY_CONTEXT
Everything else, including `AGENTS.md`, lockfiles (owned by T-01), package manifests.

## CONTRACT
No push to origin (GitHub proof stays PENDING-HUMAN). No edits outside WRITE_SCOPE. No version-floor downgrades. Failing test FIRST where applicable. 3 failed attempts ⇒ STOP + BLOCKER handoff. `git commit -s`. Fresh session; read `.ai-sync/README.md` first.

## ACCEPTANCE_CRITERIA
- Node job uses 26.13.1 and runs frozen install + typecheck + build + tests.
- Python job uses 3.14 and runs frozen uv sync + pytest.
- Schema step uses a real validator with a proven negative fixture (ValidationError raised).
- startup_failure section contains raw gh evidence OR honest UNKNOWN + admin checklist.
- Rust pin or recorded deviation.
- All action SHAs 40-char, match actions.lock, checker passes, negative test fails closed.

## VERIFY_CMD (paste raw output into handoff)
```
node scripts/check-actions-lock.mjs
actionlint .github/workflows/*.yml   (or record unavailability)
python -c "import json,jsonschema; s=json.load(open('schemas/project.schema.json')); jsonschema.validate(json.load(open('schemas/fixtures/invalid_project.json')), s)"  (must RAISE; paste traceback)
```
(Adjust schema filename to the real one; the point is a real validator rejecting the bad fixture.)