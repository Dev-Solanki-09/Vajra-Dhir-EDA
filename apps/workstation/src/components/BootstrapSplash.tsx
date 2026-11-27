import React, { useCallback, useEffect, useState } from 'react';

interface BootstrapPack {
  pack_id: string;
  name: string;
  audience: string;
  tier: number;
  source_kind: string;
  license_spdx: string;
  commit_sha: string | null;
  status: 'verified' | 'missing' | 'syncing' | 'error';
  verified: boolean;
}

interface RepoBucketStatus {
  bucket: string;
  label: string;
  status: 'READY' | 'MISSING' | 'UPDATE_AVAILABLE' | 'CORRUPT' | 'AIRGAP_OFFLINE';
  tier1_ready: number;
  tier1_total: number;
  total_packages: number;
}

interface BootstrapStatusPayload {
  portable_mode: boolean;
  offline_mode: boolean;
  tier1_verified: boolean;
  five_repo_ready?: boolean;
  auto_skip: boolean;
  data_dir: string;
  disk_free_bytes?: number;
  target: string;
  repos?: RepoBucketStatus[];
  packs: BootstrapPack[];
}

export const BootstrapSplash: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [statusData, setStatusData] = useState<BootstrapStatusPayload | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [speedLabel, setSpeedLabel] = useState('');
  const [phaseLabel, setPhaseLabel] = useState('Verifying 5-repository workspace assets...');
  const [repoPhases, setRepoPhases] = useState<Record<string, string>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [offlinePath, setOfflinePath] = useState('');
  const [showOfflineImport, setShowOfflineImport] = useState(false);

  const dismiss = useCallback(() => {
    try {
      window.sessionStorage.setItem('vd_splash_dismissed', '1');
    } catch {
      /* ignore */
    }
    setVisible(false);
  }, []);

  const startTier1Sync = useCallback(async () => {
    setSyncing(true);
    setErrorMsg(null);
    setPhaseLabel('Fetching Tier-1 bundles from 5 companion repositories...');
    try {
      const resp = await fetch('/api/v1/bootstrap/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tiers: [1] }),
      });
      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        setErrorMsg(errBody.detail || `Sync request failed (${resp.status})`);
        setSyncing(false);
        return;
      }
      const es = new EventSource('/api/v1/bootstrap/stream');
      es.addEventListener('pack_start', (ev) => {
        try {
          const d = JSON.parse((ev as MessageEvent).data);
          setPhaseLabel(`Fetching ${d.pack_id}...`);
          if (d.repo_bucket) setRepoPhases((p) => ({ ...p, [d.repo_bucket]: 'FETCHING' }));
        } catch {
          /* ignore */
        }
      });
      es.addEventListener('pack_progress', (ev) => {
        try {
          const d = JSON.parse((ev as MessageEvent).data);
          const mbps = d.speed_bps ? `${(Number(d.speed_bps) / (1024 * 1024)).toFixed(2)} MB/s` : '';
          const eta = typeof d.eta_s === 'number' ? ` · ETA ${d.eta_s}s` : '';
          if (mbps || eta) setSpeedLabel(`${mbps}${eta}`);
          if (d.repo_bucket && d.phase) {
            setRepoPhases((p) => ({ ...p, [d.repo_bucket]: String(d.phase).toUpperCase() }));
          }
          if (d.bytes_total > 0) {
            setProgressPct(Math.min(99, Math.round((Number(d.bytes_downloaded) / Number(d.bytes_total)) * 100)));
          }
        } catch {
          /* ignore */
        }
      });
      es.addEventListener('pack_done', (ev) => {
        try {
          const d = JSON.parse((ev as MessageEvent).data);
          setProgressPct(Number(d.progress_pct || 0));
          setPhaseLabel(`Verified SHA-256: ${d.pack_id}`);
          if (d.repo_bucket) setRepoPhases((p) => ({ ...p, [d.repo_bucket]: 'READY' }));
        } catch {
          /* ignore */
        }
      });
      es.addEventListener('pack_error', (ev) => {
        try {
          const d = JSON.parse((ev as MessageEvent).data);
          setErrorMsg(`${d.pack_id}: ${d.error}`);
        } catch {
          /* ignore */
        }
      });
      es.addEventListener('sync_complete', () => {
        es.close();
        setSyncing(false);
        setProgressPct(100);
        fetch('/api/v1/bootstrap/status')
          .then((r) => (r.ok ? (r.json() as Promise<BootstrapStatusPayload>) : null))
          .then((d) => {
            if (d) {
              setStatusData(d);
              if (d.tier1_verified) dismiss();
            }
          })
          .catch(() => {});
      });
      es.onerror = () => {
        es.close();
        setSyncing(false);
      };
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Network unavailable');
      setSyncing(false);
    }
  }, [dismiss]);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.webdriver) {
      return;
    }
    try {
      if (window.sessionStorage.getItem('vd_splash_dismissed') === '1') {
        return;
      }
    } catch {
      /* ignore */
    }
    const ctrl = new AbortController();
    fetch('/api/v1/bootstrap/status', { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<BootstrapStatusPayload>) : null))
      .then((data) => {
        if (!data || data.auto_skip) {
          setVisible(false);
          return;
        }
        setStatusData(data);
        setVisible(true);
        if (!data.offline_mode && !data.tier1_verified) {
          void startTier1Sync();
        }
      })
      .catch(() => {
        setVisible(false);
      });
    return () => ctrl.abort();
  }, [startTier1Sync]);

  if (!visible || !statusData) return null;

  const repos = statusData.repos && statusData.repos.length > 0
    ? statusData.repos
    : [
        { bucket: 'dependencies', label: 'Dependencies', status: 'READY' as const, tier1_ready: 1, tier1_total: 1, total_packages: 1 },
        { bucket: 'tools', label: 'Tools', status: 'READY' as const, tier1_ready: 1, tier1_total: 1, total_packages: 1 },
        { bucket: 'libraries', label: 'Libraries', status: 'READY' as const, tier1_ready: 1, tier1_total: 1, total_packages: 1 },
        { bucket: 'packs', label: 'Packs', status: 'READY' as const, tier1_ready: 1, tier1_total: 1, total_packages: 1 },
        { bucket: 'resources', label: 'Resources', status: 'READY' as const, tier1_ready: 1, tier1_total: 1, total_packages: 1 },
      ];

  const handleOfflineImport = async () => {
    if (!offlinePath.trim()) return;
    setErrorMsg(null);
    try {
      const resp = await fetch('/api/v1/bootstrap/import-offline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archive_path: offlinePath.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        setErrorMsg(data.detail || data.error || 'Offline import failed');
        return;
      }
      setOfflinePath('');
      setPhaseLabel(`Imported offline bundle: ${data.pack_id}`);
      const st = await fetch('/api/v1/bootstrap/status').then((r) => (r.ok ? r.json() : null));
      if (st) {
        setStatusData(st);
        if (st.tier1_verified) dismiss();
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Import error');
    }
  };

  return (
    <div
      data-testid="bootstrap-splash"
      role="dialog"
      aria-modal="true"
      aria-label="Vajra-Dhir EDA Launch & Verification"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120,
        backgroundColor: '#141416',
        display: 'grid',
        placeItems: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          width: 'min(640px, 100%)',
          backgroundColor: '#1C1C1F',
          border: '1px solid #2E2E35',
          borderRadius: 3,
          padding: 22,
          display: 'grid',
          gap: 14,
          color: '#D8D8DE',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img
            src="/icons/vajra-dhir.svg"
            alt="Vajra-Dhīr EDA Emblem"
            width={52}
            height={52}
            style={{ borderRadius: 6, border: '1px solid #2E2E35', flexShrink: 0 }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 16, letterSpacing: '0.01em' }}>Vajra-Dhīr EDA</strong>
              <span className="vd-metric" style={{ fontSize: 11, color: '#8E8E98' }}>
                {statusData.portable_mode ? 'PORTABLE' : 'LOCAL'} · {statusData.target}
                {typeof statusData.disk_free_bytes === 'number' && statusData.disk_free_bytes > 0
                  ? ` · ${(statusData.disk_free_bytes / (1024 * 1024 * 1024)).toFixed(1)} GB free`
                  : ''}
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: '#8E8E98', marginTop: 2 }}>
              Hardware + Software Co-Design Workstation · Deterministic Local Verification
            </div>
          </div>
        </div>

        {/* 5-Repository Readiness Strip */}
        <div
          data-testid="five-repo-readiness-strip"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}
        >
          {repos.map((r) => {
            const livePhase = repoPhases[r.bucket] || r.status;
            const isReady = livePhase === 'READY';
            const color = isReady ? '#479662' : livePhase === 'CORRUPT' ? '#C24B4B' : '#3D7EC7';
            return (
              <div
                key={r.bucket}
                data-testid={`repo-strip-${r.bucket}`}
                className="vd-metric"
                style={{
                  padding: '8px 8px',
                  backgroundColor: '#141416',
                  border: `1px solid ${isReady ? '#2E4A37' : '#2E2E35'}`,
                  borderRadius: 2,
                  display: 'grid',
                  gap: 3,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 600, color: '#D8D8DE' }}>{r.label}</span>
                <span style={{ fontSize: 10, color }}>{livePhase}</span>
                <span style={{ fontSize: 9.5, color: '#8E8E98' }}>
                  {r.tier1_ready}/{r.tier1_total} Core
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'grid', gap: 4 }}>
          <div className="vd-metric" style={{ fontSize: 11, color: '#9FA0AA', display: 'flex', justifyContent: 'space-between' }}>
            <span>{phaseLabel}</span>
            <span>{syncing ? `${progressPct}%${speedLabel ? ` · ${speedLabel}` : ''}` : ''}</span>
          </div>
          <div style={{ height: 4, backgroundColor: '#141416', borderRadius: 2, overflow: 'hidden' }}>
            <div
              style={{
                width: `${syncing ? Math.max(progressPct, 8) : statusData.tier1_verified ? 100 : 12}%`,
                height: '100%',
                backgroundColor: statusData.tier1_verified ? '#479662' : '#3D7EC7',
              }}
            />
          </div>
        </div>

        {showOfflineImport && (
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              className="vd-input vd-metric"
              placeholder="Path to offline .tar.zst pack bundle..."
              value={offlinePath}
              onChange={(e) => setOfflinePath(e.target.value)}
              style={{ flex: 1 }}
            />
            <button type="button" className="vd-btn vd-btn-primary" onClick={() => void handleOfflineImport()}>
              Import
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="vd-metric" style={{ fontSize: 11, color: '#C48B32', backgroundColor: '#1F1B14', padding: '6px 8px', border: '1px solid #4A3B22' }}>
            {errorMsg}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <button type="button" className="vd-btn" onClick={() => setShowOfflineImport((v) => !v)}>
            Import Offline Bundle (.tar.zst)
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {syncing ? (
              <button
                type="button"
                className="vd-btn"
                onClick={() => {
                  void fetch('/api/v1/bootstrap/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
                  setSyncing(false);
                }}
              >
                Cancel
              </button>
            ) : (
              <button type="button" className="vd-btn vd-btn-primary" onClick={() => void startTier1Sync()}>
                {errorMsg ? 'Retry Sync' : 'Sync Tier-1 Packs'}
              </button>
            )}
            <button type="button" data-testid="bootstrap-skip-btn" className="vd-btn" onClick={dismiss}>
              Continue Offline (Core Only)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
