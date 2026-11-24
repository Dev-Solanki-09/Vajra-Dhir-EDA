# Incomplete Work & File Cleanup Manifest (orchestrator, 2026-11-24)

Companion to VD-EXEC-001. Documents EVERY unfinished task and stale file so nothing is lost. Verified by read-only inventory of `D:\Vajra-Dhir-EDA` (main) + `D:\project-deepseek` (DS).

## 1. Unfinished worker tickets (no handoff = incomplete)
| Ticket | State | Folded into | Genuine remaining work |
|---|---|---|---|
| T-02-gemini | REJECTED | → T-02b | superseded |
| T-02b-gemini | REJECTED (F-21) | → T-02c / G0 | pin Rust 1.100.0 + truthful handoff §4 (all else passed) |
| T-02c-gemini | READY | G0 | the narrow pin fix |
| T-03-deepseek | RETIRED, WIP ab2ec71 | G1 | **F-06 only** (merge-driver registration); F-05/F-07 adopt-tests-only |
| T-04-deepseek | QUEUED | G2 | F-08/F-09/F-20 + cavalier_contours |
| T-05 (no file) | referenced in progress.md | G3 | gate hardening — ledger G3 sub-steps are the spec |
| T-06 (no file) | referenced in progress.md | G7 | claims truth / F-19 — ledger G7 sub-steps |
| T-08 (no file) | referenced in progress.md | G1.5 | TS 7.0.2 / react floors |
| T-09/T-11/T-12/T-14/T-15/T-16 | folded | G5/G4/G8/G6 | per ledger |

## 2. DeepSeek T-03 WIP (D:\project-deepseek @ ab2ec71) — adopt into G1
4 files (620 insertions): `packages/hw-ir/tests/test_patch_op_parity.py` (TEST), `packages/hw-merge/register_merge_driver.py` (**new production tooling**), `packages/hw-merge/tests/test_merge_driver_registration.py` (TEST), `packages/symbolic-verifier/tests/test_footgun_contract.py` (TEST).
**Inventory corrections to findings (verified at HEAD):**
- **F-05 ALREADY FIXED:** `UPSERT_ENTITY` in `packages/hw-ir/ts/types.ts:121` + `src/model.rs:185` + `model_v001.rs`; `import` actor in TS `types.ts:14`, Rust `model.rs:14`/`model_v001.rs:13`, all SQL CHECK domains (`schema/001_init.sql`×9, `001_v001_init.sql`×5). Parity test passes vs main. → adopt regression test only.
- **F-07 PHANTOM:** shipped `packages/symbolic-verifier/src/footguns.rs:186-193` FG-05 = `check_split_plane_crossing(bool)`, NO numeric limit. 900–11000 / [1000,10000] exists nowhere (prompt-2.txt spec phantom). FG-04 decoupling consistent (2_000_000 nm / "2.00 mm"). → adopt contract test + document phantom.
- **F-06 GENUINE:** `.gitattributes:4` already `merge=hwir` (correct). Crate `packages/hw-merge/Cargo.toml` package name `vd-merge` (:2), `[[bin]] name="hw-merge"` (:9). NO registration script + NO `merge.hwir.driver` git-config in main. → port `register_merge_driver.py`, run it, adopt conflict test.

