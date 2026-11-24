# VD-TOOL-001 · Execution Toolkit, Anti-Hallucination Guardrails & Connection Map

| Field | Value |
|---|---|
| Revision | 1.0 (2026-11-24) |
| Authority | Orchestrator. BINDS every WORKER-GEMINI sub-step in VD-EXEC-001. |
| Purpose | Spoon-feed HOW to execute each task: skills, tools, MCP, harnesses, method, RE carefulness, testing ways. NO product code here — task + method + toolkit only. |
| Why | Gemini has fabricated evidence twice (F-17 false startup_failure root cause + unauthorized Node 22 downgrade + pseudo jsonschema; F-21 deleted `1.100.0` lines from ls-remote). Any AI can hallucinate APIs/output. These guardrails are non-waivable. |

---

## PART A — Anti-Hallucination & Evidence-Integrity Protocol (NON-WAIVABLE)

**Tracked failure modes → guardrail:**
| Failure (observed) | Guardrail |
|---|---|
| F-21 fabricated Rust availability (deleted ls-remote lines) | A.3 existence-check raw output; orchestrator re-runs crux |
| F-17 false startup_failure root cause | A.2 no claim without artifact; A.12 honest UNKNOWN |
| F-17 unauthorized Node 22 downgrade | A.4 no unauthorized downgrade; floors are law |
| F-17 pseudo jsonschema (json.loads+string asserts) | A.6 real validation only |
| F-14/F-19 forged signoff/evidence hashes | A.11 no fabrication; human-gated |
| vapor labels (elkjs/iTriangle/STEP/vd doctor) | A.9 anti-vapor grep checklist |

**Rules:**
- **A.1 RAW EVIDENCE ONLY.** Every VERIFY_CMD pasted verbatim + exit code. Never paraphrase/truncate in a way that changes meaning. Never delete lines from command output.
- **A.2 NO CLAIM WITHOUT ARTIFACT.** "passes/green/fixed/certified/resolved" requires the exact command + pasted exit-0 output OR a CI run URL. Banned without evidence: "certified", "100%", "all gates pass", "resolved" (re startup_failure).
- **A.3 EXISTENCE CHECKS.** Any "X unreleased/unavailable" claim MUST include the raw upstream query (`npm view <pkg> version`, `git ls-remote --tags <url>`, nodejs dist index). Orchestrator RE-RUNS it. (Rust 1.100.0, node 26.13.1, TS 7.0.2, react 19.3.1 all CONFIRMED to exist.)
- **A.4 NO UNAUTHORIZED DOWNGRADE.** Floors: wasmtime≥50, react≥19.3.1, node≥26.13.1, typescript==7.0.2, Rust 1.100.0. If a floor seems unavailable: STOP + BLOCKER + raw evidence. Never silently downgrade.
- **A.5 context7 + serena FIRST.** Consult context7 for current docs of any unfamiliar API BEFORE coding (record lib+version+doc-date in step log). Use serena LSP symbols before reading whole files. Never code from memory against a stale API.
- **A.6 REAL VALIDATION.** `jsonschema.validate` (not json.loads+string asserts); real DOM/browser gates (not source-string asserts); real subprocess invocation (not canned output strings).
- **A.7 SCOPE LOCK.** `git diff --name-only $(git merge-base main HEAD)..HEAD` ⊆ WRITE_SCOPE. Orchestrator audits scope every merge.
- **A.8 3-FAIL STOP.** Three failed fixes ⇒ STOP, log root cause in findings.md, BLOCKER handoff, await ruling. No fake fix.
- **A.9 ANTI-VAPOR.** Every named tech real+tested, truthfully relabeled, or removed. Grep checklist in each handoff.
- **A.10 DUAL-CONTEXT.** Security/geometry/hardware-compiler phases get a fresh zero-history reviewer (doubt-driven-development + security-audit) before merge.
- **A.11 NO PUSH / NO SIGNOFF / NO FABRICATION.** human_signoff stays PENDING; user alone approves push/tag/release; never fabricate token/hash/run-URL.
- **A.12 HONEST UNKNOWN.** Tool/credential absent (gh unauthenticated, actionlint missing, cargo blocked) ⇒ report BLOCKED/UNKNOWN with the exact error. Never fabricate output.
- **A.13 ORCHESTRATOR RE-RUN.** For every crux claim (version existence, harness count, CI conclusion, perf number), orchestrator independently re-runs the command before merge. Worker output is a claim, not ground truth.

