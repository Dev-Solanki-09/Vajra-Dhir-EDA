import React, { useEffect, useState } from 'react';
import { globalCrossProbeBus } from '@vajradhir/crossprobe-bus';
import { globalIdeWorkspaceStore } from '../ideFileStore';
import { useDesignStore } from '../store/useDesignStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { VajraIcon } from './VajraIcons';

export interface NotificationItem {
  id: string;
  severity: 'info' | 'warn' | 'error' | 'pass';
  title: string;
  detail: string;
}

export const ToastStack: React.FC<{
  onOpenDiagnostics?: () => void;
  onOpenSettings?: () => void;
}> = ({ onOpenDiagnostics, onOpenSettings }) => {
  const toasts = useSettingsStore((s) => s.toasts);
  const dismissToast = useSettingsStore((s) => s.dismissToast);
  if (toasts.length === 0) return null;

  return (
    <div className="vd-toast-stack" data-testid="toast-stack">
      {toasts.map((t) => {
        const edge =
          t.severity === 'error'
            ? 'var(--vd-fail)'
            : t.severity === 'warn'
            ? 'var(--vd-warn)'
            : t.severity === 'pass'
            ? 'var(--vd-pass)'
            : 'var(--vd-border-active)';
        return (
          <div key={t.id} className="vd-toast-card" data-testid={`toast-${t.severity}`} style={{ borderLeft: `2px solid ${edge}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
              <strong style={{ fontSize: 11 }}>{t.title}</strong>
              <button type="button" className="vd-btn vd-btn-icon" style={{ minHeight: 16 }} onClick={() => dismissToast(t.id)}>
                <VajraIcon name="close" size={10} />
              </button>
            </div>
            <div className="vd-metric" style={{ fontSize: 10.5, color: 'var(--vd-text-secondary)' }}>{t.detail}</div>
            {t.actionTarget && (
              <button
                type="button"
                className="vd-btn"
                style={{ marginTop: 4 }}
                onClick={() => {
                  if (t.actionTarget === 'diagnostics') onOpenDiagnostics?.();
                  if (t.actionTarget === 'settings') onOpenSettings?.();
                  dismissToast(t.id);
                }}
              >
                {t.actionLabel || 'Inspect'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

export const EnterpriseDrawers: React.FC<{
  mode: 'none' | 'notifications' | 'search' | 'files' | 'plugins' | 'jobs';
  onClose: () => void;
  notifications?: NotificationItem[];
  onClearNotifications?: () => void;
  onJumpToEntity?: (refdes: string) => void;
  onJumpToWorkspace?: (wsId: 'schematic' | 'pcb_layout' | 'mcad_3d' | 'sim_lab') => void;
}> = ({ mode, onClose, notifications: propNotifs, onClearNotifications, onJumpToEntity, onJumpToWorkspace }) => {
  const storeNotifs = useSettingsStore((s) => s.notifications);
  const clearStoreNotifs = useSettingsStore((s) => s.clearNotifications);
  const dndMode = useSettingsStore((s) => s.dndMode);
  const toggleDnd = useSettingsStore((s) => s.toggleDnd);
  const jobs = useSettingsStore((s) => s.jobs);
  const finishJob = useSettingsStore((s) => s.finishJob);
  const entitiesByRefdes = useDesignStore((s) => s.entitiesByRefdes);

  const notifications = propNotifs ?? storeNotifs;
  const handleClear = onClearNotifications ?? clearStoreNotifs;

  const [notifFilter, setNotifFilter] = useState<'all' | 'error' | 'warn' | 'pass'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [plugins, setPlugins] = useState<Array<{ id: string; version: string; runtime: string; granted_capabilities: string[]; denied_capabilities: string[] }>>([]);
  const [files, setFiles] = useState<Array<{ path: string; name: string; kind: string }>>([]);

  useEffect(() => {
    if (mode === 'plugins') {
      fetch('/api/v1/plugins')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.plugins) setPlugins(d.plugins);
        })
        .catch(() => {});
    }
    if (mode === 'files' || mode === 'search') {
      fetch('/api/v1/fs/tree')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (Array.isArray(d?.entries)) {
            setFiles(d.entries);
          }
        })
        .catch(() => {});
    }
  }, [mode]);

  if (mode === 'none') return null;

  const q = searchQuery.trim().toLowerCase();
  const filteredFiles = files.filter((f) => f.kind === 'file' && (!q || f.path.toLowerCase().includes(q)));
  const entityMatches = Object.values(entitiesByRefdes).filter(
    (e) => !q || e.refdes.toLowerCase().includes(q) || (e.mpn || '').toLowerCase().includes(q) || (e.value || '').toLowerCase().includes(q)
  );
  const filteredNotifs = notifications.filter((n) => notifFilter === 'all' || n.severity === notifFilter);

  return (
    <div className="vd-modal-backdrop" role="dialog" aria-modal="true" aria-label={`Enterprise drawer ${mode}`}>
      <div className="vd-modal-panel" data-testid={`enterprise-drawer-${mode}`} style={{ maxWidth: 640, width: '92vw' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <strong style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
            <VajraIcon name={mode === 'plugins' ? 'plugin' : mode === 'search' ? 'search' : mode === 'files' ? 'folder' : mode === 'jobs' ? 'historyClock' : 'bell'} size={14} />
            {mode === 'notifications' && `Notification Center (${notifications.length})`}
            {mode === 'search' && 'Global Project Search (Ctrl+Shift+F)'}
            {mode === 'files' && 'Open Workspace File Browser'}
            {mode === 'plugins' && 'Capability-Gated Plugins & MCP Apps'}
            {mode === 'jobs' && 'Background Jobs Monitor'}
          </strong>
          <button type="button" className="vd-btn" onClick={onClose}>Close</button>
        </div>

        {mode === 'notifications' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['all', 'error', 'warn', 'pass'] as const).map((f) => (
                  <button key={f} type="button" className={`vd-btn ${notifFilter === f ? 'vd-btn-primary' : ''}`} onClick={() => setNotifFilter(f)}>{f}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="button" className={`vd-btn ${dndMode ? 'vd-btn-primary' : ''}`} onClick={toggleDnd}>
                  {dndMode ? 'DND On' : 'DND Off'}
                </button>
                <button type="button" data-testid="notifications-clear-btn" className="vd-btn" onClick={handleClear}>Clear All</button>
              </div>
            </div>
            {filteredNotifs.length === 0 ? (
              <div className="vd-metric" style={{ color: 'var(--vd-text-secondary)', fontSize: 11 }}>No active notifications.</div>
            ) : (
              filteredNotifs.map((n) => (
                <div key={n.id} style={{ padding: 7, backgroundColor: 'var(--vd-bg-canvas)', border: '1px solid var(--vd-border-subtle)', borderRadius: 2, fontSize: 11.5 }}>
                  <strong>{n.title}</strong>
                  <div className="vd-metric" style={{ fontSize: 10.5, color: 'var(--vd-text-secondary)' }}>{n.detail}</div>
                </div>
              ))
            )}
          </div>
        )}

        {mode === 'jobs' && (
          <div style={{ display: 'grid', gap: 6 }}>
            {jobs.map((j) => (
              <div key={j.id} className="vd-metric" style={{ padding: 8, backgroundColor: 'var(--vd-bg-canvas)', border: '1px solid var(--vd-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                <div>
                  <div>{j.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--vd-text-muted)' }}>Status: {j.status} · {j.progressPct}% · {j.durationMs} ms</div>
                </div>
                {j.status === 'running' && (
                  <button type="button" className="vd-btn" onClick={() => finishJob(j.id, 'cancelled')}>Cancel</button>
                )}
              </div>
            ))}
          </div>
        )}

        {(mode === 'search' || mode === 'files') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              type="text"
              autoFocus
              data-testid="global-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search components (U1, U2), nets, .ato, .kicad_pcb, firmware..."
              className="vd-input"
            />
            <div style={{ display: 'grid', gap: 4 }}>
              {mode === 'search' && entityMatches.slice(0, 10).map((ent) => (
                <button
                  key={`ent-${ent.refdes}`}
                  type="button"
                  className="vd-btn"
                  style={{ justifyContent: 'space-between', fontSize: 11 }}
                  onClick={() => {
                    globalCrossProbeBus.select([ent.refdes], 'tree');
                    onJumpToEntity?.(ent.refdes);
                    onJumpToWorkspace?.('pcb_layout');
                    onClose();
                  }}
                >
                  <span className="vd-metric">{ent.refdes} ({ent.mpn || ent.value})</span>
                  <span className="vd-metric" style={{ color: 'var(--vd-border-active)' }}>Focus in 2D/3D</span>
                </button>
              ))}
              {filteredFiles.slice(0, 25).map((f) => (
                <button
                  key={f.path}
                  type="button"
                  className="vd-btn"
                  style={{ justifyContent: 'space-between', fontSize: 11 }}
                  onClick={() => {
                    void globalIdeWorkspaceStore.openFile(f.path, true);
                    onJumpToWorkspace?.('schematic');
                    onClose();
                  }}
                >
                  <span>{f.path}</span>
                  <span className="vd-metric" style={{ color: 'var(--vd-text-secondary)' }}>Open in Monaco</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === 'plugins' && (
          <div style={{ display: 'grid', gap: 8 }}>
            {plugins.map((p) => (
              <div key={p.id} data-testid={`plugin-card-${p.id}`} style={{ padding: 10, backgroundColor: 'var(--vd-bg-canvas)', border: '1px solid var(--vd-border-subtle)', borderRadius: 2 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <strong>{p.id} v{p.version}</strong>
                  <span className="vd-metric" style={{ fontSize: 11, color: 'var(--vd-dlp-airgap)' }}>{p.runtime}</span>
                </div>
                <div className="vd-metric" style={{ fontSize: 11, color: 'var(--vd-pass)' }}>
                  Granted: {p.granted_capabilities.join(', ') || 'none'}
                </div>
                <div className="vd-metric" style={{ fontSize: 11, color: 'var(--vd-warn)' }}>
                  Denied by Policy: {p.denied_capabilities.join(', ') || 'none'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
