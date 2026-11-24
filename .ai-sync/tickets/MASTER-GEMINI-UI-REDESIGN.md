# VD-UI-001 · Silicon Darkroom Workstation — UI/UX & Layout Redesign (Hallmark-driven)

| Field | Value |
|---|---|
| Revision | 1.0 (2026-11-24) |
| Authority | Orchestrator. Executes as the detailed content of VD-MASTER-001 **PHASE G6**. |
| Owner | WORKER-GEMINI (sole worker), Antigravity, `D:\project-gemini`. |
| Method | **Hallmark** `redesign` verb, **full depth**, **app-screen scope**, **brand kept** (Silicon Darkroom). User named Hallmark explicitly → permitted on the existing design. |
| Vision | Blender + Adobe + VS Code + simulation tester lab + chatbot agent that does the work + interactive/manual designing like Flux.ai / Protoflow. Every feature easy to navigate and use. Professional, finished, unslopped. |
| Dependencies | G2 (cad truth), G3 (gate hardening), G5 (real engines: elkjs/ngspice-wasm/iBOM/STEP) MUST precede. U-track IS G6. |

> **Skills to load at U0:** `hallmark` (read `SKILL.md`, `references/redesign.md`, `references/flow.md` § App screens, `references/gates.md` §1–§5, `references/craft.md` §9, `references/interaction-and-states.md`), `vd-silicon-darkroom-ui`, `antislop`, `antislop-ui`, `antislop-human`. Hallmark scripts live at `C:\Users\D.Solanki\.agents\skills\hallmark\scripts\` (`theme.mjs`, `sloplint.mjs`, `capture.mjs`) — run via `node`.

---

## 0. Pre-flight findings (verified 2026-11-24, file:line)

**Shipped GUI = `apps/prototype-gui`** ("Silicon Darkroom Workbench", `index.html:6`), entry `src/main.tsx`→`src/App.tsx`, served **vite dev only** at `127.0.0.1:5173` (`package.json:11`), `/api`→daemon 41900 (`vite.config.ts:9-11`). Daemon is JSON-API-only (`packages/vd-daemon/src/daemon.py:19,475`) — no static GUI serving.

Defects that make the current GUI read as generated / vapor:
1. **Mock Dockview.** `components/DockviewWorkbench.tsx:17-151` is a hand-rolled split-pane; prototype-gui has **no dockview-react dependency**. Real Dockview lives only in `apps/desktop/src/components/SpatialWorkbench.tsx:3-7,97`. The "Dockview Multi-Pane Workstation" gate passes on source-text asserts against the mock.
2. **Three divergent palettes.** `apps/prototype-gui/src/tokens.css:1-23` (`:root[data-theme="silicon-darkroom"]`: canvas #0B0E14, panel #151A24, active #3B82F6, text #E6EDF7, human-lock #FBBF24, agent #8B5CF6, airgap #06B6D4) vs `apps/desktop/src/theme.ts:5-36` (#090A0F, cyan #00F0FF, magenta #FF0055) vs `packages/webgpu-cad-engine/src/engine.ts:19-27` (F.Cu #E05D44 ≠ tokens #E04F5F).
3. **Fonts never loaded.** Inter + JetBrains Mono declared (`tokens.css:8-9`) but no `@font-face`/webfont link → system fallback.
4. **Static AI dock.** "AI Worker Dock" inline aside `App.tsx:604-629`; "THOUGHT STREAM" `:622-627` is **static text, no chat input**. Modes OFF/COPILOT/AUTONOMOUS exist (`:34,314`).
5. **Stub engine.** `packages/webgpu-cad-engine/src/engine.ts:30-49` backend enum webgpu|webgl2|software_canvas, 112-line stub, no GPU pipeline. Actual PCB render = Canvas2D (`PcbCanvas.tsx:102,336`); schematic = SVG (`SchematicCanvas.tsx:179`), elkjs label-only (`:169-172`, stub `commandBus.ts:246`).
6. **Zero behavioral UI gates.** Every UI test is source-text/HTTP/math (`scripts/test-prototype-gui.py:30-74`, `test-dockview-and-brain.py:52-110`, etc.) — no DOM, no screenshots.
7. Plain CSS + pervasive inline styles; no Tailwind. **No `design.md`/`DESIGN.md` at root; no `.hallmark/` anywhere.**

**What STAYS (wiring — Hallmark redesign keeps content + wiring):** 18 `EdaCommand`s (`commandBus.ts:83-331`, `{id,category,label,shortcut,mcpVerb,requiresAi:false,run}`), enforcing registry (`packages/command-bus/src/index.ts:91-99`), command palette Ctrl+Shift+P (`App.tsx:91-94,643-680`), 7 workspace IDs (`WORKSPACE_TABS commandBus.ts:38-81`: schematic, pcb_layout, mcad_3d, sim_lab, library_bom, firmware_pinmux, mfg_diff), daemon API contracts, every `id`/`data-testid`/handler a test reads. Routes/destinations/component logic stay; system + composition change.

**Signature (the one object the tool is known by):** the **lock-aware cross-probed canvas** — PCB/schematic viewport with amber human-lock rings, agent-violet proposals, and live cross-probe to sim/BOM. Not a greeting above stat cards.

**Genre:** modern-minimal (developer tool). **Brand:** silicon-darkroom (kept, named tokens). Brand palette wins over genre defaults; genre governs composition discipline.

---

## U0 · Design system lock (Hallmark scaffold + Floor)

1. Run Hallmark pre-flight; record `.hallmark/preflight.json`. Baseline sweep:
   `node <hallmark>/scripts/sloplint.mjs apps/prototype-gui --genre modern-minimal --render --before --scope app --url http://127.0.0.1:5173` (dev server running; linter renders the live app, not the empty `index.html`). Look at screenshots before weighing findings; write the 4-line read.
