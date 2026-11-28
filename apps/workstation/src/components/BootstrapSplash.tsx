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

interface CompanionPackageStatus {
  id: string;
  repo_bucket: string;
  repo?: string;
  version?: string;
  tier: 'tier1_essential' | 'tier2_dlc' | string;
  target_dir: string;
  license_spdx?: string;
  size_bytes?: number;
  status: 'READY' | 'MISSING' | 'UPDATE_AVAILABLE' | 'CORRUPT';
  verified: boolean;
  local_dir?: string;
}

interface RepoBucketStatus {
  bucket: string;
  label: string;
  status: 'READY' | 'MISSING' | 'UPDATE_AVAILABLE' | 'CORRUPT' | 'AIRGAP_OFFLINE';
  tier1_ready: number;
  tier1_total: number;
  total_packages: number;
  packages?: CompanionPackageStatus[];
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
  registry_packages?: CompanionPackageStatus[];
  packs: BootstrapPack[];
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const BootstrapSplash: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [statusData, setStatusData] = useState<BootstrapStatusPayload | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [installComplete, setInstallComplete] = useState(false);
  const [includeTier2, setIncludeTier2] = useState(true);
  const [showPackageList, setShowPackageList] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [speedLabel, setSpeedLabel] = useState('');
  const [phaseLabel, setPhaseLabel] = useState('Required workspace packages are ready to download from the 5 official repositories.');
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

  const refreshStatus = useCallback(async () => {
    const r = await fetch('/api/v1/bootstrap/status');
    if (!r.ok) return null;
    const d = (await r.json()) as BootstrapStatusPayload;
    setStatusData(d);
    return d;
  }, []);

