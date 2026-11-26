import { create } from '../shims/zustand';
import { usePolishStore } from './usePolishStore';

export type ThemeVariant = 'matte_charcoal' | 'high_contrast_dark' | 'neutral_matte_light';
export type DensityMode = 'compact' | 'standard' | 'comfortable';
export type MousePreset = 'blender' | 'kicad' | 'unity' | 'trackpad';
export type KeymapPreset = 'vajra' | 'kicad' | 'blender' | 'altium';

export interface RecentProjectEntry {
  name: string;
  kind: string;
  path: string;
  lastOpenedUtc: string;
}

export interface GlobalSettings {
  version: number;
  general: {
    defaultProjectsDir: string;
    startupBehavior: 'home' | 'workbench' | 'reopen_last';
    confirmBeforeDelete: boolean;
    confirmUnsavedClose: boolean;
    telemetryDisabled: boolean;
    recentProjects: RecentProjectEntry[];
  };
  appearance: {
    theme: ThemeVariant;
    density: DensityMode;
    uiFontSizePx: number;
    monoFontSizePx: number;
    showStatusBar: boolean;
    showHotkeyHints: boolean;
    reduceMotion: boolean;
  };
  navigation: {
    mousePreset: MousePreset;
    invertScrollZoom: boolean;
    zoomToCursor: boolean;
    fovDeg: number;
    unit: 'mm' | 'mil' | 'nm';
    gridMm: number;
    snapRadiusPx: number;
  };
  keymap: {
    preset: KeymapPreset;
    bindings: Record<string, string>;
  };
  autosave: {
    enabled: boolean;
    intervalSec: number;
    rollingBackupCount: number;
    crashRecovery: boolean;
    undoCap: number;
  };
  performance: {
    memoryProfile: 'laptop_8gb' | 'workstation_16gb';
    duckdbLimitMb: number;
    wasmIdleSec: number;
    onDemand3d: boolean;
    maxPixelRatio: number;
    maxWebglContexts: number;
    solverRecalc: 'debounced' | 'manual';
  };
  eda: {
    fabProfile: string;
    stackup: string;
    bomCurrency: 'INR' | 'USD' | 'EUR';
    warnNrndEol: boolean;
  };
  tools: {
    kicadCli: string;
    ngspice: string;
    renode: string;
    typst: string;
    autorouter: string;
    padne: string;
    docker: string;
    ollama: string;
    pythonVenv: string;
  };
  agent: {
    dlpMode: 'PUBLIC_OPEN' | 'PRIVATE_CLOUD_OK' | 'NDA_AIRGAPPED';
    agentMode: 'off' | 'copilot' | 'autonomous';
    ollamaEndpoint: string;
    sessionCostCapUsd: number;
    budgetWarnPct: number;
    mcpUrl: string;
    pluginDir: string;
    pluginPolicy: 'ask_first' | 'strict_sandbox';
  };
}

export interface ProjectSettings {
  name: string;
  revision: string;
  author: string;
  organization: string;
  description: string;
  license: string;
  fabProfileOverride: string;
  dlpLock: boolean;
  dlpClass: 'PUBLIC_OPEN' | 'PRIVATE_CLOUD_OK' | 'NDA_AIRGAPPED';
  boardThicknessMm: number;
  copperWeightOz: string;
  surfaceFinish: 'HASL' | 'ENIG';
  solderMaskColor: 'Green' | 'Matte Black' | 'Blue' | 'Red' | 'White';
}

export interface NotificationEntry {
  id: string;
  severity: 'info' | 'pass' | 'warn' | 'error';
  title: string;
  detail: string;
  timestamp: string;
  actionLabel?: string;
  actionTarget?: 'diagnostics' | 'settings';
}

export interface BackgroundJobEntry {
  id: string;
  label: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  progressPct: number;
  durationMs: number;
  startedAt: string;
}

export interface ActivityLogEntry {
  id: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  source: string;
  message: string;
  timestamp: string;
}

