# Security Policy

## Scope
Security reports cover `packages/wasm-sandbox`, `packages/hw-dlp`, `packages/hw-ir`, `packages/mcp-gateway`, `packages/vd-daemon`, CSP boundaries in `apps/workstation` and `apps/desktop`, and release automation.

## Reporting a Vulnerability
Please report vulnerabilities privately using GitHub Private Vulnerability Reporting under the Security tab.
Do not open public issues for sensitive security defects.

- **Initial Response:** Within 48 hours.
- **Triage:** Within 7 days.
- **Coordinated Disclosure SLA:** 90 days.

## NDA Airgap & Local Isolation Guarantees
- Local daemons (`vd-daemon`, MCP HTTP bridge, workstation preview) bind strictly to `127.0.0.1` / UDS / Named Pipe.
- In `NDA_AIRGAPPED` mode, `packages/hw-dlp` blocks outbound redirects to external LLM or cloud providers.
- Ring 2 external workers execute under `network_mode: "none"` (`WorkerContract` v1) with SHA-256 pinned image digests.

## Security Floor Requirements
- `wasmtime >= 51.0.0` (`CVE-2026-115889` mitigated)
- `react >= 19.3.1` (`CVE-2026-126187` mitigated)
- `node >= 26.13.1`
- `typescript == 7.0.2`
- `rust == 1.100.0` with a 72-hour publish cooldown (`.cargo/config.toml`).
