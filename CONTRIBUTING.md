# Contributing to Vajra-Dhīr EDA

Thank you for contributing to an open, deterministic hardware and software co-design IDE.

## Core Contributing Standards
1. **Developer Certificate of Origin (DCO):** All commits must include a `Signed-off-by:` trailer (`git commit -s`). No CLA is required.
2. **Review the Specifications:** Review `AGENTS.md`, `docs/VD-SAD-001-ARCHITECTURE.md`, and `docs/AGENT_KNOWLEDGE_UPDATE_2026_11.md` before submitting structural changes.
3. **Ring 1 Permissive Firewall:** Core crates in `packages/*` and `apps/*` must remain MIT / Apache-2.0 / BSD. Never link AGPL or unapproved GPL dependencies into Ring 1.
4. **Deterministic Offline Tests:** All test suites must execute offline with zero cloud credentials and $0 API cost.
5. **Architectural RFCs:** Any change to HW-IR SQLite schemas, the 12 MCP verbs, or the `WorkerContract` requires an Architecture RFC.

## Local Verification
```bash
node scripts/check-spdx-firewall.mjs
node scripts/verify-all.mjs
```
