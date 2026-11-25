# Vajra-Dhīr EDA — Silicon Darkroom Design System (`design.md`)

Status: **LOCKED (Hallmark v2.0.0 · modern-minimal · silicon-darkroom kept · app screen)**

## 1. Signature & Visual Direction
- **Signature Object:** Lock-aware cross-probed CAD canvas — schematic & PCB viewport with amber (`#FBBF24`) human-lock rings, agent-violet (`#8B5CF6`) proposal previews, and sub-16ms live cross-probing.
- **Genre:** `modern-minimal` developer workstation (`apps/workstation`, launched via `vd studio`).

## 2. Unified Token Block (`:root[data-theme="silicon-darkroom"]`)
| Token | Value | Role |
|---|---|---|
| `--vd-bg-canvas` | `#0B0E14` | Primary Obsidian canvas surface |
| `--vd-bg-workbench` | `#10141C` | Shell frame & backdrop |
| `--vd-bg-panel` | `#151A24` | Dock panels, inspectors, activity bar |
| `--vd-bg-elevated` | `#1C2331` | Command palette, menus, interactive controls |
| `--vd-border-subtle` | `#232B3B` | Hairline structural separation |
| `--vd-border-active` | `#3B82F6` | Active focus & primary selection accent |
| `--vd-text-primary` | `#E6EDF7` | Primary high-contrast body & heading text |
| `--vd-text-secondary` | `#94A3B8` | Metadata & secondary labels |
| `--vd-text-muted` | `#64748B` | Disabled/dim annotations |
| `--vd-human-lock` | `#FBBF24` | Human-owned fail-closed lock state |
| `--vd-agent-pulse` | `#8B5CF6` | AI proposal & semantic highlight (never purple-to-blue gradient) |
| `--vd-dlp-airgap` | `#06B6D4` | NDA airgap indicator |
| `--vd-layer-f-cu` | `#E05D44` | Unified Front Copper (`F.Cu`) across CSS, desktop theme, and CAD engine |
| `--vd-layer-b-cu` | `#3B82F6` | Back Copper (`B.Cu`) |
| `--vd-layer-in1-cu` | `#D0A020` | Inner Plane 1 (`In1.Cu`) |
| `--vd-layer-in2-cu` | `#10B981` | Inner Plane 2 (`In2.Cu`) |

## 3. Non-Waivable Hallmark Floor Invariants
1. All colours and fonts route through CSS tokens declared in `apps/workstation/src/tokens.css`.
2. Zero `transition: all`; never animate `width`, `height`, `top`, or `left` (composited `transform`/`opacity` only, wrapped with `prefers-reduced-motion: reduce`).
3. `overflow-x: clip` on `html` & `body`; instant `:focus-visible` outlines on every interactive control.
4. Labels use body face in sentence/lower case (`Thought stream`, `Explorer`, `Inspector`), untracked — zero tracked-caps eyebrows, zero emoji icons (vector SVG only).
5. Offline-first fonts (`Inter`, `JetBrains Mono`) with metric-compatible system fallbacks and `tabular-nums` for coordinates/telemetry.
6. Every frame counter and performance number in the status bar reflects measured `requestAnimationFrame` deltas — never hardcoded constants.
