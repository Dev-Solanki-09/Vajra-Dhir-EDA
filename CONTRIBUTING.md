# Contributing to Vajra-Dhīr EDA

Thank you for contributing to an open, deterministic hardware and software co-design IDE.

## Core Contributing Standards
1. **Developer Certificate of Origin (DCO):** All commits must include a `Signed-off-by:` trailer (`git commit -s`). No CLA is required.
2. **Review the Specifications:** Read [`AGENTS.md`](AGENTS.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md), and [`docs/VERIFICATION.md`](docs/VERIFICATION.md) before submitting structural changes.
3. **Ring 1 Permissive Firewall:** Core crates and packages in `packages/*` and `apps/*` must remain Apache-2.0 / MIT / BSD compatible (with documented runtime exceptions in [`docs/LICENSE_EXCEPTIONS.md`](docs/LICENSE_EXCEPTIONS.md)). Never link AGPL or unapproved GPL dependencies into Ring 1.
4. **Deterministic Offline Tests:** All test suites must execute 100% offline with zero cloud credentials and $0 API cost.
5. **Factual Engineering Claims:** Never alter `human_signoff: PENDING` or mark unfabricated reference boards as physically fabricated without bench reports.

## RFC Workflow
Any change to `HW-IR` SQLite schemas (`packages/hw-ir/schema/`), the 12 MCP v2 verbs (`schemas/mcp-v2-12verbs.json`), `WorkerContract` (`schemas/worker_contract.v1.json`), or Ring 1–4 boundaries requires an Architecture RFC:
1. Open an issue using the [Architecture RFC template](.github/ISSUE_TEMPLATE/rfc_architecture.yml).
2. Document the concrete failure mode, schema diff, and offline verification plan.
3. Obtain maintainer review before opening the implementation PR.

## Local Verification Commands
Run these checks locally before opening a pull request:
```bash
node scripts/check-spdx-firewall.mjs
python scripts/audit-secrets-and-paths.py
python scripts/check-links.py
python scripts/test-sqlite-30tables-locks.py
python scripts/test-schemas.py
node scripts/verify-all.mjs
```
