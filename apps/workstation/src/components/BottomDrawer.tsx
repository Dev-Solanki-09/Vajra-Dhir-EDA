import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { globalCrossProbeBus } from '@vajradhir/crossprobe-bus';
import { useDesignStore } from '../store/useDesignStore';
import { useSpiceOverlay } from '../spiceSimStore';
import { VajraIcon } from './VajraIcons';

const LazyTerminalPanel = React.lazy(() => import('./TerminalPanel').then((m) => ({ default: m.TerminalPanel })));
const LazyComponentLibraryPanel = React.lazy(() => import('./ComponentLibraryPanel').then((m) => ({ default: m.ComponentLibraryPanel })));
const LazyUplotScope = React.lazy(() => import('./UplotScope').then((m) => ({ default: m.UplotScope })));
const LazyVcdWaveformViewer = React.lazy(() => import('./VcdWaveformViewer').then((m) => ({ default: m.VcdWaveformViewer })));

export type BottomDrawerTab = 'diagnostics' | 'library' | 'simulation' | 'terminal' | 'history';

export interface DiagnosticRow {
  id: string;
  rule_id?: string;
  severity: 'error' | 'warn' | 'info';
  domain: string;
  entity: string;
  cause: string;
  fix: string;
  finding?: Record<string, unknown>;
  auto_fixable?: boolean;
}

export const BottomDrawer: React.FC<{
  open: boolean;
  activeTab: BottomDrawerTab;
  onSelectTab: (tab: BottomDrawerTab) => void;
  onClose: () => void;
  onFocusEntity: (refdes: string) => void;
}> = ({ open, activeTab, onSelectTab, onClose, onFocusEntity }) => {
  const [diagFilter, setDiagFilter] = useState<'all' | 'error' | 'warn' | 'Physics' | 'DRC'>('all');
  const [diags, setDiags] = useState<DiagnosticRow[]>([]);
  const [diagBusy, setDiagBusy] = useState(false);
  const revId = useDesignStore((s) => s.revId);
  const undoTx = useDesignStore((s) => s.undoTx);
  const redoTx = useDesignStore((s) => s.redoTx);
  const spiceOverlay = useSpiceOverlay();

  const fetchDiagnostics = useCallback(async () => {
    setDiagBusy(true);
    try {
      const resp = await fetch('/api/v1/diagnostics');
      if (resp.ok) {
        const data = (await resp.json()) as { diagnostics?: DiagnosticRow[] };
        if (Array.isArray(data.diagnostics)) {
          setDiags(data.diagnostics);
        }
      }
    } catch {
      /* retain current diagnostics on transient error */
    } finally {
      setDiagBusy(false);
    }
  }, []);

  const runUnifiedVerifyJob = useCallback(async () => {
    setDiagBusy(true);
    try {
      const resp = await fetch('/api/v1/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'verify', label: 'Verify & Test Board (ERC + Footguns + DRC)' }),
      });
      if (resp.ok) {
        await new Promise((r) => setTimeout(r, 250));
      }
      await fetchDiagnostics();
    } finally {
      setDiagBusy(false);
    }
  }, [fetchDiagnostics]);

  useEffect(() => {
    if (open && activeTab === 'diagnostics') {
      void fetchDiagnostics();
    }
  }, [open, activeTab, revId, fetchDiagnostics]);

  if (!open) return null;

  const filteredDiags = diags.filter((d) => {
    if (diagFilter === 'all') return true;
    if (diagFilter === 'error' || diagFilter === 'warn') return d.severity === diagFilter;
    return d.domain.toLowerCase().includes(diagFilter.toLowerCase());
  });
  const errCnt = diags.filter((d) => d.severity === 'error').length;
  const warnCnt = diags.filter((d) => d.severity === 'warn').length;

  const tabs: Array<{ id: BottomDrawerTab; label: string; icon: 'diagnosticsShield' | 'libraryGrid' | 'oscilloscope' | 'terminalPrompt' | 'historyClock' }> = [
    { id: 'diagnostics', label: `Diagnostics (${errCnt}E/${warnCnt}W)`, icon: 'diagnosticsShield' },
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {[
                  { id: 'all', label: `All (${diags.length})` },
                  { id: 'error', label: `Errors (${errCnt})` },
                  { id: 'warn', label: `Warnings (${warnCnt})` },
                  { id: 'Physics', label: 'Physics' },
                  { id: 'DRC', label: 'DRC' },
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
              <button
                type="button"
                data-testid="diag-run-verify-btn"
                className="vd-btn vd-btn-primary"
                style={{ minHeight: 22, fontSize: 10.5 }}
                disabled={diagBusy}
                onClick={() => void runUnifiedVerifyJob()}
              >
                {diagBusy ? 'Verifying...' : 'Run Board Verification'}
              </button>
            </div>
            <table data-testid="diagnostics-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }} className="vd-metric">
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--vd-text-secondary)', borderBottom: '1px solid var(--vd-border-subtle)' }}>
                  <th style={{ padding: '3px 6px' }}>Severity</th>
                  <th style={{ padding: '3px 6px' }}>Domain</th>
                  <th style={{ padding: '3px 6px' }}>Entity</th>
                  <th style={{ padding: '3px 6px' }}>Root Cause</th>
                  <th style={{ padding: '3px 6px' }}>Suggested Fix</th>
                  <th style={{ padding: '3px 6px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDiags.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '10px 6px', color: 'var(--vd-text-secondary)' }}>
                      {diagBusy ? 'Running ERC + EE Physics + Spatial DRC...' : 'Zero active diagnostics matching filter.'}
                    </td>
                  </tr>
                ) : filteredDiags.map((row) => (
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
                    <td style={{ padding: '4px 6px', display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="vd-btn"
                        style={{ minHeight: 18, padding: '1px 6px', fontSize: 10 }}
                        onClick={() => {
                          globalCrossProbeBus.select([row.entity], 'tree');
                          onFocusEntity(row.entity);
                        }}
                      >
                        Inspect
                      </button>
                      {row.auto_fixable && row.finding && (
                        <button
                          type="button"
                          className="vd-btn vd-btn-primary"
                          style={{ minHeight: 18, padding: '1px 6px', fontSize: 10 }}
                          onClick={async () => {
                            await fetch('/api/v1/ee/audit/apply-fix', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ finding: row.finding }),
                            });
                            await fetchDiagnostics();
                          }}
                        >
                          Auto-Fix
                        </button>
                      )}
                      <button
                        type="button"
                        className="vd-btn"
                        style={{ minHeight: 18, padding: '1px 6px', fontSize: 10 }}
                        onClick={async () => {
                          await fetch('/api/v1/diagnostics/waive', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ rule_id: row.rule_id || row.domain, entity_id: row.entity }),
                          });
                          await fetchDiagnostics();
                        }}
                      >
                        Waive
                      </button>
                    </td>
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
              <LazyUplotScope
                title={`SPICE Probe: ${spiceOverlay.latestWaveSeriesLabel || 'v(vout_3v3)'}`}
                xLabel={spiceOverlay.latestWaveXLabel || 'Time (us)'}
                seriesLabel={spiceOverlay.latestWaveSeriesLabel || 'v(vout_3v3)'}
                xValues={spiceOverlay.latestWaveX.length > 2 ? spiceOverlay.latestWaveX : [0, 1]}
                yValues={spiceOverlay.latestWaveY.length > 2 ? spiceOverlay.latestWaveY : [0, 0]}
                strokeColor="#E05D44"
              />
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
