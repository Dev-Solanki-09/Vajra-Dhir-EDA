/**
 * Vajra-Dhīr EDA — Harness MCP v2 (The 12 EDA Verbs)
 * 
 * Strict typed verbs exposing deterministic compiler, placement, DRC, SPICE,
 * and patch operations to Frontier AI Agents.
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

export const EDA_VERB_DEFINITIONS: EdaVerbDefinition[] = [
  {
    name: 'eda_patch_circuit',
    description: 'Apply an atomic HardwarePatch to the HW-IR database with automatic dry-run, undo logging, and human-lock protection.',
    parameters: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'UUIDv7 of the target project' },
        actor_id: { type: 'string', description: 'Identifier of the agent or engineer applying the patch' },
        forward_ops: {
          type: 'array',
          items: { type: 'object' },
          description: 'List of HardwarePatchOp operations (UPSERT_ENTITY, MOVE_COMPONENT, etc.)'
        },
        dry_run: { type: 'boolean', description: 'If true, validates lock guards and returns diff without writing to disk' },
      },
      required: ['project_id', 'actor_id', 'forward_ops'],
    },
  },
  {
    name: 'eda_query_design',
    description: 'Run structured SQL or filter queries over the HW-IR database (components, nets, traces, vias, constraints).',
    parameters: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'UUIDv7 of the target project' },
        entity_type: {
          type: 'string',
          enum: ['component', 'net', 'trace', 'via', 'copper_zone', 'constraint', 'raw_sql'],
          description: 'Entity table to query'
        },
        filter_expr: { type: 'string', description: 'Filter expression or SQL SELECT statement' },
      },
      required: ['project_id', 'entity_type'],
    },
  },
  {
    name: 'eda_verify_drc',
    description: 'Execute deterministic DRC/ERC verification against fab limits (clearance, shorts, open nets, courtyards).',
    parameters: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'UUIDv7 of the target project' },
        board_id: { type: 'string', description: 'Target board UUIDv7' },
        fab_profile: { type: 'string', description: 'Target fab ruleset (e.g. jlcpcb_4l_7628, pcbway_2l, sky130A)' },
      },
      required: ['project_id', 'board_id'],
    },
  },
  {
    name: 'eda_run_spice',
    description: 'Execute SPICE simulation (operating point, transient, AC, Monte Carlo) via dialect-transpiled ngspice/Xyce.',
    parameters: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'UUIDv7 of the target project' },
        analysis_type: { type: 'string', enum: ['tran', 'ac', 'dc', 'op', 'monte_carlo'] },
        stop_time_s: { type: 'number', description: 'Transient simulation stop time in seconds' },
        step_time_s: { type: 'number', description: 'Transient simulation max step time in seconds' },
        signals_to_probe: { type: 'array', items: { type: 'string' } },
      },
      required: ['project_id', 'analysis_type', 'signals_to_probe'],
    },
  },
  {
    name: 'eda_synthesize_block',
    description: 'Synthesize a verified Open-CUBO circuit block or atopile module into the design.',
    parameters: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'UUIDv7 of the target project' },
        block_kind: { type: 'string', description: 'e.g. buck_regulator, usb_pd_sink, ldo_linear, diff_rx' },
        parameters: { type: 'object', description: 'Key-value input parameters (v_in, v_out, i_max, etc.)' },
      },
      required: ['project_id', 'block_kind', 'parameters'],
    },
  },
  {
    name: 'eda_pinmux_solve',
    description: 'Run the Z3 pinmux constraint solver to assign MCU/FPGA peripherals to pins with zero conflicts.',
    parameters: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'UUIDv7 of the target project' },
        mcu_component_id: { type: 'string', description: 'Component UUIDv7 of the microcontroller' },
        required_peripherals: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of peripherals (e.g. ["I2C1", "SPI2", "UART1", "ADC1_CH4"])'
        },
      },
      required: ['project_id', 'mcu_component_id', 'required_peripherals'],
    },
  },
  {
    name: 'eda_export_fab',
    description: 'Generate production manufacturing outputs (Gerber X3, IPC-2581C, drill files, BOM, Pick-and-Place, STEP).',
    parameters: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'UUIDv7 of the target project' },
        board_id: { type: 'string', description: 'Target board UUIDv7' },
        format: { type: 'string', enum: ['gerber_x3', 'ipc_2581c', 'step_mcad', 'bom_csv', 'pos_csv', 'all'] },
      },
      required: ['project_id', 'board_id', 'format'],
    },
  },
  {
    name: 'eda_diff_revisions',
    description: 'Compute a semantic 3-way hardware diff between git commits or branches with spatial collision check.',
    parameters: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'UUIDv7 of the target project' },
        base_ref: { type: 'string', description: 'Git ref or commit for common ancestor' },
        head_ref: { type: 'string', description: 'Git ref or commit for comparison' },
      },
      required: ['project_id', 'base_ref', 'head_ref'],
    },
  },
  {
    name: 'eda_route_walkaround',
    description: 'Execute obstacle-avoidance walkaround or differential pair routing between two pins/pads.',
    parameters: {
      type: 'object',
      properties: {
        board_id: { type: 'string', description: 'Target board UUIDv7' },
        from_pin_id: { type: 'string', description: 'Source pin UUIDv7' },
        to_pin_id: { type: 'string', description: 'Target pin UUIDv7' },
        preferred_layer: { type: 'string', description: 'e.g. F.Cu, B.Cu' },
      },
      required: ['board_id', 'from_pin_id', 'to_pin_id'],
    },
  },
  {
    name: 'eda_check_datasheet',
    description: 'Query the local zero-hallucination datasheet evidence ledger for cryptographic pin/limit citations and crops.',
    parameters: {
      type: 'object',
      properties: {
        mpn: { type: 'string', description: 'Manufacturer Part Number' },
        query_fact: { type: 'string', description: 'Fact to retrieve (e.g. absolute_max_vcc, thermal_resistance, pinout)' },
      },
      required: ['mpn', 'query_fact'],
    },
  },
  {
    name: 'eda_signoff_waiver',
    description: 'Cryptographically sign an active DRC waiver bound to the exact geometry SHA-256 fingerprint.',
    parameters: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'UUIDv7 of the target project' },
        rule_code: { type: 'string', description: 'DRC rule code being waived (e.g. clearance, shorting_items)' },
        entity_ids: { type: 'array', items: { type: 'string' } },
        justification: { type: 'string', description: 'Technical rationale for waiver' },
        waived_by: { type: 'string', description: 'Engineer identity or GPG fingerprint' },
      },
      required: ['project_id', 'rule_code', 'entity_ids', 'justification', 'waived_by'],
    },
  },
  {
    name: 'eda_run_code_mode',
    description: 'Execute a sandboxed Python/Wasm script inside Wasmtime 51 with fuel, 256 MiB memory, and 5s watchdog ceiling.',
    parameters: {
      type: 'object',
      properties: {
        source_code: { type: 'string', description: 'Python/Wasm script source' },
        timeout_ms: { type: 'number', description: 'Execution timeout in ms (max 5000)' },
      },
      required: ['source_code'],
    },
  },
];