2. Scaffold the kept brand at app scope:
   `node <hallmark>/scripts/theme.mjs scaffold silicon-darkroom --brand --redesign full --scope app` → writes `tokens.css` + `base.css` beside the project stylesheet, fills tokens from the project's own palette/faces (no `check`), prints the stamp skeleton + imports.
3. **Unify the three palettes** into ONE `:root[data-theme="silicon-darkroom"]` token block (Hallmark Floor 1: every colour/font through a token; no literal colour/font-family past the block). Migrate `apps/desktop/theme.ts` + `engine.ts` palette to read the shared tokens. Reconcile F.Cu to one value.
4. **Load the fonts** self-hosted (offline $0, no CDN): Inter + JetBrains Mono `@font-face` woff2 under `apps/prototype-gui/public/fonts/`, `font-display: swap`, fallback metrics. Two families max; mono only where mono is the material (code/coordinates/numerics).
5. **Type scale fixed** ratio 1.125–1.2, no fluid heads, no display face on labels/buttons/data. Body ≥16px. Labels sentence/lower case, untracked, body face a step smaller (Floor 9 — kill tracked-caps "THOUGHT STREAM" → "Thought stream").
6. **Colour restrained:** accent #3B82F6 marks primary action + current selection + state ONLY; second neutral carries sidebars/toolbars/panels. Semantic state colours: human-lock #FBBF24, agent #8B5CF6, airgap #06B6D4 — used as state, never decoration. **No purple-to-blue gradient** (agent violet is a semantic state, not a gradient wash).
7. **Density is the design:** controls 32–40px with 44px hit target; one container recipe; one radius per nesting level; tables before cards; tabular numerals for figures (no icon tiles, no unmeasured trend arrows — Floor 8/46a).
8. **Motion is state:** `--dur-micro`/`--dur-short`, `transform`+`opacity` only, never `transition: all`, never animate width/height/top/left (Floor 2). Every animation has `prefers-reduced-motion: reduce` fallback; content visible with scripting off (Floor 7).
9. **Every interactive element has `:focus-visible`, instant** (Floor 6). `overflow-x: clip` on html+body (Floor 4). Image grid tracks `minmax(0,1fr)`; display heads `overflow-wrap: break-word; min-width:0` (Floor 5). No emoji icons (lucide-react, MIT). No middle-dot meta strings / glued arrows / decorative status dots (Floor 10). No card-in-card (Floor 11).
10. **Stamp** line 1 of CSS: `/* Hallmark · v2.0.0 · genre: modern-minimal · brand: silicon-darkroom (kept) · shape: app screen · redesign: full · scope: app · built: the project */` + critique line + waivers within first 40 lines.
11. **Lock the system:** write `design.md` at repo root (Hallmark `design-md.md`) — the single source every workspace reads. Add `.hallmark/` + `.ai-sync/private/` to `.gitignore`.

**Acceptance U0:** one token block, fonts loaded, `design.md` locked, sloplint baseline recorded, Floor 0 FAIL on the scaffold.

---

## U1 · Shell & information architecture (the hybrid)

