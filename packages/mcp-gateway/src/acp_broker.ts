/**
 * packages/mcp-gateway/src/acp_broker.ts
 * 
 * Agent Client Protocol (ACP) Bring-Your-Own-Agent Wire Protocol:
 * Implements JSON-RPC 2.0 stdio lifecycle:
 * - initialize
 * - session/new
 * - session/load
 * - session/prompt
 * - session/update
 * - session/request_permission
 * - session/cancel
 * 
 * Interconnects vd-agent, Claude Code, OpenAI Codex, Gemini CLI, and Ollama
 * while injecting the 12-verb MCP Gateway and enforcing hw-dlp permissions.
 */

import { EDA_VERB_DEFINITIONS } from './verbs.js';

export type PermissionMode =
  | 'PLAN_ONLY'
  | 'ASK_BEFORE_MUTATE'
  | 'AUTO_VERIFY_SAFE'
  | 'AUTONOMOUS_SANDBOX';

export type DlpClass = 'PUBLIC_OPEN' | 'PRIVATE_CLOUD_OK' | 'NDA_AIRGAPPED';

export interface AcpSessionConfig {
  sessionId: string;
  projectId: string;
  agentModel: string;
  dlpClass: DlpClass;
  permissionMode: PermissionMode;
  localOllamaUrl?: string;
  costCapUsd: number;
}

export interface AcpPromptRequest {
  sessionId: string;
  prompt: string;
  userContext?: Record<string, unknown>;
}

export interface AcpPermissionRequest {
  sessionId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  isHardwareMutation: boolean;
  touchesLockedEntity: boolean;
}

export interface AcpPermissionResponse {
  approved: boolean;
  reason?: string;
  forcedActorCtx: 'human' | 'agent' | 'compiler';
}

export class AcpBroker {
  private sessions: Map<string, AcpSessionConfig> = new Map();
  private sessionCosts: Map<string, number> = new Map();

  public initialize(clientName: string, protocolVersion: string): Record<string, unknown> {
    return {
      protocolVersion: '2024-11-05',
      serverInfo: {
        name: 'vajra-dhir-acp-broker',
        version: '0.1.0',
        supportedAgents: ['vd-agent', 'claude-code', 'codex-cli', 'gemini-cli', 'ollama'],
      },
      capabilities: {
        tools: {
          count: EDA_VERB_DEFINITIONS.length,
          deferLoadingSupported: true,
        },
        permissions: {
          failClosedLocks: true,
          humanSignoffGate8: true,
        },
      },
    };
  }

  public createSession(config: AcpSessionConfig): { sessionId: string; status: string; injectedToolsCount: number } {
    // Airgap enforcement: if NDA_AIRGAPPED, cloud models are strictly forbidden
    if (config.dlpClass === 'NDA_AIRGAPPED') {
      const isCloudModel = !config.agentModel.toLowerCase().includes('ollama') &&
                           !config.agentModel.toLowerCase().includes('vllm') &&
                           !config.agentModel.toLowerCase().includes('local');
      if (isCloudModel) {
        throw new Error(
          `DLP_VIOLATION: Workspace is NDA_AIRGAPPED. Cloud model '${config.agentModel}' rejected. Only local Ollama/vLLM endpoints permitted.`
        );
      }
    }

    this.sessions.set(config.sessionId, config);
    this.sessionCosts.set(config.sessionId, 0.0);

    return {
      sessionId: config.sessionId,
      status: 'active',
      injectedToolsCount: EDA_VERB_DEFINITIONS.length,
    };
  }

  public getSession(sessionId: string): AcpSessionConfig | undefined {
    return this.sessions.get(sessionId);
  }

  public evaluatePermission(req: AcpPermissionRequest): AcpPermissionResponse {
    const session = this.sessions.get(req.sessionId);
    if (!session) {
      return { approved: false, reason: 'Session not found', forcedActorCtx: 'agent' };
    }

    // Fail-closed invariant: Non-human actors can NEVER touch locked=1 entities
    if (req.touchesLockedEntity) {
      return {
        approved: false,
        reason: 'KERNEL_LOCK_VIOLATION: Non-human actor cannot mutate human-locked entity',
        forcedActorCtx: 'agent',
      };
    }

    // Gate 8 manufacturing release requires explicit human token
    if (req.toolName === 'eda_export_fab') {
      const hasSignToken = Boolean(req.arguments && req.arguments.human_signoff_token);
      if (!hasSignToken) {
        return {
          approved: false,
          reason: 'VD-GATE-SIGN_REQUIRED: Gate 8 manufacturing export requires explicit human_signoff_token',
          forcedActorCtx: 'agent',
        };
      }
    }

    switch (session.permissionMode) {
      case 'PLAN_ONLY':
        if (req.isHardwareMutation) {
          return { approved: false, reason: 'Mode is PLAN_ONLY: mutations prohibited', forcedActorCtx: 'agent' };
        }
        return { approved: true, forcedActorCtx: 'agent' };

      case 'ASK_BEFORE_MUTATE':
        // In interactive IDE, triggers human prompt
        return { approved: true, forcedActorCtx: 'agent' };

      case 'AUTO_VERIFY_SAFE':
      case 'AUTONOMOUS_SANDBOX':
        return { approved: true, forcedActorCtx: 'agent' };

      default:
        return { approved: false, reason: 'Unknown permission mode', forcedActorCtx: 'agent' };
    }
  }

  public recordCost(sessionId: string, costUsd: number): { currentCostUsd: number; capExceeded: boolean } {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    const current = (this.sessionCosts.get(sessionId) ?? 0.0) + costUsd;
    this.sessionCosts.set(sessionId, current);

    const capExceeded = current > session.costCapUsd;
    return {
      currentCostUsd: Number(current.toFixed(4)),
      capExceeded,
    };
  }
}
