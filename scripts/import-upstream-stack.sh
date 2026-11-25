#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Vajra-Dhīr EDA — Complete License-Isolated Upstream Tech Stack Importer
# Excludes ALL skill repos and strictly blocks AGPL / EUPL / Non-Commercial exclusions.
# Usage: ./scripts/import-upstream-stack.sh [--dry-run] [--ring1 | --ring2 | --ring3 | --ring4 | --mcp | --all]
# ==============================================================================

DRY_RUN=0
MODE="--ring1"

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --ring1|--ring2|--ring3|--ring4|--mcp|--all) MODE="$arg" ;;
    *) echo "Usage: $0 [--dry-run] [--ring1 | --ring2 | --ring3 | --ring4 | --mcp | --all]"; exit 1 ;;
  esac
done

# Ensure gitignored mirror roots exist BEFORE any cloning (skip mkdir during --dry-run)
if [ "$DRY_RUN" -eq 0 ]; then
  mkdir -p vendor/ring1-refs vendor/quarantine workers/sources plugins/sources evalops/sources tools/local-mcps
fi

# Forbidden AGPL / Non-Commercial / EUPL deny-list (never clone into Ring 1 or mirrors)
FORBIDDEN_PATTERN="(PyMuPDF|KiBot|Konnect|Part-DB-server|pypsa-app|OpenModelica|surfer-project/surfer|serde_kicad_sexpr)"

clone_shallow() {
  local dest="$1"
  local url="$2"
  local license_class="${3:-unknown}"
  local name
  name="${url##*/}"
  name="${name%.git}"

  if [[ "$url" =~ $FORBIDDEN_PATTERN ]]; then
    echo "[DENY] Blocked forbidden/excluded repo: $url" >&2
    exit 1
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    echo "[DRY-RUN] [$license_class] $url -> $dest/$name"
    return 0
  fi

  mkdir -p "$dest"
  if [ -d "$dest/$name/.git" ]; then
    echo "[SKIP] $dest/$name already imported"
  else
    echo "[IMPORT] [$license_class] $url -> $dest/$name"
    git clone --depth 1 --filter=blob:none "$url" "$dest/$name" || echo "[WARN] Failed to clone $url (check network/auth)"
  fi
}