Recompose the shell inside the existing app; keep routes/IDs/logic. Navigation rule: **every feature reachable in ≤3 clicks or via the palette**; sidebar earned (>7 destinations ✓); standard patterns beat invented ones; modal is the last answer after inline editing + disclosure; **state lives in the URL** (workspace tab, panel layout, filters); destructive action undo/confirm.

- **VS Code layer:** left **activity bar** (7 workspace icons + agent + library + settings); **command palette** Ctrl+Shift+P (keep wiring, restyle); **breadcrumbs** (project › board › workspace); **status bar** (daemon health, lock state, airgap indicator, measured FPS); keyboard-first; settings editor.
- **Blender layer:** contextual **workspace switcher** (the 7 tabs, per-workspace saved layouts); top **tool modes** Select/Route/Place/Inspect (`toolMode App.tsx:41,106-116`); **N-panel** context-sensitive properties sidebar; **viewport overlays** toggles (layers, ratsnest, DRC markers, lock rings); axis gizmo; **region quad-split** via REAL dockview-react (replace the mock `DockviewWorkbench`).
- **Adobe layer:** **dockable floating panels** (dockview-react popout groups → multi-monitor); tabbed panel groups; right **inspector stack** (properties/layers/stackup/DRC); simulation **scrubber/timeline** in sim_lab; **library/asset browser** (LibraryBomCenter as a library panel with preview thumbnails).
- **Simulation tester lab layer:** VirtualLabWorkbench → **instrument rack**: scope (uPlot 60FPS/166k/25ms, X3 feed), Bode plotter, PDN IR-drop heatmap, instrument palette, run/stop/trigger, probe cross-link to canvas (CrossProbeBus <16ms, X2 feed). Four states on every instrument region.
- **Chatbot agent layer (REAL, replaces static text):** AI Worker Dock rebuilt — chat **input box**, mode switch OFF/COPILOT/AUTONOMOUS (keep `:34`), **streaming thought stream** from ACP/daemon (replace `App.tsx:622-627` static text), agent proposals render as **diff cards with Accept/Reject**. **Fail-closed:** agent never mutates `locked=1`; acceptance requires a human actor (`_tx_actor_ctx`); autonomous mode still human-gates locked writes. Agent emits `EdaCommand`s through the bus (Same-Hands `requiresAi` semantics). **NDA airgap indicator** (hw-dlp zero-egress); offline local model via ollama (critic L101-105 NDA_AIRGAPPED). Optional monaco/xterm/node-pty terminal dock (L79 override).
- **Flux.ai / Protoflow interactive canvas layer:** schematic+PCB **direct manipulation** — click-place, drag-route with 45°/snap (`cad-geom`), **inline parametric editing** (click component → floating mini-inspector), **AI autocomplete ghost suggestions** (copilot mode), **cross-probe highlight** schematic↔PCB↔sim↔BOM, **amber lock rings** on human-locked entities, real-time cursor presence (X2). kicanvas layer-visibility UX study (critic L117).

**Acceptance U1:** real dockview-react drag/dock/float/popout works; activity bar + palette + breadcrumbs + status bar present; agent dock sends→streams→proposes→accept/reject with fail-closed lock; every destination ≤3 clicks; URL carries state.

---

## U2 · Real engine surface (kill the stub, measure don't claim)

1. `webgpu-cad-engine` stub → **real wgpu WebGPU pipeline + WebGL2 fallback + software Canvas2D last resort** (critic L64: WebGPU+WebGL2 60 FPS). PCB render moves to engine-backed with Canvas2D fallback preserved.
2. Schematic SVG + **real elkjs auto-layout** (G6 dep, Option A) replacing label-only `SchematicCanvas.tsx:169-172`.
3. **120 FPS manual-edit path** via rstar/i_overlay/iTriangle/cavalier_contours (critic L32; G2 fixes feed). rstar 177ns bench (L57) — **bench-verify offline or relabel honestly**.
4. **Measured FPS meter** in status bar (real rAF delta, not a claimed number — anti-vapor). If 120/60 FPS unachievable on host, display the measured value and relabel docs; never print an unmeasured benchmark.

**Acceptance U2:** engine renders via WebGPU or WebGL2 (backend indicator truthful); elkjs layout real; FPS meter reads measured deltas; perf claims in docs match measurement.

---

## U3 · Per-workspace recomposition (full depth, most-visited first)

