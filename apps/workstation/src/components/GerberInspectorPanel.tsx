import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { globalCrossProbeBus } from '@vajradhir/crossprobe-bus';
import { globalKiCadSyncStore, useKiCadSync } from '../kicadSyncClient';
import { globalGerberWorkerClient } from '../workers/gerberClient';
import type { FabSanityCheck, PlottedGerberLayerResult } from '../workers/gerberWorker.worker';

const MM_TO_NM = 1_000_000;

function layerColor(type: string, side: string): string {
  if (type === 'outline') return '#EAB308';
  if (type === 'drill') return '#F8FAFC';
  if (type === 'silkscreen') return side === 'bottom' ? '#94A3B8' : '#E2E8F0';
  if (type === 'soldermask') return side === 'bottom' ? '#065F46' : '#047857';
  if (type === 'solderpaste') return '#A855F7';
  if (type === 'copper') return side === 'bottom' ? '#3B82F6' : '#E05D44';
  return '#64748B';
}

export const GerberInspectorPanel: React.FC<{ autoLoad?: boolean }> = ({ autoLoad = false }) => {
  const sync = useKiCadSync();
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportedPcbSha, setExportedPcbSha] = useState<string>('');
  const [sideView, setSideView] = useState<'top' | 'bottom' | 'all'>('top');
  const [layers, setLayers] = useState<PlottedGerberLayerResult[]>([]);
  const [sanityChecks, setSanityChecks] = useState<FabSanityCheck[]>([]);
  const [baseViewBox, setBaseViewBox] = useState<[number, number, number, number]>([0, -40, 60, 40]);
  const [zoom, setZoom] = useState(1.0);
  const [visibleMap, setVisibleMap] = useState<Record<string, boolean>>({});
  const [opacityMap, setOpacityMap] = useState<Record<string, number>>({});
  const [rulerMode, setRulerMode] = useState(false);
  const [rulerPtA, setRulerPtA] = useState<{ xMm: number; yMm: number } | null>(null);
  const [rulerPtB, setRulerPtB] = useState<{ xMm: number; yMm: number } | null>(null);
  const [crossProbeCoord, setCrossProbeCoord] = useState<{ xMm: number; yMm: number; xNm: number; yNm: number } | null>(null);

  const isStale = Boolean(exportedPcbSha && sync.pcbSha256 && exportedPcbSha !== sync.pcbSha256);

  const exportAndInspect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pcbPath = globalKiCadSyncStore.getSnapshot().pcbPath;
      const res = await fetch('/api/v1/fab/gerbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pcbPath ? { pcb_path: pcbPath } : {}),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || `HTTP ${res.status}`);
        setLoading(false);
        return;
      }
      setExportedPcbSha(String(data.pcb_sha256 ?? ''));
      const plotted = await globalGerberWorkerClient.plotFiles(data.files ?? []);
      setLayers(plotted.layers);
      setSanityChecks(plotted.sanityChecks);
      setBaseViewBox(plotted.viewBox);

      const vis: Record<string, boolean> = {};
      const opa: Record<string, number> = {};
      for (const l of plotted.layers) {
        vis[l.id] = true;
        opa[l.id] = l.type === 'soldermask' ? 0.35 : 0.9;
      }
      setVisibleMap(vis);
      setOpacityMap(opa);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gerber export failed');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoLoad && layers.length === 0) {
      void exportAndInspect();
    }
  }, [autoLoad, layers.length, exportAndInspect]);

  const effectiveViewBox = useMemo(() => {
    const [vx, vy, vw, vh] = baseViewBox;
    const nw = vw / zoom;
    const nh = vh / zoom;
    const cx = vx + vw * 0.5;
    const cy = vy + vh * 0.5;
    return `${(cx - nw * 0.5).toFixed(3)} ${(cy - nh * 0.5).toFixed(3)} ${nw.toFixed(3)} ${nh.toFixed(3)}`;
  }, [baseViewBox, zoom]);

  const filteredLayers = useMemo(() => {
    return layers.filter((l) => {
      if (!visibleMap[l.id]) return false;
      if (sideView === 'all') return true;
      return l.side === sideView || l.side === 'all' || l.type === 'outline' || l.type === 'drill';
    });
  }, [layers, visibleMap, sideView]);

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const parts = effectiveViewBox.split(' ').map(Number);
    if (parts.length !== 4 || rect.width <= 0 || rect.height <= 0) return;
    const [vx, vy, vw, vh] = parts;
    const rx = (e.clientX - rect.left) / rect.width;
    const ry = (e.clientY - rect.top) / rect.height;
    const xMm = vx + rx * vw;
    // Note: Gerber SVG uses negated Y (-y_gerber), while KiCad PCB Y-down = -y_gerber!
    const yMm = vy + ry * vh;
    const xNm = Math.round(xMm * MM_TO_NM);
    const yNm = Math.round(yMm * MM_TO_NM);

    if (rulerMode) {
      if (!rulerPtA || (rulerPtA && rulerPtB)) {
        setRulerPtA({ xMm, yMm });
        setRulerPtB(null);
      } else {
        setRulerPtB({ xMm, yMm });
      }
      return;
    }

    setCrossProbeCoord({ xMm, yMm, xNm, yNm });
    globalCrossProbeBus.focusDrc(
      `gerber-probe`,
      [xNm - 500_000, yNm - 500_000, xNm + 500_000, yNm + 500_000],
      'pcb'
    );
  };

  const rulerDistanceMm = useMemo(() => {
    if (!rulerPtA || !rulerPtB) return null;
    return Math.hypot(rulerPtB.xMm - rulerPtA.xMm, rulerPtB.yMm - rulerPtA.yMm);
  }, [rulerPtA, rulerPtB]);

  return (
    <div
      data-testid="gerber-inspector-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 380,
        gap: 8,
        backgroundColor: 'var(--vd-bg-canvas)',
        color: 'var(--vd-text-primary)',
      }}
    >
      {/* Top Toolbar */}
      <div
        className="vd-metric"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 6,
          padding: '6px 8px',
          backgroundColor: 'var(--vd-bg-panel)',
          border: '1px solid var(--vd-border-subtle)',
          borderRadius: 6,
          fontSize: 11,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
          <button
            type="button"
            data-testid="gerber-export-btn"
            className="vd-btn vd-btn-primary"
            style={{ minHeight: 24, padding: '2px 8px', fontSize: 11 }}
            disabled={loading}
            onClick={() => void exportAndInspect()}
          >
            {loading ? 'Exporting & Plotting...' : 'Export & Inspect Gerbers'}
          </button>
          {(['top', 'bottom', 'all'] as const).map((s) => (
            <button
              key={s}
              type="button"
              data-testid={`gerber-side-${s}`}
              className={`vd-btn ${sideView === s ? 'vd-btn-primary' : ''}`}
              style={{ minHeight: 24, padding: '2px 7px', fontSize: 11 }}
              onClick={() => setSideView(s)}
            >
              {s === 'top' ? 'Top Composite' : s === 'bottom' ? 'Bottom Composite' : 'All Stack'}
            </button>
          ))}
          <button
            type="button"
            data-testid="gerber-ruler-btn"
            className={`vd-btn ${rulerMode ? 'vd-btn-primary' : ''}`}
            style={{ minHeight: 24, padding: '2px 7px', fontSize: 11 }}
            onClick={() => setRulerMode((r) => !r)}
          >
            {rulerMode ? 'Ruler: On' : 'Ruler'}
          </button>
          <button
            type="button"
            className="vd-btn"
            style={{ minHeight: 24, padding: '2px 6px', fontSize: 11 }}
            onClick={() => setZoom((z) => Math.min(8, Number((z * 1.25).toFixed(2))))}
          >
            +
          </button>
          <button
            type="button"
            className="vd-btn"
            style={{ minHeight: 24, padding: '2px 6px', fontSize: 11 }}
            onClick={() => setZoom((z) => Math.max(0.5, Number((z / 1.25).toFixed(2))))}
          >
            -
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span
            data-testid="gerber-stale-badge"
            style={{ color: isStale ? '#FBBF24' : layers.length ? '#6ee7b7' : 'var(--vd-text-secondary)' }}
          >
            {isStale ? 'STALE (PCB modified)' : layers.length ? `FRESH · ${layers.length} layers` : 'tracespace MIT Worker Ready'}
          </span>
        </div>
      </div>

      {error && (
        <div role="alert" style={{ padding: 8, borderRadius: 4, border: '1px solid #EF4444', color: '#FCA5A5', fontSize: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: 8, flex: 1, minHeight: 280 }}>
        {/* Left Layer Stack & Fab Sanity Checks */}
        <div
          className="vd-metric"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: 8,
            backgroundColor: 'var(--vd-bg-panel)',
            border: '1px solid var(--vd-border-subtle)',
            borderRadius: 6,
            overflowY: 'auto',
            fontSize: 11,
          }}
        >
          <strong style={{ fontSize: 11 }}>Layer Stack ({layers.length})</strong>
          {layers.length === 0 && (
            <span style={{ color: 'var(--vd-text-secondary)' }}>
              Click &quot;Export &amp; Inspect Gerbers&quot; to stream RS-274X &amp; Excellon drills from KiCad 10.
            </span>
          )}
          {layers.map((l) => (
            <div
              key={l.id}
              data-testid={`gerber-layer-row-${l.filename}`}
              style={{ display: 'flex', flexDirection: 'column', gap: 3, borderBottom: '1px solid var(--vd-border-subtle)', paddingBottom: 4 }}
            >
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, cursor: 'pointer' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(visibleMap[l.id])}
                    onChange={(e) => setVisibleMap((m) => ({ ...m, [l.id]: e.target.checked }))}
                  />
                  <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: layerColor(l.type, l.side), display: 'inline-block' }} />
                  <span>{l.filename}</span>
                </span>
                <span style={{ color: 'var(--vd-text-secondary)', fontSize: 10 }}>{l.type}</span>
              </label>
              <input
                type="range"
                min={0.1}
                max={1.0}
                step={0.05}
                value={opacityMap[l.id] ?? 0.9}
                onChange={(e) => setOpacityMap((m) => ({ ...m, [l.id]: Number(e.target.value) }))}
              />
            </div>
          ))}

          {sanityChecks.length > 0 && (
            <div data-testid="gerber-sanity-summary" style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
              <strong>Fab Sanity Checks</strong>
              {sanityChecks.map((sc) => (
                <div key={sc.id} style={{ color: sc.passed ? '#6ee7b7' : '#FCA5A5', fontSize: 10 }}>
                  {sc.passed ? 'PASS' : 'FAIL'} · {sc.label}: {sc.detail}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Center Interactive SVG Viewport */}
        <div
          style={{
            position: 'relative',
            backgroundColor: '#0B0E14',
            border: '1px solid var(--vd-border-subtle)',
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          <svg
            ref={svgRef}
            data-testid="gerber-svg-viewport"
            viewBox={effectiveViewBox}
            onClick={handleSvgClick}
            style={{ width: '100%', height: '100%', display: 'block', cursor: rulerMode ? 'crosshair' : 'pointer' }}
          >
            {filteredLayers.map((l) => (
              <g
                key={l.id}
                data-testid={`gerber-svg-layer-${l.type}-${l.side}`}
                color={layerColor(l.type, l.side)}
                opacity={opacityMap[l.id] ?? 0.9}
                dangerouslySetInnerHTML={{ __html: l.svgFragment }}
              />
            ))}
            {crossProbeCoord && (
              <circle
                cx={crossProbeCoord.xMm}
                cy={crossProbeCoord.yMm}
                r={0.8}
                fill="none"
                stroke="#38BDF8"
                strokeWidth={0.2}
              />
            )}
            {rulerPtA && rulerPtB && (
              <line
                x1={rulerPtA.xMm}
                y1={rulerPtA.yMm}
                x2={rulerPtB.xMm}
                y2={rulerPtB.yMm}
                stroke="#FBBF24"
                strokeWidth={0.2}
                strokeDasharray="0.5 0.3"
              />
            )}
          </svg>

          <div
            className="vd-metric"
            style={{
              position: 'absolute',
              left: 10,
              bottom: 8,
              display: 'flex',
              gap: 14,
              padding: '4px 8px',
              backgroundColor: 'rgba(11, 14, 20, 0.9)',
              border: '1px solid var(--vd-border-subtle)',
              borderRadius: 4,
              fontSize: 10,
            }}
          >
            <span data-testid="gerber-crossprobe-readout">
              {crossProbeCoord
                ? `CrossProbe: (${crossProbeCoord.xNm} nm, ${crossProbeCoord.yNm} nm)`
                : 'Click Gerber to cross-probe to P2 & P3'}
            </span>
            {rulerDistanceMm !== null && (
              <span data-testid="gerber-ruler-readout" style={{ color: '#FBBF24' }}>
                Ruler: {rulerDistanceMm.toFixed(3)} mm
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
