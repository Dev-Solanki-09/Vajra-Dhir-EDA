# AGENTS.md — Vajra-Dhīr EDA Principal Engineering Constitution

Read `docs/AGENT_KNOWLEDGE_UPDATE_2026_11.md` and `task_plan.md` BEFORE editing any file.
Follow `ChiefGyk3D/Clouds-Against-Humanity` Enterprise Engineering Habits on every PR.

## Hard Non-Negotiable Invariants
1. **Units & IDs:** ALL geometry is signed `i64` nanometers (`1 mm = 1_000_000 nm`) and `i32` millidegrees (`0..360000`). ALL entity IDs are immutable UUIDv7 strings. NEVER store PCB/IC coordinates as floats in SQLite or JSONL.
2. **Human Locks Fail Closed:** Every write to `HW-IR` MUST set `_tx_actor_ctx` inside the SQLite transaction. Non-human actors (`agent`, `compiler`) MUST NEVER mutate `locked = 1` entities.
3. **Ring 1 License Firewall:** `packages/*` and `apps/*` MUST stay strictly MIT / Apache-2.0 / BSD. Zero AGPL (`kibot`, `konnect`, `part-db`, `pypsa-app`, `openmodelica`), zero GPL linked in Ring 1, zero non-commercial ML checkpoints, zero vendor `.pdf` files committed to Git.
4. **Nov 2026 CVE Floor:** `wasmtime >= 50.0.0`, `react >= 19.3.1`, `node >= 26.13.1`, `typescript == 7.0.2` (`moduleResolution: bundler|nodenext`), Rust `1.100.0` (with `.cargo/config.toml` 72h publish cooldown).
5. **No Blind Coding:**
   - Use `serena` LSP symbols before reading whole files; use `context7` before using any unfamiliar API.
   - Write the failing deterministic test FIRST (Red -> Green -> Refactor). All Ring 1 tests MUST run 100% offline with $0 API cost and zero credentials.
   - If a fix fails 3 times, STOP, log root cause in `findings.md`, and escalate architecture.
   - Never mark a task complete without running the exact verification commands and inspecting fresh output.
6. **Dual-Context Review:** Before merging any security-critical, geometry, or hardware-compiler PR, spawn a fresh reviewer context with zero solver history (`doubt-driven-development` + `security-audit`).
7. **Enterprise Habits:** Single `budget.json` pricing source; zero secrets in Git; zero inbound open ports (`127.0.0.1` / UDS / `network_mode: none`); stamp verification dates on external claims (`docs/CLAIMS_REGISTER.md`).

## Skill Routing Table (`.agents/skills/`)
- Rust kernel / SQLite / `hw-merge` / `cad-geom` -> load `vd-principal-systems-rust` + `rust-skills`
- KiCad 10 / `atopile` / PCB / Z3 / SPICE / Physics -> load `vd-senior-eda-physics` + `kicad-happy`
- MCP Gateway / ACP / Wasmtime / `hw-dlp` / `WorkerContract` -> load `vd-frontier-agent-harness` + `mcp-builder`
- React 19 / Dockview / WebGPU / MCP Apps `ui://` -> load `vd-silicon-darkroom-ui` + `impeccable` + `vercel-react-best-practices`
- Security / CI / Release / Threat Model -> load `vd-enterprise-devsecops` + `security-audit` + `owasp-security`
