import { create } from '../shims/zustand';
import { globalKiCadSyncStore } from '../kicadSyncClient';

export type StageFreshnessState = 'FRESH' | 'RECOMPUTING' | 'STALE' | 'FAILED';

export interface CanonicalEntity {
  id: string;
  refdes: string;
  mpn: string;
  value: string;
  package: string;
  x_nm: number;
  y_nm: number;
  rot_mdeg: number;
  side: string;
  locked: boolean;
}

export interface TransientPreview {
  refdes: string;
  x_nm: number;
  y_nm: number;
  rot_mdeg: number;
  side: string;
  sourcePaneId: string;
  timestamp: number;
}

export interface LockConflictBanner {
  refdes: string;
  errorCode: string;
  message: string;
  violetGhostOps: Array<Record<string, unknown>>;
}

export interface DesignStoreState {
  revId: number;
  entitiesByRefdes: Record<string, CanonicalEntity>;
  bomSummary: { component_count: number; unique_values: number; total_usd: number };
  stageFreshness: Record<string, StageFreshnessState>;
  transientPreviews: Record<string, TransientPreview>;
  lastOriginPaneId: string;
  isApplyingSyncDelta: boolean;
  syncWsConnected: boolean;
  lockConflict: LockConflictBanner | null;
  hydrateFromDaemon: () => Promise<void>;
  reconcileDiffSince: (sinceRev: number) => Promise<void>;
  setTransientPreview: (preview: TransientPreview) => void;
  clearTransientPreview: (refdes: string) => void;
  commitTx: (
    originPaneId: string,
    ops: Array<Record<string, unknown>>,
    summary?: string,
    actorKind?: 'human' | 'agent'
  ) => Promise<{ applied: boolean; rev_id?: number; error_code?: string; message?: string }>;
  undoTx: () => Promise<boolean>;
  redoTx: () => Promise<boolean>;
  connectSyncChannels: () => void;
}

const SYNC_BC_NAME = 'vajradhir-design-sync';
let syncBc: BroadcastChannel | null = null;
let syncWs: WebSocket | null = null;
let channelsConnected = false;

function indexEntities(list: CanonicalEntity[]): Record<string, CanonicalEntity> {
  const map: Record<string, CanonicalEntity> = {};
  for (const e of list) {
    if (e.refdes) map[e.refdes] = e;
  }
  return map;
}

