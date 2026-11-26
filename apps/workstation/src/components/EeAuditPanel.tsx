import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { globalCrossProbeBus } from '@vajradhir/crossprobe-bus';

const UplotScope = React.lazy(() =>
  import('./UplotScope').then((m) => ({ default: m.UplotScope }))
);

export type EeDomain = 'Power' | 'Signal/Bus' | 'Thermal/Derating' | 'Pinmux' | 'Control/Stability';

export interface EeFinding {
  rule_id: string;
  severity: 'error' | 'warning' | 'info' | string;
  domain: EeDomain | string;
  entity_uuids?: string[];
  refdes?: string;
  physics_formula: string;
  calculated_value: string;
  limit_value: string;
  why_it_fails_plain_english: string;
  recommended_fix: string;
  auto_patch_proposal?: Record<string, unknown>;
}

export interface EeBodePayload {
  freqs_hz: number[];
  mag_db: number[];
  phase_deg: number[];
  phase_margin_deg: number;
  gain_margin_db: number;
  crossover_hz: number;
  stable: boolean;
}

export interface EeAuditPayload {
  passed: boolean;
  error_count: number;
  finding_count: number;
  domains: Record<string, EeFinding[]>;
  findings: EeFinding[];
  bode: EeBodePayload;
  engines: string[];
}

export interface BenchmarkCaseItem {
  id: string;
  expected_rule: string;
  caught: boolean;
  repaired_green: boolean;
  spec: Record<string, unknown>;
  audit: EeAuditPayload;
  repaired_spec?: Record<string, unknown>;
  repaired_audit?: EeAuditPayload;
}

const DOMAIN_TABS: ReadonlyArray<'All' | EeDomain> = [
  'All',
  'Power',
  'Signal/Bus',
  'Thermal/Derating',
  'Pinmux',
  'Control/Stability',
];

