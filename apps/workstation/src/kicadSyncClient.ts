import { useSyncExternalStore } from 'react';
import { CLIENT_EDA_COMMANDS } from './commandBus';

export interface KiCadFinding {
  entity_uuid: string | null;
  severity: 'error' | 'warning' | 'info';
  rule_id: string;
  message: string;
  pos_nm: { x_nm: number; y_nm: number };
}

export interface LockViolationBanner {
  timestamp: number;
  entityRef: string;
  actorKind: string;
  errorCode: string;
  message: string;
  suggestedOps: Array<Record<string, unknown>>;
}

export interface KiCadSyncSnapshot {
  loaded: boolean;
  loading: boolean;
  error: string | null;
  projectDir: string;
  pcbPath: string;
  schPath: string;
  pcbText: string;
  schText: string;
  pcbSha256: string;
  schSha256: string;
  revision: number;
  wsConnected: boolean;
  lastEventType: string;
  wsEventSeq: number;
  ercFindings: KiCadFinding[];
  drcFindings: KiCadFinding[];
  ercSummary: string;
  drcSummary: string;
  lockViolation: LockViolationBanner | null;
}

class KiCadSyncStore {
  private snapshot: KiCadSyncSnapshot = {
    loaded: false,
    loading: false,
    error: null,
    projectDir: '',
    pcbPath: '',
    schPath: '',
    pcbText: '',
    schText: '',
    pcbSha256: '',
    schSha256: '',
    revision: 0,
    wsConnected: false,
    lastEventType: 'init',
    wsEventSeq: 0,
    ercFindings: [],
    drcFindings: [],
    ercSummary: 'ERC not yet run',
    drcSummary: 'DRC not yet run',
    lockViolation: null,
  };

  private listeners = new Set<() => void>();
  private ws: WebSocket | null = null;
  private pollTimer: number | null = null;
  private started = false;

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  getSnapshot = () => this.snapshot;