export interface CustomLayoutEntry {
  name: string;
  workspaceId: string;
  savedAtUtc: string;
  layoutJson: unknown;
}

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  version: 1,
  general: {
    defaultProjectsDir: '~/VajraDhirProjects',
    startupBehavior: 'workbench',
    confirmBeforeDelete: true,
    confirmUnsavedClose: true,
    telemetryDisabled: true,
    recentProjects: [],
  },
  appearance: {
    theme: 'matte_charcoal',
    density: 'standard',
    uiFontSizePx: 11.5,
    monoFontSizePx: 11.5,
    showStatusBar: true,
    showHotkeyHints: true,
    reduceMotion: false,
  },
  navigation: {
    mousePreset: 'blender',
    invertScrollZoom: false,
    zoomToCursor: true,
    fovDeg: 45,
    unit: 'mm',
    gridMm: 0.5,
    snapRadiusPx: 10,
  },
  keymap: {
    preset: 'vajra',
    bindings: {},
  },
  autosave: {
    enabled: true,
    intervalSec: 60,
    rollingBackupCount: 10,
    crashRecovery: true,
    undoCap: 100,
  },
  performance: {
    memoryProfile: 'laptop_8gb',
    duckdbLimitMb: 256,
    wasmIdleSec: 5,
    onDemand3d: true,
    maxPixelRatio: 1.25,
    maxWebglContexts: 2,
    solverRecalc: 'debounced',
  },
  eda: {
    fabProfile: 'jlcpcb_4l',
    stackup: '4l_jlc04161h',
    bomCurrency: 'USD',
    warnNrndEol: true,
  },
  tools: {
    kicadCli: '',
    ngspice: '',
    renode: '',
    typst: '',
    autorouter: '',
    padne: '',
    docker: '',
    ollama: '',
    pythonVenv: '',
  },
  agent: {
    dlpMode: 'NDA_AIRGAPPED',
    agentMode: 'copilot',
    ollamaEndpoint: 'http://127.0.0.1:11434',
    sessionCostCapUsd: 5.0,
    budgetWarnPct: 80,
    mcpUrl: 'http://127.0.0.1:41900/mcp',
    pluginDir: '.vd-plugins',
    pluginPolicy: 'ask_first',
  },
};

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  name: 'golden-buck-mcu',
  revision: 'Rev A',
  author: 'Hardware Engineer',
  organization: 'Vajra-Dhir Lab',
  description: '4-layer USB-C PD 12V to 3.3V synchronous buck converter reference design',
  license: 'CERN-OHL-P-2.0',
  fabProfileOverride: '',
  dlpLock: true,
  dlpClass: 'NDA_AIRGAPPED',
  boardThicknessMm: 1.6,
  copperWeightOz: '1 oz',
  surfaceFinish: 'ENIG',
  solderMaskColor: 'Matte Black',
};

const CUSTOM_LAYOUTS_KEY = 'vd.workstation.customLayouts.v1';

function loadStoredLayouts(): CustomLayoutEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_LAYOUTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStoredLayouts(list: CustomLayoutEntry[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CUSTOM_LAYOUTS_KEY, JSON.stringify(list));
  } catch {
    /* ignore storage quota */
  }
}

export function applyAppearanceToDom(cfg: GlobalSettings) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', cfg.appearance.theme);
  root.setAttribute('data-density', cfg.appearance.density);
  root.style.setProperty('--vd-ui-size', `${cfg.appearance.uiFontSizePx}px`);
  root.style.setProperty('--vd-mono-size', `${cfg.appearance.monoFontSizePx}px`);
  usePolishStore.setState({
    unitMode: cfg.navigation.unit === 'mil' ? 'mil' : 'mm',
    activeFabPresetId: cfg.eda.fabProfile,
    webglMaxContexts: cfg.performance.maxWebglContexts,
  });
}