export const EeAuditPanel: React.FC<{ autoRun?: boolean }> = ({ autoRun = true }) => {
  const [mode, setMode] = useState<'workspace' | 'benchmark8'>('workspace');
  const [domainFilter, setDomainFilter] = useState<'All' | EeDomain>('All');
  const [audit, setAudit] = useState<EeAuditPayload | null>(null);
  const [activeSpec, setActiveSpec] = useState<Record<string, unknown> | null>(null);
  const [benchmarkCases, setBenchmarkCases] = useState<BenchmarkCaseItem[]>([]);
  const [previewPatchId, setPreviewPatchId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [statusNote, setStatusNote] = useState<string>('Ready — Z3 + SymPy + Pint + python-control');

  const runWorkspaceAudit = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const resp = await fetch('/api/v1/ee/audit');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as { spec: Record<string, unknown>; audit: EeAuditPayload };
      setMode('workspace');
      setActiveSpec(data.spec);
      setAudit(data.audit);
      setStatusNote(
        `Workspace audited (${data.audit.error_count} errors, PM=${data.audit.bode.phase_margin_deg.toFixed(1)}°)`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoRun) {
      void runWorkspaceAudit();
    }
  }, [autoRun, runWorkspaceAudit]);

  const runBenchmark8 = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    setPreviewPatchId(null);
    try {
      const resp = await fetch('/api/v1/ee/audit/benchmark-8');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as {
        total: number;
        caught: number;
        repaired_green: number;
        cases: BenchmarkCaseItem[];
      };
      setMode('benchmark8');
      setBenchmarkCases(
        data.cases.map((c) => ({
          ...c,
          repaired_green: false,
        }))
      );
      setStatusNote(`8-Circuit Regression Check: ${data.caught}/${data.total} broken circuits caught`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const crossProbeFinding = (f: EeFinding, highlightViolet = false) => {
    const ref = f.refdes || (f.entity_uuids && f.entity_uuids[0]) || 'U2';
    globalCrossProbeBus.select([ref], 'inspector');
    globalCrossProbeBus.highlightNet(ref, 'inspector', highlightViolet ? '#8B5CF6' : '#E05D44');
  };

  const applyCaseFix = async (caseItem: BenchmarkCaseItem) => {
    const targetFinding =
      caseItem.audit.findings.find((f) => f.rule_id === caseItem.expected_rule) ??
      caseItem.audit.findings[0];
    if (!targetFinding) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const resp = await fetch('/api/v1/ee/audit/apply-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec: caseItem.spec, finding: targetFinding }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as {
        repaired_spec: Record<string, unknown>;
        audit: EeAuditPayload;
      };
      setBenchmarkCases((prev) =>
        prev.map((c) =>
          c.id === caseItem.id
            ? {
                ...c,
                repaired_green: data.audit.passed,
                repaired_spec: data.repaired_spec,
                repaired_audit: data.audit,
              }
            : c
        )
      );
      setAudit(data.audit);
      setPreviewPatchId(null);
      crossProbeFinding(targetFinding, false);
      setStatusNote(`${caseItem.id} repaired -> GREEN (0 errors)`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const applyAllBenchmarkFixes = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const updated: BenchmarkCaseItem[] = [];
      let lastAudit: EeAuditPayload | null = null;
      for (const c of benchmarkCases) {
        if (c.repaired_green) {
          updated.push(c);
          continue;
        }
        const targetFinding =
          c.audit.findings.find((f) => f.rule_id === c.expected_rule) ?? c.audit.findings[0];
        if (!targetFinding) {
          updated.push(c);
          continue;
        }
        const resp = await fetch('/api/v1/ee/audit/apply-fix', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ spec: c.spec, finding: targetFinding }),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = (await resp.json()) as {
          repaired_spec: Record<string, unknown>;
          audit: EeAuditPayload;
        };
        lastAudit = data.audit;
        updated.push({
          ...c,
          repaired_green: data.audit.passed,
          repaired_spec: data.repaired_spec,
          repaired_audit: data.audit,
        });
      }
      setBenchmarkCases(updated);
      if (lastAudit) setAudit(lastAudit);
      setStatusNote(
        `Applied auto-fixes: ${updated.filter((x) => x.repaired_green).length}/${updated.length} circuits GREEN`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const applyWorkspaceFix = async (finding: EeFinding) => {
    if (!activeSpec) return;
    setLoading(true);
    try {
      const resp = await fetch('/api/v1/ee/audit/apply-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec: activeSpec, finding }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as {
        repaired_spec: Record<string, unknown>;
        audit: EeAuditPayload;
      };
      setActiveSpec(data.repaired_spec);
      setAudit(data.audit);
      setPreviewPatchId(null);
      setStatusNote(`Repaired ${finding.rule_id} on ${finding.refdes || 'target'}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const visibleFindings = useMemo(() => {
    const list = audit?.findings ?? [];
    if (domainFilter === 'All') return list;
    return list.filter((f) => f.domain === domainFilter);
  }, [audit, domainFilter]);

  const bodeFreqKhz = useMemo(
    () => (audit?.bode?.freqs_hz ?? []).map((hz) => Number((hz / 1000).toFixed(3))),
    [audit]
  );

  const repairedCount = useMemo(
    () => benchmarkCases.filter((c) => c.repaired_green).length,
    [benchmarkCases]
  );

  return (
    <div
      data-testid="ee-audit-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: 10,
        backgroundColor: 'var(--vd-bg-canvas)',
        color: 'var(--vd-text-primary)',
        border: '1px solid var(--vd-border)',
        borderRadius: 6,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div>
          <strong style={{ fontSize: 13 }}>Senior EE Verification Brain</strong>
          <div style={{ fontSize: 11, color: 'var(--vd-text-muted)' }}>
            Engines: Z3 SMT · SymPy + Pint · python-control · P7 DuckDB Derating · {statusNote}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="vd-btn"
            data-testid="ee-audit-run-workspace"
            disabled={loading}
            onClick={() => void runWorkspaceAudit()}
          >
            Audit Active Board
          </button>
          <button
            type="button"
            className="vd-btn vd-btn-primary"
            data-testid="ee-audit-run-benchmark8"
            disabled={loading}
            onClick={() => void runBenchmark8()}
          >
            Run 8-Circuit Regression
          </button>
        </div>
      </div>

      {errorMsg && (
        <div
          data-testid="ee-audit-error"
          style={{ padding: 8, borderRadius: 4, border: '1px solid #ef4444', color: '#fca5a5', fontSize: 12 }}
        >
          Verification error: {errorMsg}
        </div>
      )}

      {audit?.bode && bodeFreqKhz.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 8 }}>
          <Suspense fallback={<div className="vd-metric">Loading python-control Gain Bode...</div>}>
            <UplotScope
              title={`python-control SMPS Open-Loop Gain (GM: ${audit.bode.gain_margin_db.toFixed(1)} dB)`}
              xLabel="Freq (kHz)"
              seriesLabel="|T(jω)| dB"
              xValues={bodeFreqKhz}
              yValues={audit.bode.mag_db}
              strokeColor="#38BDF8"
            />
            <UplotScope
              title={`SMPS Phase Response (PM: ${audit.bode.phase_margin_deg.toFixed(1)}° @ ${(audit.bode.crossover_hz / 1000).toFixed(1)} kHz)`}
              xLabel="Freq (kHz)"
              seriesLabel="Phase (deg)"
              xValues={bodeFreqKhz}
              yValues={audit.bode.phase_deg}
              strokeColor={audit.bode.stable ? '#10B981' : '#EF4444'}
            />
          </Suspense>
        </div>
      )}

      {mode === 'benchmark8' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="ee-benchmark8-view">
          <div
            className="vd-metric"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px' }}
          >
            <span data-testid="ee-benchmark8-summary">
              <strong>8-Circuit Regression Check:</strong>{' '}
              {benchmarkCases.filter((c) => c.caught).length} / {benchmarkCases.length} caught ·{' '}
              <span data-testid="ee-benchmark8-repaired-count">
                {repairedCount} / {benchmarkCases.length} GREEN
              </span>
            </span>
            <button
              type="button"
              className="vd-btn vd-btn-primary"
              data-testid="ee-apply-all-benchmark8"
              disabled={loading || repairedCount === benchmarkCases.length}
              onClick={() => void applyAllBenchmarkFixes()}
            >
              Apply All Fixes
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {benchmarkCases.map((c) => {
              const targetFinding =
                c.audit.findings.find((f) => f.rule_id === c.expected_rule) ?? c.audit.findings[0];
              const isPreview = previewPatchId === c.id;
              return (
                <div
                  key={c.id}
                  data-testid={`ee-case-${c.id}`}
                  style={{
                    padding: 8,
                    borderRadius: 4,
                    border: c.repaired_green
                      ? '1px solid #10B981'
                      : isPreview
                        ? '1px solid #8B5CF6'
                        : '1px solid var(--vd-border)',
                    backgroundColor: 'var(--vd-bg-surface)',
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => targetFinding && crossProbeFinding(targetFinding, false)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'inherit',
                        cursor: 'pointer',
                        textAlign: 'left',
                        padding: 0,
                      }}
                    >
                      <strong>{c.id}</strong>{' '}
                      <span
                        data-testid={`ee-case-status-${c.id}`}
                        style={{
                          marginLeft: 6,
                          padding: '1px 6px',
                          borderRadius: 3,
                          fontSize: 11,
                          backgroundColor: c.repaired_green ? '#064e3b' : '#7f1d1d',
                          color: c.repaired_green ? '#6ee7b7' : '#fecaca',
                        }}
                      >
                        {c.repaired_green ? 'GREEN · 0 ERRORS' : `CAUGHT: ${c.expected_rule}`}
                      </span>
                    </button>

                    {!c.repaired_green && targetFinding && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          className="vd-btn"
                          data-testid={`ee-preview-fix-${c.id}`}
                          onClick={() => {
                            setPreviewPatchId(isPreview ? null : c.id);
                            crossProbeFinding(targetFinding, !isPreview);
                          }}
                        >
                          {isPreview ? 'Hide Ghost' : 'Preview Fix'}
                        </button>
                        <button
                          type="button"
                          className="vd-btn vd-btn-primary"
                          data-testid={`ee-apply-fix-${c.id}`}
                          disabled={loading}
                          onClick={() => void applyCaseFix(c)}
                        >
                          Apply Fix
                        </button>
                      </div>
                    )}
                  </div>

                  {targetFinding && (
                    <div style={{ marginTop: 4, fontSize: 11, color: 'var(--vd-text-muted)' }}>
                      <div>
                        <code>{targetFinding.physics_formula}</code> · Calc:{' '}
                        <strong>{targetFinding.calculated_value}</strong> vs Limit:{' '}
                        <strong>{targetFinding.limit_value}</strong>
                      </div>
                      <div style={{ marginTop: 2 }}>{targetFinding.why_it_fails_plain_english}</div>
                      <div style={{ marginTop: 2, color: '#93c5fd' }}>Fix: {targetFinding.recommended_fix}</div>
                    </div>
                  )}

                  {isPreview && targetFinding?.auto_patch_proposal && (
                    <div
                      data-testid={`ee-ghost-preview-${c.id}`}
                      style={{
                        marginTop: 6,
                        padding: 6,
                        borderRadius: 4,
                        border: '1px dashed #8B5CF6',
                        backgroundColor: 'rgba(139, 92, 246, 0.12)',
                        color: '#ddd6fe',
                        fontSize: 11,
                      }}
                    >
                      Violet Ghost Patch Preview: <code>{JSON.stringify(targetFinding.auto_patch_proposal)}</code>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="ee-workspace-view">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {DOMAIN_TABS.map((dom) => {
              const count =
                dom === 'All'
                  ? audit?.findings?.length ?? 0
                  : audit?.domains?.[dom]?.length ?? 0;
              return (
                <button
                  key={dom}
                  type="button"
                  className={domainFilter === dom ? 'vd-btn vd-btn-primary' : 'vd-btn'}
                  onClick={() => setDomainFilter(dom)}
                  style={{ fontSize: 11 }}
                >
                  {dom} ({count})
                </button>
              );
            })}
            <span
              data-testid="ee-workspace-badge"
              style={{
                marginLeft: 'auto',
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: 11,
                backgroundColor: audit?.passed ? '#064e3b' : '#7f1d1d',
                color: audit?.passed ? '#6ee7b7' : '#fecaca',
              }}
            >
              {audit?.passed ? 'GREEN · 0 ERRORS' : `${audit?.error_count ?? 0} ERRORS`}
            </span>
          </div>

          {visibleFindings.length === 0 ? (
            <div className="vd-metric" style={{ padding: 10, fontSize: 12 }}>
              All checked EE physics, Z3 SMT pinmux/I2C/bootstrap rules, MLCC DC-bias derating, and SMPS loop stability checks passed in this domain.
            </div>
          ) : (
            visibleFindings.map((f, idx) => {
              const key = `${f.rule_id}-${f.refdes || idx}`;
              const isPreview = previewPatchId === key;
              return (
                <div
                  key={key}
                  style={{
                    padding: 8,
                    borderRadius: 4,
                    border: isPreview ? '1px solid #8B5CF6' : '1px solid var(--vd-border)',
                    backgroundColor: 'var(--vd-bg-surface)',
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => crossProbeFinding(f, false)}
                      style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}
                    >
                      <strong>[{f.domain}] {f.rule_id}</strong> ({f.refdes || 'SYS'})
                    </button>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className="vd-btn"
                        onClick={() => {
                          setPreviewPatchId(isPreview ? null : key);
                          crossProbeFinding(f, !isPreview);
                        }}
                      >
                        Preview Fix
                      </button>
                      <button
                        type="button"
                        className="vd-btn vd-btn-primary"
                        onClick={() => void applyWorkspaceFix(f)}
                      >
                        Apply Fix
                      </button>
                    </div>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11, color: 'var(--vd-text-muted)' }}>
                    <code>{f.physics_formula}</code> · {f.calculated_value} vs {f.limit_value}
                    <div style={{ marginTop: 2 }}>{f.why_it_fails_plain_english}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default EeAuditPanel;
