# Release Notes: Vajra-Dhir EDA v0.0.5

- **Version:** `0.0.5`
- **License:** Apache License 2.0 (`LICENSE`, with permissive `MIT OR Apache-2.0` per-crate declarations; see `NOTICE` and [LICENSE_EXCEPTIONS.md](LICENSE_EXCEPTIONS.md))
- **human_signoff:** `PENDING`
- **release_authorized:** `false`
- **physical_fabrication_status:** `NOT_FABRICATED_0_OF_3`

## What Changed in `v0.0.5`

- **Canva + Affinity Silicon Darkroom Workstation (`StudioDrawerRail.tsx`, `BespokeStudioWindows.tsx`, `WorkstationShell.tsx`, `usePolishStore.ts`):** Added a `48px` vertical left rail (`parts | blocks | modules | outliner | files | plugins`) with a single `272px` collapsible drawer wired to companion libraries/files/plugins, aligned the top bar to 6 Affinity Personas (`Plan | Schematic | PCB | 3D | Lab & Sim | Make`), added 9 on-demand floating studio windows (Design Rules, BOM Cost Optimizer with `₹`/`$` & Basic feeder swap, Pinmux Matrix, Sim Studio, Manufacturing Studio), enforced a self-healing `vd.layout.v7` Dockview layout, kept `0` WebGL contexts active on Home, and wired `F1` Help Center, `?` Shortcuts, and `Escape` dismissal.
- **Universal Semantic Hub & Live Circuit Feedback (`sync_propagator.py`, `Schematic2DPanel.tsx`, `Pcb2DPanel.tsx`, `Workspaces.tsx`):** Added `SYNC_PLAN_BLOCKS` deterministic HW-IR net/component synthesis, interactive Live Net Spotlight (`sch-wire-*`), Circuit X-Ray voltage & over-wattage rings (`sch-xray-*`), `spiceOverlay.xrayEnabled` PCB overlay sync, and live `sim_lab` `uPlot` scope bindings.
- **Hardened Hermes Progressive Skills & 7-Layer Closed-Loop Engine (`hermes_bridge.py`, `autonomous_loop.py`, `mcp_live_server.py`, `AgentDockPanel.tsx`):** Integrated two-stage `agentskills.io` `SKILL.md` progressive loading with OWASP ASI01/ASI03 approval defaults (`skills_write_approval=True`, `memory_write_approval=True`), full `L1 -> L7` closed-loop autonomous engineering orchestration with `>=3` oscillation detection and mandatory Gate-8 human hold, and `defer_loading: True` plugin MCP tools.
- **20 Master-of-Electronics `SKILL.md` Skills & 5-Repo Companion Readiness (`vendor/MANIFEST.json`, `kg_routes.py`, `bootstrap_routes.py`, `assets/icons/`):** Authored 20 `agentskills.io` EE engineering & orchestration skills (`res-ee-skills`), added `/api/v1/libraries/*` and `/api/v1/sbc-modules` companion endpoints, generated custom multi-OS app icons, and polished `BootstrapSplash`.
- **Daemon Hardening & Clean `.archive/` Repository Structure (`daemon.py`, `kg_routes.py`, `.gitignore`):** Fixed missing `_REPO_ROOT` in `kg_routes.py`, hoisted agent/tx routes above unrelated lazy imports, aligned SPICE endpoint `/api/v1/sim/run`, removed user-facing DB jargon, and organized superseded planning notes, old docs, and scratch test caches into gitignored `.archive/`.

## How to Run It

```bash
# Windows (double-click launch.bat, Vajra-Dhir-EDA.vbs, or run in terminal)
launch.bat

# macOS / Linux
./launch.sh

# Headless daemon + workstation sanity probe
node scripts/launch.mjs --headless-check
```

## Verification & Known Limits

- Hardware reference blueprints in `designs/` are software-verified only (`0/3` physically fabricated; Gate-8 human signoff required before fab).
- Full Rust compilation and `cargo test --workspace` require `ubuntu-24.04` CI or local C++ build tools (`link.exe` on Windows); `cargo metadata --locked --format-version 1` passes offline.

## Locked Artifact Digests (`v0.0.5` LF-Normalized SHA-256)

- `pnpm-lock.yaml`: `d049f18b2719b896fffb5525f65481848bbe28971b210c0111adf0801542520c`
- `uv.lock`: `6c288fc1dea554f2ff9b920b78d9e1d39d64f2b8cda17115e172ca7e6699105e`
- `Cargo.lock`: `6b70f2bfc8eb028a8461e5cf80fa94abd653257e3420e26e6371674a4d4a058b`
- `apps/workstation/dist/index.html`: `2c637b893934bb9be90552c594fbd5be40b5fb9b9faca51382b9260b779b9904`