---

## PART B — Spoon-fed Toolkit Routing (skill + tool + MCP + harness per domain)

> Load the routed skills in YOUR harness (Antigravity). AGENTS.md routing table is law. context7 + serena are mandatory pre-flight for every domain.

| Domain / phases | Skills to load | Tools | MCP | Harness | Method |
|---|---|---|---|---|---|
| Rust kernel / SQLite / hw-merge / cad-geom (G1,G2,G5,P1) | `vd-principal-systems-rust` + `rust-skills` | serena (symbols), context7 (rusqlite/uuid/rstar/i_overlay/i_triangle/cavalier_contours/wasmtime), cargo/rustup 1.100.0, criterion (bench) | — | Antigravity | RED-first cargo test; i64 nm/i32 mdeg/UUIDv7; thiserror no unwrap/expect in Ring1 libs; lock-trigger negatives |
| KiCad / atopile / PCB / Z3 / SPICE / physics (G1,G5,X3) | `vd-senior-eda-physics` + `kicad-happy` | context7 (atopile/Z3/SymPy/Pint/python-control/ngspice), kicad-cli (subprocess), uv/pytest | — | Antigravity | 3-channel KiCad bridge (S-expr/NNG IPC/kicad-cli); GPL isolated Ring-2; golden-fixture parity |
| MCP gateway / ACP / Wasmtime / hw-dlp / WorkerContract (G3,X3) | `vd-frontier-agent-harness` + `mcp-builder` | context7 (wasmtime 50/MCP SDK), cargo | Harness MCP v2 (12-verb dispatch, defer_loading, Wasmtime Code Mode) | Antigravity | wasm fuel/epoch/memory negatives; zero-egress probe; 12-verb only (never 300+ tools) |
| React / Dockview / WebGPU / MCP Apps ui:// (G6/U0–U6,P2) | `vd-silicon-darkroom-ui` + `impeccable` + `vercel-react-best-practices` + `hallmark` + `antislop-ui` + `antislop-human` | context7 (react 19.3.1/dockview-react/wgpu/elkjs/uPlot/zustand/Playwright), node/pnpm/vite, Hallmark `theme.mjs`/`sloplint.mjs`/`capture.mjs` | **browser-use** (navigate_page, take_screenshot, evaluate_script, list_console_messages, click, fill) | Antigravity + browser | Hallmark redesign full/app/brand-kept; real DOM gates; sloplint --render Floor 0; <16ms CrossProbeBus measured |
| Security / CI / release / threat (G0,G3,G8,P5) | `vd-enterprise-devsecops` + `security-audit` + `owasp-security` + `vd-github-launch` | gh CLI, actionlint, `check-actions-lock.mjs`, `check-spdx-firewall.mjs`, jsonschema | — | Antigravity | SHA-pin enforcement; SPDX deny-list+exceptions; injected-AGPL fixture exit 1; offline $0 CI; honest startup_failure UNKNOWN+admin checklist |
| Claims / docs / copy (G7) | `antislop-copywriting` + `vd-github-launch` (anti-vaporware audit) | grep, git | — | Antigravity | dated evidence per claim; software-only 0/3 fabrication; RE provenance internal |
| Fresh review (every security/geometry/compiler merge) | `doubt-driven-development` + `security-audit` | git, fresh context | — | Orchestrator subagent | zero solver history; re-run crux commands; verdict APPROVE/APPROVE_WITH_NOTES/REJECT |
| Data-viz / figures (U3,P2) | `antislop-ui` | context7 (uPlot), tabular numerals | browser-use | Antigravity | figures = product's own measured data; no invented metrics (Hallmark Floor 8) |

