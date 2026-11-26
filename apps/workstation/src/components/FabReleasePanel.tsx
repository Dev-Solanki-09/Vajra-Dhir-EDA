import React, { useCallback, useState } from 'react';
import { globalCrossProbeBus } from '@vajradhir/crossprobe-bus';
import { globalKiCadSyncStore } from '../kicadSyncClient';

interface PreflightGate {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

interface BomRow {
  Comment: string;
  Designator: string;
  RefList: string[];
  Qty: number;
  Footprint: string;
  MPN: string;
  LCSC: string;
  Stock: number;
  UnitUSD: number;
  DNP: string;
  DatasheetSHA?: string;
}

interface FabBundleResult {
  success: boolean;
  manifest_sha256: string;
  pcb_sha256: string;
  release_dir: string;
  fabrication_status: string;
  release_authorized: boolean;
  gerbers_file_count: number;
  ipc2581?: {
    valid: boolean;
    error_count: number;
    layer_count: number;
    component_count: number;
    net_count: number;
    validator: string;
  };
  ibom?: {
    success: boolean;
    cas_artifact?: { sha256: string };
    size_bytes?: number;
  };
  pcbdraw?: {
    top?: { success: boolean; cas_artifact?: { sha256: string }; callout_count?: number };
    bottom?: { success: boolean; cas_artifact?: { sha256: string }; callout_count?: number };
  };
  bom?: {
    bom_rows: BomRow[];
    cpl_count: number;
    total_bom_usd: number;
    missing_parts: string[];
  };
  preflight_gates: PreflightGate[];
}

export const FabReleasePanel: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<FabBundleResult | null>(null);
  const [previewTab, setPreviewTab] = useState<'pcbdraw' | 'ibom'>('pcbdraw');
  const [pcbSide, setPcbSide] = useState<'top' | 'bottom'>('top');
  const [actorId, setActorId] = useState('lead-ee@local');
  const [signoffState, setSignoffState] = useState<{ authorized: boolean; digest?: string; message?: string }>({
    authorized: false,
  });

  const buildBundle = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSignoffState({ authorized: false });
    try {
      const pcbPath = globalKiCadSyncStore.getSnapshot().pcbPath;
      const res = await fetch('/api/v1/fab/build-bundle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pcbPath ? { pcb_path: pcbPath } : {}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`);
      } else {
        setBundle(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fab bundle generation failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const submitHumanSignoff = async () => {
    setError(null);
    try {
      const res = await fetch('/api/v1/fab/signoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor: actorId,
          actor_role: 'human',
          human_confirmed: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSignoffState({ authorized: false, message: data.error || data.error_code });
      } else {
        setSignoffState({
          authorized: true,
          digest: data.gate8_human_signoff?.signoff_digest_sha256,
          message: `Authorized by ${data.gate8_human_signoff?.actor} (${data.fabrication_status})`,
        });
      }
    } catch (err) {
      setSignoffState({ authorized: false, message: err instanceof Error ? err.message : 'Signoff failed' });
    }
  };

  const handleBomRowClick = (row: BomRow) => {
    if (row.RefList?.length) {
      globalCrossProbeBus.select(row.RefList, 'pcb');
    }
  };

  const topSha = bundle?.pcbdraw?.top?.cas_artifact?.sha256;
  const bottomSha = bundle?.pcbdraw?.bottom?.cas_artifact?.sha256;
  const ibomSha = bundle?.ibom?.cas_artifact?.sha256;
  const activeSvgSha = pcbSide === 'top' ? topSha : bottomSha;

  return (
    <div
      data-testid="fab-release-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        height: '100%',
        color: 'var(--vd-text-primary)',
        backgroundColor: 'var(--vd-bg-canvas)',
        fontSize: 12,
      }}
    >
      <div
        className="vd-metric"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          backgroundColor: 'var(--vd-bg-panel)',
          border: '1px solid var(--vd-border-subtle)',
          borderRadius: 6,
        }}
      >
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            type="button"
            data-testid="fab-build-bundle-btn"
            className="vd-btn vd-btn-primary"
            style={{ minHeight: 26, padding: '3px 10px', fontSize: 11 }}
            disabled={loading}
            onClick={() => void buildBundle()}
          >
            {loading ? 'Building Fab Package...' : 'Build Manufacturing & Assembly Bundle'}
          </button>
          <button
            type="button"
            className={`vd-btn ${previewTab === 'pcbdraw' ? 'vd-btn-primary' : ''}`}
            style={{ minHeight: 24, padding: '2px 8px', fontSize: 11 }}
            onClick={() => setPreviewTab('pcbdraw')}
          >
            PcbDraw Pinout
          </button>
          <button
            type="button"
            data-testid="fab-tab-ibom"
            className={`vd-btn ${previewTab === 'ibom' ? 'vd-btn-primary' : ''}`}
            style={{ minHeight: 24, padding: '2px 8px', fontSize: 11 }}
            onClick={() => setPreviewTab('ibom')}
          >
            InteractiveHtmlBom
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span data-testid="fab-honesty-badge" style={{ color: '#FBBF24' }}>
            {bundle?.fabrication_status ?? 'NOT_FABRICATED_0_OF_3'}
          </span>
          <span data-testid="fab-2581-badge" style={{ color: bundle?.ipc2581?.valid ? '#6ee7b7' : 'var(--vd-text-secondary)' }}>
            {bundle?.ipc2581
              ? `2581check: ${bundle.ipc2581.valid ? 'PASS' : 'FAIL'} (${bundle.ipc2581.net_count} nets)`
              : '2581check Ready'}
          </span>
        </div>
      </div>

