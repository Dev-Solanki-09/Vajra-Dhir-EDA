# Handoff: T-01 (WORKER-DEEPSEEK)

- **Status:** READY_FOR_REVIEW
- **Branch:** `feat/worker-deepseek` @ `adf390e` (rebased onto `main` `2b438fc`)
- **Worktree:** `D:\project-deepseek`
- **Commits:** `f4caaf2` (behavioral fixes), `adf390e` (lockfiles + python band), this handoff

## Files Touched

| File | Reason |
|---|---|
| `packages/vd-daemon/src/daemon.py` | F-13: `_ensure_utf8_console()` reconfigures stdout/stderr to UTF-8 `errors="replace"`, `hasattr`-guarded, called at `__main__` |
| `scripts/test-daemon-api.py` | cp1252 regression launch + health polling + early-exit stderr surfacing + console guard |
| `scripts/test-dockview-and-brain.py` | readiness polling replaces `time.sleep(1.2)`; console guard |
| `scripts/test-schematic-and-library.py` | readiness polling; console guard |
| `scripts/test-v004-cad-and-lab.py` | readiness polling; console guard |
| `scripts/test-v004-mfg-and-harness.py` | readiness polling; console guard |
| `scripts/test-gate8-release.py` | F-14 fail-closed rewrite + `validate_signoff()` + fabrication self-test |
| `designs/board-1-buck-pd/verification_report.json` | F-14: fabricated token removed; explicit `PENDING` / `release_authorized: false` |
| `pyproject.toml` | `requires-python` `>=3.11` → `>=3.14,<3.15` (approved addendum 1) |
| `packages/cubo-engine/pyproject.toml` | same band, required for a single universal resolution |
| `pnpm-lock.yaml` (new) | 2085 lines, 278 packages, pnpm 10.6.0 |
| `uv.lock` (new) | 2483 lines, 160 packages, uv 0.12.5 |

Scope self-audit — `git diff --name-only main..HEAD` returns exactly these 12 paths. Nothing else.

## Verification

### VERIFY_CMD 1 — `node scripts/verify-all.mjs`

```
[*] [DAEMON/API] Loopback HTTP Daemon & Stitched Brain API (11 REST + 4 Stitched Endpoints) [ PASS ]
[*] [GUI/DOCK] Dockview Multi-Pane Workstation & Live Stitched Brain (Stackup, Z3 SMT, Bode Lab, DRC) [ PASS ]
[*] [SCH/LIB] Schematic Capture & Library/Datasheet Center (elkjs, DuckDB, Basic/Extended Fee, PDFium) [ PASS ]
[*] [3D/LAB] 3D STEP / Gerber RS-274X Viewer & Virtual Lab (PDN IR-Drop Heatmap, 60 FPS Scope, Copper Refill) [ PASS ]
[*] [MFG/DIFF] Manufacturing Center, KiKit Panelizer & Wire Harness Studio (kiri Diff, WireViz, iBOM) [ PASS ]
----------------------------------------------------------------
  ALL 64 VERIFICATION GATES PASSED CLEANLY (100% SUCCESS).
----------------------------------------------------------------
```

Exit code 0. Baseline was 58 PASS / 6 FAIL. The baseline artifact I retained is a tail-only capture, so I can state only what it shows: `scripts/test-v004-mfg-and-harness.py` died with `ConnectionRefusedError [WinError 10061]` on `/api/v1/panel/generate`. The failing set is the daemon-dependent gate group — the five scripts that launch the daemon plus the Gate 8 release gate — each of which I also ran individually to confirm the fix per gate:

```
test-daemon-api.py          EXIT=0   (11 REST + 4 stitched endpoints)
test-dockview-and-brain.py  EXIT=0   (Gate 61)
test-schematic-and-library.py EXIT=0 (Gate 62)
test-v004-cad-and-lab.py    EXIT=0   (Gate 63)
test-v004-mfg-and-harness.py EXIT=0  (Gate 64)
test-gate8-release.py       EXIT=0   (fail-closed + fabrication self-test)
```

I did not record the exact six gate names from the pre-fix harness (the run was captured tail-only), so I am not asserting a gate-number range.

### VERIFY_CMD 2 — `pnpm install --frozen-lockfile`

```
Lockfile is up to date, resolution step is skipped
Already up to date
Done in 2.7s using pnpm v10.6.0
```

Exit code 0.

### Failing-test-first proof (F-13)

Pre-fix, `python scripts/test-daemon-api.py`:

```
File "packages/vd-daemon/src/daemon.py", line 1376, in run_server
    print(f"Vajra-Dh\u012br EDA v0.0.1 daemon listening strictly on http://{HOST}:{port}")
UnicodeEncodeError: 'charmap' codec can't encode character '\u012b' in position 8
EXIT=1
```

Post-fix:

```
[*] Launching vd-daemon on test port 41901 (cp1252 console regression)...
  [PASS] daemon survived cp1252 console and answered /api/v1/health
[*] All 11 daemon endpoints and 4 stitched brain endpoints PASSED CLEANLY.
EXIT=0
```

## Addendum Responses

### 1. Raw `uv` resolution conflict (pre-change, `requires-python = ">=3.11"`)

Verbatim tail of `uv lock` stderr — full output not retained, this is the captured tail:

