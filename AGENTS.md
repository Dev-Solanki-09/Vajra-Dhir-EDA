# AGENTS.md — Contributing & AI Agent Engineering Guidelines

Welcome! Before editing files in this repository, read [Architecture Overview](docs/ARCHITECTURE.md), [Threat Model](docs/THREAT_MODEL.md), and [Verification Guide](docs/VERIFICATION.md).

## Non-Negotiable Engineering Invariants

1. **Deterministic Geometry & Identifiers:**
   - Represent all PCB/IC planar coordinates in signed `i64` nanometers (`1 mm = 1_000_000 nm`) and angles in signed `i32` millidegrees (`0..360000`).
   - Identify hardware entities with immutable UUIDv7 strings. Do not store board geometry as floating-point numbers in SQLite or JSONL logs.
2. **Fail-Closed Human Locks:**
   - Every mutation to the Hardware IR database MUST declare `_tx_actor_ctx` inside its SQLite transaction.
   - Automated agents, CRDT peers, and compilers MUST NEVER modify entities marked `locked = 1` (`KERNEL_LOCK_VIOLATION`).
3. **License & Artifact Isolation:**
   - Ring 1 packages (`packages/*`, `apps/*`) MUST stay strictly `Apache-2.0`, `MIT`, or `BSD` compatible, with documented runtime exceptions isolated per [License Exceptions](docs/LICENSE_EXCEPTIONS.md).
   - Never link AGPL/GPL libraries into Ring 1, commit proprietary ML weights, or commit unauthorized `.pdf` files outside `docs/public-examples/`.
4. **Minimum Toolchain & Security Floors:**
   - Keep `wasmtime >= 51.0.0`, `react >= 19.3.1`, `node >= 26.13.1`, `typescript == 7.0.2`, and Rust `1.100.0`.
   - Maintain single-source pricing in `budget.json`, zero leaked secrets or personal host paths (`scripts/audit-secrets-and-paths.py`), and loopback-only local services (`127.0.0.1` / `network_mode: "none"` for external workers).
5. **Test-First Offline Verification:**
   - Write a failing deterministic test before implementing behavioral changes whenever feasible.
   - Keep Ring 1 tests 100% offline with zero paid APIs or external credentials required.
   - Record factual capability evidence in [Claims Register](docs/CLAIMS_REGISTER.md) and never mark hardware reference designs as physically fabricated without bench verification reports (`NOT_FABRICATED_0_OF_3` while unfabricated).
6. **Commit Hygiene & Verification Before Completion:**
   - Use DCO signoff (`git commit -s`) on every commit.
   - Before finalizing any security, geometry, or compiler change, run the relevant verification suite (`node scripts/check-spdx-firewall.mjs`, `python scripts/audit-secrets-and-paths.py`, `python scripts/check-links.py`, `node scripts/verify-all.mjs`) and report exact pass/fail output honestly.
