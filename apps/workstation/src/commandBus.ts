export type ActorMode = 'human' | 'agent';

export type CommandCategory =
  | 'File'
  | 'Edit'
  | 'Place'
  | 'Route'
  | 'Verify'
  | 'Simulate'
  | 'Library'
  | 'Export'
  | 'Workspace';

export interface EdaCommand<TIn = unknown, TOut = unknown> {
  id: string;
  category: CommandCategory;
  label: string;
  description?: string;
  shortcut?: string;
  mcpVerb: string;
  requiresAi: false;
  run: (input: TIn, actor: ActorMode) => Promise<TOut>;
}

export type WorkspaceId =
  | 'schematic'
  | 'pcb_layout'
  | 'mcad_3d'
  | 'sim_lab'
  | 'library_bom'
  | 'firmware_pinmux'
  | 'mfg_diff';

export interface WorkspaceTabMeta {
  id: WorkspaceId;
  title: string;
  description: string;
}

export const WORKSPACE_TABS: WorkspaceTabMeta[] = [
  {
    id: 'schematic',
    title: 'Schematic capture',
    description: 'Orthogonal net capture, hierarchical sheets, auto-layout, atopile .ato sync',
  },
  {
    id: 'pcb_layout',
    title: 'PCB layout',
    description: 'Interactive 45-degree router, diff-pairs, copper pour refill, amber human locks',
  },
  {
    id: 'mcad_3d',
    title: '3D STEP & Gerbers',
    description: 'Isolated OCCT Web Worker STEP viewer and RS-274X stackup inspection',
  },
  {
    id: 'sim_lab',
    title: 'Simulation & physics lab',
    description: 'Transient/AC probes, SMPS Bode plots, and PDN DC IR-drop heatmap',
  },
  {
    id: 'library_bom',
    title: 'Library & BOM',
    description: 'DuckDB parametric component search, Basic/Extended fee filter, datasheet citations',
  },
  {
    id: 'firmware_pinmux',
    title: 'Firmware & pinmux',
    description: 'Z3 SMT pinmux solver, board_pins.h generation, and HAL synchronization',
  },
  {
    id: 'mfg_diff',
    title: 'Manufacturing & diff',
    description: '2x2 panelizer, visual Git ECO copper diff, assembly BOM, wire harness',
  },
];

async function postJson(path: string, body: unknown = {}) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export const CLIENT_EDA_COMMANDS: EdaCommand[] = [
  { id: 'file.new_template', category: 'File', label: 'New project from template', shortcut: 'Ctrl+Alt+N', mcpVerb: 'hw_project', requiresAi: false, run: async (tpl) => ({ template: tpl }) },
  { id: 'edit.undo', category: 'Edit', label: 'Undo last hardware patch', shortcut: 'Ctrl+Z', mcpVerb: 'hw_patch', requiresAi: false, run: async () => postJson('/api/v1/undo') },
  { id: 'edit.redo', category: 'Edit', label: 'Redo undone hardware patch', shortcut: 'Ctrl+Shift+Z', mcpVerb: 'hw_patch', requiresAi: false, run: async () => postJson('/api/v1/redo') },
  { id: 'edit.lock_toggle', category: 'Edit', label: 'Toggle human lock on selection', shortcut: 'L', mcpVerb: 'hw_lock', requiresAi: false, run: async (p) => postJson('/api/v1/patch', p) },
  { id: 'place.via_drop', category: 'Place', label: 'Drop stitching via at cursor', shortcut: 'V', mcpVerb: 'hw_patch', requiresAi: false, run: async (p) => postJson('/api/v1/patch', p) },
  { id: 'place.snap_probe', category: 'Place', label: 'Snap coordinate to nearest pad', shortcut: 'S', mcpVerb: 'hw_query', requiresAi: false, run: async (p) => postJson('/api/v1/snap', p) },
  { id: 'route.posture_45', category: 'Route', label: 'Solve 45-degree walkaround posture', shortcut: 'X', mcpVerb: 'hw_route', requiresAi: false, run: async (p) => postJson('/api/v1/route-preview', p) },
  { id: 'route.copper_refill', category: 'Route', label: 'Refill copper zones (i64 integer)', shortcut: 'B', mcpVerb: 'hw_route', requiresAi: false, run: async (p) => postJson('/api/v1/copper/refill', p) },
  { id: 'verify.z3_pinmux', category: 'Verify', label: 'Solve MCU pinmux conflicts (Z3)', shortcut: 'Ctrl+Shift+M', mcpVerb: 'hw_verify', requiresAi: false, run: async () => postJson('/stitch/z3/pinmux') },
  { id: 'verify.drc_full', category: 'Verify', label: 'Run full offline DRC & footguns', shortcut: 'F8', mcpVerb: 'hw_drc', requiresAi: false, run: async () => postJson('/api/v1/verify') },
  { id: 'verify.kicad_drc', category: 'Verify', label: 'Run KiCad 10 parity DRC', shortcut: 'Shift+F8', mcpVerb: 'hw_drc', requiresAi: false, run: async () => postJson('/stitch/kicad/drc') },
  { id: 'simulate.pdn_ir', category: 'Simulate', label: 'Solve 2.5D PDN DC IR-drop', shortcut: 'F9', mcpVerb: 'hw_sim', requiresAi: false, run: async () => postJson('/api/v1/pdn/solve', { net: '+3V3_OUT', current_a: 3.0 }) },
  { id: 'simulate.smps_bode', category: 'Simulate', label: 'Compute SMPS Bode stability margin', shortcut: 'Shift+F9', mcpVerb: 'hw_sim', requiresAi: false, run: async () => postJson('/stitch/physics/smps-bode') },
  { id: 'library.search', category: 'Library', label: 'Query DuckDB part & feeder catalog', shortcut: 'Ctrl+L', mcpVerb: 'hw_search', requiresAi: false, run: async () => fetch('/api/v1/components/search').then((r) => r.json()) },
  { id: 'export.kicad_pcb', category: 'Export', label: 'Export canonical KiCad 10 .kicad_pcb', shortcut: 'Ctrl+E', mcpVerb: 'hw_export', requiresAi: false, run: async () => fetch('/api/v1/export/kicad-pcb').then((r) => r.text()) },
  { id: 'export.firmware_pins', category: 'Export', label: 'Export C header board_pins.h', shortcut: 'Ctrl+Shift+H', mcpVerb: 'hw_export', requiresAi: false, run: async () => fetch('/api/v1/export/firmware-pins').then((r) => r.text()) },
  { id: 'export.panelize', category: 'Export', label: 'Generate 2x2 production panel', shortcut: 'Ctrl+Shift+B', mcpVerb: 'hw_cam', requiresAi: false, run: async () => postJson('/api/v1/panel/generate', { rows: 2, cols: 2 }) },
  { id: 'workspace.diff_eco', category: 'Workspace', label: 'Compare hardware revisions (ECO diff)', shortcut: 'Ctrl+D', mcpVerb: 'hw_diff', requiresAi: false, run: async () => postJson('/api/v1/diff/compare', { rev_old: 1, rev_new: 2 }) },
];
