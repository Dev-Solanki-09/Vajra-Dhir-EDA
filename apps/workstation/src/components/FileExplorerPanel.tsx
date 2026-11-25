import React, { useState } from 'react';
import { globalIdeWorkspaceStore, useIdeWorkspace } from '../ideFileStore';

export const FileExplorerPanel: React.FC = () => {
  const ide = useIdeWorkspace();
  const [filter, setFilter] = useState('');

  const visibleFiles = ide.files.filter(
    (f) => !filter.trim() || f.path.toLowerCase().includes(filter.trim().toLowerCase())
  );

  return (
    <div
      data-testid="file-explorer-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 10,
        height: '100%',
        backgroundColor: 'var(--vd-bg-panel)',
        color: 'var(--vd-text-primary)',
        fontSize: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 12 }}>Workspace Files</strong>
        <button
          type="button"
          className="vd-btn"
          style={{ minHeight: 22, padding: '1px 7px', fontSize: 11 }}
          onClick={() => void globalIdeWorkspaceStore.refreshTree()}
        >
          Refresh
        </button>
      </div>

      <input
        type="text"
        aria-label="Filter workspace files"
        placeholder="Filter (.ato, .h, .kicad_pcb)..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{
          padding: '4px 8px',
          backgroundColor: 'var(--vd-bg-canvas)',
          color: 'var(--vd-text-primary)',
          border: '1px solid var(--vd-border-subtle)',
          borderRadius: 4,
          fontSize: 11,
        }}
      />

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {visibleFiles.map((f) => {
          const isActive = f.path === ide.activePath;
          const tab = ide.tabs.find((t) => t.path === f.path);
          return (
            <button
              key={f.path}
              type="button"
              data-testid={`file-tree-item-${f.path}`}
              className={`vd-btn ${isActive ? 'vd-btn-primary' : ''}`}
              style={{
                justifyContent: 'space-between',
                textAlign: 'left',
                padding: '4px 8px',
                minHeight: 26,
                fontSize: 11,
                fontFamily: 'var(--vd-font-mono)',
              }}
              onClick={() => void globalIdeWorkspaceStore.openFile(f.path)}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.path}{tab?.dirty ? ' •' : ''}
              </span>
              <span style={{ color: 'var(--vd-text-secondary)', fontSize: 10 }}>
                {Math.max(1, Math.round(f.size_bytes / 1024))}k
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
