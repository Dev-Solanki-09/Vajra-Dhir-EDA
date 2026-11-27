import React, { useEffect, useState } from 'react';

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

interface BootstrapStatusPayload {
  portable_mode: boolean;
  offline_mode: boolean;
  tier1_verified: boolean;
  auto_skip: boolean;
  data_dir: string;
  disk_free_bytes?: number;
  target: string;
  packs: BootstrapPack[];
}

export const BootstrapSplash: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [statusData, setStatusData] = useState<BootstrapStatusPayload | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [speedLabel, setSpeedLabel] = useState('');
  const [phaseLabel, setPhaseLabel] = useState('Checking pinned Tier-1 runtime packs...');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const dismiss = () => {
    try {
      window.sessionStorage.setItem('vd_splash_dismissed', '1');
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

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
    fetch('/api/bootstrap/status', { signal: ctrl.signal })
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

  const tier1Packs = statusData.packs.filter((p) => p.audience === 'runtime' && p.tier === 1);

  const startTier1Sync = async () => {
    setSyncing(true);
    setErrorMsg(null);
    setPhaseLabel('Downloading pinned Tier-1 runtime archives...');
    try {
      const resp = await fetch('/api/bootstrap/sync', {
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
      const es = new EventSource('/api/bootstrap/stream');
      es.addEventListener('pack_start', (ev) => {
        try {
          const d = JSON.parse((ev as MessageEvent).data);
          setPhaseLabel(`Fetching pinned pack: ${d.pack_id}`);
        } catch {
          /* ignore */
        }
      });
      es.addEventListener('pack_progress', (ev) => {
        try {
          const d = JSON.parse((ev as MessageEvent).data);
          const mbps = d.speed_bps ? `${(Number(d.speed_bps) / (1024 * 1024)).toFixed(2)} MB/s` : '';
          const eta = typeof d.eta_s === 'number' ? ` · ETA ${d.eta_s}s` : '';
          setSpeedLabel(`${mbps}${eta}`);
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
        fetch('/api/bootstrap/status')
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
  };

  return (
    <div
      data-testid="bootstrap-splash"
      role="dialog"
      aria-modal="true"
      aria-label="Runtime Environment Pre-Flight"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120,
        backgroundColor: 'rgba(11, 14, 20, 0.92)',
        display: 'grid',
        placeItems: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          width: 'min(580px, 100%)',
          backgroundColor: '#161A22',
          border: '1px solid #2D3340',
          borderRadius: 4,
          padding: 18,
          display: 'grid',
          gap: 12,
          color: '#D8DCE6',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: 14, letterSpacing: '0.02em' }}>Vajra-Dhīr Runtime Pre-Flight</strong>
          <span className="vd-metric" style={{ fontSize: 11, color: '#8E96A8' }}>
            {statusData.portable_mode ? 'PORTABLE' : 'STANDARD'} · {statusData.target}
            {typeof statusData.disk_free_bytes === 'number' && statusData.disk_free_bytes > 0
              ? ` · ${(statusData.disk_free_bytes / (1024 * 1024 * 1024)).toFixed(1)} GB free`
              : ''}
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: '#9BA3B4', lineHeight: 1.45 }}>
          Core CAD, KiCad transcoding, Z3/SymPy verification, and SPICE simulation work immediately offline.
          Optional Tier-1 companion packs can be SHA-256 verified now or skipped until needed.
        </p>

        <div style={{ display: 'grid', gap: 6 }}>
          {tier1Packs.map((pack) => (
            <div
              key={pack.pack_id}
              className="vd-metric"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '6px 10px',
                backgroundColor: '#101319',
                border: '1px solid #252A36',
                fontSize: 11.5,
              }}
            >
              <span>
                {pack.name} <span style={{ color: '#6E7789' }}>({pack.license_spdx} · {(pack.commit_sha || '').slice(0, 8)})</span>
              </span>
              <span style={{ color: pack.verified ? '#3ECF8E' : '#8E96A8' }}>
                {pack.verified ? 'Verified' : 'Optional / Not Cached'}
              </span>
            </div>
          ))}
        </div>

        {syncing && (
          <div style={{ display: 'grid', gap: 4 }}>
            <div className="vd-metric" style={{ fontSize: 11, color: '#9BA3B4' }}>
              {phaseLabel} ({progressPct}%){speedLabel ? ` · ${speedLabel}` : ''}
            </div>
            <div style={{ height: 4, backgroundColor: '#101319', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(progressPct, 6)}%`, height: '100%', backgroundColor: '#3B82F6' }} />
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="vd-metric" style={{ fontSize: 11, color: '#F59E0B', backgroundColor: '#1F1A12', padding: '6px 8px', border: '1px solid #523E1B' }}>
            {errorMsg} — you can continue offline immediately.
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          {syncing ? (
            <button
              type="button"
              className="vd-btn"
              onClick={() => {
                void fetch('/api/bootstrap/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
                setSyncing(false);
              }}
            >
              Cancel Sync
            </button>
          ) : (
            <button type="button" className="vd-btn vd-btn-primary" onClick={() => void startTier1Sync()}>
              Sync Tier-1 Packs
            </button>
          )}
          <button type="button" data-testid="bootstrap-skip-btn" className="vd-btn" onClick={dismiss}>
            Launch Offline / Skip
          </button>
        </div>
      </div>
    </div>
  );
};
