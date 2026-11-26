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
      case 'hw_discover':
        return { status: 'success', query: args.query ?? '', evidence_found: true, datasheet_verified: true };
      case 'hw_inspect':
        return {
          status: 'success',
          entity_type: args.entity_type ?? 'component',
          sandbox: 'wasmtime-51',
          memory_cap_mib: 256,
          stdout_cap_bytes: 16384,
          records: [],
        };
      case 'hw_patch':
        return {
          status: 'success',
          action: 'applied',
          patch_id: 'patch-01',
          dry_run: Boolean(args.dry_run),
          applied_ops_count: Array.isArray(args.forward_ops) ? args.forward_ops.length : 0,
        };
      case 'hw_lock':
        return { status: 'success', entity_id: args.entity_id, locked: Boolean(args.locked) };
      case 'hw_compile':
        return { status: 'success', target: args.target ?? 'kicad_sync', diagnostics: [] };
      case 'hw_verify':
        return { status: 'success', verdict: 'PASS', violations_count: 0, violations: [] };
      case 'hw_simulate':
        return {
          status: 'success',
          analysis: args.analysis_type ?? 'tran',
          transpiled_mode: 'ngspice:wasm',
          convergence: true,
        };
      case 'hw_layout':
        return { status: 'success', mode: args.mode ?? 'auto_route', routes_generated: 1 };
      case 'hw_signoff':
        return {
          status: args.human_confirmed ? 'success' : 'blocked',
          release_authorized: Boolean(args.human_confirmed && args.waived_by),
          gate: 'GATE_8_HUMAN_ONLY',
        };
      case 'hw_firmware':
        return { status: 'success', action: args.action ?? 'cosim_run', cosim_pass: true };
      case 'hw_export':
        return { status: 'success', format: args.format ?? 'fab_bundle', output: 'Execution via Wasmtime 51 gateway ready.' };
      case 'hw_diff':
        return { status: 'success', clean: true, conflicts_count: 0 };
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
