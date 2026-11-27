import { useSyncExternalStore } from 'react';
import { globalCrossProbeBus } from '@vajradhir/crossprobe-bus';
import { useDesignStore } from './useDesignStore';

export interface SessionContextSnapshot {
  projectId: string;
  projectName: string;
  revId: number;
  dirty: boolean;
  activeWorkspace: string;
  activePanel: string;
  selectedUuids: string[];
  activeNet: string | null;
  activeFile: string;
  cursorLine: number;
}

class SessionContextBusImpl {
  private snapshot: SessionContextSnapshot = {
    projectId: '',
    projectName: '',
    revId: 0,
    dirty: false,
    activeWorkspace: 'pcb_layout',
    activePanel: 'viewport',
    selectedUuids: [],
    activeNet: null,
    activeFile: 'elec/src/main.ato',
    cursorLine: 1,
  };
  private listeners = new Set<() => void>();
  private mountedPluginFrames = new Set<HTMLIFrameElement>();

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  getSnapshot = () => this.snapshot;

  registerPluginIframe(iframe: HTMLIFrameElement | null) {
    if (!iframe) return;
    this.mountedPluginFrames.add(iframe);
    this.pushHostContextToPlugins();
  }

  unregisterPluginIframe(iframe: HTMLIFrameElement | null) {
    if (!iframe) return;
    this.mountedPluginFrames.delete(iframe);
  }

  updateContext(partial: Partial<SessionContextSnapshot>) {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const cb of this.listeners) cb();
    this.pushHostContextToPlugins();
  }

  pushHostContextToPlugins() {
    const design = useDesignStore.getState();
    const probe = globalCrossProbeBus.getSnapshot();
    const payload = {
      jsonrpc: '2.0',
      method: 'ui/notifications/host-context-changed',
      params: {
        project_id: this.snapshot.projectId,
        project_name: this.snapshot.projectName,
        rev_id: design.revId || this.snapshot.revId,
        dirty: this.snapshot.dirty,
        active_workspace: this.snapshot.activeWorkspace,
        selected_uuids: probe.selection.entityIds.length ? probe.selection.entityIds : this.snapshot.selectedUuids,
        active_net: probe.activeHighlight.netId ?? this.snapshot.activeNet,
        active_file: this.snapshot.activeFile,
      },
    };
    for (const frame of this.mountedPluginFrames) {
      try {
        frame.contentWindow?.postMessage(payload, '*');
      } catch {
        /* ignore detached frame */
      }
    }
  }

  handlePluginMessage(ev: MessageEvent) {
    const data = ev.data as { method?: string; params?: Record<string, unknown> } | undefined;
    if (!data || typeof data !== 'object') return;
    if (data.method === 'ui/focus-entity' && Array.isArray(data.params?.entityIds)) {
      const ids = (data.params!.entityIds as unknown[]).map((x) => String(x)).filter(Boolean);
      if (ids.length > 0) {
        globalCrossProbeBus.select(ids, 'plugin' as never);
        this.updateContext({ selectedUuids: ids });
      }
    } else if (data.method === 'ui/propose-ghost' && Array.isArray(data.params?.ops)) {
      void useDesignStore
        .getState()
        .commitTx('ui-plugin', data.params!.ops as Array<Record<string, unknown>>, 'Plugin Ghost Proposal', 'agent');
    }
  }
}

export const globalSessionContextBus = new SessionContextBusImpl();

export function useSessionContext(): SessionContextSnapshot {
  return useSyncExternalStore(globalSessionContextBus.subscribe, globalSessionContextBus.getSnapshot);
}
