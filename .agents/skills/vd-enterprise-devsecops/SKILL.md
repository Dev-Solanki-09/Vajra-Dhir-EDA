---
name: vd-enterprise-devsecops
description: Enterprise DevSecOps, Clouds-Against-Humanity habits, SPDX/CycloneDX license firewall, zero-credential offline CI testing, and GitHub Actions security. Trigger on CI workflows, Dockerfiles, scripts, or release packaging.
---
# Enterprise DevSecOps & Supply-Chain Discipline — Vajra-Dhīr EDA

## 1. Clouds-Against-Humanity Operational Mandates
1. **Single Cost Truth:** Read LLM, worker, and BOM caps strictly from `budget.json` across runtime router, GUI HUD, and CI cost gate.
2. **Zero Secrets in Git:** Never commit API keys, tokens, or signing keys. Verify with `gitleaks` on every PR.
3. **Zero Inbound Exposure:** Local daemons bind strictly to UDS / Named Pipe / `127.0.0.1` + per-session bearer token; all Ring 2 OCI workers run under `runtime: runsc` (`gVisor`) with `network_mode: none`, `read_only: true`, `cap_drop: ["ALL"]`, `no-new-privileges:true`.
4. **Offline $0 CI Tests:** Every module MUST ship deterministic mocked-provider unit/integration tests requiring zero cloud accounts and zero paid API keys.
5. **No Autodeploy:** Automated CI proves build/tests/security/licenses; human confirmation is required for releases and Harness² skill PRs.
6. **Dated Claims & Threat Model:** Update `docs/THREAT_MODEL.md` when adding new trust boundaries and stamp dates in `docs/CLAIMS_REGISTER.md` for external tool behaviors.

## 2. Supply-Chain & License Verification
- Pin all GitHub Actions via `.github/workflows/actions.lock` (`gh actions-lock`).
- Pin all Ring 2 Docker images by immutable `@sha256:` digest in `hw.lock` and `docker-compose.workers.yml`.
- Maintain `.cargo/config.toml` `[registry] global-min-publish-age = "72 hours"`.
- Run `cloudflare/security-audit-skill` iteratively on touched security modules before release; never accept a single-pass audit as complete.