Recompose each screen inside the shell; keep routes/destinations/component logic; no hero stage (app scope). Order: **pcb_layout → schematic → sim_lab → library_bom → mfg_diff → mcad_3d → firmware_pinmux**. Each workspace: name its signature object, draw **four states** (loading skeleton in the shape of what's coming / empty with the one action that fills it / error with what broke + what to do / full), density + tables-before-cards, kept-wiring list. mfg_diff renders G5 REAL output (panelizer `.kicad_pcb`, pcb-diff SVGs, wire-harness SVG+BOM, iBOM). mcad_3d renders G5 REAL STEP import. Sweep each workspace before the next.

**Acceptance U3:** all 7 workspaces recomposed, four states each, real G5 output rendered, wiring kept (kept-check green).

---

## U4 · Behavioral UI gates (replace source-text asserts)

New offline, $0, zero-credential, 127.0.0.1-only browser gates (Playwright/puppeteer-core):
- palette opens + executes a command; workspace switch persists in URL; dock popout/float works.
- agent chat: send → stream → proposal → **accept (human actor)** / reject; **agent write to locked=1 refused** (fail-closed negative).
- lock ring renders on locked entity; cross-probe highlight schematic↔PCB↔sim↔BOM **<16ms measured**.
- FPS meter reads real rAF delta; four states render; `:focus-visible` present; `prefers-reduced-motion` honored; contrast passes (antislop-human checker).
- Hallmark sweep: `node <hallmark>/scripts/sloplint.mjs apps/prototype-gui --genre modern-minimal --render --scope app --kept --url http://127.0.0.1:5173` until **Floor 0 FAIL**; restore anything dropped or record it in the stamp; `.hallmark/compare.html` before/after.
- Retire the old source-text UI asserts via G3 classification (do NOT edit a test to make the redesign pass — keep `data-testid` hooks so behavioral gates target them).

**Acceptance U4:** behavioral gates green; sloplint Floor 0 FAIL; compare.html produced; finish review (fresh context) acted on.

---

## U5 · Accessibility & finish

WCAG AA contrast on the dark palette (verify #E6EDF7 on #0B0E14, accent on panel, amber/violet/cyan state text). Full keyboard nav; screen-reader labels; 44px targets; **no color-only state** (lock ring + icon + label); reduced-motion; font fallback metrics. `antislop-human` + `antislop-layoutmobile` (workstation is desktop-first; panels reflow, not mobile-first — record). Finish review in fresh context (`gates.md` §6): act on first word (recapture/rebuild/fix/ship).

**Acceptance U5:** contrast checker green; keyboard-only walkthrough completes; finish review resolved.

---

## U6 · Acceptance & handoff

- Browser-verified **screenshots per workspace** (`.hallmark/`, gitignored) + console-clean logs.
- `design.md` locked; sloplint clean; **kept-check**: all 18 commands + palette + 7 workspace IDs + daemon API wiring preserved.
- Behavioral UI gates green; full harness 64/64 + new UI gates counted; `pnpm install --frozen-lockfile` + typecheck green.
- Handoff `.ai-sync/handoffs/G-06-gemini.md`: Hallmark **Picks block** (Redesign full · Before/After Floor counts · Keeps · Files · Screen rows · Signature · Sweep outcome), `compare.html` path, material ask, kept-wiring list, measured FPS/perf numbers, zero vapor labels.
- **STOP → READY_FOR_REVIEW.** Orchestrator dual-context audit (fresh browser re-run + sloplint) before merge.

**WRITE_SCOPE:** `apps/prototype-gui/**`, `apps/desktop/**` (palette unify), `packages/ui-core/**`, `packages/webgpu-cad-engine/**`, `packages/crossprobe-bus/**`, `packages/schematic-beautifier/**`, `packages/command-bus/**` (additive only), `apps/prototype-gui/src/tokens.css` + new `base.css`, root `design.md`, new UI gate scripts, `package.json`/`pnpm-lock.yaml` (new deps only: dockview-react, lucide-react, uPlot, fonts), `.gitignore` (`.hallmark/`), `.ai-sync/handoffs/G-06-gemini.md`. **NO `daemon.py` edits** (T-01 merged/locked), **NO AGENTS.md**.

**VERIFY_CMD:** `pnpm install --frozen-lockfile` · `pnpm -r exec tsc --noEmit` · `node <hallmark>/scripts/sloplint.mjs apps/prototype-gui --genre modern-minimal --render --scope app --kept --url http://127.0.0.1:5173` · new browser gates · `node scripts/verify-all.mjs`.

**Global acceptance:** every GUI feature demonstrably works in a browser (screenshots + console-clean); real dockview, real agent chat, real engine surface; iBOM/elkjs/STEP real or honestly deferred; zero vapor labels; Hallmark Floor 0 FAIL; harness green; wiring kept.