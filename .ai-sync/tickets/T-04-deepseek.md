# TICKET T-04 · Wave 3 · CAD Defects & Geometry Honesty

| Field | Value |
|---|---|
| Owner | WORKER-DEEPSEEK (OpenCode) |
| Worktree | `D:\project-deepseek` |
| Branch | `feat/worker-deepseek` |
| Status | **QUEUED — start only after T-03 is merged and your worktree is rebased on main** |
| Handoff | `.ai-sync/handoffs/T-04-deepseek.md` |

## Mission
Fix four verified defects in shipped CAD/geometry code. Failing test FIRST for each. Zero harness regressions (ground truth at your base: 64/64).

1. **F-08 · Via-drop FSM bug.** `manualEditorFsm.ts` (locate exact path under `apps/prototype-gui/src/` or `packages/`) dispatches `SET_LOCK` on via-drop instead of a geometry op. Verify against shipped code, fix the transition, add an FSM unit test proving via-drop produces the geometry operation (and lock state unchanged).
2. **F-09a · Annealer `w_cong`.** `packages/placement-router/src/placer.rs` — `CostWeights` omits `w_cong` though the energy formula references congestion weighting. Add the field with a sane default, wire it into the energy function, unit-test that a congested region raises cost.
3. **F-09b · IPC-2152 vs IPC-2221 mislabel.** Trace-width code labeled IPC-2152 actually uses IPC-2221 constants (k=0.048, exp 0.725). Decision rule: EITHER implement the real IPC-2152 internal-layer current-tables calculation OR relabel the function/docs/claims to IPC-2221 truthfully. No third option — a wrong standards label is a fabrication. Record which path you took and why in the handoff.
4. **F-20 · UUIDv7 violation.** `packages/autorouter/src/lib.rs` uses `uuid::Uuid::new_v4()`. AGENTS.md invariant 1: all entity IDs are UUIDv7. Switch to v7 (`uuid` crate `v7` feature), regression test asserting the version nibble == 7 on generated IDs.
5. **Dead dependency ruling: `cavalier_contours`.** Declared in `packages/cad-geom/Cargo.toml`, zero `use` in src. EITHER activate it for real (arc-aware offsetting/contour booleans with a behavior test proving arcs round-trip) OR remove the dependency and note the removal in the handoff. Prefer activation if it is a <1-day change; otherwise remove — dead deps are dishonest weight.

## WRITE_SCOPE (only these may change)
`packages/placement-router/**`, `packages/autorouter/**`, `packages/cad-geom/**`, the single FSM file for F-08 (+ its new test), `Cargo.lock` (if your changes touch deps), `.ai-sync/handoffs/T-04-deepseek.md`.

## CONTRACT
i64 nm / i32 mdeg preserved; never floats for geometry in SQLite/JSONL; no weakened tests; offline $0; 3 failed attempts ⇒ STOP + BLOCKER; `git commit -s`; no push; no edits outside WRITE_SCOPE.

## ACCEPTANCE_CRITERIA
- Each of the 5 items has a failing-test-first proof in the handoff (red output → green output).
- Full harness still 64/64 exit 0.
- `cargo test -p vd-placement-router -p vd-autorouter -p vd-cad-geom` green (or exact toolchain BLOCKER evidence).

## VERIFY_CMD (paste raw output into handoff)
```
cargo test -p vd-placement-router -p vd-autorouter -p vd-cad-geom
node scripts/verify-all.mjs
```