import_ring1() {
  echo "=== RING 1: PURE PERMISSIVE CORE (MIT / Apache-2.0 / BSD / Documented Exceptions) ==="
  local DIR="vendor/ring1-refs"
  local REPOS=(
    # UI, IDE & 2D/3D Rendering
    "https://github.com/microsoft/vscode.git"
    "https://github.com/modelcontextprotocol/ext-apps.git"
    "https://github.com/mathuo/dockview.git"
    "https://github.com/xyflow/xyflow.git"
    "https://github.com/xtermjs/xterm.js.git"
    "https://github.com/microsoft/node-pty.git"
    "https://github.com/microsoft/monaco-editor.git"
    "https://github.com/pmndrs/zustand.git"
    "https://github.com/gfx-rs/wgpu.git"
    "https://github.com/mrdoob/three.js.git"
    "https://github.com/kovacsv/Online3DViewer.git"
    "https://github.com/theacodes/kicanvas.git"
    "https://github.com/tracespace/tracespace.git"
    "https://github.com/leeoniya/uPlot.git"
    "https://github.com/nytamin/spacemouse.git"
    "https://github.com/kieler/elkjs.git"
    "https://github.com/typst/typst.git"
    "https://gitlab.com/dnschneid/kischvidimer.git"
    # Pure-MIT CAD Geometry, Sandbox, Protocols & Security
    "https://github.com/georust/rstar.git"
    "https://github.com/iShape-Rust/iOverlay.git"
    "https://github.com/iShape-Rust/iTriangle.git"
    "https://github.com/jbuckmccready/cavalier_contours.git"
    "https://github.com/elalish/manifold.git"
    "https://github.com/bytecodealliance/wasmtime.git"
    "https://github.com/duckdb/duckdb.git"
    "https://github.com/agentclientprotocol/agent-client-protocol.git"
    "https://github.com/open-telemetry/opentelemetry-rust.git"
    "https://github.com/gitleaks/gitleaks.git"
    "https://github.com/sigstore/cosign.git"
    "https://github.com/CycloneDX/cyclonedx-python.git"
    # Harnesses & CLI Token Compression (Non-Skill)
    "https://github.com/anomalyco/opencode.git"
    "https://github.com/block/goose.git"
    "https://github.com/openai/codex.git"
    "https://github.com/google-gemini/gemini-cli.git"
    "https://github.com/rtk-ai/rtk.git"
    "https://github.com/ollama/ollama.git"
    # Neuro-Symbolic Brain, PCB Compilers, Parsers & Routers
    "https://github.com/atopile/atopile.git"
    "https://github.com/tscircuit/tscircuit.git"
    "https://github.com/meraworks/lamina.git"
    "https://github.com/kidandcat/fragua.git"
    "https://github.com/Z3Prover/z3.git"
    "https://github.com/sympy/sympy.git"
    "https://github.com/hgrecco/pint.git"
    "https://github.com/python-control/python-control.git"
    "https://github.com/pypdfium2-team/pypdfium2.git"
    "https://github.com/jsvine/pdfplumber.git"
    "https://github.com/turbyho/datasheet-lens.git"
    "https://github.com/turbyho/kicad-workbench.git"
    "https://github.com/yaqwsx/jlcparts.git"
    "https://github.com/uPesy/easyeda2kicad.py.git"
    "https://github.com/TousstNicolas/JLC2KiCad_lib.git"
    "https://github.com/adom-inc/kicad_lib.git"
    "https://github.com/Atlantix-EDA/KiParse.git"
    "https://github.com/2AMLogic/kicad-tools.git"
    "https://github.com/drandyhaas/KiCadRoutingTools.git"
    "https://github.com/parisxmas/fastroute.git"
    "https://github.com/mikwielgus/topola.git"
    "https://github.com/cisco-open/2581check.git"
    "https://github.com/openscopeproject/InteractiveHtmlBom.git"
    "https://github.com/yaqwsx/PcbDraw.git"
    "https://github.com/wokwi/ngspice-wasm.git"
    "https://bitbucket.org/jpcgt/flatcam.git"
    "https://gitlab.com/kicad/code/kicad-python.git"
    # Core Polyglot LSP & Tooling
    "https://github.com/rust-lang/rust-analyzer.git"
    "https://github.com/microsoft/pyright.git"
    "https://github.com/astral-sh/uv.git"
    "https://github.com/astral-sh/ruff.git"
  )
  for r in "${REPOS[@]}"; do clone_shallow "$DIR" "$r" "ring1-permissive"; done
  # LGPL-2.1-with-OCCT-exception kept separate from pure-MIT Ring 1 (isolated runtime Web Worker)
  clone_shallow "vendor/quarantine" "https://github.com/kovacsv/occt-import-js.git" "lgpl-2.1-occt-worker-exception"
}

