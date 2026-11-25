# License Firewall Exceptions & Cross-Language Isolation Register

Status: **ACTIVE** · Last Verified: **2026-11-25**

Vajra-Dhīr EDA enforces a strict MIT / Apache-2.0 / BSD license boundary across Ring 1 (`packages/*`, `apps/*`). The following explicit engineering rulings and isolated exceptions apply and are enforced offline by `scripts/check-spdx-firewall.mjs` and `scripts/test-upstream-ledgers.py`:

## 1. Option A — Isolated Permissive/Weak-Copyleft Runtime Exceptions

| Component | Upstream License | Scope & Isolation Boundary | Why Allowed |
|---|---|---|---|
| **`elkjs`** | `EPL-2.0` | Consumed strictly as an **unmodified npm runtime package** in the frontend workspace (`apps/workstation` / `packages/schematic-beautifier`). Never modified or forked into Rust/C source. | `EPL-2.0` unmodified runtime library usage does not relicense surrounding MIT application code. |
| **`occt-import-js`** | `LGPL-2.1-with-OCCT-exception` | Shipped strictly as an **unmodified compiled WASM bundle executed exclusively inside an isolated browser Web Worker** (`mcad_3d` viewport), communicating only serialized triangle buffers and metadata (`postMessage`), never statically linked into Ring-1 Rust crates or `vd-daemon`. | Preserves LGPL-2.1 relinking/replacement separation for unmodified dynamically/worker-loaded WASM artifacts. |

## 2. Option B — Strict Copyleft Removals & Cross-Language Clean-Room Implementations

Per architectural ruling (**2026-11-25**), any capability inspired by published standards or behavior from `GPL`, `AGPL`, or `EUPL` ecosystems is **never** ported in the same programming language and **never** linked into Ring 1:

1. **`surfer` (`EUPL-1.2`, Rust) — REMOVED & REPLACED CROSS-LANGUAGE:**
   - Removed from all importer scripts, Ring-1 builds, and dependency graphs.
   - Replaced in v0.0.5 with a pure-MIT **TypeScript** (`apps/workstation` + `uPlot` + HTML5 Canvas) digital VCD/FST waveform track compliant with IEEE 1364 VCD/FST specs.
2. **`serde_kicad_sexpr` — DROPPED:**
   - Replaced with our own pure-MIT **Rust** S-expression parser & emitter in `packages/cad-transcoder` conforming to documented KiCad 10 S-expression file formats.
3. **`KiKit` (`MIT` wrapper over `GPL-3.0` KiCad `pcbnew` Python bindings) — RING-2 SUBPROCESS ONLY:**
   - `vd-daemon` MUST NEVER import `pcbnew` in-process. When invoked, `kikit panelize` runs strictly as an isolated external Ring-2 CLI subprocess; primary Ring-1 panelization is implemented natively in pure-MIT **Rust** (`packages/panelizer` / `vd-panelizer`).
4. **Pure-MIT Cross-Language Core Crates (Rust):**
   - `packages/panelizer` (`vd-panelizer`), `packages/wire-harness` (`vd-wire-harness`), `packages/pcb-diff` (`vd-pcb-diff`), `packages/cad-transcoder` (`vd-cad-transcoder` RS-274X + S-expr), and `packages/dfm-dfa-safety` are implemented natively in **Rust** against published engineering standards (IPC-7525B, IPC-7351B, IPC-2152, IPC-2221, RS-274X/X2, IEC 60757, KiCad format specification).
5. **Hard-Exclusion Set (Never Cloned / Never Linked):**
   - `PyMuPDF` (`AGPL`), `KiBot` (`AGPL`), `Konnect` (`AGPL`), `Part-DB-server` (`AGPL`), `pypsa-app` (`AGPL`), and `OpenModelica` (`OSMC-PL` / GPL tooling) are blocked by `FORBIDDEN_PATTERN` in `scripts/import-upstream-stack.sh` and denied in `vendor/MANIFEST.json`.