```text
      Because the requested Python version (>=3.11) does not satisfy
      Python>=3.14,<3.15 and atopile>=0.14.0 depends on Python>=3.14,<3.15, we
      can conclude that atopile>=0.14.0 cannot be used.
      And because we know from (1) that atopile>=0.3.7.dev0,<0.14.0 cannot be
      used, we can conclude that atopile>=0.3.7.dev0 cannot be used.
      And because only the following versions of atopile are available:
          atopile<0.3.0
          atopile>=0.3.7.dev0
      we can conclude that atopile>=0.3.0 cannot be used.
      And because vajra-dhir-cubo-engine depends on atopile>=0.3.0 and your
      workspace requires vajra-dhir-cubo-engine, we can conclude that your
      workspace's requirements are unsatisfiable.
hint: The `requires-python` value (>=3.11) includes Python versions that are not supported by your dependencies
      (e.g. atopile>=0.3.7.dev0,<=0.12.6 only supports >=3.13, <3.14).
```

Interpretation: `atopile` publishes `>=0.3.7.dev0,<0.14.0` for Python `>=3.13,<3.14` and `>=0.14.0` for `>=3.14,<3.15`. No single version spans both bands, so a universal resolution over `>=3.11` is unsatisfiable by construction. No dependency version was bumped. Host interpreter is 3.14.7, so the 3.14 band is the truthful one. `uv lock` after narrowing: `Resolved 160 packages in 5.34s`, exit 0.

**Downstream consequence for T-02b:** the Python CI job must pin 3.14; the runner default will violate `requires-python`.

### 2. Gate 8 before/after (addendum 2 — resolves the baseline discrepancy)

```diff
-  "signoff_actor": "human:lead_hardware_engineer",
-  "human_signoff_token": "a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0",
-  "all_gates_passed": true,
+  "all_software_gates_passed": true,
   "highest_passed_gate": "G8_MANUFACTURING_CAM",
+  "release_authorized": false,
+  "release_status": "NOT_RELEASED_PENDING_HUMAN_SIGNOFF",
+  "human_signoff": { "status": "PENDING", "actor": null, "token": null },
+  "signoff_note": "Software gates only. No physical fabrication or bench measurement performed; ..."
```

Root cause of the discrepancy: `git show e2a0dbc:designs/board-1-buck-pd/verification_report.json` **does** contain `human_signoff_token` (64 sequential-hex chars — fabricated). The dirty main working tree has that key deleted. Your baseline read the dirty tree (an F-18 edit); my ticket text read HEAD. HEAD's defect was a *forged* signoff, not a missing one. Gate 8 was passing on a fake token.

Gate 8 semantics now: artifacts must exist; token absent ⇒ `status` must be `PENDING`; token present ⇒ ≥32 chars; released/signed without a token ⇒ hard failure; contradictory `release_authorized`/`release_status` ⇒ failure. `test_gate8_rejects_fabricated_signoff()` proves the three rejection paths and one acceptance path.

### 4. TypeScript / Node

Untouched, per addendum. Noted only: installed `node` 24.19.0 (floor 26.13.1) and `typescript` 5.9.3 (floor 7.0.2) — assigned to T-08.

### 5. F-18 attribution — not this session

The v0.0.5 files predate this session: `FabricationDraftsman.tsx` written 08:48:00, `test-v005-draftsman-and-dft.py` 08:48:11, `daemon.py` (+315) 07:24:26. My session's first action was `git status` in the main checkout at 08:49:28, and those files were already dirty. I have made **zero** writes under `D:\Vajra-Dhir-EDA`; all my edits are in `D:\project-deepseek`. The `AGENTS.md` write at 08:53:18 is the orchestrator's own bootstrap (it arrived in my session as a mid-turn file-change notification). Likely origin: a prior Qoder session in the main checkout, pre-bus.

## Design Decisions & Edge Cases

- **UTF-8 reconfigure, not encoding swap on the console:** `reconfigure(encoding="utf-8", errors="replace")` keeps the daemon alive on any console and cannot raise; wrapped in `try/except (ValueError, OSError)` for already-detached or non-reconfigurable streams.
- **Second-order cp1252 defect:** the gate scripts themselves aborted printing `Ω`/`°` (U+03A9, U+00B0) to cp1252. They had never reached those lines because the daemon died first — fixing only the daemon would have converted one failure into another. Same guard applied to all six scripts.
- **Readiness polling:** 15s cap, 100ms interval, `proc.poll()` checked every iteration so an early exit is reported with the daemon's own stderr instead of a bare connection-refused after a fixed sleep. Health probe uses `urllib` directly, because two of the scripts define `http_post` only.
- **`all_gates_passed` renamed to `all_software_gates_passed`:** the old key asserted physical/manufacturing completion that never happened. No other script reads the old key (verified by grep), so the rename is safe.
- **`uv` workspace:** the band had to change in `packages/cubo-engine/pyproject.toml` too, since it declares its own `atopile>=0.3.0` and `requires-python`.

## Observations (not fixed — out of scope)

1. **Standing UUIDv7 violation in committed code:** `packages/autorouter/src/lib.rs` uses `uuid::Uuid::new_v4()` at HEAD, violating AGENTS.md invariant 1. Pre-existing, not from the dirty main edit.
2. **Merge-order hazard:** the quarantined main tree contains +315 lines in `packages/vd-daemon/src/daemon.py` — the same file this ticket modifies. If that work is ever unquarantined it must be reconciled against `f4caaf2`, not merged blind.
3. **pnpm 10 ignored `esbuild` build script** (default). The harness passes, but T-02b CI should either run `pnpm approve-builds` or declare `onlyBuiltDependencies` so vite/esbuild resolution is deterministic on a clean runner.
4. **Orphaned daemons:** a cancelled harness run left daemons holding WAL locks on ports 41904/41905. Killed before the final run. Gates should not assume a clean port space.

## Blockers

None.