import_ring2() {
  echo "=== RING 2: QUARANTINED STUDY / OCI WORKER PACKS (NEVER LINKED INTO RING 1) ==="

  local QUARANTINE_STUDY=(
    "https://github.com/KiCad/kicad-source-mirror.git"
    "https://gitlab.com/kicad/libraries/kicad-footprint-generator.git"
    "https://gitlab.com/kicad/libraries/kicad-symbols.git"
    "https://gitlab.com/kicad/libraries/kicad-footprints.git"
    "https://github.com/yaqwsx/KiKit.git"
    "https://github.com/wireviz/WireViz.git"
    "https://github.com/leoheck/kiri.git"
    "https://github.com/Gasman2014/KiCad-Diff.git"
    "https://github.com/horizon-eda/horizon.git"
    "https://github.com/thesourcerer8/altium2kicad.git"
  )
  for r in "${QUARANTINE_STUDY[@]}"; do clone_shallow "vendor/quarantine" "$r" "ring2-quarantine"; done

  local PACK_2A=(
    "https://github.com/freerouting/freerouting.git"
    "https://github.com/bbenchoff/OrthoRoute.git"
    "https://github.com/atx/padne.git"
    "https://github.com/kbralten/KiPIDA.git"
    "https://github.com/coldlogix/fasthenry.git"
    "https://github.com/ediloren/FastHenry2.git"
    "https://github.com/antmicro/gerber2ems.git"
    "https://github.com/thliebig/openEMS-Project.git"
    "https://github.com/awslabs/palace.git"
    "https://github.com/tmolteno/python-necpp.git"
    "https://github.com/scikit-rf/scikit-rf.git"
    "https://github.com/capn-freako/PyBERT.git"
    "https://github.com/kamratia1/pybis2spice.git"
    "https://github.com/OpenMagnetics/PyOpenMagnetics.git"
    "https://github.com/OpenMagnetics/MAS.git"
    "https://github.com/pybamm-team/PyBaMM.git"
    "https://github.com/pybamm-team/liionpack.git"
    "https://github.com/CadQuery/cadquery.git"
    "https://gitlab.onelab.info/gmsh/gmsh.git"
    "https://github.com/ElmerCSC/elmerfem.git"
    "https://github.com/Dhondtguido/CalculiX.git"
  )
  for r in "${PACK_2A[@]}"; do clone_shallow "workers/sources/pack-2a-pcb-physics" "$r" "ring2-oci-2a"; done

  local PACK_2B=(
    "https://github.com/renode/renode.git"
    "https://github.com/vibeic/ngspice.git"
    "https://github.com/Xyce/Xyce.git"
    "https://github.com/Xyce/XDM.git"
    "https://github.com/nunobrum/spicelib.git"
    "https://github.com/ra3xdh/qucs_s.git"
    "https://github.com/pfalstad/circuitjs1.git"
    "https://github.com/chipmuenk/pyfda.git"
    "https://github.com/fastmachinelearning/hls4ml.git"
    "https://github.com/probe-rs/probe-rs.git"
    "https://github.com/pyvisa/pyvisa.git"
    "https://github.com/sigrokproject/libsigrok.git"
    "https://github.com/ngscopeclient/scopehal-apps.git"
    "https://github.com/openpnp/openpnp.git"
    "https://github.com/openpnp/openpnp-capture.git"
    "https://github.com/google/openhtf.git"
  )
  for r in "${PACK_2B[@]}"; do clone_shallow "workers/sources/pack-2b-virtual-hil" "$r" "ring2-oci-2b"; done

  local PACK_2C=(
    "https://github.com/iic-jku/IIC-OSIC-TOOLS.git"
    "https://github.com/librelane/librelane.git"
    "https://github.com/The-OpenROAD-Project/OpenROAD-MCP.git"
    "https://github.com/The-OpenROAD-Project/OpenROAD-flow-scripts.git"
    "https://github.com/The-OpenROAD-Project/OpenSTA.git"
    "https://github.com/The-OpenROAD-Project/asap7.git"
    "https://github.com/verilator/verilator.git"
    "https://github.com/steveicarus/iverilog.git"
    "https://github.com/cocotb/cocotb.git"
    "https://github.com/pyuvm/pyuvm.git"
    "https://github.com/fvutils/pyvsc.git"
    "https://github.com/YosysHQ/yosys.git"
    "https://github.com/YosysHQ/sby.git"
    "https://github.com/YosysHQ/nextpnr.git"
    "https://github.com/YosysHQ/eqy.git"
    "https://github.com/YosysHQ/mcy.git"
    "https://github.com/berkeley-abc/abc.git"
    "https://github.com/chipsalliance/Surelog.git"
    "https://github.com/MikePopoloski/slang.git"
    "https://github.com/chipsalliance/verible.git"
    "https://github.com/enjoy-digital/litex.git"
    "https://github.com/amaranth-lang/amaranth.git"
    "https://github.com/StefanSchippers/xschem.git"
    "https://github.com/RTimothyEdwards/magic.git"
    "https://github.com/RTimothyEdwards/netgen.git"
    "https://github.com/KLayout/klayout.git"
    "https://github.com/iic-jku/klayout-pex.git"
    "https://github.com/ediloren/FasterCap.git"
    "https://github.com/ALIGN-analoglayout/ALIGN-public.git"
    "https://github.com/idea-fasoc/OpenFASoC.git"
    "https://github.com/fossi-foundation/cace.git"
    "https://github.com/stineje/CharLib.git"
    "https://github.com/gdsfactory/gdsfactory.git"
    "https://github.com/devsim/devsim.git"
    "https://github.com/OpenVAF-Reloaded/OpenVAF.git"
    "https://github.com/gem5/gem5.git"
    "https://github.com/HewlettPackard/mcpat.git"
    "https://github.com/uvahotspot/HotSpot.git"
    "https://github.com/ucb-bar/chipyard.git"
    "https://github.com/llvm/circt.git"
    "https://github.com/google/xls.git"
    "https://github.com/ferrandi/PandA-bambu.git"
    "https://github.com/VLSIDA/OpenRAM.git"
    "https://github.com/AUCOHL/DFFRAM.git"
    "https://github.com/FPGA-Research/FABulous.git"
    "https://github.com/AUCOHL/Fault.git"
    "https://github.com/ChairImpSec/PROLEAD.git"
  )
  for r in "${PACK_2C[@]}"; do clone_shallow "workers/sources/pack-2c-silicon-vlsi" "$r" "ring2-oci-2c"; done

  local PACK_2D=(
    "https://github.com/e2nIEE/pandapower.git"
    "https://github.com/PyPSA/PyPSA.git"
    "https://github.com/Eomys/pyleecan.git"
    "https://github.com/pvlib/pvlib-python.git"
    "https://github.com/qelectrotech/qelectrotech-source-mirror.git"
    "https://github.com/autonomy-logic/openplc-runtime.git"
    "https://github.com/autonomy-logic/openplc-editor.git"
  )
  for r in "${PACK_2D[@]}"; do clone_shallow "workers/sources/pack-2d-power-machines" "$r" "ring2-oci-2d"; done

  local PACK_2E=(
    "https://github.com/NVlabs/sionna.git"
    "https://github.com/gnuradio/gnuradio.git"
    "https://github.com/pothosware/SoapySDR.git"
    "https://github.com/NanoComp/meep.git"
    "https://github.com/grame-cncm/faust.git"
    "https://github.com/newaetech/chipwhisperer.git"
  )
  for r in "${PACK_2E[@]}"; do clone_shallow "workers/sources/pack-2e-comms-photonics" "$r" "ring2-oci-2e"; done
}