  private update(partial: Partial<KiCadSyncSnapshot>) {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const cb of this.listeners) cb();
  }

  ensureStarted() {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;
    void this.fetchFiles();
    this.connectWebSocket();
    this.pollTimer = window.setInterval(() => {
      void this.pollEvents();
    }, 3000);
  }

  async fetchFiles(projectDir?: string): Promise<void> {
    this.update({ loading: true, error: null });
    try {
      const qs = projectDir ? `?project_dir=${encodeURIComponent(projectDir)}` : '';
      const res = await fetch(`/api/v1/kicad/files${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.update({
        loaded: true,
        loading: false,
        projectDir: String(data.project_dir ?? ''),
        pcbPath: String(data.pcb_path ?? ''),
        schPath: String(data.sch_path ?? ''),
        pcbText: String(data.kicad_pcb ?? ''),
        schText: String(data.kicad_sch ?? ''),
        pcbSha256: String(data.pcb_sha256 ?? ''),
        schSha256: String(data.sch_sha256 ?? ''),
        revision: Number(data.revision ?? 1),
      });
    } catch (err) {
      this.update({
        loading: false,
        error: err instanceof Error ? err.message : 'Unable to fetch KiCad project files',
      });
    }
  }

  async pollEvents(): Promise<void> {
    try {
      const res = await fetch('/api/v1/kicad/events');
      if (!res.ok) return;
      const ev = await res.json();
      const nextRev = Number(ev.revision ?? this.snapshot.revision);
      const nextPcbSha = String(ev.pcb_sha256 ?? '');
      const nextSchSha = String(ev.sch_sha256 ?? '');
      if (
        nextRev !== this.snapshot.revision ||
        (nextPcbSha && nextPcbSha !== this.snapshot.pcbSha256) ||
        (nextSchSha && nextSchSha !== this.snapshot.schSha256)
      ) {
        this.update({ lastEventType: ev.external_changed ? 'external_file_changed' : 'sync_tick' });
        await this.fetchFiles();
      }
    } catch {
      /* daemon offline */
    }
  }

  private connectWebSocket() {
    if (typeof WebSocket === 'undefined') return;
    try {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${proto}//${window.location.host}/api/v1/ws`;
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => this.update({ wsConnected: true });
      ws.onclose = () => {
        this.update({ wsConnected: false });
        window.setTimeout(() => {
          if (this.ws === ws) this.connectWebSocket();
        }, 4000);
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as { type?: string };
          if (msg.type === 'patch_applied' || msg.type === 'external_file_changed' || msg.type === 'ato_build_complete') {
            this.update({ lastEventType: msg.type, wsEventSeq: this.snapshot.wsEventSeq + 1 });
            void this.fetchFiles();
          } else if (msg.type === 'mcad:updated' || msg.type === 'thermal:solved') {
            this.update({ lastEventType: msg.type, wsEventSeq: this.snapshot.wsEventSeq + 1 });
          }
        } catch {
          /* ignore malformed WS frame */
        }
      };
    } catch {
      /* WS fallback polling remains active */
    }
  }

  async dispatchOps(
    summary: string,
    ops: Array<Record<string, unknown>>,
    actorKind: 'human' | 'agent' = 'human',
    entityRef = 'selection',
    commandId?: string
  ): Promise<{ applied: boolean; errorCode?: string; message: string }> {
    const payload = {
      actor_kind: actorKind,
      actor_id: actorKind === 'agent' ? 'agent-overlay' : 'human-workstation',
      summary,
      sync_kicad: true,
      ops,
    };
    const matchedCmd = commandId ? CLIENT_EDA_COMMANDS.find((c) => c.id === commandId) : undefined;
    try {
      const res = await fetch('/api/v1/patch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data.applied === false) {
        const errorCode = String(data.error_code ?? 'KERNEL_LOCK_VIOLATION');
        const message = String(data.message ?? 'Kernel rejected patch');
        if (errorCode === 'KERNEL_LOCK_VIOLATION') {
          this.update({
            lockViolation: {
              timestamp: Date.now(),
              entityRef,
              actorKind,
              errorCode,
              message,
              suggestedOps: ops,
            },
          });
        }
        return { applied: false, errorCode, message };
      }
      if (matchedCmd && matchedCmd.requiresAi !== false) {
        throw new Error('Command violated Same-Hands invariant');
      }
      this.update({ lockViolation: null, lastEventType: 'patch_applied' });
      await this.fetchFiles();
      return { applied: true, message: String(data.message ?? 'Patch applied') };
    } catch (err) {
      return {
        applied: false,
        errorCode: 'DAEMON_OFFLINE',
        message: err instanceof Error ? err.message : 'Daemon unreachable',
      };
    }
  }

  clearLockViolation() {
    this.update({ lockViolation: null });
  }

  async runErc(): Promise<void> {
    try {
      const res = await fetch('/api/v1/kicad/erc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.snapshot.schPath ? { sch_path: this.snapshot.schPath } : {}),
      });
      if (!res.ok) return;
      const data = await res.json();
      const findings = Array.isArray(data.findings) ? (data.findings as KiCadFinding[]) : [];
      this.update({
        ercFindings: findings,
        ercSummary: `ERC ${data.passed ? 'PASS' : 'FAIL'}: ${data.error_count ?? 0} err, ${data.warning_count ?? 0} warn (${data.kicad_version ?? '10.0.8'})`,
      });
    } catch {
      this.update({ ercSummary: 'ERC unavailable (daemon offline)' });
    }
  }

  async runDrc(): Promise<void> {
    try {
      const res = await fetch('/api/v1/kicad/drc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.snapshot.pcbPath ? { pcb_path: this.snapshot.pcbPath } : {}),
      });
      if (!res.ok) return;
      const data = await res.json();
      const findings = Array.isArray(data.findings) ? (data.findings as KiCadFinding[]) : [];
      this.update({
        drcFindings: findings,
        drcSummary: `DRC ${data.passed ? 'PASS' : 'FAIL'}: ${data.error_count ?? 0} err, ${data.warning_count ?? 0} warn (${data.kicad_version ?? '10.0.8'})`,
      });
    } catch {
      this.update({ drcSummary: 'DRC unavailable (daemon offline)' });
    }
  }
}

export const globalKiCadSyncStore = new KiCadSyncStore();

export function useKiCadSync(): KiCadSyncSnapshot {
  globalKiCadSyncStore.ensureStarted();
  return useSyncExternalStore(globalKiCadSyncStore.subscribe, globalKiCadSyncStore.getSnapshot);
}
