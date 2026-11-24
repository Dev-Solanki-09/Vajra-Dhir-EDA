# TICKET T-03 · Wave 1/2 · Kernel Protocol Parity

| Field | Value |
|---|---|
| Owner | WORKER-DEEPSEEK (OpenCode) |
| Worktree | `D:\project-deepseek` |
| Branch | `feat/worker-deepseek` |
| Status | **QUEUED — start only after T-01 is merged and your worktree is rebased on main** |
| Handoff | `.ai-sync/handoffs/T-03-deepseek.md` |

## Mission
Fix three verified spec/code drift defects in the SHIPPED code (spec artifacts in `prompt-and-skills/` may differ — verify against actual source). Failing test FIRST for each.

1. **F-05** Rust `HardwarePatchOp` enum (likely `packages/hw-ir/src/model.rs`) includes `UPSERT_ENTITY`; the TypeScript mirror omits it. Also `hw_patch` actor enum (schemas + TS/Rust types) lacks `import` though provenance includes human|agent|cubo|import|compiler. Align mirrors to the canonical kernel definition. Add a parity regression test that enumerates both sides and fails on mismatch.
2. **F-06** `.gitattributes` merge-driver name (reported `vd-merge`) vs package `packages/hw-merge`. Inspect `.gitattributes`, the crate's actual binary name, and registration scripts/docs; make consistent (canonical = what the crate actually builds — verify). Test asserting driver name matches crate binary.
3. **F-07** FG-05 in `packages/symbolic-verifier` (Rust `footguns.rs` and/or Python): message says 900–11000, check enforces [1000, 10000]. Read spec intent (`docs/`, `prompt-and-skills/prompt-2.txt` §4 footguns), decide canonical range, align message AND check, boundary tests both sides of each limit. Document decision in handoff.

## Toolchain
cargo/rustc NOT installed. Attempt rustup via https://win.rustup.rs (network allowed for tooling). Policy pins Rust 1.100.0 — check upstream existence (`rustup toolchain install 1.100.0`); if absent, DO NOT edit `rust-toolchain.toml` or silently downgrade policy — use available stable for local verification, record deviation in handoff. If Rust cannot install: complete TS/schema/Python-side fixes, report cargo verification BLOCKED with exact errors. Once cargo works: `cargo generate-lockfile`, commit `Cargo.lock`.

## WRITE_SCOPE
`packages/hw-ir/**`, `packages/hw-merge/**`, `.gitattributes`, `packages/symbolic-verifier/**`, `schemas/**` (patch-op/actor schemas only), `Cargo.lock` (new), new tests inside those packages, `.ai-sync/handoffs/T-03-deepseek.md`.

## CONTRACT
Same as T-01, plus: zero `.unwrap()`/`.expect()` in Ring 1 library crates (thiserror); lock-trigger negative tests must keep passing.

## VERIFY_CMD
```
cargo test <affected crates — discover names from Cargo.toml>
python scripts/test-sqlite-trigger.py
python scripts/test-sqlite-30tables-locks.py
<your new parity/naming/boundary tests>
```
**Do NOT run `node scripts/verify-all.mjs` or daemon tests while T-01 is in flight (port collision). After T-01 merge, full harness is allowed.**

## Audit note
This ticket touches kernel/merge ⇒ orchestrator will commission an independent dual-context review before merge.