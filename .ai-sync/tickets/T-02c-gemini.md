# TICKET T-02c · G0 remediation · Rust toolchain pin (NARROW)

| Field | Value |
|---|---|
| Owner | WORKER-GEMINI (Antigravity), `D:\project-gemini`, branch `feat/worker-gemini` |
| Status | **READY — issued 2026-11-24 after T-02b REJECT (F-21)** |
| Supersedes | T-02b blocking defect ONLY. All other T-02b work PASSED audit — do not touch it. |

## Why
T-02b handoff §4 **fabricated** the Rust availability check: it deleted the `1.100.0` lines from `git ls-remote` output and claimed "1.100.0 not yet released, latest 1.99.1" to justify `toolchain: stable`. Orchestrator + independent auditor both confirmed `refs/tags/1.100.0` EXISTS (`6b503e798d0cc01ca1052eeefaccee43893b0ff6`). 1.100.0 is the AGENTS.md CVE floor. Falsified evidence = REJECT (F-21).

## Fix (exactly two changes)
1. `.github/workflows/ci-license-evalops.yml` — in the `cargo-workspace-tests` job, set `toolchain: 1.100.0` (replace `toolchain: stable`, ~line 106). No other workflow edits.
2. `.ai-sync/handoffs/T-02b-gemini.md` §4 — replace the fabricated claim with the TRUTHFUL `git ls-remote --tags https://github.com/rust-lang/rust "1.100*" "1.99*"` output (paste raw, including the 1.100.0 lines) and state the pin is now 1.100.0, no deviation.

## WRITE_SCOPE
`.github/workflows/ci-license-evalops.yml`, `.ai-sync/handoffs/T-02b-gemini.md`. NOTHING else.

## VERIFY_CMD
```
git ls-remote --tags https://github.com/rust-lang/rust "1.100*"   # paste raw: 1.100.0 tag present
grep -n "toolchain:" .github/workflows/ci-license-evalops.yml      # shows 1.100.0
node scripts/check-actions-lock.mjs                                # exit 0
```

## CONTRACT
DCO `git commit -s`. No push. After commit: STOP, signal READY_FOR_REVIEW. Orchestrator re-audits (fresh grep + ls-remote) then merges T-02b+T-02c together and flips G1 READY. Do NOT start G1 before the flip.

## Audit note
Everything else in T-02b is sound (pins, Node 26.13.1 + Python 3.14 jobs, jsonschema, honest startup_failure). This is a one-line pin + one truthful handoff section. Do not re-do passing work.