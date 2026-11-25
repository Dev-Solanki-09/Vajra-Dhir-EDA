# Release Readiness Packet — Vajra-Dhīr EDA `v0.1.0`

- **Date:** 2026-11-25
- **Target Version:** `v0.1.0` (`vd studio` loopback workstation + Ring 1 Core)
- **human_signoff:** `PENDING`
- **release_authorized:** `false`
- **physical_fabrication_status:** `NOT_FABRICATED_0_OF_3`

---

## 1. Executive Gate Summary (78 Classified Gates)
- **`node scripts/verify-all.mjs`:** **`77 PASS / 1 FAIL`** (`50 BEHAVIORAL`, `28 STRUCTURAL_CONTRACT`, `78 total`).
  - **Sole Windows host failure:** Gate 53 (`scripts/test-cad-perfection.py` running `cargo test -p vd-cad-geom`) fails on this Windows workstation strictly due to missing MSVC `link.exe` (`linker 'link.exe' not found`), not code failure. Full Rust workspace test compilation executes on `ubuntu-24.04` CI (`rust: 1.100.0`).
  - **`cargo metadata --format-version 1 --locked`:** PASS (exit `0`).
- **G8 Specific Verifications (All PASS on HEAD):**
  - `node scripts/check-spdx-firewall.mjs` — scans `package.json`, `packages/*/package.json`, `apps/*/package.json`, `pnpm-lock.yaml`, `uv.lock`, `Cargo.lock`, and PDF quarantine (`PASS`).
  - `node scripts/test-g8-lockfile-spdx.mjs` — injected AGPL/EUPL negative suite (`apps/*/package.json`, `uv.lock`, `Cargo.lock`, `pnpm-lock.yaml`) (`G8_LOCKFILE_SPDX_FIREWALL_OK`, `PASS`).
  - `python scripts/audit-secrets-and-paths.py` — zero leaked secrets or personal host paths (`PASS`).
  - `python scripts/test-gate8-release.py` & `python -O scripts/test-gate8-release.py` — fail-closed `human_signoff: PENDING` & `gate_verdicts` hash checks across all 3 reference boards (`PASS`).
  - `python scripts/test-g7-claims-and-hashes.py` — independent LF-normalized SHA-256 recomputation of 24/24 board artifacts (`G7_CLAIMS_AND_HASHES_OK`, `PASS`).
  - `python scripts/test-g6d-e2e-golden-journeys.py` — live cold-booted `vd-daemon` serving `apps/workstation/dist` across all 5 Golden E2E Chrome headless journeys (`G6D_E2E_5_JOURNEYS_OK`, `PASS`).

---

## 2. Locked Artifact Digests (LF-Normalized SHA-256)
- `pnpm-lock.yaml`: `781149a6deeda6f513256430e47fd1ef238165b5fc620b7948cff00e88a10502`
- `uv.lock`: `9a0843e2965d9eed176d13fd79e41023686ef13ce35751351dcec68b9bfc4d4c`
- `Cargo.lock`: `5472553db43beba0e3164e6d2aa7be450332d91ae3a823dc9c953f5f30463b86`
- `apps/workstation/dist/index.html`: `8c50fa978f4cf123911a971eeefaad7356c3fb2ae25138c7fa8c2ebd05bc8dba`

---

## 3. Environment & Outstanding Human Signoff Actions
1. **Hardware Fabrication Gate:** `0/3` reference PCBs physically fabricated or bench-tested; production claims remain strictly scoped to software verification blueprints (`designs/board-{1,2,3}/verification_report.json`).
2. **Host Toolchain Notes:**
   - Windows build machine runs Node `24.19.0` (upgrade to `26.13.1` LTS optional for local runs; GitHub Actions CI pins `26.13.1`).
   - Full `cargo test --workspace --locked` execution requires MSVC `link.exe` locally or `ubuntu-24.04` GitHub Actions runner upon push.
3. **Human Release Signoff Required:** Do NOT push, tag, or authorize `release_authorized: true` until human maintainer reviews this packet, approves push/CI run on GitHub Actions, and issues an explicit cryptographic signoff token.
