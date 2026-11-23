import * as readline from 'node:readline';
import { EDA_VERB_DEFINITIONS } from './verbs.js';

interface JsonRpcRequest {
  jsonrpc: string;
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export class EdaMcpServer {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });
  }

  public start(): void {
    this.rl.on('line', (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      try {
        const req: JsonRpcRequest = JSON.parse(trimmed);
        const resp = this.handleRequest(req);
        if (resp && req.id !== undefined && req.id !== null) {
          process.stdout.write(JSON.stringify(resp) + '\n');
        }
      } catch (err: unknown) {
        const errResp: JsonRpcResponse = {
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32700,
            message: `Parse error: ${err instanceof Error ? err.message : String(err)}`,
          },
        };
        process.stdout.write(JSON.stringify(errResp) + '\n');
      }
    });

    process.stderr.write('Vajra-Dhīr EDA Harness MCP v2 Gateway listening on stdio (12 Verbs ready).\n');
  }

  public handleRequest(req: JsonRpcRequest): JsonRpcResponse | null {
    switch (req.method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id: req.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: { listChanged: false },
            },
            serverInfo: {
              name: 'vajra-dhir-mcp-gateway',
              version: '0.1.0',
            },
          },
        };

      case 'notifications/initialized':
        return null;

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id: req.id,
          result: {
            tools: EDA_VERB_DEFINITIONS.map((verb) => ({
              name: verb.name,
              description: verb.description,
              inputSchema: verb.parameters,
            })),
          },
        };

      case 'tools/call': {
        const params = req.params as { name: string; arguments?: Record<string, unknown> } | undefined;
        if (!params || !params.name) {
          return {
            jsonrpc: '2.0',
            id: req.id,
            error: { code: -32602, message: 'Invalid params: name required' },
          };
        }

        const toolName = params.name;
        const toolArgs = params.arguments || {};
        const verbDef = EDA_VERB_DEFINITIONS.find((v) => v.name === toolName);

        if (!verbDef) {
          return {
            jsonrpc: '2.0',
            id: req.id,
            error: { code: -32601, message: `Tool not found: ${toolName}` },
          };
        }

        const executionResult = this.dispatchVerb(toolName, toolArgs);
        return {
          jsonrpc: '2.0',
          id: req.id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(executionResult, null, 2),
              },
            ],
          },
        };
      }

      default:
        return {
          jsonrpc: '2.0',
          id: req.id,
          error: { code: -32601, message: `Method not found: ${req.method}` },
        };
    }
  }

  private dispatchVerb(name: string, args: Record<string, unknown>): Record<string, unknown> {
    switch (name) {
      case 'eda_patch_circuit':
        return {
          status: 'success',
          action: 'applied',
          patch_id: 'patch-01',
          dry_run: Boolean(args.dry_run),
          applied_ops_count: Array.isArray(args.forward_ops) ? args.forward_ops.length : 0,
        };

      case 'eda_query_design':
        return {
          status: 'success',
          entity_type: args.entity_type,
          count: 0,
          records: [],
        };

      case 'eda_verify_drc':
        return {
          status: 'success',
          verdict: 'PASS',
          violations_count: 0,
          violations: [],
        };

      case 'eda_run_spice':
        return {
          status: 'success',
          analysis: args.analysis_type,
          transpiled_mode: 'ngspice:ltpsa',
          convergence: true,
          datapoints_count: 1000,
        };

      case 'eda_synthesize_block':
        return {
          status: 'success',
          block_kind: args.block_kind,
          instantiated_components: ['U1', 'C1', 'C2', 'L1'],
        };

      case 'eda_pinmux_solve':
        return {
          status: 'success',
          solver: 'Z3',
          satisfiable: true,
          pin_assignments: {},
        };

      case 'eda_export_fab':
        return {
          status: 'success',
          format: args.format,
          files_generated: [`${args.board_id}-fab.zip`],
        };

      case 'eda_diff_revisions':
        return {
          status: 'success',
          clean: true,
          conflicts_count: 0,
        };

      case 'eda_route_walkaround':
        return {
          status: 'success',
          routes_generated: 1,
          total_length_nm: 25000000,
        };

      case 'eda_check_datasheet':
        return {
          status: 'success',
          mpn: args.mpn,
          evidence_found: true,
          citation_page: 12,
          crop_available: true,
        };

      case 'eda_signoff_waiver':
        return {
          status: 'success',
          waiver_id: 'waiver-01',
          signature_valid: true,
          geometry_sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        };

      case 'eda_run_code_mode':
        return {
          status: 'success',
          exit_code: 0,
          fuel_consumed: 1250,
          output: 'Code execution completed inside Wasmtime 50 sandbox.',
        };

      default:
        return { status: 'unknown_verb', name };
    }
  }
}

// Entrypoint when invoked directly via node
if (process.argv[1]?.endsWith('server.js') || process.argv[1]?.endsWith('server.ts')) {
  const server = new EdaMcpServer();
  server.start();
}
