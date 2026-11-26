import React, { Suspense, useState } from 'react';
import { globalCrossProbeBus } from '@vajradhir/crossprobe-bus';
import { useDesignStore } from '../store/useDesignStore';
import { VajraIcon } from './VajraIcons';

const LazyTerminalPanel = React.lazy(() => import('./TerminalPanel').then((m) => ({ default: m.TerminalPanel })));
const LazyComponentLibraryPanel = React.lazy(() => import('./ComponentLibraryPanel').then((m) => ({ default: m.ComponentLibraryPanel })));
const LazyUplotScope = React.lazy(() => import('./UplotScope').then((m) => ({ default: m.UplotScope })));
const LazyVcdWaveformViewer = React.lazy(() => import('./VcdWaveformViewer').then((m) => ({ default: m.VcdWaveformViewer })));

export type BottomDrawerTab = 'diagnostics' | 'library' | 'simulation' | 'terminal' | 'history';

export interface DiagnosticRow {
  id: string;
  severity: 'error' | 'warn' | 'info';
  domain: 'ERC' | 'DRC' | 'Physics' | 'Co-Sim';
  entity: string;
  cause: string;
  fix: string;
}

const DEFAULT_DIAGNOSTICS: DiagnosticRow[] = [
  { id: 'd1', severity: 'warn', domain: 'Physics', entity: 'L1', cause: 'MLCC DC-bias derating margin 18% at 12V VBUS', fix: 'Verify 25V X7R rating' },
  { id: 'd2', severity: 'info', domain: 'DRC', entity: 'U2', cause: 'Human lock active on buck regulator U2', fix: 'Protected by KERNEL_LOCK_VIOLATION' },
];

export const BottomDrawer: React.FC<{
  open: boolean;
  activeTab: BottomDrawerTab;
  onSelectTab: (tab: BottomDrawerTab) => void;
  onClose: () => void;
  onFocusEntity: (refdes: string) => void;
}> = ({ open, activeTab, onSelectTab, onClose, onFocusEntity }) => {
  const [diagFilter, setDiagFilter] = useState<'all' | 'error' | 'warn' | 'Physics' | 'Co-Sim'>('all');
  const revId = useDesignStore((s) => s.revId);
  const undoTx = useDesignStore((s) => s.undoTx);
  const redoTx = useDesignStore((s) => s.redoTx);

  if (!open) return null;

  const filteredDiags = DEFAULT_DIAGNOSTICS.filter((d) => {
    if (diagFilter === 'all') return true;
    if (diagFilter === 'error' || diagFilter === 'warn') return d.severity === diagFilter;
    return d.domain === diagFilter;
  });

  const tabs: Array<{ id: BottomDrawerTab; label: string; icon: 'diagnosticsShield' | 'libraryGrid' | 'oscilloscope' | 'terminalPrompt' | 'historyClock' }> = [
    { id: 'diagnostics', label: 'Diagnostics', icon: 'diagnosticsShield' },
    { id: 'library', label: 'Library', icon: 'libraryGrid' },
    { id: 'simulation', label: 'Simulation', icon: 'oscilloscope' },
    { id: 'terminal', label: 'Terminal', icon: 'terminalPrompt' },
    { id: 'history', label: 'History', icon: 'historyClock' },
  ];

  return (
    <section className="vd-bottom-drawer" data-testid="zone4-bottom-drawer" aria-label="Bottom Utility Drawer">
      <div className="vd-bottom-drawer-tabs">
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              data-testid={`bottom-tab-${t.id}`}
              className={`vd-ws-tab ${activeTab === t.id ? 'vd-active' : ''}`}
              data-active={activeTab === t.id}
              style={{ height: 26 }}
              onClick={() => onSelectTab(t.id)}
            >
              <VajraIcon name={t.icon} size={12} /> {t.label}
            </button>
          ))}
        </div>
        <button type="button" data-testid="bottom-drawer-close-btn" className="vd-btn vd-btn-icon" style={{ minHeight: 18 }} onClick={onClose} title="Collapse Bottom Drawer (Ctrl+`)">
          <VajraIcon name="close" size={11} />
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 8 }}>
        {activeTab === 'diagnostics' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {[
                { id: 'all', label: `All (${DEFAULT_DIAGNOSTICS.length})` },
                { id: 'error', label: 'Errors (0)' },
                { id: 'warn', label: 'Warnings (1)' },
                { id: 'Physics', label: 'Physics' },
                { id: 'Co-Sim', label: 'Co-Sim' },
              ].map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  className={`vd-btn ${diagFilter === pill.id ? 'vd-btn-primary' : ''}`}
                  onClick={() => setDiagFilter(pill.id as typeof diagFilter)}
                >
                  {pill.label}
                </button>
              ))}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }} className="vd-metric">
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--vd-text-secondary)', borderBottom: '1px solid var(--vd-border-subtle)' }}>
                  <th style={{ padding: '3px 6px' }}>Severity</th>
                  <th style={{ padding: '3px 6px' }}>Domain</th>
                  <th style={{ padding: '3px 6px' }}>Entity</th>
                  <th style={{ padding: '3px 6px' }}>Root Cause</th>
                  <th style={{ padding: '3px 6px' }}>Suggested Fix</th>
                </tr>
              </thead>
              <tbody>
                {filteredDiags.map((row) => (
                  <tr
                    key={row.id}
                    className="vd-tree-row"
                    style={{ display: 'table-row' }}
                    onClick={() => {
                      globalCrossProbeBus.select([row.entity], 'tree');
                      onFocusEntity(row.entity);
                    }}
                  >
                    <td style={{ padding: '4px 6px', color: row.severity === 'error' ? 'var(--vd-fail)' : row.severity === 'warn' ? 'var(--vd-warn)' : 'var(--vd-text-secondary)' }}>{row.severity}</td>
                    <td style={{ padding: '4px 6px' }}>{row.domain}</td>
                    <td style={{ padding: '4px 6px', color: 'var(--vd-border-active)' }}>{row.entity}</td>
                    <td style={{ padding: '4px 6px' }}>{row.cause}</td>
                    <td style={{ padding: '4px 6px', color: 'var(--vd-text-secondary)' }}>{row.fix}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'library' && (
          <Suspense fallback={<div className="vd-metric">Loading DuckDB Component Library...</div>}>
            <LazyComponentLibraryPanel />
          </Suspense>
        )}

        {activeTab === 'simulation' && (
          <Suspense fallback={<div className="vd-metric">Loading Waveform Viewers...</div>}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <LazyUplotScope title="SW_NODE Transient" xLabel="Time (us)" seriesLabel="V_SW (V)" xValues={[0, 0.5, 1.0, 1.5, 2.0]} yValues={[0.1, 12.0, 0.2, 11.9, 0.1]} strokeColor="#E05D44" />
              <LazyVcdWaveformViewer />
            </div>
          </Suspense>
        )}

        {activeTab === 'terminal' && (
          <Suspense fallback={<div className="vd-metric">Loading PTY Terminal...</div>}>
            <LazyTerminalPanel />
          </Suspense>
        )}

        {activeTab === 'history' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} className="vd-metric">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Current HW-IR Revision: rev #{revId}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="button" className="vd-btn" onClick={() => void undoTx()}>Undo Revision</button>
                <button type="button" className="vd-btn" onClick={() => void redoTx()}>Redo Revision</button>
              </div>
            </div>
            <div style={{ padding: 6, backgroundColor: 'var(--vd-bg-canvas)', border: '1px solid var(--vd-border-subtle)', fontSize: 10.5 }}>
              Atomic hardware patches logged in SQLite WAL `hardware_patches` with inverse rollback ops.
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