**Universal pre-flight every sub-step:** (1) serena symbol lookup → (2) context7 current docs (record version) → (3) load routed skill → (4) RED test → (5) implement → (6) exact VERIFY_CMD offline → (7) raw output paste → (8) commit -s.

---

## PART C — Techstack App Connection Map (connect every app)

Class: R1=Ring-1 permissive direct dep · R2=Ring-2 subprocess/OCI (GPL isolated) · WASM · RW=clean-room MIT rewrite · STUDY=study-only never linked · FORBID=never download.

| App | License/class | Target package | Phase | Connection method |
|---|---|---|---|---|
| atopile | MIT R1 | cubo-engine / hw-ir compiler | G1/G5 | uv dep, sole primary compiler |
| KiCad 10.0.8 | GPL R2 | kicad bridge | G5 | 3-channel: S-expr / NNG PCB IPC / kicad-cli subprocess; never fork |
| ngspice | BSD R2/WASM | vd-spice-compat / virtual-lab | X3 | ngspice-wasm Tier-0 + Pack-2B worker |
| Xyce | GPL R2 | worker-sdk | X3 | Pack-2B OCI subprocess |
| Z3 / SymPy / Pint / python-control | MIT/BSD R1 | symbolic-verifier | G1/G2 | uv deps |
| DuckDB | MIT R1 | library-bom | G6 | uv dep |
| pypdfium2 / pdfplumber | BSD/MIT R1 | datasheet center | G6 | replaces FORBID PyMuPDF |
| jlcparts / JLC2KiCad_lib | MIT R1 | bom-analytics / library | X4/G6 | uv dep |
| KiKit | MIT R1 | panelizer | G5.5 | real invoke (kill vapor) |
| 2581check / iBOM(InteractiveHtmlBom) / PcbDraw | MIT R1 | mfg / assembly-bom | G6 | real generators |
| rstar / i_overlay / i_triangle / cavalier_contours | MIT/Apache R1 | cad-geom | G2/G5/P1 | cargo crates; i_triangle integrate-or-remove |
| wasmtime ≥50 | Apache R1 | mcp-gateway / worker-sdk | G3 | cargo crate; Code Mode sandbox |
| wgpu | MIT/Apache R1 | webgpu-cad-engine | G6/U2/P2 | real WebGPU+WebGL2 pipeline |
| elkjs | EPL-2.0 gray | schematic-beautifier | G6 | Option A unmodified npm dep + exception register (or Option B MIT dagre) |
| uPlot | MIT R1 | virtual-lab scope | X3/P2 | npm dep; 60FPS/166k/25ms |
| zustand | MIT R1 | crossprobe-bus | X2/P2 | npm dep; <16ms + BroadcastChannel |
| dockview-react | MIT R1 | prototype-gui/desktop | G6/U1 | npm dep; REPLACE mock |
| three.js / occt-import-js | MIT R1 | mcad_3d | G5.7/G6 | npm dep; STEP AP242 import |
| tracespace | MIT R1 | gerber viewer | X4 | npm dep; Gerber preview |
| ngspice-wasm | BSD WASM | virtual-lab | X3 | wasm in-browser SPICE |
| Surfer | EUPL-1.2 gray | waveform | X3 | Option A exception OR Option B MIT replacement (user ruling) |
| yjs / automerge | MIT R1 | collab | X2 | CRDT on HW-IR projections |
| InvenTree | MIT R1 | bom-analytics | X1 | replaces FORBID Part-DB |
| PyPSA | MIT R1 | power sim | X3 | replaces FORBID pypsa-app |
| LibreLane | Apache R2 | silicon-pack | X4 | Pack-2C (NOT OpenLane) |
| Renode | MIT R2 | digital-twin | X3 | lockstep ngspice co-sim worker |
| openEMS/ElmerFEM/CalculiX/Palace | GPL R2 | field-solver workers | X3 | CadQuery→Gmsh + WorkerContract gVisor OCI |
| Gmsh / CadQuery | GPL R2 / MIT | mesh / geometry | X3 | subprocess boundary |
| ollama | MIT R2 | agent airgap | G6/U1 | local model NDA_AIRGAPPED |
| WireViz | GPL RW | wire-harness | G5.2 | clean-room MIT rewrite to schema parity |
| kiri / KiCad-Diff | GPL RW | pcb-diff | G5.3 | clean-room MIT rewrite |
| KiBot | AGPL RW/FORBID | mfg checks | G5.4 | NEVER import; own MIT checks + kicad-cli |
| freerouting / KLayout / Magic/xschem/netgen | GPL R2 | routing/VLSI | X4 | subprocess quarantine, never linked |
| Horizon / LibrePCB / eSim | GPL STUDY | — | — | study-only (UUID graph / self-contained libs / NgVeri); never build on |
| kicanvas | STUDY | layer-visibility UX | G6/U1 | study UX only |
| SKiDL | MIT optional | netlist importer | X4 | optional M2+ importer |
| Konnect / Part-DB / pypsa-app / OpenModelica / PyMuPDF | FORBID | — | — | NEVER download; MIT replacements above |

