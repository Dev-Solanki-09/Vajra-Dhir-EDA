# Release Notes: Vajra-Dhir EDA v0.0.3

- **Version:** `0.0.3`
- **License:** Apache License 2.0 (`LICENSE`, with permissive `MIT OR Apache-2.0` per-crate declarations; see `NOTICE` and [LICENSE_EXCEPTIONS.md](LICENSE_EXCEPTIONS.md))
- **human_signoff:** `PENDING`
- **release_authorized:** `false`
- **physical_fabrication_status:** `NOT_FABRICATED_0_OF_3`

## What Was Added (`v0.0.3`)

- **6-Zone Matte Industrial Precision Workstation (`apps/workstation`):** Rebuilt shell layout with `MenuBar` (9 cascading menus with keyboard navigation and 5 workspace preset tabs plus custom layout saving), `TransportBar` with anchored `Grid`/`Layers`/`Overlays`/`Shading` popovers, collapsible `ToolShelf` with variant flyouts, `BottomDrawer` (`Diagnostics`, `Library`, `Simulation`, `Terminal`, `History`), `Ctrl+K` Command Palette, `Space` cursor context menu, `FloatingWindow` Stackup Calculator, `ToastStack`, and `VajraIcons` (78 monochrome 16x16 SVG icons).
- **Persistent Settings & Local Project Management (`packages/vd-daemon/src/settings_store.py`, `fs_pty_routes.py`):** Atomic JSON persistence in `.vd-cache/user-settings.json` and `project.vd.json` across all 9 preference categories, keymap conflict detector, `FileBrowserModal` backed by `/api/v1/fs/browse` and `/api/v1/fs/mkdir`, dirty-state `UnsavedGuardDialog`, activity audit log, and secret-scrubbed diagnostics bundle (`/api/v1/system/diagnostics-bundle`).
- **One-Command Download Launcher & Integrated Projects (`scripts/launch-studio.py`, `scripts/sync-integrated-projects.mjs`, `packages/tracespace-vendor`):** Vendored pure-MIT `@tracespace/*` packages so fresh clones/ZIP downloads compile without external vendor mirrors, auto-seeded built-in hardware designs (`designs/*`, `fixtures/golden-buck-mcu`) in `HomeScreen` and `/api/v1/projects/catalog`, added `/api/v1/projects/open`, and added `pnpm studio` plus cross-platform `pnpm setup:projects`.
- **Job Runner & Memory Endpoint (`packages/vd-daemon/src/job_runner.py`):** Added `/api/v1/jobs` (`GET`/`POST`/`DELETE`) and `/api/v1/system/memory`.

## What Was Improved

- **Daemon Startup, MIME & Static Serving (`packages/vd-daemon/src/daemon.py`, `acp_orchestrator.py`):** Lazy-loaded heavy solver modules (`z3`, `sympy`, `duckdb`, EE/SPICE/MCAD/fab routes), added explicit Windows MIME types, `Cache-Control`, gzip compression, SQLite PRAGMAs (`mmap_size`, `wal_autocheckpoint`), and query indexes on hot `HW-IR` tables.
- **Workstation Stability & Rendering (`App.tsx`, `WorkstationShell.tsx`, `Viewport3DPanel.tsx`, `ScrubInput.tsx`, `useSettingsStore.ts`):** Added `RootErrorBoundary` with layout recovery, serialized settings writes to eliminate concurrent PUT races, fixed `ScrubInput` expression parsing and drag tracking, added `webglcontextlost` and `forceContextLoss()` cleanup, enabled `proportionalLayout={false}` on Dockview, and removed background `rAF` idle churn.
- **GitHub Actions CI Workflows (`.github/actions-pins.lock.json`, `scripts/check-actions-lock.mjs`):** Moved custom JSON action pin registry out of `.github/workflows/actions.lock` to `.github/actions-pins.lock.json` so GitHub Actions parses both workflows cleanly without `startup_failure`.

## How to Run It

```bash
# 1. Install dependencies, build the workstation UI, start loopback daemon, and open http://127.0.0.1:41900
pnpm studio

# 2. Optional: clone optional external OSS upstream mirrors into vendor/ and workers/sources/
pnpm setup:projects

# 3. Run offline verification suites
python -m pytest packages -q
pnpm -r test
node scripts/check-spdx-firewall.mjs
```

## Verification & Known Limits

- Hardware reference blueprints in `designs/` are software-verified only (`0/3` physically fabricated).
- Full Rust compilation and test execution require `ubuntu-24.04` CI or local C++ build tools (`link.exe` on Windows).
- Remote publishing and fabrication release remain gated on explicit human signoff.

## Locked Artifact Digests (`v0.0.3` LF-Normalized SHA-256)

- `pnpm-lock.yaml`: `d049f18b2719b896fffb5525f65481848bbe28971b210c0111adf0801542520c`
- `uv.lock`: `7c2c8258fa1425c259d838e92afe3a4d744230de0f0d6548b94db3f53f1f78d5`
- `Cargo.lock`: `2b35cf111cbb5c7232017e4227f8d5093e2e3d22294656ef1174833bb6efd6ad`
- `apps/workstation/dist/index.html`: `306ae193a6b93252364e3a1191712f8f1a246b32bd07ac3e38f7480cd552bf49`
