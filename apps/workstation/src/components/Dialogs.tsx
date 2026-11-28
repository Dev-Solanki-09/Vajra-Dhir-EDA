import React, { useEffect, useState } from 'react';
import { KEYMAP_COMMANDS, resolveEffectiveBindings } from '../store/useKeymap';
import { ProjectSettings, useSettingsStore } from '../store/useSettingsStore';
import { FloatingWindow } from './FloatingWindow';
import { VajraIcon } from './VajraIcons';

export const ConfirmDialog: React.FC<{
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, onCancel }) => {
  if (!open) return null;
  return (
    <div className="vd-modal-backdrop" role="dialog" aria-modal="true" aria-label={title} data-testid="confirm-dialog">
      <div className="vd-modal-panel" style={{ maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <strong style={{ fontSize: 12.5 }}>{title}</strong>
          <button type="button" className="vd-btn vd-btn-icon" onClick={onCancel}><VajraIcon name="close" size={12} /></button>
        </div>
        <p style={{ margin: '0 0 12px', color: 'var(--vd-text-secondary)', fontSize: 11.5 }}>{message}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
          <button type="button" className="vd-btn" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className="vd-btn vd-btn-primary" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
};

export const UnsavedGuardDialog: React.FC<{
  open: boolean;
  projectName: string;
  onSaveAndContinue: () => void;
  onDiscardAndContinue: () => void;
  onCancel: () => void;
}> = ({ open, projectName, onSaveAndContinue, onDiscardAndContinue, onCancel }) => {
  if (!open) return null;
  return (
    <div className="vd-modal-backdrop" role="dialog" aria-modal="true" aria-label="Unsaved Changes" data-testid="unsaved-guard-dialog">
      <div className="vd-modal-panel" style={{ maxWidth: 460 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <strong style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <VajraIcon name="warningTriangle" size={14} color="var(--vd-warn)" /> Unsaved Changes
          </strong>
          <button type="button" className="vd-btn vd-btn-icon" onClick={onCancel}><VajraIcon name="close" size={12} /></button>
        </div>
        <p style={{ margin: '0 0 12px', color: 'var(--vd-text-secondary)', fontSize: 11.5 }}>
          Project <span className="vd-metric">{projectName}</span> has uncommitted edits. Save before leaving?
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
          <button type="button" data-testid="unsaved-cancel-btn" className="vd-btn" onClick={onCancel}>Cancel</button>
          <button type="button" data-testid="unsaved-discard-btn" className="vd-btn" onClick={onDiscardAndContinue}>Discard Changes</button>
          <button type="button" data-testid="unsaved-save-btn" className="vd-btn vd-btn-primary" onClick={onSaveAndContinue}>Save &amp; Continue</button>
        </div>
      </div>
    </div>
  );
};

export const InputPromptDialog: React.FC<{
  open: boolean;
  title: string;
  label: string;
  initialValue?: string;
  confirmLabel?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}> = ({ open, title, label, initialValue = '', confirmLabel = 'OK', onSubmit, onCancel }) => {
  const [val, setVal] = useState(initialValue);
  useEffect(() => {
    if (open) setVal(initialValue);
  }, [open, initialValue]);
  if (!open) return null;
  return (
    <div className="vd-modal-backdrop" role="dialog" aria-modal="true" aria-label={title} data-testid="input-prompt-dialog">
      <div className="vd-modal-panel" style={{ maxWidth: 400 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <strong style={{ fontSize: 12.5 }}>{title}</strong>
          <button type="button" className="vd-btn vd-btn-icon" onClick={onCancel}><VajraIcon name="close" size={12} /></button>
        </div>
        <label style={{ display: 'grid', gap: 4, fontSize: 11, marginBottom: 10 }}>
          <span>{label}</span>
          <input
            type="text"
            autoFocus
            className="vd-input"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && val.trim()) onSubmit(val.trim());
              if (e.key === 'Escape') onCancel();
            }}
          />
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
          <button type="button" className="vd-btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="vd-btn vd-btn-primary" onClick={() => val.trim() && onSubmit(val.trim())}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
};

export const ProjectSettingsDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const proj = useSettingsStore((s) => s.projectSettings);
  const updateProjectSettings = useSettingsStore((s) => s.updateProjectSettings);
  const [draft, setDraft] = useState<ProjectSettings>(proj);

  useEffect(() => {
    if (open) setDraft(proj);
  }, [open, proj]);

  if (!open) return null;

  return (
    <div className="vd-modal-backdrop" role="dialog" aria-modal="true" aria-label="Project Settings" data-testid="project-settings-modal">
      <div className="vd-modal-panel" style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, borderBottom: '1px solid var(--vd-border-subtle)', paddingBottom: 6 }}>
          <strong style={{ fontSize: 13 }}>Project Settings (project.vd.json)</strong>
          <button type="button" className="vd-btn vd-btn-icon" onClick={onClose}><VajraIcon name="close" size={12} /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11 }}>
          <label style={{ display: 'grid', gap: 3 }}>
            <span>Project Name</span>
            <input data-testid="proj-settings-name" className="vd-input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label style={{ display: 'grid', gap: 3 }}>
            <span>Revision</span>
            <input data-testid="proj-settings-revision" className="vd-input vd-metric" value={draft.revision} onChange={(e) => setDraft({ ...draft, revision: e.target.value })} />
          </label>
          <label style={{ display: 'grid', gap: 3 }}>
            <span>Author</span>
            <input className="vd-input" value={draft.author} onChange={(e) => setDraft({ ...draft, author: e.target.value })} />
          </label>
          <label style={{ display: 'grid', gap: 3 }}>
            <span>Organization</span>
            <input className="vd-input" value={draft.organization} onChange={(e) => setDraft({ ...draft, organization: e.target.value })} />
          </label>
          <label style={{ display: 'grid', gap: 3 }}>
            <span>Solder Mask Color</span>
            <select
              data-testid="proj-settings-soldermask"
              className="vd-select"
              value={draft.solderMaskColor}
              onChange={(e) => setDraft({ ...draft, solderMaskColor: e.target.value as ProjectSettings['solderMaskColor'] })}
            >
              <option value="Green">Green</option>
              <option value="Matte Black">Matte Black</option>
              <option value="Blue">Blue</option>
              <option value="Red">Red</option>
              <option value="White">White</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 3 }}>
            <span>Surface Finish</span>
            <select className="vd-select" value={draft.surfaceFinish} onChange={(e) => setDraft({ ...draft, surfaceFinish: e.target.value as ProjectSettings['surfaceFinish'] })}>
              <option value="ENIG">ENIG (Gold)</option>
              <option value="HASL">HASL Lead-Free</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 3 }}>
            <span>Board Thickness (mm)</span>
            <input type="number" step={0.2} className="vd-input vd-metric" value={draft.boardThicknessMm} onChange={(e) => setDraft({ ...draft, boardThicknessMm: Number(e.target.value) })} />
          </label>
          <label style={{ display: 'grid', gap: 3 }}>
            <span>Copper Weight</span>
            <select className="vd-select" value={draft.copperWeightOz} onChange={(e) => setDraft({ ...draft, copperWeightOz: e.target.value })}>
              <option value="1 oz">1 oz</option>
              <option value="2 oz">2 oz</option>
            </select>
          </label>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 11 }}>
          <input type="checkbox" checked={draft.dlpLock} onChange={(e) => setDraft({ ...draft, dlpLock: e.target.checked })} />
          <span>Enforce Project DLP Lock ({draft.dlpClass}) — prevents global settings from relaxing airgap</span>
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 12 }}>
          <button type="button" className="vd-btn" onClick={onClose}>Cancel</button>
          <button
            type="button"
            data-testid="proj-settings-save-btn"
            className="vd-btn vd-btn-primary"
            onClick={() => {
              void updateProjectSettings(draft);
              onClose();
            }}
          >
            Save project.vd.json
          </button>
        </div>
      </div>
    </div>
  );
};

