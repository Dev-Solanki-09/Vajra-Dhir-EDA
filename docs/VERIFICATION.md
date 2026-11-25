# Verification Guide — Vajra-Dhīr EDA (`v0.0.5`)

> **Physical Hardware Status:** `0/3 Physically Fabricated` (`NOT_FABRICATED_0_OF_3`). Reference boards in `designs/` are software-verified blueprints pending factory fabrication and bench testing.

## Local Offline Checks

Run checks sequentially for low-memory environments:

```bash
# 1. Dependency firewall & secrets/link hygiene
node scripts/check-spdx-firewall.mjs
node scripts/test-g8-lockfile-spdx.mjs
python scripts/audit-secrets-and-paths.py
python scripts/check-links.py

# 2. Rust workspace lock check (and tests where C++/MSVC linker is present)
cargo metadata --locked --format-version 1
cargo test --workspace

# 3. Frontend builds & Node/TS packages
pnpm install --offline --frozen-lockfile
pnpm --filter @vajradhir/collab test
pnpm --filter @vajradhir/workstation build

# 4. Full verification harness & Chromium headless E2E
node scripts/verify-all.mjs
python scripts/test-g6d-e2e-golden-journeys.py
```

## Toolchain Notes

- Rust toolchain pinned at `1.100.0` in `rust-toolchain.toml` (with `wasmtime 51.0.0` in `Cargo.lock`).
- GitHub Actions `ubuntu-24.04` runs full Rust `cargo clippy` and `cargo test --workspace`. On minimal Windows hosts lacking MSVC `link.exe`, `cargo metadata --locked` validates workspace dependency resolution while compiled Rust binary execution requires Linux CI or local Visual Studio C++ Build Tools.
