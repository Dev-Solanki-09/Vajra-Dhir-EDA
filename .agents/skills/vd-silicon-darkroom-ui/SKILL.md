---
name: vd-silicon-darkroom-ui
description: Silicon Darkroom visual design system, React 19.3.1, Dockview multi-monitor layout, WebGPU->WebGL2 fallback, MCP Apps (SEP-1865 ui://), and <16ms CrossProbeBus standards. Trigger on any apps/* or packages/ui-core or webgpu-cad-engine changes.
---
# Silicon Darkroom UI & 120 FPS CAD Frontend — Vajra-Dhīr EDA

## 1. Visual Craft & Anti-Slop Invariants
- All UI styling MUST consume `packages/ui-core/src/tokens.css` (`#0B0E14` canvas, `#10141C` workbench, `#151A24` panel, `#FBBF24` gold human-lock halo, calibrated colorblind-safe copper layers). Never invent ad-hoc hex colors or generic glowing neon gradients.
- All coordinate, voltage, current, impedance, delay, BOM price, and timing slack numbers MUST apply `.vd-metric` (`JetBrains Mono`, `font-variant-numeric: tabular-nums`).
- Never block canvas pan/zoom with full-screen modal dialogs except Gate 8 Human Release Signoff.

## 2. CPU-First Chromium Resilience
- Wrap every WebGPU pipeline behind an explicit adapter check that degrades transparently to WebGL2 + CPU WASM triangulation when `navigator.gpu` is unavailable.
- Wrap `@xterm/addon-webgl` inside `try/catch` + `onContextLoss(() => webgl.dispose())` so laptop sleep/wake falls back silently to DOM rendering.
- Run `ngspice-wasm`, `Surfer` WASM, `elkjs`, and `vd-cad-geom` WASM strictly inside dedicated Web Workers (never block the main UI thread; keep frame budget `< 8 ms`).

## 3. Strict MCP Apps CSP & Cross-Probing
- Every `ui://vajradhir/*` iframe MUST send strict CSP: `default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'none';`.
- Every selection/hover mutation MUST emit via `CrossProbeBus` (`BroadcastChannel`) so docked panes and multi-monitor `dockview-react` popout windows highlight identically in `< 16 ms`.
- Verify every UI change with Playwright headless Chromium (testing WebGL2 fallback) + `hallmark` `sloplint.mjs --render` on web/onboarding surfaces.
