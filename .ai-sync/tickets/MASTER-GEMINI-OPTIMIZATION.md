# VD-PERF-001 · Performance Optimization Plan (faster, WITHOUT breaking anything)

| Field | Value |
|---|---|
| Revision | 1.0 (2026-11-24) |
| Authority | Orchestrator. Binds WORKER-GEMINI. Runs as the **P-track AFTER G8** (stable functional baseline), BEFORE X-track. |
| Iron rule | **MEASURE FIRST, NEVER BREAK.** Every optimization: baseline measurement → RED-first perf-budget test → change → re-measure → **full harness 64/64 must stay exit 0** + all functional gates green. Zero regression tolerated. Unmet budget ⇒ honest relabel (anti-vapor), never a fake number. |
| Toolkit | VD-TOOL-001 Part B (Rust: vd-principal-systems-rust + rust-skills + criterion; GUI: vd-silicon-darkroom-ui + vercel-react-best-practices + browser-use MCP; context7 before any unfamiliar perf API). |

## Budgets (from techstack-critic.md — measure, verify, or relabel)
| Metric | Budget | Source | Where |
|---|---|---|---|
| rstar spatial query | ~177 ns | critic L57 | P1 |
| Manual editing | 120 FPS | critic L32 | P1/P2 |
| wgpu render (WebGPU + WebGL2) | 60 FPS | critic L64 | P2 |
| CrossProbeBus | <16 ms | critic L72 | P2 |
| uPlot scope | 60 FPS / 166k pts / 25 ms | critic L75 | P2/X3 |
| Daemon endpoint latency | per-endpoint budget set in P0 | measured | P3 |
| Harness wall-time | no regression vs P0 baseline | measured | P5 |
| Bundle size / build time | no regression vs P0 baseline | measured | P4 |

---

## P0 · Baseline & budget gates (NO production changes)
- step 1: measure current state — harness wall-time (`node scripts/verify-all.mjs` timed), daemon endpoint latencies (health/panel/copper/pdn), GUI rAF FPS (browser-use evaluate_script), CrossProbeBus latency, `cargo build --release` time, vite bundle size. Paste raw numbers.
- step 2: write RED-first **perf-budget regression tests** (criterion benches for Rust hot paths; rAF/timer assertions for GUI) encoding the budgets above. They establish the gate; mark expected-fail where current code is below budget (honest baseline).
- step 3: record `.ai-sync/private/perf-baseline.json` (internal) + public budget table in handoff.
- VERIFY: baseline numbers pasted; budget tests exist; harness still 64/64. SCOPE: tests/benches only, no production edits.

## P1 · Rust kernel hot paths (cad-geom, hw-ir, autorouter)
- sub-step 1: profile (cargo flamegraph / criterion baseline) — identify hot loops. context7: criterion API.
- sub-step 2: rstar query tuning (bulk-load, bbox reuse) → 177 ns budget bench. RED-first.
- sub-step 3: i_overlay boolean ops + i_triangle copper pour + cavalier_contours offset — allocation-free hot loops, i64 nm integer math (NEVER float coords), batch geometry ops.
- sub-step 4: hw-ir WAL ladder (PASSIVE every 250 patches, TRUNCATE idle) + prepared statements → write-latency budget. CAS zstd compression → I/O reduction.
- sub-step 5: uuid v7 generation cost (now_v7) — keep immutable IDs, avoid per-call entropy syscalls where safe.
- VERIFY: `cargo test` + criterion benches meet budget OR relabel · harness 64/64 · lock-trigger negatives still green. SCOPE: cad-geom/hw-ir/autorouter/cas-store. Dual-context audit (geometry).

## P2 · GUI render & interaction (`apps/workstation`, webgpu-cad-engine, crossprobe-bus)
- sub-step 1: real wgpu WebGPU pipeline — batched draw calls, instancing for pads/tracks/vias, dirty-rect redraw, offscreen canvas; WebGL2 fallback; Canvas2D last resort. → 60 FPS render budget (measured rAF).
- sub-step 2: geometry off the main thread — Web Worker for cad-geom wasm/boolean ops; main thread only renders. → 120 FPS manual-edit path.
- sub-step 3: React 19 — compiler/memo, `useMemo`/`useCallback` granularity, zustand selector subscriptions (avoid whole-store re-render); virtualize large tables/BOM (tanstack-virtual, MIT). context7: react 19.3.1 + zustand + tanstack-virtual.
- sub-step 4: CrossProbeBus <16 ms — zustand + BroadcastChannel, measured timer gate; batch cross-probe updates per frame.
- sub-step 5: uPlot scope (not React re-render) — 60 FPS / 166k pts / 25 ms budget; data-viz figures = measured product data.
- sub-step 6: measured FPS meter in status bar (real rAF delta, never a claimed constant).
- VERIFY: browser-use MCP perf evaluate_script + Playwright budget gates · sloplint Floor 0 · harness green · console-clean. SCOPE: `apps/workstation`, webgpu-cad-engine, crossprobe-bus, ui-core. Dual-context audit.

## P3 · Daemon & API (vd-daemon — supervision scope only, T-01 lock respected)
- sub-step 1: measure per-endpoint latency (P0 baseline); set budgets.
- sub-step 2: SQLite WAL + prepared statements + connection reuse; batch endpoints; reduce JSON serialize overhead; gzip responses.
- sub-step 3: async I/O where blocking; health-poll readiness preserved (T-01). NO regression to cp1252 console guard / fail-closed locks.
- VERIFY: endpoint latency budgets · `python scripts/test-daemon-api.py` + all daemon gates green · harness 64/64. SCOPE: vd-daemon (perf only, no contract change). Dual-context audit.

## P4 · Build & bundle
- sub-step 1: cargo release profile — opt-level=3, lto="thin", codegen-units=1 for kernel crates (measure build-time vs runtime tradeoff; keep deterministic).
- sub-step 2: wasm-opt for ngspice-wasm/engine wasm; pnpm frozen-lockfile; vite build treeshake + code-split + lazy-load per workspace; font subsetting (Inter/JetBrains Mono woff2); asset compression.
- sub-step 3: bundle-size + build-time budgets (no regression vs P0).
- VERIFY: `pnpm install --frozen-lockfile` + `pnpm build` + `cargo build --release` timed · bundle size measured · harness 64/64. SCOPE: Cargo.toml profiles, vite.config, package.json (build only).

## P5 · Verification, no-regression proof & handoff
- step 1: full harness `node scripts/verify-all.mjs` → **64/64 exit 0** (paste). All perf-budget gates green or honestly relabeled.
- step 2: before/after measurement table (P0 baseline vs P5) in handoff — every budget met or relabeled with measured value.
- step 3: dual-context fresh review (zero history) re-runs crux perf commands independently (A.13).
- step 4: handoff `.ai-sync/handoffs/P-05-gemini.md`; STOP READY_FOR_REVIEW. Orchestrator audits + merges, then flips X-track READY.
- ACCEPTANCE: faster on measured budgets, **zero functional regression**, zero fabricated number, harness 64/64.

## Sequencing update
G0→G1→G2→G3→G4→G5A→G5B→G5C→G6A→G6B→G6C→G6D→G7→G8 (v0.1.0) → **P0→P1→P2→P3→P4→P5 (optimization)** → X1→X2→X3→X4 (v0.2.0). Strictly serial, sole worker, STOP-for-review each phase. Perf budgets also enforced inline during G2/G5*/G6* engine work (measure-as-you-build); P-track is the system-wide hardening pass. (`i_triangle` uses native `i64` integer coordinates only.)