import_ring3_and_4() {
  echo "=== RING 3: ENTERPRISE & TEAM PLUGINS (MIT/Apache-2.0 ONLY; reuse-tool CI-CLI-only) ==="
  local RING3=(
    "https://github.com/yjs/yjs.git"
    "https://github.com/y-crdt/y-crdt.git"
    "https://github.com/temporalio/temporal.git"
    "https://github.com/nats-io/nats-server.git"
    "https://github.com/inventree/InvenTree.git"
    "https://github.com/strictdoc-project/strictdoc.git"
    "https://github.com/google/gvisor.git"
    "https://github.com/vllm-project/vllm.git"
  )
  for r in "${RING3[@]}"; do clone_shallow "plugins/sources" "$r" "ring3-plugin"; done

  echo "=== RING 4: HARDWARE EVALOPS BENCHMARKS ==="
  local RING4=(
    "https://github.com/digailab/PCB-Bench.git"
    "https://github.com/LGAI-Research/PCBWorld.git"
    "https://github.com/Koppar-AI/autorouter-bench.git"
  )
  for r in "${RING4[@]}"; do clone_shallow "evalops/sources" "$r" "ring4-evalops"; done
}

import_local_mcps() {
  echo "=== FREE LOCAL DEV MCP SERVERS (NO SKILL REPOS) ==="
  local MCPS=(
    "https://github.com/oraios/serena.git"
    "https://github.com/upstash/context7.git"
    "https://github.com/modelcontextprotocol/servers.git"
    "https://github.com/ast-grep/ast-grep-mcp.git"
    "https://github.com/microsoft/playwright-mcp.git"
    "https://github.com/ChromeDevTools/chrome-devtools-mcp.git"
    "https://github.com/semgrep/mcp.git"
    "https://github.com/mixelpixx/KiCAD-MCP-Server.git"
  )
  for r in "${MCPS[@]}"; do clone_shallow "tools/local-mcps" "$r" "local-mcp"; done
}

case "$MODE" in
  --ring1) import_ring1 ;;
  --ring2) import_ring2 ;;
  --ring3|--ring4) import_ring3_and_4 ;;
  --mcp) import_local_mcps ;;
  --all) import_ring1; import_ring2; import_ring3_and_4; import_local_mcps ;;
esac

echo "DONE: Selected Vajra-Dhīr upstream stack processed cleanly with license isolation."
