import React, { useEffect, useState } from 'react';
import { VajraIcon } from './VajraIcons';

export interface FileBrowserEntry {
  name: string;
  path: string;
  kind: 'dir' | 'file';
  ext: string;
}

export const FileBrowserModal: React.FC<{
  open: boolean;
  mode?: 'folder' | 'file';
  title?: string;
  extFilter?: string;
  onSelect: (selectedPath: string) => void;
  onClose: () => void;
}> = ({
  open,
  mode = 'folder',
  title = 'Browse Local File / Workspace Folder',
  extFilter = '',
  onSelect,
  onClose,
}) => {
  const [currentPath, setCurrentPath] = useState('');
  const [parentPath, setParentPath] = useState('');
  const [drives, setDrives] = useState<Array<{ label: string; path: string }>>([]);
  const [bookmarks, setBookmarks] = useState<Array<{ label: string; path: string }>>([]);
  const [entries, setEntries] = useState<FileBrowserEntry[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number>(-1);
  const [newFolderMode, setNewFolderMode] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const loadDir = async (targetPath: string) => {
    setErrorMsg('');
    try {
      const qs = new URLSearchParams();
      if (targetPath) qs.set('path', targetPath);
      if (extFilter) qs.set('ext', extFilter);
      const res = await fetch(`/api/v1/fs/browse?${qs.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      setCurrentPath(data.current_path || '');
      setParentPath(data.parent_path || '');
      setDrives(Array.isArray(data.drives) ? data.drives : []);
      setBookmarks(Array.isArray(data.bookmarks) ? data.bookmarks : []);
      setEntries(Array.isArray(data.entries) ? data.entries : []);
      setSelectedIdx(-1);
    } catch {
      setErrorMsg('Daemon unreachable for local directory listing');
    }
  };

  useEffect(() => {
    if (open) {
      void loadDir('');
      setNewFolderMode(false);
      setNewFolderName('');
    }
  }, [open, extFilter]);

  if (!open) return null;

  const selectedEntry = selectedIdx >= 0 ? entries[selectedIdx] : null;

  const createFolder = async () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    try {
      const res = await fetch('/api/v1/fs/mkdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_path: currentPath, name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(String(data.error || 'Unable to create folder'));
        return;
      }
      setNewFolderMode(false);
      setNewFolderName('');
      await loadDir(currentPath);
    } catch {
      setErrorMsg('Failed to create folder');
    }
  };

  return (
    <div
      className="vd-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="file-browser-modal"
      style={{ zIndex: 96 }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
        if (e.key === 'ArrowDown' && entries.length > 0) {
          e.preventDefault();
          setSelectedIdx((i) => Math.min(entries.length - 1, i + 1));
        }
        if (e.key === 'ArrowUp' && entries.length > 0) {
          e.preventDefault();
          setSelectedIdx((i) => Math.max(0, i - 1));
        }
        if (e.key === 'Backspace' && parentPath && document.activeElement?.tagName !== 'INPUT') {
          void loadDir(parentPath);
        }
      }}
    >
      <div className="vd-modal-panel" style={{ maxWidth: 740, width: '94vw', padding: 0, overflow: 'hidden' }}>
        <div style={{ height: 30, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 10px', backgroundColor: 'var(--vd-bg-elevated)', borderBottom: '1px solid var(--vd-border-subtle)' }}>
          <strong style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <VajraIcon name="folder" size={13} /> {title}
          </strong>
          <button type="button" data-testid="file-browser-close-btn" className="vd-btn vd-btn-icon" onClick={onClose}>
            <VajraIcon name="close" size={12} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 8, borderBottom: '1px solid var(--vd-border-subtle)', backgroundColor: 'var(--vd-bg-panel)' }}>
          <button type="button" data-testid="file-browser-up-btn" className="vd-btn" disabled={!parentPath} onClick={() => parentPath && void loadDir(parentPath)}>Up</button>
          <button type="button" className="vd-btn" onClick={() => void loadDir(currentPath)}>Refresh</button>
          <input
            type="text"
            data-testid="file-browser-path-input"
            className="vd-input vd-metric"
            style={{ flex: 1 }}
            value={currentPath}
            onChange={(e) => setCurrentPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void loadDir(currentPath);
            }}
          />
          <button type="button" data-testid="file-browser-new-folder-btn" className="vd-btn" onClick={() => setNewFolderMode((v) => !v)}>+ New Folder</button>
        </div>

        {newFolderMode && (
          <div style={{ display: 'flex', gap: 6, padding: '6px 8px', backgroundColor: 'var(--vd-bg-elevated)', borderBottom: '1px solid var(--vd-border-subtle)' }}>
            <input
              type="text"
              autoFocus
              data-testid="file-browser-mkdir-input"
              className="vd-input"
              placeholder="New folder name..."
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void createFolder();
              }}
              style={{ flex: 1 }}
            />
            <button type="button" data-testid="file-browser-mkdir-confirm-btn" className="vd-btn vd-btn-primary" onClick={() => void createFolder()}>Create</button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '170px 1fr', height: 290 }}>
          <aside style={{ backgroundColor: 'var(--vd-bg-canvas)', borderRight: '1px solid var(--vd-border-subtle)', padding: 6, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div className="vd-section-title" style={{ padding: '2px 4px' }}>Bookmarks</div>
            {bookmarks.map((b) => (
              <button key={b.path} type="button" className="vd-btn" style={{ justifyContent: 'flex-start' }} onClick={() => void loadDir(b.path)}>
                {b.label}
              </button>
            ))}
            <div className="vd-section-title" style={{ padding: '6px 4px 2px' }}>Drives</div>
            {drives.map((d) => (
              <button key={d.path} type="button" className="vd-btn vd-metric" style={{ justifyContent: 'flex-start' }} onClick={() => void loadDir(d.path)}>
                {d.label}
              </button>
            ))}
          </aside>

          <div style={{ overflowY: 'auto', padding: 6, backgroundColor: 'var(--vd-bg-panel)' }}>
            {errorMsg && <div className="vd-metric" style={{ color: 'var(--vd-fail)', marginBottom: 6 }}>{errorMsg}</div>}
            {entries.map((entry, idx) => (
              <div
                key={entry.path}
                className="vd-tree-row"
                data-testid={`file-browser-entry-${entry.name}`}
                data-selected={selectedIdx === idx}
                onClick={() => setSelectedIdx(idx)}
                onDoubleClick={() => {
                  if (entry.kind === 'dir') {
                    void loadDir(entry.path);
                  } else {
                    onSelect(entry.path);
                    onClose();
                  }
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <VajraIcon name={entry.kind === 'dir' ? 'folder' : 'dossierDoc'} size={13} color={entry.kind === 'dir' ? 'var(--vd-warn)' : 'var(--vd-text-secondary)'} />
                  <span>{entry.name}</span>
                </span>
                <span className="vd-metric" style={{ fontSize: 10, color: 'var(--vd-text-muted)' }}>{entry.kind === 'dir' ? 'DIR' : entry.ext || 'FILE'}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderTop: '1px solid var(--vd-border-subtle)', backgroundColor: 'var(--vd-bg-elevated)' }}>
          <span className="vd-metric" style={{ fontSize: 10.5, color: 'var(--vd-text-secondary)' }}>
            {selectedEntry ? selectedEntry.path : currentPath}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="vd-btn" onClick={onClose}>Cancel</button>
            <button
              type="button"
              data-testid="file-browser-select-btn"
              className="vd-btn vd-btn-primary"
              onClick={() => {
                if (mode === 'folder') {
                  const target = selectedEntry && selectedEntry.kind === 'dir' ? selectedEntry.path : currentPath;
                  onSelect(target);
                  onClose();
                } else if (selectedEntry) {
                  if (selectedEntry.kind === 'dir') {
                    void loadDir(selectedEntry.path);
                  } else {
                    onSelect(selectedEntry.path);
                    onClose();
                  }
                }
              }}
            >
              {mode === 'folder' ? 'Select Folder' : 'Open File'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
