# Release Notes — Vajra-Dhīr EDA `v0.0.5`

- **Version:** `0.0.5`
- **License:** Apache License 2.0 (`LICENSE`, with permissive `MIT OR Apache-2.0` per-crate declarations; see `NOTICE` and [LICENSE_EXCEPTIONS.md](LICENSE_EXCEPTIONS.md))
- **human_signoff:** `PENDING`
- **release_authorized:** `false`
- **physical_fabrication_status:** `NOT_FABRICATED_0_OF_3`

## Summary of Capabilities (`v0.0.5`)

- **Core Workstation (`apps/workstation`):** React 19 + `dockview-react` MIT docking shell served on `127.0.0.1:41900` (`vd studio`), code-split entry JS bundle (`< 400 KB`), WebGL2/Canvas2D PCB viewport, `elkjs` schematic layout, `uPlot` scope, pure-MIT IEEE-1364 VCD digital waveform track, and RS-274X Gerber layer preview.
- **Constraints, BOM & DFM (`packages/constraint-mgr`, `packages/bom-analytics`, `packages/dfm-dfa-safety`):** Netclass width/clearance/skew/length rules (`i64` nm), assembly variant DNP/MPN overrides, Extended feeder fees, stock/lifecycle alerts, and DFM/DFA/PI scorecards.
- **Collaboration & Reproducibility (`packages/collab`, `packages/hw-ir`):** `Yjs` CRDT projection with fail-closed `KERNEL_LOCK_VIOLATION` enforcement across peers/agents and deterministic `vd.hw.lock.v1` SHA-256 project digests.
- **Simulation & Silicon Contracts (`packages/sim-compat`, `packages/silicon-pack`, `packages/cad-geom`):** Lockstep co-simulation contracts, Ring-2 `network_mode: none` worker enforcement, LibreLane Pack-2C C2P2B pad-to-ball mapping, SKiDL S-expression importer, and integer `i64` nm MCAD 3D bounding-box clearance DRC.

- **Verification & Known Limits**
  - Hardware reference blueprints in `designs/` are software-verified only (`0/3` physically fabricated).
  - Full Rust compilation and test execution require `ubuntu-24.04` CI or local C++ build tools (`link.exe` on Windows).
  - Remote publishing and release tagging remain gated on explicit human signoff.

## Locked Artifact Digests (`v0.0.5` LF-Normalized SHA-256)

- `pnpm-lock.yaml`: `8ee7f665da0a3de047663b99aefbba27d5a496705c29076cc91b0a77b17e36ca`
- `uv.lock`: `b61c30ffdd5b58a68133fc0cfb222218ca11a9e6e15178b6cb6ae4e03c5618b7`
- `Cargo.lock`: `08ca3fe53fe442ce0e0627351c305641d1ec2a54a438bfad18c435d2738b6ad5`
- `apps/workstation/dist/index.html`: `656d56c145d21985d9e8b6bfa7ef31174339f621bd137150f620e45387993f1c`