export const useDesignStore = create<DesignStoreState>((set, get) => ({
  revId: 0,
  entitiesByRefdes: {},
  bomSummary: { component_count: 0, unique_values: 0, total_usd: 0 },
  stageFreshness: {},
  transientPreviews: {},
  lastOriginPaneId: 'init',
  isApplyingSyncDelta: false,
  syncWsConnected: false,
  lockConflict: null,

  hydrateFromDaemon: async () => {
    try {
      const res = await fetch('/api/v1/tx/state');
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data.rev_id === 'number' && data.rev_id >= get().revId) {
        set({
          isApplyingSyncDelta: true,
          revId: data.rev_id,
          entitiesByRefdes: indexEntities(data.entities ?? []),
          bomSummary: data.bom_summary ?? get().bomSummary,
          stageFreshness: data.stage_freshness ?? {},
        });
        set({ isApplyingSyncDelta: false });
      }
    } catch {
      /* daemon offline */
    }
  },

  reconcileDiffSince: async (sinceRev: number) => {
    try {
      const res = await fetch(`/api/v1/tx/diff?since_rev=${sinceRev}`);
      if (!res.ok) return;
      const data = await res.json();
      const cur = data.current;
      if (cur && typeof cur.rev_id === 'number' && cur.rev_id > get().revId) {
        set({
          isApplyingSyncDelta: true,
          revId: cur.rev_id,
          entitiesByRefdes: indexEntities(cur.entities ?? []),
          bomSummary: cur.bom_summary ?? get().bomSummary,
          stageFreshness: cur.stage_freshness ?? {},
        });
        set({ isApplyingSyncDelta: false });
      }
    } catch {
      /* offline */
    }
  },

  setTransientPreview: (preview: TransientPreview) => {
    if (get().isApplyingSyncDelta) return;
    set((s) => ({
      transientPreviews: { ...s.transientPreviews, [preview.refdes]: preview },
    }));
    if (syncBc) {
      try {
        syncBc.postMessage({ type: 'TRANSIENT_PREVIEW', preview });
      } catch {
        /* ignore */
      }
    }
  },

  clearTransientPreview: (refdes: string) => {
    set((s) => {
      if (!(refdes in s.transientPreviews)) return s;
      const next = { ...s.transientPreviews };
      delete next[refdes];
      return { transientPreviews: next };
    });
    if (syncBc) {
      try {
        syncBc.postMessage({ type: 'CLEAR_PREVIEW', refdes });
      } catch {
        /* ignore */
      }
    }
  },

  commitTx: async (originPaneId, ops, summary, actorKind = 'human') => {
    if (get().isApplyingSyncDelta) {
      return { applied: false, error_code: 'SYNC_ECHO_BLOCKED', message: 'Ignored recursive delta commit' };
    }
    try {
      const res = await fetch('/api/v1/tx/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin_pane_id: originPaneId, actor_kind: actorKind, summary, ops }),
      });
      const data = await res.json();
      if (!res.ok || !data.applied) {
        if (data.error_code === 'KERNEL_LOCK_VIOLATION') {
          set({
            lockConflict: {
              refdes: String(ops[0]?.refdes ?? ops[0]?.component_id ?? 'LOCKED'),
              errorCode: 'KERNEL_LOCK_VIOLATION',
              message: String(data.message ?? 'Entity is human-locked'),
              violetGhostOps: ops,
            },
          });
        }
        return { applied: false, error_code: data.error_code, message: data.message };
      }

      if (typeof data.rev_id === 'number' && data.rev_id > get().revId) {
        set({
          isApplyingSyncDelta: true,
          revId: data.rev_id,
          lastOriginPaneId: originPaneId,
          entitiesByRefdes: indexEntities(data.entities ?? []),
          bomSummary: data.bom_summary ?? get().bomSummary,
          stageFreshness: data.stage_freshness ?? get().stageFreshness,
          transientPreviews: {},
          lockConflict: null,
        });
        set({ isApplyingSyncDelta: false });
      }
      if (syncBc) {
        try {
          syncBc.postMessage({ type: 'STATE_DELTA', payload: data });
        } catch {
          /* ignore */
        }
      }
      await globalKiCadSyncStore.fetchFiles();
      return { applied: true, rev_id: data.rev_id };
    } catch (err) {
      return { applied: false, error_code: 'TX_OFFLINE', message: err instanceof Error ? err.message : 'Offline' };
    }
  },

  undoTx: async () => {
    try {
      const res = await fetch('/api/v1/tx/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin_pane_id: 'hotkey-ctrl-z' }),
      });
      const data = await res.json();
      if (res.ok && data.applied && typeof data.rev_id === 'number' && data.rev_id > get().revId) {
        set({
          isApplyingSyncDelta: true,
          revId: data.rev_id,
          entitiesByRefdes: indexEntities(data.entities ?? []),
          bomSummary: data.bom_summary ?? get().bomSummary,
          stageFreshness: data.stage_freshness ?? get().stageFreshness,
          transientPreviews: {},
        });
        set({ isApplyingSyncDelta: false });
        if (syncBc) {
          syncBc.postMessage({ type: 'STATE_DELTA', payload: data });
        }
        await globalKiCadSyncStore.fetchFiles();
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  },

  redoTx: async () => {
    try {
      const res = await fetch('/api/v1/tx/redo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin_pane_id: 'hotkey-ctrl-shift-z' }),
      });
      const data = await res.json();
      if (res.ok && data.applied && typeof data.rev_id === 'number' && data.rev_id > get().revId) {
        set({
          isApplyingSyncDelta: true,
          revId: data.rev_id,
          entitiesByRefdes: indexEntities(data.entities ?? []),
          bomSummary: data.bom_summary ?? get().bomSummary,
          stageFreshness: data.stage_freshness ?? get().stageFreshness,
          transientPreviews: {},
        });
        set({ isApplyingSyncDelta: false });
        if (syncBc) {
          syncBc.postMessage({ type: 'STATE_DELTA', payload: data });
        }
        await globalKiCadSyncStore.fetchFiles();
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  },

  connectSyncChannels: () => {
    if (channelsConnected || typeof window === 'undefined') return;
    channelsConnected = true;
    void get().hydrateFromDaemon();

    if ('BroadcastChannel' in window) {
      syncBc = new BroadcastChannel(SYNC_BC_NAME);
      syncBc.onmessage = (ev: MessageEvent) => {
        const msg = ev.data as { type?: string; preview?: TransientPreview; refdes?: string; payload?: Record<string, unknown> };
        if (!msg) return;
        if (msg.type === 'TRANSIENT_PREVIEW' && msg.preview) {
          set((s) => ({
            transientPreviews: { ...s.transientPreviews, [msg.preview!.refdes]: msg.preview! },
          }));
        } else if (msg.type === 'CLEAR_PREVIEW' && msg.refdes) {
          get().clearTransientPreview(msg.refdes);
        } else if (msg.type === 'STATE_DELTA' && msg.payload) {
          const rev = Number(msg.payload.rev_id ?? 0);
          if (rev > get().revId) {
            set({
              isApplyingSyncDelta: true,
              revId: rev,
              lastOriginPaneId: String(msg.payload.origin_pane_id ?? 'broadcast'),
              entitiesByRefdes: indexEntities((msg.payload.entities as CanonicalEntity[]) ?? []),
              bomSummary: (msg.payload.bom_summary as DesignStoreState['bomSummary']) ?? get().bomSummary,
              stageFreshness: (msg.payload.stage_freshness as Record<string, StageFreshnessState>) ?? get().stageFreshness,
              transientPreviews: {},
            });
            set({ isApplyingSyncDelta: false });
          }
        }
      };
    }

    try {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      syncWs = new WebSocket(`${proto}//${window.location.host}/ws/sync`);
      syncWs.onopen = () => set({ syncWsConnected: true });
      syncWs.onclose = () => set({ syncWsConnected: false });
      syncWs.onmessage = (ev: MessageEvent) => {
        try {
          const msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
          if (msg.type === 'STATE_DELTA' && typeof msg.rev_id === 'number') {
            if (msg.rev_id > get().revId) {
              set({
                isApplyingSyncDelta: true,
                revId: msg.rev_id,
                lastOriginPaneId: String(msg.origin_pane_id ?? 'ws'),
                entitiesByRefdes: indexEntities((msg.entities as CanonicalEntity[]) ?? []),
                bomSummary: (msg.bom_summary as DesignStoreState['bomSummary']) ?? get().bomSummary,
                stageFreshness: (msg.stage_freshness as Record<string, StageFreshnessState>) ?? get().stageFreshness,
                transientPreviews: {},
              });
              set({ isApplyingSyncDelta: false });
              void globalKiCadSyncStore.fetchFiles();
            }
          }
        } catch {
          /* ignore */
        }
      };
    } catch {
      /* ws blocked */
    }
  },
}));