  const startSync = useCallback(async (tiers: number[]) => {
    setSyncing(true);
    setInstallComplete(false);
    setErrorMsg(null);
    setProgressPct(4);
    setSpeedLabel('');
    setPhaseLabel('Connecting to GitHub companion repositories...');
    try {
      const resp = await fetch('/api/v1/bootstrap/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tiers }),
      });
      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        setErrorMsg(errBody.detail || `Download request failed (${resp.status})`);
        setSyncing(false);
        return;
      }
      const es = new EventSource('/api/v1/bootstrap/stream');
      es.addEventListener('pack_start', (ev) => {
        try {
          const d = JSON.parse((ev as MessageEvent).data);
          setPhaseLabel(`Downloading ${d.pack_id}...`);
          if (d.repo_bucket) setRepoPhases((p) => ({ ...p, [d.repo_bucket]: 'DOWNLOADING' }));
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
            setRepoPhases((p) => ({ ...p, [d.repo_bucket]: String(d.phase).replace('_', ' ').toUpperCase() }));
          }
          if (d.bytes_total > 0) {
            setProgressPct(Math.min(99, Math.round((Number(d.bytes_downloaded) / Number(d.bytes_total)) * 100)));
          }
        } catch {
          /* ignore */
        }
      });
      es.addEventListener('pack_verified', (ev) => {
        try {
          const d = JSON.parse((ev as MessageEvent).data);
          setProgressPct((prev) => Math.max(prev, Number(d.progress_pct || 0)));
          if (d.repo_bucket) setRepoPhases((p) => ({ ...p, [d.repo_bucket]: 'READY' }));
        } catch {
          /* ignore */
        }
      });
      es.addEventListener('pack_done', (ev) => {
        try {
          const d = JSON.parse((ev as MessageEvent).data);
          setProgressPct((prev) => Math.max(prev, Number(d.progress_pct || 0)));
          setPhaseLabel(`Installed & verified SHA-256: ${d.pack_id}`);
          if (d.repo_bucket) setRepoPhases((p) => ({ ...p, [d.repo_bucket]: 'READY' }));
        } catch {
          /* ignore */
        }
      });
      es.addEventListener('pack_error', (ev) => {
        try {
          const d = JSON.parse((ev as MessageEvent).data);
          setErrorMsg(`${d.pack_id}: ${d.error}`);
          if (d.repo_bucket) setRepoPhases((p) => ({ ...p, [d.repo_bucket]: 'ERROR' }));
        } catch {
          /* ignore */
        }
      });
      es.addEventListener('sync_complete', (ev) => {
        es.close();
        setSyncing(false);
        let failedCount = 0;
        try {
          const d = JSON.parse((ev as MessageEvent).data);
          const failed = d?.state?.failed_packs;
          if (Array.isArray(failed)) failedCount = failed.length;
        } catch {
          /* ignore */
        }
        void refreshStatus().then((d) => {
          if (failedCount === 0 && d?.tier1_verified) {
            setProgressPct(100);
            setInstallComplete(true);
            setPhaseLabel('All required assets verified and extracted into workspace.');
          } else if (failedCount > 0) {
            setPhaseLabel(`${failedCount} package(s) failed to install. Check network or retry.`);
          }
        });
      });
      es.onerror = () => {
        es.close();
        setSyncing(false);
      };
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Network unavailable');
      setSyncing(false);
    }
  }, [refreshStatus]);

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
      })
      .catch(() => {
        setVisible(false);
      });
    return () => ctrl.abort();
  }, []);

  if (!visible || !statusData) return null;

  const repos = statusData.repos && statusData.repos.length > 0
    ? statusData.repos
    : [
        { bucket: 'dependencies', label: 'Dependencies', status: 'MISSING' as const, tier1_ready: 0, tier1_total: 2, total_packages: 2 },
        { bucket: 'tools', label: 'Tools', status: 'MISSING' as const, tier1_ready: 0, tier1_total: 1, total_packages: 2 },
        { bucket: 'libraries', label: 'Libraries', status: 'MISSING' as const, tier1_ready: 0, tier1_total: 4, total_packages: 4 },
        { bucket: 'packs', label: 'Packs', status: 'MISSING' as const, tier1_ready: 0, tier1_total: 2, total_packages: 3 },
        { bucket: 'resources', label: 'Resources', status: 'MISSING' as const, tier1_ready: 0, tier1_total: 2, total_packages: 3 },
      ];

  const allPackages = statusData.registry_packages || [];
  const selectedPackages = allPackages.filter((p) => includeTier2 || p.tier === 'tier1_essential');
  const pendingPackages = selectedPackages.filter((p) => p.status !== 'READY');
  const totalBytes = pendingPackages.reduce((acc, p) => acc + Number(p.size_bytes || 0), 0);

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
      const st = await refreshStatus();
      if (st?.tier1_verified) {
        setInstallComplete(true);
        setProgressPct(100);
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
      aria-label="Vajra-Dhir EDA First-Run Setup"
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
          width: 'min(700px, 100%)',
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <strong style={{ fontSize: 16, letterSpacing: '0.01em' }}>
                Vajra-Dhīr EDA — First-Run Workspace Setup
              </strong>
              <span className="vd-metric" style={{ fontSize: 11, color: '#8E8E98' }}>
                {statusData.portable_mode ? 'PORTABLE' : 'LOCAL'} · {statusData.target}
                {typeof statusData.disk_free_bytes === 'number' && statusData.disk_free_bytes > 0
                  ? ` · ${(statusData.disk_free_bytes / (1024 * 1024 * 1024)).toFixed(1)} GB free`
                  : ''}
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#9FA0AA', marginTop: 3 }}>
              {installComplete
                ? 'All companion libraries, Open-CUBO blocks, 20 EE skills, plugins, and fab presets are installed.'
                : 'Download verified companion packages from the 5 official GitHub repositories into your local workspace.'}
            </div>
          </div>
        </div>

        {/* Install Location & Download Summary */}
        <div
          className="vd-metric"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
            padding: '8px 10px',
            backgroundColor: '#141416',
            border: '1px solid #2E2E35',
            borderRadius: 2,
            fontSize: 11,
          }}
        >
          <span style={{ color: '#9FA0AA', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Install directory: <strong style={{ color: '#D8D8DE' }}>{statusData.data_dir}</strong>
          </span>
          <span style={{ color: '#8E8E98', flexShrink: 0 }}>
            {pendingPackages.length > 0
              ? `${pendingPackages.length} bundle(s) · ${formatBytes(totalBytes)}`
              : `${selectedPackages.length} verified`}
          </span>
        </div>

        {/* 5-Repository Readiness Strip */}
        <div
          data-testid="five-repo-readiness-strip"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}
        >
          {repos.map((r) => {
            const livePhase = repoPhases[r.bucket] || r.status;
            const isReady = livePhase === 'READY';
            const isErr = livePhase === 'CORRUPT' || livePhase === 'ERROR';
            const color = isReady ? '#479662' : isErr ? '#C24B4B' : '#3D7EC7';
            return (
              <div
                key={r.bucket}
                data-testid={`repo-strip-${r.bucket}`}
                className="vd-metric"
                style={{
                  padding: '8px 8px',
                  backgroundColor: '#141416',
                  border: `1px solid ${isReady ? '#2E4A37' : isErr ? '#5C2B2B' : '#2E2E35'}`,
                  borderRadius: 2,
                  display: 'grid',
                  gap: 3,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 600, color: '#D8D8DE' }}>{r.label}</span>
                <span style={{ fontSize: 10, color }}>{livePhase}</span>
                <span style={{ fontSize: 9.5, color: '#8E8E98' }}>
                  {r.tier1_ready}/{r.tier1_total} Core · {r.total_packages} Total
                </span>
              </div>
            );
          })}
        </div>

        {/* Expandable Manifest Details */}
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#C5C5CE', cursor: syncing ? 'default' : 'pointer' }}>
              <input
                type="checkbox"
                checked={includeTier2}
                disabled={syncing}
                onChange={(e) => setIncludeTier2(e.target.checked)}
              />
              <span>Include optional simulation, corpus &amp; domain bundles (Tier-2)</span>
            </label>
            <button
              type="button"
              className="vd-btn"
              style={{ fontSize: 11, padding: '3px 8px' }}
              onClick={() => setShowPackageList((v) => !v)}
            >
              {showPackageList ? 'Hide Package Details' : `View ${selectedPackages.length || 14} Packages`}
            </button>
          </div>

          {showPackageList && selectedPackages.length > 0 && (
            <div
              className="vd-scroll-slim vd-metric"
              style={{
                maxHeight: 165,
                overflowY: 'auto',
                backgroundColor: '#141416',
                border: '1px solid #2E2E35',
                borderRadius: 2,
                padding: '6px 8px',
                display: 'grid',
                gap: 4,
                fontSize: 10.5,
              }}
            >
              {selectedPackages.map((pkg) => (
                <div
                  key={pkg.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.2fr 1.1fr 64px 72px',
                    gap: 8,
                    alignItems: 'center',
                    padding: '3px 0',
                    borderBottom: '1px solid #232329',
                  }}
                >
                  <span style={{ color: '#D8D8DE' }}>{pkg.id}</span>
                  <span style={{ color: '#8E8E98' }}>{pkg.target_dir}/</span>
                  <span style={{ color: '#8E8E98', textAlign: 'right' }}>{formatBytes(Number(pkg.size_bytes || 0))}</span>
                  <span style={{ color: pkg.status === 'READY' ? '#479662' : '#9FA0AA', textAlign: 'right' }}>
                    {pkg.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Progress Track */}
        <div style={{ display: 'grid', gap: 4 }}>
          <div className="vd-metric" style={{ fontSize: 11, color: '#9FA0AA', display: 'flex', justifyContent: 'space-between' }}>
            <span>{phaseLabel}</span>
            <span>{syncing || installComplete ? `${progressPct}%${speedLabel && syncing ? ` · ${speedLabel}` : ''}` : ''}</span>
          </div>
          <div style={{ height: 5, backgroundColor: '#141416', borderRadius: 2, overflow: 'hidden', border: '1px solid #26262C' }}>
            <div
              style={{
                width: `${syncing ? Math.max(progressPct, 6) : installComplete || statusData.tier1_verified ? 100 : 0}%`,
                height: '100%',
                backgroundColor: installComplete || statusData.tier1_verified ? '#479662' : '#3D7EC7',
                transition: 'width 160ms linear',
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
          <button type="button" className="vd-btn" disabled={syncing} onClick={() => setShowOfflineImport((v) => !v)}>
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
            ) : installComplete ? (
              <button type="button" data-testid="bootstrap-finish-btn" className="vd-btn vd-btn-primary" onClick={dismiss}>
                Launch Workstation
              </button>
            ) : (
              <button
                type="button"
                data-testid="bootstrap-download-all-btn"
                className="vd-btn vd-btn-primary"
                onClick={() => void startSync(includeTier2 ? [1, 2] : [1])}
              >
                {errorMsg ? 'Retry Download' : 'Download & Install All Files'}
              </button>
            )}
            {!installComplete && (
              <button type="button" data-testid="bootstrap-skip-btn" className="vd-btn" onClick={dismiss}>
                Skip for Now (Core Only)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
