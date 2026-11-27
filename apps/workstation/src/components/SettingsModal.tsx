import React, { useEffect, useMemo, useState } from 'react';
import {
  KEYMAP_COMMANDS,
  findShortcutConflicts,
  formatKeyboardEventCombo,
  resolveEffectiveBindings,
} from '../store/useKeymap';
import {
  DEFAULT_GLOBAL_SETTINGS,
  DensityMode,
  GlobalSettings,
  KeymapPreset,
  MousePreset,
  ThemeVariant,
  useSettingsStore,
} from '../store/useSettingsStore';
import { VajraIcon } from './VajraIcons';

const CATEGORIES = [
  { id: 'general', label: 'General & Startup', legacyTestId: 'settings-cat-general' },
  { id: 'appearance', label: 'Appearance & Layout', legacyTestId: 'settings-cat-appearance' },
  { id: 'navigation', label: 'Navigation & Viewport', legacyTestId: 'settings-cat-pcb-units' },
  { id: 'keymap', label: 'Keymap & Shortcuts', legacyTestId: 'settings-cat-keybindings' },
  { id: 'autosave', label: 'Auto-Save, Backups & History', legacyTestId: 'settings-cat-autosave' },
  { id: 'performance', label: 'Performance & Memory', legacyTestId: 'settings-cat-performance' },
  { id: 'eda', label: 'EDA Defaults & Fab Rules', legacyTestId: 'settings-cat-fab-compliance' },
  { id: 'tools', label: 'External Tools & Paths', legacyTestId: 'settings-cat-tools' },
  { id: 'agent', label: 'AI Agent, MCP, Plugins & Security', legacyTestId: 'settings-cat-agent-dlp' },
] as const;

type CategoryId = (typeof CATEGORIES)[number]['id'];

const SettingRow: React.FC<{
  label: string;
  modified?: boolean;
  onReset?: () => void;
  children: React.ReactNode;
}> = ({ label, modified, onReset, children }) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 10,
      padding: '6px 8px',
      borderLeft: modified ? '2px solid var(--vd-border-active)' : '2px solid transparent',
      backgroundColor: 'var(--vd-bg-canvas)',
      borderBottom: '1px solid var(--vd-border-subtle)',
      fontSize: 11.5,
    }}
  >
    <span>{label}</span>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {children}
      {modified && onReset && (
        <button type="button" className="vd-btn" style={{ minHeight: 18, padding: '1px 5px', fontSize: 10 }} onClick={onReset} title="Reset to default">
          Reset
        </button>
      )}
    </div>
  </div>
);

