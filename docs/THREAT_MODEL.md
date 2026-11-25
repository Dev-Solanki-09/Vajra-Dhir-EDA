# Threat Model — Vajra-Dhīr EDA (`v0.0.5`)

> **Framework:** STRIDE + OWASP Top 10 for Agentic AI (`ASI01`–`ASI10`)

## 1. Trust Boundaries

- **TB-1 (Untrusted External Artifacts):** Imported vendor datasheets, netlists, and community circuit blocks remain untrusted inputs. Pre-commit hooks and repository scanners block unauthorized `.pdf` files outside `docs/public-examples/`. Indirect prompt injection (`ASI01`) is mitigated by isolating untrusted parser text from human-lock state mutations.
- **TB-2 (Sandboxed Code Execution):** `packages/wasm-sandbox` pins `wasmtime >= 51.0.0` (`CVE-2026-115889` mitigated) with memory limits (`256 MiB`), epoch timeouts, and output caps (`ASI02`, `ASI05`). Frontend bundles enforce `react >= 19.3.1` (`CVE-2026-126187` mitigated).
- **TB-3 (Ring-2 External Workers):** External solvers run as isolated processes or OCI containers with mandatory `network_mode: "none"` and SHA-256 pinned images (`403 RING2_EGRESS_BLOCKED` on violation).
- **TB-4 (Airgap & Data Loss Prevention):** `packages/hw-dlp` and `vd-daemon` enforce loopback binding (`127.0.0.1`), prevent outbound redirects for local LLM providers, and reject secret leakage across Git commits.
- **TB-5 (Human-Lock & Release Fail-Closed Controls):** SQLite triggers and CRDT guards reject non-human mutations against `locked = 1` entities (`KERNEL_LOCK_VIOLATION`). Manufacturing release export remains fail-closed unless explicit human authorization is present.
