# TICKET T-01 · Wave 1 · Backend Reproducibility & Daemon Fixes

| Field | Value |
|---|---|
| Owner | WORKER-DEEPSEEK (OpenCode) |
| Worktree | `D:\project-deepseek` |
| Branch | `feat/worker-deepseek` |
| Status | **READY — EXECUTE NOW** |
| Handoff | `.ai-sync/handoffs/T-01-deepseek.md` (create in your worktree) |

## Mission
Fix the 6 failing verification gates at HEAD (baseline 58 PASS / 6 FAIL) and make installs reproducible. Root causes are ALREADY VERIFIED by the orchestrator (see `findings.md` F-13, F-14, F-16) — reproduce them, then fix failing-test-first.

## Verified root causes
1. **F-13** `packages/vd-daemon/src/daemon.py` ~line 1691 prints "Vajra-Dhīr" (U+012B) to a cp1252 Windows console → `UnicodeEncodeError` → daemon exits code 1 right after binding. Fails 5 gates via connection-refused. Host Python 3.14.7.
2. **F-16** `scripts/test-v004-mfg-and-harness.py` ~line 68 uses fixed `time.sleep(1.2)` after daemon Popen (cold-start race). Same pattern may exist in: `test-daemon-api.py`, `test-dockview-and-brain.py`, `test-schematic-and-library.py`, `test-v004-cad-and-lab.py`.
3. **F-14** `designs/board-1-buck-pd/verification_report.json` has NO `human_signoff_token` key; `scripts/test-gate8-release.py` requires it (≥32 chars). **NEVER fabricate a human signoff token.** Correct fix = fail-closed alignment: report explicitly declares signoff PENDING (inspect existing fields `signoff_actor`, `highest_passed_gate`, `all_software_gates_passed`); test asserts artifacts exist, signoff explicitly pending when no token, token ≥32 chars IF present, and test must FAIL if a bundle is falsely marked released/signed without a token.

## Tasks (order)
A. Failing regression test: launch daemon with `PYTHONIOENCODING=cp1252`, poll health — must fail pre-fix. Then fix daemon.py: reconfigure `sys.stdout`/`sys.stderr` to UTF-8 `errors="replace"` at startup (guard with `hasattr`). Minimal, local fix.
B. Readiness polling (poll `/api/v1/health` up to ~15s; detect early exit; surface daemon stderr on failure) replacing fixed sleeps in all daemon-launching gate scripts.
C. Gate 8 fail-closed alignment per F-14. Do not touch other boards' reports.
D. Provision pnpm (`npm install -g pnpm@10`; network allowed for tooling), run `pnpm install` at root, commit `pnpm-lock.yaml`. Do NOT bump dependency versions to force resolution — exact errors as BLOCKER if it fails. Also `uv lock` → `uv.lock` if pyproject defines deps (uv 0.12.5 installed); blocker if it fails.
E. Full harness: `node scripts/verify-all.mjs`. Target 64/64, zero regressions on the 58 prior passes.

## WRITE_SCOPE (only these may change)
`packages/vd-daemon/**`, `scripts/test-daemon-api.py`, `scripts/test-dockview-and-brain.py`, `scripts/test-schematic-and-library.py`, `scripts/test-v004-cad-and-lab.py`, `scripts/test-v004-mfg-and-harness.py`, `scripts/test-gate8-release.py`, `designs/board-1-buck-pd/verification_report.json`, `pnpm-lock.yaml` (new), `uv.lock` (new), `requirements-ci.txt`, `pyproject.toml`, `packages/cubo-engine/**` (only if strictly needed), `.ai-sync/handoffs/T-01-deepseek.md`.

## READ_ONLY_CONTEXT
`AGENTS.md`, `docs/AGENT_KNOWLEDGE_UPDATE_2026_11.md`, `findings.md`, `task_plan.md`, all other packages/scripts.

## CONTRACT
i64 nm / i32 mdeg / UUIDv7 untouched; `_tx_actor_ctx` + fail-closed locks untouched; Ring 1 license firewall; offline $0 tests; failing test FIRST; never weaken a test; 3 failed attempts ⇒ STOP + BLOCKER handoff; no push; no edits outside WRITE_SCOPE; `git commit -s`.

## ACCEPTANCE_CRITERIA
- All 6 failing gates pass for the right reasons; 58 prior passes intact.
- `pnpm install --frozen-lockfile` succeeds from the committed lockfile.
- Gate 8 semantics remain fail-closed (no fabricated token).
- Daemon regression test proves cp1252 survival.

## VERIFY_CMD (paste raw output into handoff)
```
node scripts/verify-all.mjs
pnpm install --frozen-lockfile
```

## Port ownership
You own daemon test ports (41901/41905 etc.) during this ticket. The Gemini worker is read-only meanwhile.

---

## ORCHESTRATOR ADDENDUM (2026-11-24, after your interim report)

1. **APPROVED (conditional): `requires-python` narrowing to `>=3.14,<3.15`** in root + `packages/cubo-engine/pyproject.toml`. Condition: your final handoff MUST include the RAW `uv` resolution-conflict output proving the atopile python bands are mutually exclusive with the wider range. This is a recorded deviation; T-02b Python CI will pin 3.14 to match.
2. **Gate-8 approach approved** (fail-closed, `human_signoff.status=PENDING`, `release_authorized=false`, no fabricated token). Discrepancy to resolve in handoff: orchestrator's baseline check found NO `human_signoff_token` key at all, while your report says you removed a fabricated 64-char token. Show the before/after JSON diff so the record is exact.
3. **Second-order cp1252 gate-script fixes and health-polling: approved**, keep them in scope.
4. **Do NOT bump TypeScript or Node engines in this ticket.** Orchestrator verified 2026-11-24: typescript 7.0.2 IS npm `latest` and Node 26.13.1 IS published (LTS). The repo's 5.9.3/24.x state is a manifest defect, assigned to a later ticket (T-08). Leave it untouched; just note it in the handoff.
5. **Work ONLY in `D:\project-deepseek`.** Unattributed v0.0.5 changes were found in the main checkout `D:\Vajra-Dhir-EDA` (see findings.md F-18). If any of that is yours, STOP and report it in your handoff — main is orchestrator-only.