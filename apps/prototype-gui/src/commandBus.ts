/**
 * apps/prototype-gui/src/commandBus.ts
 * Silicon Darkroom Client Command Bus.
 * Connects Menubar, Toolbars, Hotkeys, and Command Palette directly to the Unified Command Bus.
 */

export type ActorMode = "human" | "agent";

export type CommandCategory =
  | "File"
  | "Edit"
  | "Place"
  | "Route"
  | "Verify"
  | "Simulate"
  | "Library"
  | "Export"
  | "Workspace";

export interface EdaCommand<TIn = any, TOut = any> {
  id: string;
  category: CommandCategory;
  label: string;
  description?: string;
  shortcut?: string;
  mcpVerb: string;
  requiresAi: false; // ALWAYS false — every core EDA tool works 100% offline without AI!
  run: (input: TIn, actor: ActorMode) => Promise<TOut>;
}

export interface WorkspaceTabMeta {
  id: string;
  title: string;
  icon: string;
  description: string;
}

export const WORKSPACE_TABS: WorkspaceTabMeta[] = [
  {
    id: "schematic",
    title: "1. Schematic Capture",
    icon: "⚡",
    description: "Orthogonal net capture, hierarchical sheets, elkjs auto-beautifier, atopile .ato sync",
  },
  {
    id: "pcb_layout",
    title: "2. 2D PCB Layout (120FPS)",
    icon: "📐",
    description: "Interactive 45°/arc walkaround router, diff-pairs, length tuning, copper pour refill, gold locks",
  },
  {
    id: "mcad_3d",
    title: "3. 3D STEP & Gerbers",
    icon: "🧊",
    description: "Photorealistic 3D PBR raymarching, STEP enclosure clash test, RS-274X layer inspector",
  },
  {
    id: "sim_lab",
    title: "4. Simulation & Physics Lab",
    icon: "🔬",
    description: "ngspice-wasm SPICE transient/AC probes, Bode plots, 2.5D Laplace PDN DC IR-drop heatmap",
  },
  {
    id: "library_bom",
    title: "5. Library / jlcparts / PDF",
    icon: "📚",
    description: "DuckDB parametric search, LCSC Basic/Extended feeder-fee filter, local PDF datasheet viewer",
  },
  {
    id: "firmware_pinmux",
    title: "6. Firmware & Pinmux (Monaco)",
    icon: "💻",
    description: "Z3 SMT pinmux solver, live board_pins.h regeneration, Zephyr .dts & Embassy HAL sync",
  },
  {
    id: "mfg_diff",
    title: "7. Manufacturing / Panel / Diff",
    icon: "🏭",
    description: "KiKit panelizer wizard, visual Git ECO copper diff, assembly BOM, wire-harness editor",
  },
];

export const CLIENT_EDA_COMMANDS: EdaCommand[] = [
  {
    id: "verify.z3_pinmux",
    category: "Verify",
    label: "Solve MCU Pinmux Conflicts (Z3 SMT)",
    description: "Computes optimal MCU alternate-function pin mapping using Z3 BitVec solver",
    shortcut: "Ctrl+Shift+M",
    mcpVerb: "hw_verify",
    requiresAi: false,
    run: async () => {
      const res = await fetch("/stitch/z3/pinmux", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      return res.json();
    },
  },
  {
    id: "simulate.smps_bode",
    category: "Simulate",
    label: "SMPS Loop Stability & Bode Margins (SymPy + Pint + Control)",
    description: "Evaluates duty cycle, inductor ripple, and compensation network stability margins",
    mcpVerb: "hw_simulate",
    requiresAi: false,
    run: async () => {
      const res = await fetch("/stitch/physics/smps-bode", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      return res.json();
    },
  },
  {
    id: "verify.kicad_drc",
    category: "Verify",
    label: "Run KiCad 10 Headless DRC (kicad-cli)",
    description: "Executes DRC clearance, track width, via drill, and courtyard checks via KiCad 10 CLI oracle",
    shortcut: "F8",
    mcpVerb: "hw_verify",
    requiresAi: false,
    run: async () => {
      const res = await fetch("/stitch/kicad/drc", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      return res.json();
    },
  },
  {
    id: "mfg.panelize_kikit",
    category: "Export",
    label: "Panelize Board for Fabrication (KiKit MIT)",
    description: "Synthesizes 2x2 panel array with mouse-bites, edge rails, and fiducials",
    shortcut: "Ctrl+Shift+K",
    mcpVerb: "hw_export",
    requiresAi: false,
    run: async () => {
      const res = await fetch("/stitch/kikit/panelize", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      return res.json();
    },
  },
  {
    id: "pcb.route.interactive",
    category: "Route",
    label: "Interactive 45° Walkaround Route",
    description: "45° miter posture copper router with magnetic snapping and live clearance DRC",
    shortcut: "X",
    mcpVerb: "hw_route",
    requiresAi: false,
    run: async (input) => {
      const res = await fetch("/api/v1/route-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return res.json();
    },
  },
  {
    id: "pcb.via.drop",
    category: "Route",
    label: "Drop Layer-Flip Stitching Via",
    description: "Inserts a 0.3mm drill / 0.6mm diameter through-hole via and toggles active copper layer",
    shortcut: "V",
    mcpVerb: "hw_route",
    requiresAi: false,
    run: async () => {
      return { via_drill_nm: 300000, via_diameter_nm: 600000, start_layer: "F.Cu", end_layer: "B.Cu" };
    },
  },
  {
    id: "export.kicad_pcb",
    category: "Export",
    label: "Export KiCad 10 PCB Layout (.kicad_pcb)",
    description: "Exports exact i64 nm geometry as a KiCad 10 S-expression text file",
    shortcut: "Ctrl+E",
    mcpVerb: "hw_export",
    requiresAi: false,
    run: async () => {
      const res = await fetch("/api/v1/export/kicad-pcb");
      return res.text();
    },
  },
  {
    id: "export.firmware_pins",
    category: "Export",
    label: "Export Firmware C Header (board_pins.h)",
    description: "Exports pin alias macros synchronized with the current SQLite HW-IR revision",
    mcpVerb: "hw_export",
    requiresAi: false,
    run: async () => {
      const res = await fetch("/api/v1/export/firmware-pins");
      return res.text();
    },
  },
];
