# Verification Guide — Vajra-Dhīr EDA (`v0.0.5`)

> **Physical Hardware Status:** `0/3 Physically Fabricated` (`NOT_FABRICATED_0_OF_3`). Reference boards in `designs/` are software-verified blueprints pending factory fabrication and bench testing.

## Local Offline Checks

Run checks sequentially for low-memory environments:

```bash
# 1. Dependency firewall, repo size, secrets, and link hygiene
node scripts/check-spdx-firewall.mjs
node scripts/test-g8-lockfile-spdx.mjs
node scripts/check-repo-size.mjs
python scripts/audit-secrets-and-paths.py
python scripts/check-links.py

# 2. Rust workspace lock check (and tests where C++/MSVC linker is present)
cargo metadata --locked --format-version 1
cargo test --workspace

# 3. Frontend builds & Node/TS packages
pnpm install --offline --frozen-lockfile
pnpm test
pnpm --filter @vajradhir/workstation build

# 4. Python solver, daemon & E2E verification harnesses
python -m pytest packages -q
python scripts/test-live-mcp-harness-plugins.py
node scripts/launch.mjs --headless-check
node scripts/verify-all.mjs
python scripts/test-g6d-e2e-golden-journeys.py

# 5. Stage 1-6 subsystem E2E checks
node scripts/test-cross-integration-e2e.mjs
node scripts/test-canvas-ergonomics-e2e.mjs
node scripts/test-verifier-and-lab-e2e.mjs
node scripts/test-hermes-agent-byok-e2e.mjs
node scripts/test-product-polish-e2e.mjs
node scripts/test-final-torture-gate.mjs
```

## Toolchain Notes

- Rust toolchain pinned at `1.100.0` in `rust-toolchain.toml` (with `wasmtime 51.0.0` in `Cargo.lock`).
- GitHub Actions `ubuntu-24.04` runs full Rust `cargo clippy` and `cargo test --workspace`. On minimal Windows hosts lacking MSVC `link.exe`, `cargo metadata --locked` validates workspace dependency resolution while compiled Rust binary execution requires Linux CI or local Visual Studio C++ Build Tools.
