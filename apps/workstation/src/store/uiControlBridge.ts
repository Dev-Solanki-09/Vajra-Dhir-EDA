import { useDesignStore } from './useDesignStore';
import { globalCrossProbeBus } from '@vajradhir/crossprobe-bus';
import { CLIENT_EDA_COMMANDS, WorkspaceId } from '../commandBus';

export interface UiControlCallbacks {
  getWorkspace: () => WorkspaceId;
  setWorkspace: (w: WorkspaceId) => void;
  focusPanel: (panelId: string) => boolean;
  listPanels: () => string[];
}

let bridgeStarted = false;
let bridgeWs: WebSocket | null = null;
let uiCallbacks: UiControlCallbacks | null = null;

export function registerUiControlCallbacks(cbs: UiControlCallbacks): void {
  uiCallbacks = cbs;
}

export function startUiControlBridge(): void {
  if (bridgeStarted || typeof window === 'undefined') return;
  bridgeStarted = true;
  try {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    bridgeWs = new WebSocket(`${proto}//${window.location.host}/ws/ui-control`);
    bridgeWs.onmessage = async (ev: MessageEvent) => {
      try {
        const req = JSON.parse(String(ev.data)) as {
          id?: string;
          method?: string;
          params?: Record<string, unknown>;
        };
        if (!req.id || !req.method) return;
        const params = req.params ?? {};
        let result: Record<string, unknown> = { ok: false };

        if (req.method === 'ui_get_state') {
          const st = useDesignStore.getState();
          const probe = globalCrossProbeBus.getSnapshot();
          result = {
            ok: true,
            workspace: uiCallbacks?.getWorkspace() ?? 'pcb_layout',
            panels: uiCallbacks?.listPanels() ?? [],
            revId: st.revId,
            selectedRefdes: probe.selection.entityIds,
            entityCount: Object.keys(st.entitiesByRefdes).length,
          };
        } else if (req.method === 'ui_navigate') {
          const panelId = params.panelId ? String(params.panelId) : '';
          const wsTarget = params.workspace ? (String(params.workspace) as WorkspaceId) : null;
          let focused = false;
          if (wsTarget && uiCallbacks) uiCallbacks.setWorkspace(wsTarget);
          if (panelId && uiCallbacks) focused = uiCallbacks.focusPanel(panelId);
          result = {
            ok: true,
            workspace: uiCallbacks?.getWorkspace() ?? wsTarget,
            panelId,
            focused,
          };
        } else if (req.method === 'ui_capture_viewport') {
          const st = useDesignStore.getState();
          result = {
            ok: true,
            workspace: uiCallbacks?.getWorkspace() ?? 'pcb_layout',
            revId: st.revId,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
          };
        } else if (req.method === 'ui_execute_command') {
          const cmdId = String(params.commandId ?? '');
          const cmd = CLIENT_EDA_COMMANDS.find((c) => c.id === cmdId);
          if (cmd) {
            await cmd.run(params.args ?? {}, 'human');
            result = { ok: true, commandId: cmdId };
          } else {
            result = { ok: false, error: `Unknown command '${cmdId}'` };
          }
        }
        bridgeWs?.send(JSON.stringify({ jsonrpc: '2.0', id: req.id, result }));
      } catch {
        /* ignore malformed RPC frame */
      }
    };
  } catch {
    /* offline */
  }
}
