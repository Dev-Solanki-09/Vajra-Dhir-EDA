import React, { useEffect, useState } from 'react';
import { globalIdeWorkspaceStore } from '../ideFileStore';
import { VajraIcon } from './VajraIcons';

export interface NotificationItem {
  id: string;
  severity: 'info' | 'warn' | 'error' | 'pass';
  title: string;
  detail: string;
}

export const EnterpriseDrawers: React.FC<{
  mode: 'none' | 'notifications' | 'search' | 'files' | 'plugins';
  onClose: () => void;
  notifications: NotificationItem[];
  onClearNotifications: () => void;
}> = ({ mode, onClose, notifications, onClearNotifications }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ path: string; name: string }>>([]);
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
            setSearchResults(d.entries.filter((e: { kind: string }) => e.kind === 'file'));
          }
        })
        .catch(() => {});
    }
  }, [mode]);

  if (mode === 'none') return null;

  const filteredFiles = files.filter(
    (f) => f.kind === 'file' && (!searchQuery.trim() || f.path.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="vd-modal-backdrop" role="dialog" aria-modal="true" aria-label={`Enterprise drawer ${mode}`}>
      <div className="vd-modal-panel" data-testid={`enterprise-drawer-${mode}`} style={{ maxWidth: 600, width: '90vw' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <VajraIcon name={mode === 'plugins' ? 'plugin' : mode === 'search' ? 'search' : mode === 'files' ? 'folder' : 'bell'} size={15} />
            {mode === 'notifications' && `Notification Center (${notifications.length})`}
            {mode === 'search' && 'Global Workspace Search (Ctrl+Shift+F)'}
            {mode === 'files' && 'Open Workspace File Browser'}
            {mode === 'plugins' && 'Capability-Gated Plugins & MCP Apps'}
          </strong>
          <button type="button" className="vd-btn" onClick={onClose}>Close</button>
        </div>

        {mode === 'notifications' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="vd-btn" onClick={onClearNotifications}>Clear All</button>
            </div>
            {notifications.length === 0 ? (
              <div className="vd-metric" style={{ color: '#A1A1AA', fontSize: 12 }}>No active notifications.</div>
            ) : (
              notifications.map((n) => (
                <div key={n.id} style={{ padding: 8, backgroundColor: '#141416', border: '1px solid #2A2A2F', borderRadius: 4, fontSize: 12 }}>
                  <strong>{n.title}</strong>
                  <div className="vd-metric" style={{ fontSize: 11, color: '#A1A1AA' }}>{n.detail}</div>
                </div>
              ))
            )}
          </div>
        )}

        {(mode === 'search' || mode === 'files') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter workspace files (.ato, .kicad_pcb, .c, .typ)..."
              style={{ padding: '6px 8px', backgroundColor: '#141416', color: '#F4F4F5', border: '1px solid #3B82F6', borderRadius: 4 }}
            />
            <div style={{ maxHeight: 240, overflowY: 'auto', display: 'grid', gap: 4 }}>
              {(searchResults.length ? filteredFiles : []).slice(0, 25).map((f) => (
                <button
                  key={f.path}
                  type="button"
                  className="vd-btn"
                  style={{ justifyContent: 'space-between', fontSize: 11 }}
                  onClick={() => {
                    void globalIdeWorkspaceStore.openFile(f.path, true);
                    onClose();
                  }}
                >
                  <span>{f.path}</span>
                  <span className="vd-metric" style={{ color: '#A1A1AA' }}>Open in Monaco</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === 'plugins' && (
          <div style={{ display: 'grid', gap: 8 }}>
            {plugins.map((p) => (
              <div key={p.id} data-testid={`plugin-card-${p.id}`} style={{ padding: 10, backgroundColor: '#141416', border: '1px solid #2A2A2F', borderRadius: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <strong>{p.id} v{p.version}</strong>
                  <span className="vd-metric" style={{ fontSize: 11, color: '#06B6D4' }}>{p.runtime}</span>
                </div>
                <div className="vd-metric" style={{ fontSize: 11, color: '#10B981' }}>
                  Granted: {p.granted_capabilities.join(', ') || 'none'}
                </div>
                <div className="vd-metric" style={{ fontSize: 11, color: '#F59E0B' }}>
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
