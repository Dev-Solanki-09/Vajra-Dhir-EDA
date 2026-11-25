# Release Readiness Packet — Vajra-Dhīr EDA `v0.2.0`

- **Date:** 2026-11-25
- **Target Version:** `v0.2.0` (`vd studio` + `VD-PERF-001` P0–P5 + `X1–X4` Industrial-Rival Expansion)
- **human_signoff:** `PENDING`
- **release_authorized:** `false`
- **physical_fabrication_status:** `NOT_FABRICATED_0_OF_3`

---

## 1. Executive Gate Summary (83 Classified Gates)
- **`node scripts/verify-all.mjs`:** **`82 PASS / 1 FAIL`** (`55 BEHAVIORAL`, `28 STRUCTURAL_CONTRACT`, `83 total`).
  - **Sole Windows host failure:** Gate 53 (`scripts/test-cad-perfection.py` running `cargo test -p vd-cad-geom`) fails on this Windows workstation strictly due to missing MSVC `link.exe` (`linker 'link.exe' not found`). Full Rust workspace build/tests execute on `ubuntu-24.04` CI (`rust: 1.100.0`).
  - **`cargo metadata --locked --format-version 1`:** PASS (exit `0`).
- **X-Track & Security Verifications (All PASS on HEAD):**
  - **P0–P5 Performance:** `python scripts/test-p0-perf-budgets.py` (`P0_BASELINE_OK`, entry JS chunk reduced `2,220.89 kB` -> `73.26 kB`, `CrossProbeBus` max `< 1 ms` vs `< 16 ms` budget, `elk_layout_median_ms < 50 ms`).
  - **X1 Constraints & BOM Variants:** `python scripts/test-x1-constraints-bom.py` (`X1_CONSTRAINTS_BOM_SCORECARD_OK`, Gate 80) + `vd-constraint-mgr` / `vd-bom-analytics` MIT/Apache crates.
  - **X2 CRDT Collab & `hw.lock`:** `node scripts/test-x2-collab-hwlock.mjs` (`X2_COLLAB_HWLOCK_OK`, Gate 81) + `packages/collab` (`3/3` PASS, fail-closed `KERNEL_LOCK_VIOLATION` across remote `Yjs` peers + deterministic FIPS-verified `vd.hw.lock.v1` SHA-256 digest + `hw-ir/src/digest.rs`).
  - **X3 Co-Sim, Field Solvers & Pure-MIT VCD:** `python scripts/test-x3-sim-vcd.py` (`X3_SIM_COSIM_VCD_MIT_OK`, Gate 82) + IEEE-1364 pure-MIT `vcdParser.ts` + `VcdWaveformViewer.tsx` (zero EUPL `surfer`), `< 25 ms` 166k-sample min-max decimation, Renode-ngspice lockstep, and Ring-2 HTTP `403 RING2_EGRESS_BLOCKED`.
  - **X4 LibreLane Pack-2C, STEP 3D & Supply Chain:** `python scripts/test-x4-silicon-mcad.py` (`X4_SILICON_MCAD_SUPPLY_OK`, Gate 83) + `vd-silicon-pack` (forbids legacy OpenLane + enforces `network_mode == "none"`), `mcad_clearance.rs` (`i64` nm 3D interference/clearance DRC), `skidl_netlist.rs`, and pure-MIT `gerberPreview.ts`.
  - **SPDX & Secrets Floor:** `node scripts/check-spdx-firewall.mjs` (`PASSED`), `node scripts/test-g8-lockfile-spdx.mjs` (`G8_LOCKFILE_SPDX_FIREWALL_OK`), `python scripts/audit-secrets-and-paths.py` (`PASS`), `python scripts/test-g6d-e2e-golden-journeys.py` (`G6D_E2E_5_JOURNEYS_OK`).

---

## 2. Locked Artifact Digests (LF-Normalized SHA-256)
- `pnpm-lock.yaml`: `8ee7f665da0a3de047663b99aefbba27d5a496705c29076cc91b0a77b17e36ca`
- `uv.lock`: `9a0843e2965d9eed176d13fd79e41023686ef13ce35751351dcec68b9bfc4d4c`
- `Cargo.lock`: `55c66308468d6053e436d4c3e285efd9d7ed3ccf8bbc4984b68de024277f3a3a`
- `apps/workstation/dist/index.html`: `656d56c145d21985d9e8b6bfa7ef31174339f621bd137150f620e45387993f1c`

---

## 3. Hard Non-Negotiable Release Guards (L128 & Human Gate)
1. **No Tier-4 Hardware-Verified Claim (`L128`):** `0/3` reference PCBs have been physically fabricated or bench-tested (`NOT_FABRICATED_0_OF_3`). All `board-{1,2,3}` verdicts remain strictly verified software reference blueprints (`designs/board-{1,2,3}/verification_report.json`).
2. **Host Toolchain Caveats:** Local Windows build environment runs Node `24.19.0` (manifests target `>= 26.13.1`, CI pins `26.13.1`) and lacks MSVC `link.exe` (GitHub Actions `ubuntu-24.04` compiles full Rust workspace).
3. **Human Release Gate:** Do NOT push to remote, tag `v0.2.0`, or flip `release_authorized: true` until human maintainer reviews this packet and issues explicit approval.
