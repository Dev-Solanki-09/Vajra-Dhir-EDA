# ARCHITECTURE POINTER (orchestrator-owned)

Canonical architecture is FROZEN — do not re-plan or re-litigate it:
- `docs/VD-SAD-001.md` — 4-Ring / 7-Level / 9-Gate architecture (canonical; duplicate `VD-SAD-001-ARCHITECTURE.md` removed).
- `docs/AGENT_KNOWLEDGE_UPDATE_2026_11.md` — CVE floors, KiCad 10 bridge rules, MCP v2, supply-chain invariants.
- `AGENTS.md` — hard invariants (i64 nm, i32 millidegrees, UUIDv7, fail-closed human locks, license firewall, offline $0 tests).
- `design.md` (created in G6A) — locked Silicon Darkroom UI/UX design system.
- `task_plan.md` & `findings.md` — active program ledger and verified root causes.

## Canonical App Runtime Topology (v0.1.0+)
- **Single Workstation UI:** `apps/workstation` (evolved from `apps/prototype-gui`, absorbing `apps/desktop` `dockview-react` wiring; built static `dist/` served by `vd-daemon` on `127.0.0.1:41900`).
- **Single-Command Launch:** `vd studio [project]` boots `vd-daemon` (JSON API + static UI + SSE `/api/v1/agent/*`), supervises Ring-2 subprocesses (Windows Job Objects / Linux `PR_SET_PDEATHSIG`), and opens `127.0.0.1` in browser for **v0.1.0** (with an optional **Tauri v2** native desktop shell in **v0.2.0**).
- **Ring Isolation:** Ring 1 (`packages/*`, `apps/*`, `schemas/*`) = strictly MIT/Apache-2.0/BSD (+ documented `docs/LICENSE_EXCEPTIONS.md` unmodified runtime exceptions: `elkjs` EPL-2.0 and `occt-import-js` LGPL-2.1-with-OCCT-exception as an isolated Web Worker). GPL/AGPL tools (`kicad-cli`, `kikit`+`pcbnew`, Xyce, field solvers) run ONLY as Ring-2 subprocesses/OCI — never linked or imported in-process.

Historical reference only (NEVER execute from): `prompt-and-skills/archive` entries, `prompt-2.txt` (stale pins), `project-overview-4.txt` §8 (obsolete bootstrap instruction).