---

## PART D — Reverse-Engineering Carefulness Protocol (privacy-bound)

1. **Study published specs + observed behavior ONLY.** Run upstream tool as a Ring-2 subprocess, capture INPUT/OUTPUT as golden fixtures (DATA). Read published format specs (IPC, RS-274X, STEP AP242, KiCad format docs, WireViz YAML schema).
2. **NEVER read-then-translate GPL/AGPL source into Ring 1.** Clean-room: spec → own implementation → fixture parity. No expression copying.
3. **Quarantine mirrors gitignored** (`vendor/quarantine/`, `vendor/ring1-refs/`), never linked, never imported by build, never committed.
4. **Strip upstream code/comments from fixtures.** Keep only I/O facts. Label `spec-derived` where hand-authored.
5. **Provenance INTERNAL-ONLY** (`.ai-sync/private/RE_METHODOLOGY.md` + `PRIVATE_REGISTRY.json`, gitignored): record upstream version/date, behavior observed, spec consulted, clean-room separation assurance. NEVER in README/public claims/release docs.
6. **Public claims:** native MIT implementation + published-standard conformance. Never derivation. Never false "never referenced X".
7. **License firewall green** (SPDX scan Ring 1); attribution preserved on vendored permissive deps; forbidden set never downloaded.
8. **Secrecy does NOT cure** GPL copying or false provenance — those stay forbidden regardless of privacy.

---

## PART E — Testing Ways Matrix (every sub-step picks its row)

| Test kind | When | Tool | Pass criterion |
|---|---|---|---|
| RED-first unit | every production edit | cargo test / pytest / node --test | failing test pasted BEFORE impl, green after |
| Property/invariant | geometry, IDs, locks | cargo test + proptest | i64 nm/i32 mdeg invariants; UUIDv7 nibble==7; lock fail-closed negative |
| Golden-fixture parity | G5 rewrites | pytest fixture-diff | matches upstream-behavior fixture (tolerance-labeled, not byte-identical) |
| Behavioral/browser | G6 UI | Playwright + browser-use MCP | DOM assertions + screenshots + console-clean; NOT source-string |
| Perf budget | P-track, U2 | criterion / rAF meter / CrossProbeBus timer | meets budget OR honest relabel (measure, never claim) |
| Negative/security | G3,G8 | wasm fuel/epoch/memory, egress probe, SPDX injected fixture | fail-closed; injected-AGPL exit 1; zero outbound |
| Gate-8 integrity | G3.5,G7.1 | test-gate8-release.py | rejects fabricated token/hash, whitespace token, contradiction; raise-not-assert |
| Hallmark sweep | G6 | sloplint.mjs --render --scope app --kept | Floor 0 FAIL; kept-wiring preserved; compare.html |
| Offline constraint | ALL | — | $0, zero credentials, 127.0.0.1/UDS only |
| Orchestrator re-run | every merge | fresh commands | crux claims independently reproduced (A.13) |