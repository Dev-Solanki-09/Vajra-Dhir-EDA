import { useSyncExternalStore } from 'react';
import { globalKiCadSyncStore } from './kicadSyncClient';

export interface WorkspaceFileEntry {
  path: string;
  name: string;
  kind: 'file' | 'dir';
  size_bytes: number;
}

export interface OpenEditorTab {
  path: string;
  content: string;
  savedContent: string;
  dirty: boolean;
  language: string;
}

export interface IdeWorkspaceSnapshot {
  rootDir: string;
  files: WorkspaceFileEntry[];
  tabs: OpenEditorTab[];
  activePath: string;
  statusNote: string;
  revealTarget: { path: string; line: number; seq: number } | null;
}

export function detectMonacoLanguage(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.ato')) return 'ato';
  if (lower.endsWith('.c') || lower.endsWith('.h')) return 'c';
  if (lower.endsWith('.rs')) return 'rust';
  if (lower.endsWith('.py')) return 'python';
  if (lower.endsWith('.sv') || lower.endsWith('.v')) return 'systemverilog';
  if (lower.endsWith('.cir') || lower.endsWith('.sp')) return 'spice';
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'yaml';
  if (lower.endsWith('.kicad_pcb') || lower.endsWith('.kicad_sch') || lower.endsWith('.kicad_mod')) return 'kicad_sexpr';
  if (lower.endsWith('.json') || lower.endsWith('.kicad_pro') || lower.endsWith('.kicad_prl')) return 'json';
  return 'plaintext';
}

const FALLBACK_ATO = `module Buck3V3:
    component U1 "CH224K"
    component U2 "TPS54302"
    component J1 "PWR_12V_IN"
    component L1 "4.7uH"
    component C1 "10uF 25V"
`;

class IdeWorkspaceStore {
  private snapshot: IdeWorkspaceSnapshot = {
    rootDir: '',
    files: [
      { path: 'elec/src/main.ato', name: 'main.ato', kind: 'file', size_bytes: FALLBACK_ATO.length },
    ],
    tabs: [
      {
        path: 'elec/src/main.ato',
        content: FALLBACK_ATO,
        savedContent: FALLBACK_ATO,
        dirty: false,
        language: 'ato',
      },
    ],
    activePath: 'elec/src/main.ato',
    statusNote: 'IDE ready',
    revealTarget: null,
  };

  private listeners = new Set<() => void>();
  private started = false;

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  getSnapshot = () => this.snapshot;

  private update(partial: Partial<IdeWorkspaceSnapshot>) {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const cb of this.listeners) cb();
  }

  ensureStarted() {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;
    void this.refreshTree().then(() => this.openFile('elec/src/main.ato', true));
  }

  async refreshTree(): Promise<void> {
    try {
      const res = await fetch('/api/v1/fs/tree');
      if (!res.ok) return;
      const data = await res.json();
      const entries = Array.isArray(data.entries) ? (data.entries as WorkspaceFileEntry[]) : [];
      this.update({
        rootDir: String(data.root_dir ?? ''),
        files: entries,
      });
    } catch {
      /* daemon offline */
    }
  }

  async openFile(relPath: string, forceReload = false): Promise<void> {
    const existing = this.snapshot.tabs.find((t) => t.path === relPath);
    if (existing && !forceReload) {
      this.update({ activePath: relPath });
      return;
    }
    try {
      const res = await fetch(`/api/v1/fs/read?path=${encodeURIComponent(relPath)}`);
      if (!res.ok) return;
      const data = await res.json();
      const content = String(data.content ?? '');
      const nextTab: OpenEditorTab = {
        path: relPath,
        content,
        savedContent: content,
        dirty: false,
        language: detectMonacoLanguage(relPath),
      };
      const nextTabs = existing
        ? this.snapshot.tabs.map((t) => (t.path === relPath ? nextTab : t))
        : [...this.snapshot.tabs, nextTab];
      this.update({
        tabs: nextTabs,
        activePath: relPath,
        statusNote: `Opened ${relPath}`,
      });
    } catch {
      /* offline */
    }
  }

  setActiveTab(relPath: string) {
    this.update({ activePath: relPath });
  }

  async openFileAtLine(relPath: string, line: number): Promise<void> {
    await this.openFile(relPath, false);
    const nextSeq = (this.snapshot.revealTarget?.seq ?? 0) + 1;
    this.update({
      activePath: relPath,
      revealTarget: { path: relPath, line: Math.max(1, line), seq: nextSeq },
      statusNote: `Jumped to ${relPath}:${Math.max(1, line)}`,
    });
  }

  updateTabContent(relPath: string, nextContent: string) {
    const nextTabs = this.snapshot.tabs.map((t) =>
      t.path === relPath
        ? { ...t, content: nextContent, dirty: nextContent !== t.savedContent }
        : t
    );
    this.update({ tabs: nextTabs });
  }

  async saveActiveFile(pathOverride?: string): Promise<boolean> {
    const targetPath = pathOverride ?? this.snapshot.activePath;
    const tab = this.snapshot.tabs.find((t) => t.path === targetPath);
    if (!tab) return false;
    try {
      const res = await fetch('/api/v1/fs/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: tab.path, content: tab.content }),
      });
      if (!res.ok) return false;
      const nextTabs = this.snapshot.tabs.map((t) =>
        t.path === targetPath ? { ...t, savedContent: t.content, dirty: false } : t
      );
      this.update({ tabs: nextTabs, statusNote: `Saved ${tab.path}` });
      await globalKiCadSyncStore.pollEvents();
      return true;
    } catch {
      this.update({ statusNote: `Save failed (daemon offline): ${tab.path}` });
      return false;
    }
  }

  closeTab(relPath: string) {
    const remaining = this.snapshot.tabs.filter((t) => t.path !== relPath);
    const nextActive =
      this.snapshot.activePath === relPath ? remaining[0]?.path ?? '' : this.snapshot.activePath;
    this.update({ tabs: remaining, activePath: nextActive });
  }
}

export const globalIdeWorkspaceStore = new IdeWorkspaceStore();

export function useIdeWorkspace(): IdeWorkspaceSnapshot {
  globalIdeWorkspaceStore.ensureStarted();
  return useSyncExternalStore(globalIdeWorkspaceStore.subscribe, globalIdeWorkspaceStore.getSnapshot);
}
