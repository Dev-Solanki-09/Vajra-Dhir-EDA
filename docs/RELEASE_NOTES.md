# Release Notes: Vajra-Dhir EDA v0.0.4

- **Version:** `0.0.4`
- **License:** Apache License 2.0 (`LICENSE`, with permissive `MIT OR Apache-2.0` per-crate declarations; see `NOTICE` and [LICENSE_EXCEPTIONS.md](LICENSE_EXCEPTIONS.md))
- **human_signoff:** `PENDING`
- **release_authorized:** `false`
- **physical_fabrication_status:** `NOT_FABRICATED_0_OF_3`

## What Changed in `v0.0.4`

- **Single-App Portable Launch & Runtime Packaging (`launch.mjs`, `Vajra-Dhir-EDA.vbs`, `bootstrap_routes.py`):** Added silent Windows VBS entrypoint, cross-platform desktop shortcut installer (`scripts/create-shortcut.mjs`), `--headless-check` self-test, resumable HTTP Range downloads (`*.part`), airgap `.tar.zst` offline import (`POST /api/bootstrap/import-offline`), cache GC (`POST /api/bootstrap/gc`), `< 150 MiB` repo size check (`scripts/check-repo-size.mjs`), and `BootstrapSplash` progress/skip controls.
- **Clean `.vdproj/` Project Isolation & Live `< 4 KB` Delta Sync (`settings_store.py`, `sync_propagator.py`, `kg_routes.py`, `cosim_engine.py`, `threeRendererPool.ts`):** Stopped auto-seeding repo fixtures onto empty Home launches, added compact entity/net `STATE_DELTA` WebSocket patches, added singleton reusable `THREE.WebGLRenderer` pooling in `Viewport3DPanel.tsx`, wired 8 Smart Circuit Blocks, mapped `daemon.py` `/api/v1/components/search` cleanly to DuckDB columns (`starter_kg.duckdb`), and generated live `VD_HW_*` macros from HW-IR pinmux rows.
- **Interactive Canvases & Pure-MIT Autorouter Fallback (`useUnifiedViewport.ts`, `Schematic2DPanel.tsx`, `Pcb2DPanel.tsx`, `router_worker.py`, `packages/kicanvas-core`):** Unified cursor/grid/alignment/redline overlay hooks over KiCanvas 2D views with zero idle React pointermove re-renders, added mid-route via (`V`), copper pour (`B`), 45-degree routing (`X`), flip (`Shift+F`), Net Spotlight, missing `lib_symbol` guards in `kicanvas-core`, and a pure-MIT octilinear autorouter fallback preserving `locked = 1` human entities.
- **Live SPICE Synthesis, Z3/Bode Solvers, Diagnostics & Honest Fab Status (`spice_synth.py`, `ngspice_runner.py`, `kicad_bridge.py`, `ee_audit_routes.py`, `job_runner.py`, `fab_routes.py`):** Compiled live HW-IR nets/components into SPICE netlists with 3-tier behavioral models, isolated `KICAD_CONFIG_HOME` for `kicad-cli` DRC runs, added waivable diagnostics (`POST /api/v1/diagnostics/waive`), executed real async verification jobs outside `DB_LOCK`, wired `/stitch/z3/pinmux` and `/stitch/physics/smps-bode` to `z3_pinmux` and `control_auditor`, and reported honest `NOT_FABRICATED_0_OF_3` fab bring-up status in `FabReleasePanel.tsx`.
- **Hermes-Core BYOK Agent, Multi-OS Icons & Offline Help (`packages/vd-daemon/src/agent/*`, `assets/icons/`, `docs/guides/`, `HelpCenterModal.tsx`):** Added encrypted BYOK provider vault, `NDA_AIRGAPPED` egress guard (`HTTP 403`), SQLite FTS5 memory, 6 EE skills, `@board`/`@drc`/`@spice` context mentions, `/rollback`, Dual-Context auditor, multi-OS icons (`.svg`, `.ico`, `.icns`, `.png`), 10 offline markdown guides, and `HelpCenterModal` (`Shift+F1`).
- **Schema & Verification Hardening (`001_v001_init.sql`, `002_manual_perfection.sql`, `agent/runtime.py`):** Added `KERNEL_LOCK_VIOLATION` triggers to `001_v001_init.sql`, added `IF NOT EXISTS` schema idempotence guards to `002_manual_perfection.sql`, replaced per-turn `git` subprocess spawns with fast `.git/HEAD` resolution, and added 6 Stage-7 subsystem/torture E2E suites.

## How to Run It

```bash
# Windows (double-click launch.bat, Vajra-Dhir-EDA.vbs, or run in terminal)
launch.bat

# macOS / Linux
./launch.sh

# Headless daemon + workstation sanity probe
node scripts/launch.mjs --headless-check

# Offline verification suites
node scripts/check-spdx-firewall.mjs
node scripts/check-repo-size.mjs
python scripts/audit-secrets-and-paths.py
python scripts/check-links.py
pnpm test
python -m pytest packages -q
node scripts/verify-all.mjs
```

## Verification & Known Limits

- Hardware reference blueprints in `designs/` are software-verified only (`0/3` physically fabricated; Gate 8 human signoff required before fab).
- Full Rust compilation and `cargo test --workspace` require `ubuntu-24.04` CI or local C++ build tools (`link.exe` on Windows); `cargo metadata --locked --format-version 1` passes offline.

## Locked Artifact Digests (`v0.0.4` LF-Normalized SHA-256)

- `pnpm-lock.yaml`: `d049f18b2719b896fffb5525f65481848bbe28971b210c0111adf0801542520c`
- `uv.lock`: `cce42a18355ab08ecfe65a497fa52e718ed5d35b2204025254cf9d9a4d994f29`
- `Cargo.lock`: `9fe357aa6131730d4d6fdc899a35508f3c091fa780925cc08105564fbd6ce3e1`
- `apps/workstation/dist/index.html`: `89c96173c6b686d895a497c824639f3ade24c6b97777fbf7bf6658770c01cf0e`