export const ShortcutsModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const keymap = useSettingsStore((s) => s.settings.keymap);
  const [query, setQuery] = useState('');
  if (!open) return null;
  const effective = resolveEffectiveBindings(keymap.preset, keymap.bindings);
  const rows = KEYMAP_COMMANDS.filter(
    (c) => !query.trim() || c.label.toLowerCase().includes(query.toLowerCase()) || c.category.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="vd-modal-backdrop" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" data-testid="shortcuts-modal">
      <div className="vd-modal-panel" style={{ maxWidth: 680 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <strong>Keyboard shortcuts ({rows.length} active · 18 commands synced · Preset: {keymap.preset})</strong>
          <button type="button" className="vd-btn" onClick={onClose}>Close</button>
        </div>
        <input
          type="text"
          className="vd-input"
          placeholder="Filter shortcuts..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: '100%', marginBottom: 8 }}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
          {rows.map((cmd) => (
            <div key={cmd.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 6px', borderBottom: '1px solid var(--vd-border-subtle)', fontSize: 11 }}>
              <span>{cmd.label}</span>
              <span className="vd-metric" style={{ color: 'var(--vd-border-active)' }}>{effective[cmd.id]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const ActivityLogModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const logs = useSettingsStore((s) => s.activityLog);
  const [filter, setFilter] = useState<'ALL' | 'INFO' | 'WARN' | 'ERROR'>('ALL');
  if (!open) return null;
  const visible = logs.filter((l) => filter === 'ALL' || l.level === filter);

  return (
    <div className="vd-modal-backdrop" role="dialog" aria-modal="true" aria-label="Activity and Audit Log" data-testid="activity-log-modal">
      <div className="vd-modal-panel" style={{ maxWidth: 680 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <strong>Activity &amp; Audit Log</strong>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['ALL', 'INFO', 'WARN', 'ERROR'] as const).map((lvl) => (
              <button key={lvl} type="button" className={`vd-btn ${filter === lvl ? 'vd-btn-primary' : ''}`} onClick={() => setFilter(lvl)}>{lvl}</button>
            ))}
            <button type="button" className="vd-btn" onClick={onClose}>Close</button>
          </div>
        </div>
        <div style={{ maxHeight: 340, overflowY: 'auto', display: 'grid', gap: 4 }}>
          {visible.map((l) => (
            <div key={l.id} className="vd-metric" style={{ padding: '4px 6px', backgroundColor: 'var(--vd-bg-canvas)', border: '1px solid var(--vd-border-subtle)', fontSize: 10.5 }}>
              <span style={{ color: l.level === 'ERROR' ? 'var(--vd-fail)' : l.level === 'WARN' ? 'var(--vd-warn)' : 'var(--vd-pass)' }}>[{l.level}]</span>{' '}
              <span style={{ color: 'var(--vd-text-muted)' }}>{l.source}</span> — {l.message}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const AboutModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [tab, setTab] = useState<'info' | 'notices'>('info');
  const [copied, setCopied] = useState(false);
  if (!open) return null;

  return (
    <div className="vd-modal-backdrop" role="dialog" aria-modal="true" aria-label="About Vajra-Dhir EDA" data-testid="about-modal">
      <div className="vd-modal-panel" style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <strong>About Vajra-Dhīr EDA v0.0.5</strong>
          <button type="button" className="vd-btn" onClick={onClose}>Close</button>
        </div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
          <button type="button" className={`vd-btn ${tab === 'info' ? 'vd-btn-primary' : ''}`} onClick={() => setTab('info')}>System Info</button>
          <button type="button" className={`vd-btn ${tab === 'notices' ? 'vd-btn-primary' : ''}`} onClick={() => setTab('notices')}>Third-Party Notices &amp; Licenses</button>
        </div>
        {tab === 'info' ? (
          <div className="vd-metric" style={{ display: 'grid', gap: 6, fontSize: 11, backgroundColor: 'var(--vd-bg-canvas)', padding: 10, border: '1px solid var(--vd-border-subtle)' }}>
            <div>Version: 0.0.5 (Architecture Frozen · Milestone 1)</div>
            <div>Ring 1 License: Apache-2.0 / MIT (Zero AGPL/EUPL in Core)</div>
            <div>Engine: Deterministic SQLite WAL (i64 nm, i32 mdeg, UUIDv7)</div>
            <div>Security Floors: Wasmtime 51.0.0 · React 19.3.1 · TypeScript 7.0.2</div>
            <button
              type="button"
              className="vd-btn"
              style={{ justifySelf: 'start', marginTop: 4 }}
              onClick={() => {
                void navigator.clipboard?.writeText('Vajra-Dhir EDA v0.0.5 | Apache-2.0 | Wasmtime 51 | React 19.3.1 | 127.0.0.1:41900').catch(() => {});
                setCopied(true);
              }}
            >
              {copied ? 'Copied System Info' : 'Copy System Info'}
            </button>
          </div>
        ) : (
          <div className="vd-metric" style={{ fontSize: 10.5, display: 'grid', gap: 6, backgroundColor: 'var(--vd-bg-canvas)', padding: 10, border: '1px solid var(--vd-border-subtle)' }}>
            <div>Repository: Apache License 2.0 (NOTICE &amp; docs/LICENSE_EXCEPTIONS.md)</div>
            <div>Isolated Runtime Exceptions: elkjs (EPL-2.0 unmodified npm), occt-import-js (LGPL-2.1-with-OCCT-exception Web Worker)</div>
            <div>Ring 2 External Subprocesses: KiCad, KiKit, openEMS, ElmerFEM, CalculiX, LibreLane, Renode (zero-egress isolated)</div>
          </div>
        )}
      </div>
    </div>
  );
};

export const StackupCalculatorWindow: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [traceWidthMm, setTraceWidthMm] = useState(0.18);
  const [dielectricMm, setDielectricMm] = useState(0.11);
  const [er, setEr] = useState(4.2);
  // Microstrip approximate Z0
  const z0 = (87 / Math.sqrt(er + 1.41)) * Math.log((5.98 * dielectricMm) / (0.8 * traceWidthMm + 0.035));

  return (
    <FloatingWindow open={open} title="Layer Stackup & Impedance Calculator" onClose={onClose} data-testid="floating-stackup-window" initialWidth={380}>
      <div style={{ display: 'grid', gap: 8, fontSize: 11 }}>
        <label style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Trace Width (mm)</span>
          <input type="number" step={0.01} className="vd-input vd-metric" style={{ width: 80 }} value={traceWidthMm} onChange={(e) => setTraceWidthMm(Number(e.target.value) || 0.1)} />
        </label>
        <label style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Prepreg Height (mm)</span>
          <input type="number" step={0.01} className="vd-input vd-metric" style={{ width: 80 }} value={dielectricMm} onChange={(e) => setDielectricMm(Number(e.target.value) || 0.05)} />
        </label>
        <label style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Substrate Dk (er)</span>
          <input type="number" step={0.1} className="vd-input vd-metric" style={{ width: 80 }} value={er} onChange={(e) => setEr(Number(e.target.value) || 4.0)} />
        </label>
        <div className="vd-metric" style={{ padding: 8, backgroundColor: 'var(--vd-bg-canvas)', border: '1px solid var(--vd-border-subtle)' }}>
          Estimated Microstrip Z0: <strong>{Number.isFinite(z0) ? z0.toFixed(1) : '50.0'} Ohm</strong>
        </div>
      </div>
    </FloatingWindow>
  );
};