function deepMerge<T extends Record<string, unknown>>(base: T, patch: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

export interface SettingsStoreState {
  settings: GlobalSettings;
  projectSettings: ProjectSettings;
  hydrated: boolean;
  notifications: NotificationEntry[];
  toasts: NotificationEntry[];
  dndMode: boolean;
  jobs: BackgroundJobEntry[];
  activityLog: ActivityLogEntry[];
  customLayouts: CustomLayoutEntry[];
  hydrateSettings: () => Promise<void>;
  updateSettings: (patch: Record<string, unknown>) => Promise<void>;
  resetSettings: () => Promise<void>;
  importSettings: (raw: GlobalSettings) => Promise<void>;
  updateProjectSettings: (patch: Partial<ProjectSettings>) => Promise<void>;
  pushNotification: (n: Omit<NotificationEntry, 'id' | 'timestamp'>) => void;
  dismissToast: (id: string) => void;
  clearNotifications: () => void;
  toggleDnd: () => void;
  startJob: (label: string) => string;
  finishJob: (id: string, status?: 'completed' | 'failed' | 'cancelled') => void;
  logActivity: (level: ActivityLogEntry['level'], source: string, message: string) => void;
  saveCustomLayout: (entry: CustomLayoutEntry) => void;
  deleteCustomLayout: (name: string) => void;
  renameCustomLayout: (oldName: string, newName: string) => void;
}

let settingsWriteSeq = 0;
let settingsWriteChain: Promise<void> = Promise.resolve();

export const useSettingsStore = create<SettingsStoreState>((set, get) => ({
  settings: DEFAULT_GLOBAL_SETTINGS,
  projectSettings: DEFAULT_PROJECT_SETTINGS,
  hydrated: false,
  notifications: [
    {
      id: 'n-init',
      severity: 'pass',
      title: 'Kernel Armed',
      detail: 'SQLite HW-IR WAL + _tx_actor_ctx triggers ready (NDA_AIRGAPPED)',
      timestamp: new Date().toISOString(),
    },
  ],
  toasts: [],
  dndMode: false,
  jobs: [
    {
      id: 'job-boot',
      label: 'HW-IR WAL Hydration',
      status: 'completed',
      progressPct: 100,
      durationMs: 24,
      startedAt: new Date().toISOString(),
    },
  ],
  activityLog: [
    {
      id: 'act-boot',
      level: 'INFO',
      source: 'vd-daemon',
      message: 'Loopback 127.0.0.1:41900 workspace initialized',
      timestamp: new Date().toISOString(),
    },
  ],
  customLayouts: loadStoredLayouts(),

  hydrateSettings: async () => {
    try {
      const [gRes, pRes] = await Promise.all([fetch('/api/v1/settings'), fetch('/api/v1/project/settings')]);
      const gJson = gRes.ok ? ((await gRes.json()) as GlobalSettings) : DEFAULT_GLOBAL_SETTINGS;
      const pJson = pRes.ok ? ((await pRes.json()) as ProjectSettings) : DEFAULT_PROJECT_SETTINGS;
      const merged = deepMerge(DEFAULT_GLOBAL_SETTINGS as unknown as Record<string, unknown>, gJson as unknown as Record<string, unknown>) as unknown as GlobalSettings;
      applyAppearanceToDom(merged);
      set({ settings: merged, projectSettings: { ...DEFAULT_PROJECT_SETTINGS, ...pJson }, hydrated: true });
    } catch {
      applyAppearanceToDom(get().settings);
      set({ hydrated: true });
    }
  },

  updateSettings: async (patch) => {
    const seq = ++settingsWriteSeq;
    const optimistic = deepMerge(get().settings as unknown as Record<string, unknown>, patch) as unknown as GlobalSettings;
    applyAppearanceToDom(optimistic);
    set({ settings: optimistic });
    const job = settingsWriteChain.then(async () => {
      try {
        const res = await fetch('/api/v1/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (res.ok) {
          const persisted = (await res.json()) as GlobalSettings;
          if (seq === settingsWriteSeq) {
            applyAppearanceToDom(persisted);
            set({ settings: persisted });
          }
          get().logActivity('INFO', 'settings', 'Saved global settings to .vd-cache/user-settings.json');
        }
      } catch {
        /* retain optimistic in offline mode */
      }
    });
    settingsWriteChain = job.catch(() => {});
    await job;
  },

  resetSettings: async () => {
    applyAppearanceToDom(DEFAULT_GLOBAL_SETTINGS);
    set({ settings: DEFAULT_GLOBAL_SETTINGS });
    try {
      const res = await fetch('/api/v1/settings/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (res.ok) {
        const fresh = (await res.json()) as GlobalSettings;
        applyAppearanceToDom(fresh);
        set({ settings: fresh });
      }
    } catch {
      /* ignore */
    }
    get().logActivity('INFO', 'settings', 'Reset all settings to defaults');
  },

  importSettings: async (raw) => {
    const merged = deepMerge(DEFAULT_GLOBAL_SETTINGS as unknown as Record<string, unknown>, raw as unknown as Record<string, unknown>) as unknown as GlobalSettings;
    applyAppearanceToDom(merged);
    set({ settings: merged });
    try {
      const res = await fetch('/api/v1/settings/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged),
      });
      if (res.ok) {
        const saved = (await res.json()) as GlobalSettings;
        applyAppearanceToDom(saved);
        set({ settings: saved });
      }
    } catch {
      /* ignore */
    }
    get().logActivity('INFO', 'settings', 'Imported settings JSON');
  },

  updateProjectSettings: async (patch) => {
    const next = { ...get().projectSettings, ...patch };
    set({ projectSettings: next });
    try {
      const res = await fetch('/api/v1/project/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const saved = (await res.json()) as ProjectSettings;
        set({ projectSettings: saved });
        get().logActivity('INFO', 'project', `Updated project.vd.json (${saved.name} ${saved.revision})`);
      }
    } catch {
      /* offline */
    }
  },

  pushNotification: (n) => {
    const entry: NotificationEntry = {
      ...n,
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
    };
    set((s) => ({
      notifications: [entry, ...s.notifications].slice(0, 60),
      toasts: s.dndMode ? s.toasts : [entry, ...s.toasts].slice(0, 3),
    }));
    get().logActivity(n.severity === 'error' ? 'ERROR' : n.severity === 'warn' ? 'WARN' : 'INFO', 'notify', `${n.title}: ${n.detail}`);
    if (n.severity !== 'error') {
      setTimeout(() => {
        get().dismissToast(entry.id);
      }, 4000);
    }
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clearNotifications: () => set({ notifications: [], toasts: [] }),
  toggleDnd: () => set((s) => ({ dndMode: !s.dndMode })),

  startJob: (label) => {
    const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const job: BackgroundJobEntry = {
      id,
      label,
      status: 'running',
      progressPct: 35,
      durationMs: 0,
      startedAt: new Date().toISOString(),
    };
    set((s) => ({ jobs: [job, ...s.jobs].slice(0, 20) }));
    return id;
  },

  finishJob: (id, status = 'completed') => {
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id === id
          ? {
              ...j,
              status,
              progressPct: status === 'completed' ? 100 : j.progressPct,
              durationMs: Math.max(1, Date.now() - new Date(j.startedAt).getTime()),
            }
          : j
      ),
    }));
  },

  logActivity: (level, source, message) => {
    const entry: ActivityLogEntry = {
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      level,
      source,
      message,
      timestamp: new Date().toISOString(),
    };
    set((s) => ({ activityLog: [entry, ...s.activityLog].slice(0, 120) }));
  },

  saveCustomLayout: (entry) => {
    const next = [entry, ...get().customLayouts.filter((l) => l.name !== entry.name)];
    saveStoredLayouts(next);
    set({ customLayouts: next });
    get().logActivity('INFO', 'workspace', `Saved custom workspace layout "${entry.name}"`);
  },

  deleteCustomLayout: (name) => {
    const next = get().customLayouts.filter((l) => l.name !== name);
    saveStoredLayouts(next);
    set({ customLayouts: next });
  },

  renameCustomLayout: (oldName, newName) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const next = get().customLayouts.map((l) => (l.name === oldName ? { ...l, name: trimmed } : l));
    saveStoredLayouts(next);
    set({ customLayouts: next });
  },
}));
