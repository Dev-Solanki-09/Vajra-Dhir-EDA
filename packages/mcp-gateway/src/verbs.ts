/**
 * Vajra-Dhīr EDA — Harness MCP v2 (Canonical 12 EDA Verbs, Wasmtime 51 Code Mode)
 *
 * Unified single canonical 12-verb surface covering Stages P1..P17 and ACP agent harness.
 */

export interface EdaVerbDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

export const CANONICAL_12_MCP_VERBS = [
  'hw_discover',
  'hw_inspect',
  'hw_patch',
  'hw_lock',
  'hw_compile',
  'hw_verify',
  'hw_simulate',
  'hw_layout',
  'hw_signoff',
  'hw_firmware',
  'hw_export',
  'hw_diff',
] as const;

export const EDA_VERB_DEFINITIONS: EdaVerbDefinition[] = [
  {
    name: 'hw_discover',
    description: 'Discover parts in DuckDB/jlcparts (P7), verify datasheet PDF evidence/crops (P8), and enumerate workspace artifacts.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Component query, MPN, or LCSC code' },
        check_datasheet: { type: 'boolean', description: 'Require verified datasheet citation evidence' },
      },
      required: ['query'],
    },
  },
  {
    name: 'hw_inspect',
    description: 'Query HW-IR SQLite entities/nets/constraints or filter large netlist/DRC JSON inside Wasmtime 51 Code Mode (256 MiB / 16 KiB stdout cap).',
    parameters: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        entity_type: { type: 'string', enum: ['component', 'net', 'trace', 'via', 'constraint', 'code_mode'] },
        filter_expr: { type: 'string', description: 'Filter expression or Wasmtime 51 sandboxed query script' },
      },
      required: ['project_id', 'entity_type'],
    },
  },
  {
    name: 'hw_patch',
    description: 'Apply an atomic HardwarePatch or code/enclosure edit through CommandBus with undo logging and human-lock guard.',
    parameters: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        actor_id: { type: 'string' },
        forward_ops: { type: 'array', items: { type: 'object' } },
        dry_run: { type: 'boolean' },
      },
      required: ['project_id', 'actor_id', 'forward_ops'],
    },
  },
  {
    name: 'hw_lock',
    description: 'Set or query human lock status (`locked = 1`) on components, traces, or design constraints.',
    parameters: {
      type: 'object',
      properties: {
        entity_id: { type: 'string' },
        locked: { type: 'boolean' },
        reason: { type: 'string' },
      },
      required: ['entity_id', 'locked'],
    },
  },
  {
    name: 'hw_compile',
    description: 'Compile atopile `.ato` / Open-CUBO blocks / `system.yaml` (P5, P6) and sync KiCad 10 schematics/PCB (P1).',
    parameters: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        target: { type: 'string', enum: ['ato', 'kicad_sync', 'cubo_block', 'enclosure'] },
      },
      required: ['project_id', 'target'],
    },
  },
  {
    name: 'hw_verify',
    description: 'Run deterministic ERC/DRC (P1), Z3/SymPy/Pint EE Audit (P9), PI (P13 padne), 3D Clash + Thermal (P14), and IPC-2581 check (P16).',
    parameters: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        suites: { type: 'array', items: { type: 'string' } },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'hw_simulate',
    description: 'Run ngspice analog/transient/fault simulation (P10) and power integrity FEM solve (P13).',
    parameters: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        analysis_type: { type: 'string', enum: ['tran', 'ac', 'dc', 'op', 'pi_fem', 'thermal_fem'] },
        signals_to_probe: { type: 'array', items: { type: 'string' } },
      },
      required: ['project_id', 'analysis_type'],
    },
  },
  {
    name: 'hw_layout',
    description: 'Run OrthoRoute / Fast-RTR placement/routing (P12) or Gerber geometry inspection (P15).',
    parameters: {
      type: 'object',
      properties: {
        board_id: { type: 'string' },
        mode: { type: 'string', enum: ['auto_route', 'walkaround', 'gerber_inspect'] },
      },
      required: ['board_id', 'mode'],
    },
  },
  {
    name: 'hw_signoff',
    description: 'Surface Gate 8 human cryptographic signoff status or record verified human DRC waiver (always human-gated).',
    parameters: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        waived_by: { type: 'string' },
        human_confirmed: { type: 'boolean' },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'hw_firmware',
    description: 'Compile firmware and execute deterministic Renode / QEMU MCU-on-circuit co-simulation (P11).',
    parameters: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        action: { type: 'string', enum: ['build', 'cosim_run', 'patch_firmware'] },
      },
      required: ['project_id', 'action'],
    },
  },
  {
    name: 'hw_export',
    description: 'Export Gerbers, IPC-2581C, STEP 3D, iBom, PcbDraw SVG, EMS BOM/CPL (P16), and Engineering Dossier PDF (P17).',
    parameters: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        format: { type: 'string', enum: ['gerbers', 'ipc2581', 'fab_bundle', 'dossier_pdf', 'all'] },
      },
      required: ['project_id', 'format'],
    },
  },
  {
    name: 'hw_diff',
    description: 'Compute semantic hardware diff or manage Dual Checkpoints (`git_tree_sha`, `hw_ir_lamport_seq`, `cas_manifest_sha`).',
    parameters: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        base_ref: { type: 'string' },
        head_ref: { type: 'string' },
      },
      required: ['project_id'],
    },
  },
];