export const SettingsModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onBrowseDir?: (onPicked: (path: string) => void) => void;
  onResetWorkspaceLayouts?: () => void;
}> = ({ open, onClose, onBrowseDir, onResetWorkspaceLayouts }) => {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const resetSettings = useSettingsStore((s) => s.resetSettings);
  const importSettings = useSettingsStore((s) => s.importSettings);
  const pushNotification = useSettingsStore((s) => s.pushNotification);

  const [cat, setCat] = useState<CategoryId>('general');
  const [search, setSearch] = useState('');
  const [recordingCmdId, setRecordingCmdId] = useState<string | null>(null);
  const [conflictMsg, setConflictMsg] = useState('');
  const [importDraft, setImportDraft] = useState('');
  const [showImportBox, setShowImportBox] = useState(false);
  const [byokProvider, setByokProvider] = useState('deterministic_offline');
  const [byokModel, setByokModel] = useState('vd-offline-ee-v1');
  const [byokBaseUrl, setByokBaseUrl] = useState('');
  const [byokKeyDraft, setByokKeyDraft] = useState('');
  const [vaultStatus, setVaultStatus] = useState<Record<string, { configured: boolean; masked: string }>>({});
  const [memApproval, setMemApproval] = useState(true);
  const [skillApproval, setSkillApproval] = useState(true);
  const [connStatus, setConnStatus] = useState('');

  useEffect(() => {
    if (!open) return;
    void fetch('/api/v1/agent/providers')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        if (d.settings?.provider) setByokProvider(String(d.settings.provider));
        if (d.settings?.model) setByokModel(String(d.settings.model));
        if (d.settings?.base_url !== undefined) setByokBaseUrl(String(d.settings.base_url));
        if (typeof d.settings?.memory_write_approval === 'boolean') setMemApproval(d.settings.memory_write_approval);
        if (typeof d.settings?.skills_write_approval === 'boolean') setSkillApproval(d.settings.skills_write_approval);
        if (d.vault_status) setVaultStatus(d.vault_status);
      })
      .catch(() => {});
  }, [open]);

  const effectiveBindings = useMemo(
    () => resolveEffectiveBindings(settings.keymap.preset, settings.keymap.bindings),
    [settings.keymap.preset, settings.keymap.bindings]
  );

  const matchCounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const counts: Record<CategoryId, number> = {
      general: 0, appearance: 0, navigation: 0, keymap: 0, autosave: 0, performance: 0, eda: 0, tools: 0, agent: 0,
    };
    if (!q) return counts;
    const corpus: Record<CategoryId, string[]> = {
      general: ['default projects directory', 'startup', 'confirm delete', 'unsaved close', 'telemetry'],
      appearance: ['theme', 'matte charcoal', 'high contrast', 'neutral matte light', 'density', 'compact', 'standard', 'font size', 'status bar', 'hotkey hints', 'reduce motion'],
      navigation: ['mouse preset', 'blender', 'kicad', 'unity', 'scroll zoom', 'fov', 'units', 'mm', 'mil', 'nm', 'grid spacing', 'snap radius'],
      keymap: ['keymap', 'shortcut', 'bindings', 'conflict', ...KEYMAP_COMMANDS.map((c) => c.label.toLowerCase())],
      autosave: ['autosave', 'auto-save', 'interval', 'backup', 'crash recovery', 'undo cap'],
      performance: ['memory profile', 'duckdb', 'wasm', '3d rendering', 'pixel ratio', 'webgl', 'solver'],
      eda: ['fab rules', 'jlcpcb', 'pcb power india', 'stackup', 'currency', 'inr', 'usd', 'nrnd', 'eol'],
      tools: ['kicad-cli', 'ngspice', 'renode', 'typst', 'autorouter', 'padne', 'docker', 'ollama', 'python'],
      agent: ['dlp', 'airgap', 'agent mode', 'ollama', 'cost cap', 'mcp', 'plugin'],
    };
    for (const c of CATEGORIES) {
      counts[c.id] = corpus[c.id].filter((item) => item.includes(q)).length;
    }
    return counts;
  }, [search]);

  if (!open) return null;

  const q = search.trim().toLowerCase();

  return (
    <div
      className="vd-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Workstation Settings"
      data-testid="settings-modal"
      style={{ zIndex: 88 }}
      onKeyDown={(e) => {
        if (recordingCmdId) {
          e.preventDefault();
          e.stopPropagation();
          if (e.key === 'Escape') {
            setRecordingCmdId(null);
            return;
          }
          const combo = formatKeyboardEventCombo(e.nativeEvent);
          if (!combo) return;
          const conflicts = findShortcutConflicts(effectiveBindings, recordingCmdId, combo);
          if (conflicts.length > 0) {
            setConflictMsg(`Conflict: "${combo}" is already bound to ${conflicts.join(', ')}`);
          } else {
            setConflictMsg('');
          }
          void updateSettings({
            keymap: { bindings: { ...settings.keymap.bindings, [recordingCmdId]: combo } },
          });
          setRecordingCmdId(null);
          return;
        }
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        className="vd-modal-panel"
        style={{
          width: 'min(900px, 95vw)',
          height: 'min(620px, 90vh)',
          display: 'grid',
          gridTemplateRows: '40px 1fr',
          padding: 0,
          overflow: 'hidden',
        }}
      >
        {/* Top Search & Action Bar */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '0 10px',
            backgroundColor: 'var(--vd-bg-elevated)',
            borderBottom: '1px solid var(--vd-border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
            <VajraIcon name="settings" size={14} />
            <strong style={{ fontSize: 12 }}>Preferences</strong>
            <input
              type="text"
              data-testid="settings-search-input"
              className="vd-input"
              placeholder="Search settings (units, autosave, theme, keymap)..."
              value={search}
              onChange={(e) => {
                const next = e.target.value;
                setSearch(next);
                if (next.trim()) {
                  const lower = next.trim().toLowerCase();
                  if (lower.includes('unit') || lower.includes('grid')) setCat('navigation');
                  else if (lower.includes('autosave') || lower.includes('auto-save')) setCat('autosave');
                  else if (lower.includes('theme') || lower.includes('density')) setCat('appearance');
                  else if (lower.includes('key') || lower.includes('shortcut')) setCat('keymap');
                }
              }}
              style={{ width: 290 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button type="button" className="vd-btn" onClick={() => setShowImportBox((v) => !v)}>Import JSON</button>
            <button
              type="button"
              className="vd-btn"
              onClick={() => {
                const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'vajradhir-settings.json';
                a.click();
                URL.revokeObjectURL(url);
                pushNotification({ severity: 'info', title: 'Settings Exported', detail: 'Downloaded vajradhir-settings.json' });
              }}
            >
              Export JSON
            </button>
            <button type="button" data-testid="settings-reset-all-btn" className="vd-btn" onClick={() => void resetSettings()}>
              Reset All to Defaults
            </button>
            <button type="button" data-testid="settings-close-btn" className="vd-btn vd-btn-primary" onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        {/* Body */}
        <div style={{ display: 'grid', gridTemplateColumns: '205px 1fr', minHeight: 0 }}>
          <nav
            style={{
              backgroundColor: 'var(--vd-bg-workbench)',
              borderRight: '1px solid var(--vd-border-subtle)',
              padding: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              overflowY: 'auto',
            }}
          >
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                data-testid={c.legacyTestId}
                className={`vd-btn ${cat === c.id ? 'vd-btn-primary' : ''}`}
                style={{ justifyContent: 'space-between', minHeight: 26, fontSize: 11, padding: '2px 8px' }}
                onClick={() => setCat(c.id)}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</span>
                {q && matchCounts[c.id] > 0 && (
                  <span className="vd-metric" style={{ fontSize: 10 }}>{matchCounts[c.id]}</span>
                )}
              </button>
            ))}
          </nav>

          <div style={{ padding: 12, overflowY: 'auto', backgroundColor: 'var(--vd-bg-panel)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {showImportBox && (
              <div style={{ display: 'grid', gap: 6, padding: 8, backgroundColor: 'var(--vd-bg-canvas)', border: '1px solid var(--vd-border-strong)' }}>
                <textarea
                  rows={4}
                  className="vd-input vd-metric"
                  placeholder="Paste settings JSON..."
                  value={importDraft}
                  onChange={(e) => setImportDraft(e.target.value)}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                  <button type="button" className="vd-btn" onClick={() => setShowImportBox(false)}>Cancel</button>
                  <button
                    type="button"
                    className="vd-btn vd-btn-primary"
                    onClick={() => {
                      try {
                        const parsed = JSON.parse(importDraft) as GlobalSettings;
                        void importSettings(parsed);
                        setShowImportBox(false);
                      } catch {
                        pushNotification({ severity: 'error', title: 'Invalid Settings JSON', detail: 'JSON parse failed' });
                      }
                    }}
                  >
                    Apply JSON
                  </button>
                </div>
              </div>
            )}

            {cat === 'general' && (
              <>
                <SettingRow
                  label="Default Projects Directory"
                  modified={settings.general.defaultProjectsDir !== DEFAULT_GLOBAL_SETTINGS.general.defaultProjectsDir}
                  onReset={() => void updateSettings({ general: { defaultProjectsDir: DEFAULT_GLOBAL_SETTINGS.general.defaultProjectsDir } })}
                >
                  <input
                    className="vd-input vd-metric"
                    style={{ width: 220 }}
                    value={settings.general.defaultProjectsDir}
                    onChange={(e) => void updateSettings({ general: { defaultProjectsDir: e.target.value } })}
                  />
                  {onBrowseDir && (
                    <button type="button" className="vd-btn" onClick={() => onBrowseDir((p) => void updateSettings({ general: { defaultProjectsDir: p } }))}>
                      Browse...
                    </button>
                  )}
                </SettingRow>
                <SettingRow label="On Startup">
                  <select
                    className="vd-select"
                    value={settings.general.startupBehavior}
                    onChange={(e) => void updateSettings({ general: { startupBehavior: e.target.value } })}
                  >
                    <option value="workbench">Open Workbench Directly</option>
                    <option value="home">Open Enterprise Home Hub</option>
                    <option value="reopen_last">Reopen Last Project</option>
                  </select>
                </SettingRow>
                <SettingRow label="Confirm before deleting items">
                  <input type="checkbox" checked={settings.general.confirmBeforeDelete} onChange={(e) => void updateSettings({ general: { confirmBeforeDelete: e.target.checked } })} />
                </SettingRow>
                <SettingRow label="Confirm on unsaved project close">
                  <input type="checkbox" checked={settings.general.confirmUnsavedClose} onChange={(e) => void updateSettings({ general: { confirmUnsavedClose: e.target.checked } })} />
                </SettingRow>
                <SettingRow label="Privacy & Telemetry">
                  <span className="vd-pill" style={{ color: 'var(--vd-pass)' }}>Offline Local-First - Telemetry Permanently Disabled</span>
                </SettingRow>
              </>
            )}

            {cat === 'appearance' && (
              <>
                <SettingRow
                  label="Theme Variant"
                  modified={settings.appearance.theme !== DEFAULT_GLOBAL_SETTINGS.appearance.theme}
                  onReset={() => void updateSettings({ appearance: { theme: DEFAULT_GLOBAL_SETTINGS.appearance.theme } })}
                >
                  <select
                    data-testid="settings-theme-select"
                    className="vd-select"
                    value={settings.appearance.theme}
                    onChange={(e) => void updateSettings({ appearance: { theme: e.target.value as ThemeVariant } })}
                  >
                    <option value="matte_charcoal">Matte Charcoal (Default)</option>
                    <option value="high_contrast_dark">High-Contrast Dark</option>
                    <option value="neutral_matte_light">Neutral Matte Light</option>
                  </select>
                </SettingRow>
                <SettingRow
                  label="UI Density"
                  modified={settings.appearance.density !== DEFAULT_GLOBAL_SETTINGS.appearance.density}
                  onReset={() => void updateSettings({ appearance: { density: DEFAULT_GLOBAL_SETTINGS.appearance.density } })}
                >
                  <select
                    data-testid="settings-density-select"
                    className="vd-select"
                    value={settings.appearance.density}
                    onChange={(e) => void updateSettings({ appearance: { density: e.target.value as DensityMode } })}
                  >
                    <option value="standard">Standard (Default)</option>
                    <option value="compact">Compact (Dense 1080p)</option>
                    <option value="comfortable">Comfortable</option>
                  </select>
                </SettingRow>
                <SettingRow label="Interface Font Size (px)">
                  <input type="number" step={0.5} min={11} max={14} className="vd-input vd-metric" style={{ width: 64 }} value={settings.appearance.uiFontSizePx} onChange={(e) => void updateSettings({ appearance: { uiFontSizePx: Number(e.target.value) } })} />
                </SettingRow>
                <SettingRow label="Code / Data Mono Font Size (px)">
                  <input type="number" step={0.5} min={11} max={16} className="vd-input vd-metric" style={{ width: 64 }} value={settings.appearance.monoFontSizePx} onChange={(e) => void updateSettings({ appearance: { monoFontSizePx: Number(e.target.value) } })} />
                </SettingRow>
                <SettingRow label="Show Status Bar">
                  <input type="checkbox" checked={settings.appearance.showStatusBar} onChange={(e) => void updateSettings({ appearance: { showStatusBar: e.target.checked } })} />
                </SettingRow>
                <SettingRow label="Show Live Modal Hotkey Hint Bar">
                  <input type="checkbox" checked={settings.appearance.showHotkeyHints} onChange={(e) => void updateSettings({ appearance: { showHotkeyHints: e.target.checked } })} />
                </SettingRow>
                <SettingRow label="Reduce Motion">
                  <input type="checkbox" checked={settings.appearance.reduceMotion} onChange={(e) => void updateSettings({ appearance: { reduceMotion: e.target.checked } })} />
                </SettingRow>
                {onResetWorkspaceLayouts && (
                  <SettingRow label="Saved Dockview Layouts">
                    <button type="button" className="vd-btn" onClick={onResetWorkspaceLayouts}>Reset All Workspace Layouts</button>
                  </SettingRow>
                )}
              </>
            )}

            {cat === 'navigation' && (
              <>
                <SettingRow label="Mouse Navigation Preset">
                  <select className="vd-select" value={settings.navigation.mousePreset} onChange={(e) => void updateSettings({ navigation: { mousePreset: e.target.value as MousePreset } })}>
                    <option value="blender">Blender: MMB Orbit / Shift+MMB Pan</option>
                    <option value="kicad">KiCad / Altium: RMB Pan / Scroll Zoom</option>
                    <option value="unity">Unity / Unreal: Alt+LMB Orbit</option>
                    <option value="trackpad">Trackpad</option>
                  </select>
                </SettingRow>
                <SettingRow
                  label="Default Measurement Unit"
                  modified={settings.navigation.unit !== DEFAULT_GLOBAL_SETTINGS.navigation.unit}
                  onReset={() => void updateSettings({ navigation: { unit: DEFAULT_GLOBAL_SETTINGS.navigation.unit } })}
                >
                  <select
                    data-testid="settings-unit-select"
                    className="vd-select vd-metric"
                    value={settings.navigation.unit}
                    onChange={(e) => void updateSettings({ navigation: { unit: e.target.value } })}
                  >
                    <option value="mm">mm (Millimeters)</option>
                    <option value="mil">mil (Thousandths of Inch)</option>
                    <option value="nm">nm (Nanometers)</option>
                  </select>
                </SettingRow>
                <SettingRow label="Default Grid Spacing (mm)">
                  <select className="vd-select vd-metric" value={settings.navigation.gridMm} onChange={(e) => void updateSettings({ navigation: { gridMm: Number(e.target.value) } })}>
                    <option value={0.1}>0.10 mm</option>
                    <option value={0.25}>0.25 mm</option>
                    <option value={0.5}>0.50 mm</option>
                    <option value={1.0}>1.00 mm</option>
                    <option value={2.54}>2.54 mm</option>
                  </select>
                </SettingRow>
                <SettingRow label="Magnetic Snap Radius (px)">
                  <input type="number" min={2} max={32} className="vd-input vd-metric" style={{ width: 64 }} value={settings.navigation.snapRadiusPx} onChange={(e) => void updateSettings({ navigation: { snapRadiusPx: Number(e.target.value) } })} />
                </SettingRow>
                <SettingRow label="3D Camera FOV (deg)">
                  <input type="number" min={30} max={75} className="vd-input vd-metric" style={{ width: 64 }} value={settings.navigation.fovDeg} onChange={(e) => void updateSettings({ navigation: { fovDeg: Number(e.target.value) } })} />
                </SettingRow>
                <SettingRow label="Invert Scroll Zoom">
                  <input type="checkbox" checked={settings.navigation.invertScrollZoom} onChange={(e) => void updateSettings({ navigation: { invertScrollZoom: e.target.checked } })} />
                </SettingRow>
                <SettingRow label="Zoom Toward Cursor">
                  <input type="checkbox" checked={settings.navigation.zoomToCursor} onChange={(e) => void updateSettings({ navigation: { zoomToCursor: e.target.checked } })} />
                </SettingRow>
              </>
            )}

            {cat === 'keymap' && (
              <>
                <SettingRow label="Keymap Preset">
                  <select className="vd-select" value={settings.keymap.preset} onChange={(e) => void updateSettings({ keymap: { preset: e.target.value as KeymapPreset } })}>
                    <option value="vajra">Vajra Default</option>
                    <option value="kicad">KiCad-Style</option>
                    <option value="blender">Blender-Style</option>
                    <option value="altium">Altium-Style</option>
                  </select>
                </SettingRow>
                {conflictMsg && (
                  <div data-testid="keymap-conflict-warning" role="alert" className="vd-metric" style={{ padding: 6, border: '1px solid var(--vd-warn)', color: 'var(--vd-warn)', fontSize: 11 }}>
                    {conflictMsg}
                  </div>
                )}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--vd-text-secondary)', borderBottom: '1px solid var(--vd-border-subtle)' }}>
                      <th style={{ padding: '4px 6px' }}>Command</th>
                      <th style={{ padding: '4px 6px' }}>Category</th>
                      <th style={{ padding: '4px 6px' }}>Shortcut</th>
                      <th style={{ padding: '4px 6px', textAlign: 'right' }}>Reset</th>
                    </tr>
                  </thead>
                  <tbody>
                    {KEYMAP_COMMANDS.map((cmd) => (
                      <tr key={cmd.id} style={{ borderBottom: '1px solid var(--vd-border-subtle)' }}>
                        <td style={{ padding: '4px 6px' }}>{cmd.label}</td>
                        <td style={{ padding: '4px 6px', color: 'var(--vd-text-muted)' }}>{cmd.category}</td>
                        <td style={{ padding: '4px 6px' }}>
                          <button
                            type="button"
                            data-testid={`keymap-bind-${cmd.id}`}
                            className={`vd-btn vd-metric ${recordingCmdId === cmd.id ? 'vd-btn-primary' : ''}`}
                            onClick={() => setRecordingCmdId(cmd.id)}
                          >
                            {recordingCmdId === cmd.id ? 'Press keys...' : effectiveBindings[cmd.id]}
                          </button>
                        </td>
                        <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                          <button
                            type="button"
                            data-testid={`keymap-reset-${cmd.id}`}
                            className="vd-btn"
                            onClick={() => {
                              const next = { ...settings.keymap.bindings };
                              delete next[cmd.id];
                              setConflictMsg('');
                              void updateSettings({ keymap: { bindings: next } });
                            }}
                          >
                            Reset
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {cat === 'autosave' && (
              <>
                <SettingRow label="Enable Auto-Save">
                  <input type="checkbox" checked={settings.autosave.enabled} onChange={(e) => void updateSettings({ autosave: { enabled: e.target.checked } })} />
                </SettingRow>
                <SettingRow
                  label="Auto-Save Interval (seconds)"
                  modified={settings.autosave.intervalSec !== DEFAULT_GLOBAL_SETTINGS.autosave.intervalSec}
                  onReset={() => void updateSettings({ autosave: { intervalSec: DEFAULT_GLOBAL_SETTINGS.autosave.intervalSec } })}
                >
                  <select
                    data-testid="settings-autosave-select"
                    className="vd-select vd-metric"
                    value={settings.autosave.intervalSec}
                    onChange={(e) => void updateSettings({ autosave: { intervalSec: Number(e.target.value) } })}
                  >
                    <option value={30}>30s</option>
                    <option value={60}>60s</option>
                    <option value={300}>300s</option>
                  </select>
                </SettingRow>
                <SettingRow label="Rolling Backup Count">
                  <input type="number" min={5} max={50} className="vd-input vd-metric" style={{ width: 64 }} value={settings.autosave.rollingBackupCount} onChange={(e) => void updateSettings({ autosave: { rollingBackupCount: Number(e.target.value) } })} />
                </SettingRow>
                <SettingRow label="Crash-Recovery Dirty Buffer">
                  <input type="checkbox" checked={settings.autosave.crashRecovery} onChange={(e) => void updateSettings({ autosave: { crashRecovery: e.target.checked } })} />
                </SettingRow>
                <SettingRow label="Undo Stack Memory Cap">
                  <input type="number" min={25} max={200} className="vd-input vd-metric" style={{ width: 64 }} value={settings.autosave.undoCap} onChange={(e) => void updateSettings({ autosave: { undoCap: Number(e.target.value) } })} />
                </SettingRow>
              </>
            )}

            {cat === 'performance' && (
              <>
                <SettingRow label="Memory Profile">
                  <select className="vd-select" value={settings.performance.memoryProfile} onChange={(e) => void updateSettings({ performance: { memoryProfile: e.target.value } })}>
                    <option value="laptop_8gb">Laptop 8 GB</option>
                    <option value="workstation_16gb">Workstation 16 GB+</option>
                  </select>
                </SettingRow>
                <SettingRow label="DuckDB Memory Limit (MB)">
                  <select className="vd-select vd-metric" value={settings.performance.duckdbLimitMb} onChange={(e) => void updateSettings({ performance: { duckdbLimitMb: Number(e.target.value) } })}>
                    <option value={128}>128 MB</option>
                    <option value={256}>256 MB</option>
                    <option value={512}>512 MB</option>
                  </select>
                </SettingRow>
                <SettingRow label="WASM Worker Idle Terminate (s)">
                  <select className="vd-select vd-metric" value={settings.performance.wasmIdleSec} onChange={(e) => void updateSettings({ performance: { wasmIdleSec: Number(e.target.value) } })}>
                    <option value={3}>3s</option>
                    <option value={5}>5s</option>
                    <option value={15}>15s</option>
                  </select>
                </SettingRow>
                <SettingRow label="Max Pixel Ratio">
                  <select className="vd-select vd-metric" value={settings.performance.maxPixelRatio} onChange={(e) => void updateSettings({ performance: { maxPixelRatio: Number(e.target.value) } })}>
                    <option value={1.0}>1.0</option>
                    <option value={1.25}>1.25</option>
                    <option value={1.5}>1.5</option>
                  </select>
                </SettingRow>
                <SettingRow label="Max Active WebGL Contexts">
                  <select className="vd-select vd-metric" value={settings.performance.maxWebglContexts} onChange={(e) => void updateSettings({ performance: { maxWebglContexts: Number(e.target.value) } })}>
                    <option value={2}>2</option>
                    <option value={4}>4</option>
                  </select>
                </SettingRow>
                <SettingRow label="On-Demand 3D Rendering">
                  <input type="checkbox" checked={settings.performance.onDemand3d} onChange={(e) => void updateSettings({ performance: { onDemand3d: e.target.checked } })} />
                </SettingRow>
                <SettingRow label="Background Solver Auto-Recalc">
                  <select className="vd-select" value={settings.performance.solverRecalc} onChange={(e) => void updateSettings({ performance: { solverRecalc: e.target.value } })}>
                    <option value="debounced">Debounced Auto</option>
                    <option value="manual">Manual Only</option>
                  </select>
                </SettingRow>
              </>
            )}

            {cat === 'eda' && (
              <>
                <SettingRow label="Default Fab Profile">
                  <select className="vd-select" value={settings.eda.fabProfile} onChange={(e) => void updateSettings({ eda: { fabProfile: e.target.value } })}>
                    <option value="pcb_power_india">PCB Power India</option>
                    <option value="lioncircuits">LionCircuits</option>
                    <option value="jlcpcb_2l">JLCPCB 2L</option>
                    <option value="jlcpcb_4l">JLCPCB 4L</option>
                    <option value="pcbway_4l">PCBWay</option>
                    <option value="hand_solder">Hand-Solder Prototype</option>
                  </select>
                </SettingRow>
                <SettingRow label="Default Board Stackup">
                  <select className="vd-select" value={settings.eda.stackup} onChange={(e) => void updateSettings({ eda: { stackup: e.target.value } })}>
                    <option value="2l_16mm">2-Layer 1.6mm</option>
                    <option value="4l_jlc04161h">4-Layer JLC04161H-7628</option>
                    <option value="6l_std">6-Layer Standard</option>
                  </select>
                </SettingRow>
                <SettingRow label="BOM Display Currency">
                  <select className="vd-select vd-metric" value={settings.eda.bomCurrency} onChange={(e) => void updateSettings({ eda: { bomCurrency: e.target.value } })}>
                    <option value="INR">INR</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </SettingRow>
                <SettingRow label="Warn on NRND / EOL Parts">
                  <input type="checkbox" checked={settings.eda.warnNrndEol} onChange={(e) => void updateSettings({ eda: { warnNrndEol: e.target.checked } })} />
                </SettingRow>
              </>
            )}

            {cat === 'tools' && (
              <>
                {([
                  ['kicadCli', 'kicad-cli'],
                  ['ngspice', 'ngspice'],
                  ['renode', 'renode'],
                  ['typst', 'typst'],
                  ['autorouter', 'autorouter'],
                  ['padne', 'padne'],
                  ['docker', 'docker'],
                  ['ollama', 'ollama'],
                  ['pythonVenv', 'Python worker venv'],
                ] as const).map(([key, label]) => (
                  <SettingRow key={key} label={label}>
                    <input
                      className="vd-input vd-metric"
                      style={{ width: 240 }}
                      placeholder="Auto-detect from PATH"
                      value={settings.tools[key]}
                      onChange={(e) => void updateSettings({ tools: { [key]: e.target.value } })}
                    />
                  </SettingRow>
                ))}
              </>
            )}

            {cat === 'agent' && (
              <>
                <SettingRow label="AI Provider (Hermes-Core BYOK)">
                  <select
                    data-testid="settings-byok-provider"
                    className="vd-select vd-metric"
                    value={byokProvider}
                    onChange={(e) => {
                      const next = e.target.value;
                      setByokProvider(next);
                      void fetch('/api/v1/agent/settings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ provider: next }),
                      });
                    }}
                  >
                    <option value="deterministic_offline">Offline Planner ($0 Airgap)</option>
                    <option value="ollama">Ollama (Loopback 127.0.0.1)</option>
                    <option value="openai">OpenAI (BYOK)</option>
                    <option value="anthropic">Anthropic Claude (BYOK)</option>
                    <option value="gemini">Google Gemini (BYOK)</option>
                    <option value="openrouter">OpenRouter (BYOK)</option>
                    <option value="nous">Nous Portal (BYOK)</option>
                    <option value="nvidia_nim">NVIDIA NIM (BYOK)</option>
                    <option value="custom">Custom Endpoint</option>
                  </select>
                </SettingRow>
                <SettingRow label="Model Identifier">
                  <input
                    className="vd-input vd-metric"
                    style={{ width: 220 }}
                    value={byokModel}
                    onChange={(e) => setByokModel(e.target.value)}
                    onBlur={() =>
                      void fetch('/api/v1/agent/settings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ model: byokModel, base_url: byokBaseUrl }),
                      })
                    }
                  />
                </SettingRow>
                <SettingRow label={`API Key Vault (${vaultStatus[byokProvider]?.configured ? vaultStatus[byokProvider].masked : 'Not Set'})`}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input
                      data-testid="settings-byok-key-input"
                      type="password"
                      placeholder="Paste BYOK key (never logged)"
                      className="vd-input vd-metric"
                      style={{ width: 190 }}
                      value={byokKeyDraft}
                      onChange={(e) => setByokKeyDraft(e.target.value)}
                    />
                    <button
                      type="button"
                      data-testid="settings-byok-save-btn"
                      className="vd-btn vd-btn-primary"
                      onClick={async () => {
                        const res = await fetch('/api/v1/agent/vault', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ provider: byokProvider, api_key: byokKeyDraft }),
                        });
                        const data = await res.json();
                        setByokKeyDraft('');
                        if (res.ok) {
                          setVaultStatus((prev) => ({ ...prev, [byokProvider]: { configured: Boolean(data.configured), masked: String(data.masked || '') } }));
                          setConnStatus(`Saved to ${data.backend || 'vault'} (${data.masked || 'cleared'})`);
                        }
                      }}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      data-testid="settings-byok-test-btn"
                      className="vd-btn"
                      onClick={async () => {
                        const res = await fetch('/api/v1/agent/test-connection', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            provider: byokProvider,
                            model: byokModel,
                            base_url: byokBaseUrl,
                            dlp_tier: settings.agent.dlpMode,
                          }),
                        });
                        const data = await res.json();
                        setConnStatus(String(data.message || (data.ok ? 'Connected' : 'Blocked')));
                      }}
                    >
                      Test Connection
                    </button>
                  </div>
                </SettingRow>
                {connStatus && (
                  <div data-testid="settings-byok-status" className="vd-metric" style={{ padding: '4px 8px', fontSize: 11, color: '#93C5FD' }}>
                    {connStatus}
                  </div>
                )}
                <SettingRow label="Require Approval Before Saving Agent Memory">
                  <input
                    type="checkbox"
                    checked={memApproval}
                    onChange={(e) => {
                      const v = e.target.checked;
                      setMemApproval(v);
                      void fetch('/api/v1/agent/settings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ memory_write_approval: v }),
                      });
                    }}
                  />
                </SettingRow>
                <SettingRow label="Require Approval Before Saving EE Skills">
                  <input
                    type="checkbox"
                    checked={skillApproval}
                    onChange={(e) => {
                      const v = e.target.checked;
                      setSkillApproval(v);
                      void fetch('/api/v1/agent/settings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ skills_write_approval: v }),
                      });
                    }}
                  />
                </SettingRow>
                <SettingRow label="Default Privacy / Network Policy">
                  <select className="vd-select vd-metric" value={settings.agent.dlpMode} onChange={(e) => void updateSettings({ agent: { dlpMode: e.target.value } })}>
                    <option value="NDA_AIRGAPPED">NDA_AIRGAPPED (Loopback Only)</option>
                    <option value="PRIVATE_CLOUD_OK">PRIVATE_CLOUD_OK</option>
                    <option value="PUBLIC_OPEN">PUBLIC_OPEN</option>
                  </select>
                </SettingRow>
                <SettingRow label="Default Agent Mode">
                  <select className="vd-select" value={settings.agent.agentMode} onChange={(e) => void updateSettings({ agent: { agentMode: e.target.value } })}>
                    <option value="off">Off (Manual Only)</option>
                    <option value="copilot">Copilot (Ghost Proposals)</option>
                    <option value="autonomous">Autonomous (Gated)</option>
                  </select>
                </SettingRow>
                <SettingRow label="Local Ollama Endpoint">
                  <input className="vd-input vd-metric" style={{ width: 220 }} value={settings.agent.ollamaEndpoint} onChange={(e) => void updateSettings({ agent: { ollamaEndpoint: e.target.value } })} />
                </SettingRow>
                <SettingRow label="Session Cost Cap (USD)">
                  <input type="number" step={0.5} className="vd-input vd-metric" style={{ width: 72 }} value={settings.agent.sessionCostCapUsd} onChange={(e) => void updateSettings({ agent: { sessionCostCapUsd: Number(e.target.value) } })} />
                </SettingRow>
                <SettingRow label="Live MCP Server URL">
                  <span className="vd-metric">{settings.agent.mcpUrl}</span>
                  <button
                    type="button"
                    className="vd-btn"
                    onClick={() => {
                      void navigator.clipboard?.writeText(
                        JSON.stringify({ mcpServers: { 'vajra-dhir': { url: settings.agent.mcpUrl } } }, null, 2)
                      ).catch(() => {});
                      pushNotification({ severity: 'info', title: 'Copied MCP Client JSON', detail: settings.agent.mcpUrl });
                    }}
                  >
                    Copy MCP Client JSON
                  </button>
                </SettingRow>
                <SettingRow label="Plugin Capability Policy">
                  <select className="vd-select" value={settings.agent.pluginPolicy} onChange={(e) => void updateSettings({ agent: { pluginPolicy: e.target.value } })}>
                    <option value="ask_first">Ask on First Enable</option>
                    <option value="strict_sandbox">Strict Sandbox Only</option>
                  </select>
                </SettingRow>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
