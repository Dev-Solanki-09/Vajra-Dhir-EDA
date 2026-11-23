# Security Policy

## Scope
Security reports cover `packages/wasm-sandbox`, `packages/hw-dlp`, `packages/hw-ir`, `packages/mcp-gateway`, CSP boundaries in `apps/desktop`, and release automation.

## Reporting a Vulnerability
Please report vulnerabilities privately using GitHub Private Vulnerability Reporting under the Security tab.
Do not open public issues for sensitive security defects.

- **Initial Response:** Within 48 hours.
- **Triage:** Within 7 days.
- **Coordinated Disclosure SLA:** 90 days.

## Security Floor Requirements
- `wasmtime >= 50.0.0`
- `react >= 19.3.1`
- `node >= 26.13.1`
- `rust == 1.100.0` with a 72-hour publish cooldown.
