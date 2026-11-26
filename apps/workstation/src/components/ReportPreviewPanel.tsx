import React, { useCallback, useState } from 'react';
import { globalKiCadSyncStore } from '../kicadSyncClient';
import { globalIdeWorkspaceStore } from '../ideFileStore';

interface DossierStage {
  id: string;
  stage: string;
  verdict: 'PASS' | 'FAILED' | 'STALE' | string;
  detail: string;
  run_sha: string;
}

interface DossierBuildResult {
  success: boolean;
  compiler: string;
  overall_verdict: string;
  fabrication_status: string;
  pdf_path: string;
  pdf_size_bytes: number;
  cas_artifact?: { sha256: string };
  stages: DossierStage[];
}

export const ReportPreviewPanel: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DossierBuildResult | null>(null);

  const compileDossier = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snap = globalKiCadSyncStore.getSnapshot();
      const res = await fetch('/api/v1/report/build-dossier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pcb_path: snap.pcbPath || undefined,
          sch_path: snap.schPath || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dossier compile failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const openTemplateInMonaco = async () => {
    try {
      const res = await fetch('/api/v1/report/template');
      const data = await res.json();
      if (res.ok && data.path) {
        await globalIdeWorkspaceStore.openFile(data.path, true);
      }
    } catch {
      // ignore if daemon offline
    }
  };

  const pdfSha = result?.cas_artifact?.sha256;

  return (
    <div
      data-testid="report-preview-panel"
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
            data-testid="report-compile-btn"
            className="vd-btn vd-btn-primary"
            style={{ minHeight: 26, padding: '3px 10px', fontSize: 11 }}
            disabled={loading}
            onClick={() => void compileDossier()}
          >
            {loading ? 'Compiling Typst Dossier...' : 'Compile Engineering Dossier PDF'}
          </button>
          <button
            type="button"
            className="vd-btn"
            style={{ minHeight: 24, padding: '2px 8px', fontSize: 11 }}
            onClick={() => void openTemplateInMonaco()}
          >
            Edit .typ in Monaco
          </button>
        </div>
        <span
          data-testid="report-overall-badge"
          style={{
            color:
              result?.overall_verdict === 'FAILED'
                ? '#FCA5A5'
                : result?.overall_verdict === 'STALE'
                  ? '#FBBF24'
                  : '#6ee7b7',
          }}
        >
          {result
            ? `${result.overall_verdict} · ${(result.pdf_size_bytes / 1024).toFixed(1)} KB · ${result.fabrication_status}`
            : 'Typst Offline Dossier Ready'}
        </span>
      </div>

      {error && (
        <div role="alert" style={{ padding: 8, border: '1px solid #EF4444', borderRadius: 4, color: '#FCA5A5' }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 10, flex: 1, minHeight: 0 }}>
          <div
            data-testid="report-stages-list"
            style={{
              overflowY: 'auto',
              padding: 8,
              border: '1px solid var(--vd-border-subtle)',
              borderRadius: 6,
              backgroundColor: 'var(--vd-bg-panel)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <strong>Honest Stage Verdicts ({result.compiler})</strong>
            {result.stages.map((st) => (
              <div
                key={st.id}
                className="vd-metric"
                style={{
                  padding: 6,
                  borderRadius: 4,
                  border: `1px solid ${st.verdict === 'FAILED' ? '#EF4444' : st.verdict === 'STALE' ? '#F59E0B' : '#10B981'}`,
                  fontSize: 11,
                }}
              >
                <div style={{ fontWeight: 600, color: st.verdict === 'FAILED' ? '#FCA5A5' : st.verdict === 'STALE' ? '#FBBF24' : '#6ee7b7' }}>
                  {st.verdict} · {st.stage}
                </div>
                <div style={{ color: 'var(--vd-text-secondary)', marginTop: 2 }}>{st.detail}</div>
              </div>
            ))}
          </div>

          <div
            style={{
              border: '1px solid var(--vd-border-subtle)',
              borderRadius: 6,
              backgroundColor: '#1E293B',
              overflow: 'hidden',
              minHeight: 360,
            }}
          >
            {pdfSha ? (
              <iframe
                data-testid="report-pdf-iframe"
                title="Engineering Dossier PDF"
                src={`/api/v1/fab/artifact/${pdfSha}`}
                style={{ width: '100%', height: '100%', border: 'none' }}
              />
            ) : (
              <div className="vd-metric" style={{ padding: 16 }}>PDF artifact missing</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