## 3. Vapor / stub inventory (anti-vapor law targets)
| Location | Defect | Fix phase |
|---|---|---|
| `packages/webgpu-cad-engine/src/engine.ts` (112 ln) | stub: backend enum + nm→px math, no GPU device/pipeline/draw | G6/U2 |
| `apps/prototype-gui/src/components/DockviewWorkbench.tsx:17-151` | hand-rolled mock; no dockview-react dep | G6/U1 |
| `apps/prototype-gui/src/App.tsx:623-626` | static thought stream, no live agent feed/chat input | G6/U1 |
| `apps/prototype-gui/src/components/SchematicCanvas.tsx:169,172,126-128` | elkjs label-only button `setBeautified(true)`; hardcoded symbols/wires; no elkjs import | G6/U2 |
| `packages/vd-daemon/src/daemon.py:1339` | iTriangle vapor: canned `/copper/refill` JSON, `mesh_triangles_count:348` hardcoded | G5.6 |
| `packages/cli/src/main.rs:200` | "3D STEP" print-only, no parser | G5.7 |
| `packages/cli/src/main.rs:431-439` | **`vd doctor` ALL-hardcoded [PASS]** (fake preflight; Node v24.x vs floor) | G3.2 |
| `packages/cli/src/main.rs:238-241` | canned C2P2B output | G3.2 |
| `apps/desktop/src/components/WebGpuCanvas.tsx:25` | "Mock layout entities" | G6/U2 |
| `apps/prototype-gui/src/commandBus.ts:252` | iTriangle label | G5.6 |
| KiKit | declared, never invoked | G5.5 |
| deferred (task_plan:198) | iTriangle, STEP AP242, kiri, WireViz, elkjs, zstd CAS/WAL | G5/G6 |

## 4. Cleanup manifest (actions)
Classification: SUPERSEDED-STALE / SUPERSEDED-DRAFT / EVIDENCE-KEEP / ARCHIVE-REFERENCE.

### 4a. Tracked duplicates — `git rm` (git-recoverable)
- `docs/VD-SAD-001-ARCHITECTURE.md` — byte-identical to `docs/VD-SAD-001.md` (diff exit 0). Remove dup; keep canonical `VD-SAD-001.md` (critic L37 reference).
- `docs/superpowers/plans/2026-11-24-milestone1-spine-remediation.md` — TRACKED+gitignored anomaly (committed before ignore), byte-identical to `-1.md`, superseded by MASTER-GEMINI-ENDGAME. Remove.

### 4b. Gitignored stale seeds — MOVE to `.ai-sync/private/archive/` (reversible, hidden; NOT hard-deleted)
User archive, not orchestrator-created → moved aside rather than destroyed. Removed from working surface; hard-delete available on user confirmation.
- `prompt-and-skills/`: prompt-1/2/3/4/5.txt (prompt-2 = banned wasmtime30/React19.0 hazard F-11), project-overview-1/2/3/4.txt ("nothing built" obsolete), 1-9.txt, progress_log.md, checkpoint_handoff.md ("64/64 certified" false).
- `docs/superpowers/plans/`: -1/-2/-3/-4.md, action-plan.md (untracked gitignored drafts; vision absorbed into VD-UI-001).
- **KEEP in place:** `prompt-and-skills/techstack.md` + `techstack-critic.md` (program reference, read by import script + ledger), `prompt-and-skills/vd-github-skill/` (archive reference).

### 4c. EVIDENCE-KEEP (do NOT delete)
- `docs/REVERSE_ENGINEERED_ENGINES.md` — gitignored, internal secret provenance (privacy policy). Keep, never commit.
- `docs/CHECKPOINT_PROGRESS.md` — tracked, stale "37/37 / 3 Physical Boards Certified" → **G7.5 reconciles**, not deleted (reconciliation target).
- `docs/TECHSTACK.md`, `CLAIMS_REGISTER.md`, `THREAT_MODEL.md`, `ADDENDUM_01`, `AGENT_KNOWLEDGE_UPDATE`, `progress.md`, `task_plan.md`, `findings.md`, README/CHANGELOG/AGENTS/SECURITY — current evidence.
- `stash@{0}` (F-18 quarantine) — superseded v0.0.5 work, daemon.py conflicts T-01. KEEP; user ruling drop-or-mine pending.

### 4d. Orchestrator scratch
- `.qoder/worktrees/agent-general-purpose-054ca616`, `-8b4838ce` — gitignored completed subagent worktrees. Removed if unregistered/stale (orchestrator-owned scratch).

## 5. Ledger gaps closed
T-05/T-06/T-08 had no ticket files; their work is now fully specified as VD-EXEC-001 sub-steps G3/G7/G1.5. No unfinished item is undocumented.