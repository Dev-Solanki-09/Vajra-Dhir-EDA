/**
 * Unified Deterministic Command Bus for Vajra-Dhīr EDA.
 * Enforces the "Same-Hands" Law: Every GUI action == Every AI Worker action.
 * Core EDA commands work 100% offline without any AI (requiresAi: false).
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
  defaultOpen: boolean;
}

export const WORKSPACE_TABS: WorkspaceTabMeta[] = [
  {
    id: "schematic",
    title: "1. Schematic Capture",
    icon: "SchematicIcon",
    description: "Orthogonal net capture, hierarchical sheets, elkjs auto-beautifier, atopile .ato sync",
    defaultOpen: true,
  },
  {
    id: "pcb_layout",
    title: "2. 2D PCB Layout (120FPS)",
    icon: "PcbIcon",
    description: "Interactive 45°/arc walkaround router, diff-pairs, length tuning, copper pour refill, gold locks",
    defaultOpen: true,
  },
  {
    id: "mcad_3d",
    title: "3. 3D STEP & Gerbers",
    icon: "ThreeDIcon",
    description: "Photorealistic 3D PBR raymarching, STEP enclosure clash test, RS-274X layer inspector",
    defaultOpen: false,
  },
  {
    id: "sim_lab",
    title: "4. Simulation & Physics Lab",
    icon: "SimIcon",
    description: "ngspice-wasm SPICE transient/AC probes, Bode plots, 2.5D Laplace PDN DC IR-drop heatmap",
    defaultOpen: false,
  },
  {
    id: "library_bom",
    title: "5. Library / jlcparts / PDF",
    icon: "LibraryIcon",
    description: "DuckDB parametric search, LCSC Basic/Extended feeder-fee filter, local PDF datasheet viewer",
    defaultOpen: false,
  },
  {
    id: "firmware_pinmux",
    title: "6. Firmware & Pinmux (Monaco)",
    icon: "FirmwareIcon",
    description: "Z3 SMT pinmux solver, live board_pins.h regeneration, Zephyr .dts & Embassy HAL sync",
    defaultOpen: false,
  },
  {
    id: "mfg_diff",
    title: "7. Manufacturing / Panel / Diff",
    icon: "MfgIcon",
    description: "KiKit panelizer wizard, visual Git ECO copper diff, assembly BOM, wire-harness editor",
    defaultOpen: false,
  },
];

export class CommandRegistry {
  private commands = new Map<string, EdaCommand>();

  register(command: EdaCommand) {
    if (command.requiresAi !== false) {
      throw new Error(`Violation of Same-Hands Law: command ${command.id} must have requiresAi: false`);
    }
    this.commands.set(command.id, command);
  }

  get(id: string): EdaCommand | undefined {
    return this.commands.get(id);
  }

  list(): EdaCommand[] {
    return Array.from(this.commands.values());
  }

  listByCategory(category: CommandCategory): EdaCommand[] {
    return this.list().filter((c) => c.category === category);
  }

  async execute<TIn, TOut>(id: string, input: TIn, actor: ActorMode = "human"): Promise<TOut> {
    const cmd = this.commands.get(id);
    if (!cmd) {
      throw new Error(`Command '${id}' not registered in Command Bus`);
    }
    return cmd.run(input, actor) as Promise<TOut>;
  }
}

export * from "./commands";
