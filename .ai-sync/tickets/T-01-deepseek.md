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