      {error && (
        <div role="alert" style={{ padding: 8, border: '1px solid #EF4444', borderRadius: 4, color: '#FCA5A5' }}>
          {error}
        </div>
      )}

      {bundle && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.15fr', gap: 10, flex: 1, minHeight: 0 }}>
          {/* Left column: Pre-flight Gates + Gate 8 Signoff + Interactive BOM */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0, overflowY: 'auto' }}>
            <div
              data-testid="fab-preflight-gates"
              style={{
                padding: 8,
                border: '1px solid var(--vd-border-subtle)',
                borderRadius: 6,
                backgroundColor: 'var(--vd-bg-panel)',
              }}
            >
              <strong style={{ display: 'block', marginBottom: 4 }}>Fail-Closed Pre-Flight Matrix</strong>
              {bundle.preflight_gates.map((g) => (
                <div key={g.id} className="vd-metric" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '2px 0' }}>
                  <span style={{ color: g.passed ? '#6ee7b7' : '#FBBF24' }}>
                    {g.passed ? 'PASS' : 'HOLD'} · {g.label}
                  </span>
                  <span style={{ color: 'var(--vd-text-secondary)' }}>{g.detail}</span>
                </div>
              ))}
            </div>

            <div
              data-testid="fab-gate8-box"
              style={{
                padding: 8,
                border: `1px solid ${signoffState.authorized ? '#10B981' : '#F59E0B'}`,
                borderRadius: 6,
                backgroundColor: 'var(--vd-bg-panel)',
              }}
            >
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'space-between' }}>
                <input
                  type="text"
                  value={actorId}
                  onChange={(e) => setActorId(e.target.value)}
                  aria-label="Human signoff actor"
                  style={{
                    flex: 1,
                    padding: '4px 6px',
                    fontSize: 11,
                    backgroundColor: 'var(--vd-bg-canvas)',
                    color: 'var(--vd-text-primary)',
                    border: '1px solid var(--vd-border-subtle)',
                    borderRadius: 4,
                  }}
                />
                <button
                  type="button"
                  data-testid="fab-gate8-sign-btn"
                  className="vd-btn vd-btn-lock"
                  style={{ minHeight: 24, fontSize: 11 }}
                  onClick={() => void submitHumanSignoff()}
                >
                  Human Gate-8 Signoff
                </button>
              </div>
              <div className="vd-metric" style={{ marginTop: 4, fontSize: 11, color: signoffState.authorized ? '#6ee7b7' : '#FBBF24' }}>
                {signoffState.message ?? 'Release locked: Human Gate-8 signoff required'}
              </div>
            </div>

            <div
              style={{
                flex: 1,
                border: '1px solid var(--vd-border-subtle)',
                borderRadius: 6,
                backgroundColor: 'var(--vd-bg-panel)',
                overflow: 'auto',
              }}
            >
              <div className="vd-metric" style={{ padding: '6px 8px', borderBottom: '1px solid var(--vd-border-subtle)', fontSize: 11 }}>
                EMS BOM CSV ({bundle.bom?.bom_rows.length ?? 0} lines · Est ${bundle.bom?.total_bom_usd ?? 0}) · Click row to CrossProbe P2/P3/P4
              </div>
              <table data-testid="fab-bom-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--vd-text-secondary)', borderBottom: '1px solid var(--vd-border-subtle)' }}>
                    <th style={{ padding: '4px 6px' }}>Designators</th>
                    <th style={{ padding: '4px 6px' }}>Value / MPN</th>
                    <th style={{ padding: '4px 6px' }}>Footprint</th>
                    <th style={{ padding: '4px 6px' }}>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {(bundle.bom?.bom_rows ?? []).map((row) => (
                    <tr
                      key={row.Designator}
                      data-testid={`fab-bom-row-${row.RefList[0] ?? 'item'}`}
                      onClick={() => handleBomRowClick(row)}
                      style={{ cursor: 'pointer', borderBottom: '1px solid var(--vd-border-subtle)' }}
                    >
                      <td className="vd-metric" style={{ padding: '4px 6px', color: '#93C5FD' }}>{row.Designator}</td>
                      <td style={{ padding: '4px 6px' }}>{row.Comment}</td>
                      <td className="vd-metric" style={{ padding: '4px 6px' }}>{row.Footprint}</td>
                      <td className="vd-metric" style={{ padding: '4px 6px' }}>{row.Qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right column: PcbDraw Top/Bottom Assembly Pinout OR Embedded iBom HTML */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              border: '1px solid var(--vd-border-subtle)',
              borderRadius: 6,
              backgroundColor: '#05080F',
              overflow: 'hidden',
              minHeight: 320,
            }}
          >
            {previewTab === 'pcbdraw' ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', backgroundColor: 'var(--vd-bg-panel)', borderBottom: '1px solid var(--vd-border-subtle)' }}>
                  <span className="vd-metric">PcbDraw Assembly & Pinout ({pcbSide.toUpperCase()})</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button type="button" className="vd-btn" style={{ minHeight: 20, fontSize: 10 }} onClick={() => setPcbSide('top')}>Top</button>
                    <button type="button" className="vd-btn" style={{ minHeight: 20, fontSize: 10 }} onClick={() => setPcbSide('bottom')}>Bottom</button>
                  </div>
                </div>
                {activeSvgSha ? (
                  <img
                    data-testid={`fab-pcbdraw-${pcbSide}`}
                    src={`/api/v1/fab/artifact/${activeSvgSha}`}
                    alt={`PcbDraw ${pcbSide} assembly`}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 8 }}
                  />
                ) : (
                  <div className="vd-metric" style={{ padding: 16 }}>No PcbDraw SVG available</div>
                )}
              </>
            ) : ibomSha ? (
              <iframe
                data-testid="fab-ibom-iframe"
                title="InteractiveHtmlBom"
                src={`/api/v1/fab/artifact/${ibomSha}`}
                style={{ width: '100%', height: '100%', border: 'none', backgroundColor: '#FFFFFF' }}
              />
            ) : (
              <div className="vd-metric" style={{ padding: 16 }}>InteractiveHtmlBom artifact missing</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
