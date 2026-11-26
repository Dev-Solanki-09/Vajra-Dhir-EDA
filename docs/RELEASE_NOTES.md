# Release Notes — Vajra-Dhīr EDA `v0.0.2`

- **Version:** `0.0.2`
- **License:** Apache License 2.0 (`LICENSE`, with permissive `MIT OR Apache-2.0` per-crate declarations; see `NOTICE` and [LICENSE_EXCEPTIONS.md](LICENSE_EXCEPTIONS.md))
- **human_signoff:** `PENDING`
- **release_authorized:** `false`
- **physical_fabrication_status:** `NOT_FABRICATED_0_OF_3`

## Summary of Capabilities (`v0.0.2`)

- **Core Workstation (`apps/workstation`):** React 19 + `dockview-react` MIT docking shell served on `127.0.0.1:41900` (`vd studio`), Matte Industrial Precision chrome, code-split entry JS bundle (`< 400 KB`), WebGL2/Canvas2D PCB viewport with KiCanvas RAF lifecycle guard, `elkjs` schematic layout, `uPlot` scope, pure-MIT IEEE-1364 VCD digital waveform track, MIT `tracespace` 15-layer Gerber preview, and `zustand` omnidirectional `rev_id` cross-view sync.
- **Live MCP v2, ACP & Manufacturing Dossier (`packages/vd-daemon`, `packages/mcp-gateway`):** Unified 12-verb MCP v2 (`--stdio` + Streamable HTTP `/mcp`), `/ws/ui-control` bridge, ACP broker (`OFF`/`COPILOT`/`AUTONOMOUS`), 2-tier capability-gated plugin host, 2.5D DC PI (`padne`), 3D MCAD thermal (`CadQuery` + `Gmsh`/`ElmerFEM`), IPC-2581 fab bundle builder with fail-closed Gate-8 signoff (`403`), and Typst bring-up PDF dossier.
- **Constraints, BOM & DFM (`packages/constraint-mgr`, `packages/bom-analytics`, `packages/dfm-dfa-safety`):** Netclass width/clearance/skew/length rules (`i64` nm), assembly variant DNP/MPN overrides, Extended feeder fees, stock/lifecycle alerts, and DFM/DFA/PI scorecards.
- **Collaboration & Reproducibility (`packages/collab`, `packages/hw-ir`):** `Yjs` CRDT projection with fail-closed `KERNEL_LOCK_VIOLATION` enforcement across peers/agents and deterministic `vd.hw.lock.v1` SHA-256 project digests.
- **Simulation & Silicon Contracts (`packages/sim-compat`, `packages/silicon-pack`, `packages/cad-geom`):** Lockstep co-simulation contracts, Ring-2 `network_mode: none` worker enforcement, LibreLane Pack-2C C2P2B pad-to-ball mapping, SKiDL S-expression importer, and integer `i64` nm MCAD 3D bounding-box clearance DRC.

- **Verification & Known Limits**
  - Hardware reference blueprints in `designs/` are software-verified only (`0/3` physically fabricated).
  - Full Rust compilation and test execution require `ubuntu-24.04` CI or local C++ build tools (`link.exe` on Windows).
  - Remote publishing and release tagging remain gated on explicit human signoff.

## Locked Artifact Digests (`v0.0.2` LF-Normalized SHA-256)

- `pnpm-lock.yaml`: `51496ee58e6d6df74c933965e9fce291e7013ac0992be29754ae9f78a807652f`
- `uv.lock`: `18bee561dcd5573bd635623b7e8234397da59638294bfe8071de6b9e8e92745c`
- `Cargo.lock`: `0c0d3f18118163a81c2cfe6590853687882d451254b0c9d1093e523921487ff4`
- `apps/workstation/dist/index.html`: `9ae102db5477049a2d6983dc04fb877fc98c3a3b94bf326e8a213e5a963fdd4e`
