---
name: vd-senior-eda-physics
description: Senior mixed-signal PCB, silicon IC, KiCad 10 3-channel bridge, symbolic Z3/SymPy/Pint verification, and EE Footgun domain expertise. Trigger on hardware compilers, KiCad bridge, atopile, Open-CUBO, Z3, SPICE, or layout/routing code.
---
# Senior Mixed-Signal EDA & Physics Engineering — Vajra-Dhīr EDA

## 1. KiCad 10.0.8 Technical Reality (Zero Hallucinated APIs)
- KiCad 10's NNG/Protobuf IPC API (`kicad-python`) requires a running KiCad GUI, supports PCB Editor ONLY, and does NOT support schematics, headless runs, or exports (until KiCad 11).
- Strictly maintain the 3-Channel Bridge:
  - **Ch-A:** Deterministic `.kicad_sch` S-expression parser/writer + atomic `.tmp -> fsync -> rename` + 5-second SHA-256 Echo Suppression Ring.
  - **Ch-B:** Optional `kicad-python` NNG IPC (`$TMPDIR/kicad/api.sock` on Linux/macOS, `\\.\pipe\kicad-api-*` on Windows) wrapped inside `begin_commit()`/`push_commit()`. Degrade gracefully to Ch-A/S-expr when GUI is closed.
  - **Ch-C:** Headless `kicad-cli` for `sch erc`, `pcb drc`, `pcb export` (Gerber X2, IPC-2581, STEP, BOM/CPL, Design Variants).
- Map `HW-IR` `variants` 1:1 to KiCad 10's native Design Variants.

## 2. Fail-Closed Electrical & Physical Signoff Rules
- NEVER compute physics equations in LLM text—always run unit-safe `Pint` + symbolic `SymPy` + `python-control` inside Python/Code Mode.
- Always check **non-linear component reality** from DuckDB KG before approving passives/magnetics:
  - MLCC effective capacitance under applied DC bias (`C_eff / C_nom >= 0.50`, rated voltage `>= 2x` working voltage).
  - Inductor peak current saturation (`I_sat >= 1.25 * (I_out_max + dI_L / 2)`).
  - MOSFET/IC thermal margin (`T_J <= T_J_max - 25 C`).
- Every router invocation (`KiCadRoutingTools`, `fastroute`) MUST:
  1. Synchronize `.kicad_pro` + `.kicad_dru` directly from `HW-IR.net_classes` before routing.
  2. Snapshot SHA-256 hashes of all `locked = 1` components, traces, vias, and zones before routing and REJECT the entire router output if a single locked byte changed.
- Every solver wrapper (`ngspice`, `Gmsh`, `openEMS`, `OpenROAD`, `Z3`) MUST execute its deterministic Recovery Ladder (and extract `Z3 unsat_core`) BEFORE returning a structured diagnostic to any LLM.

## 3. Datasheet Zero-Hallucination & Copyright Guard
- Vendor PDFs are fetched and cached strictly locally (`~/.vajradhir/datasheets/<sha256>.pdf`) — NEVER committed to Git.
- Never feed raw unstructured PDF prose into Solver or Auditor prompts (prompt-injection risk); pass ONLY type-validated numeric tables and 300–600 dpi cropped PNG regions with normalized `[x0, y0, x1, y1]` bboxes.
