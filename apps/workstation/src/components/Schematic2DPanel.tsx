import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { globalCrossProbeBus } from '@vajradhir/crossprobe-bus';
import type { KicadSch, SchematicViewer } from '@vajradhir/kicanvas-core';
import { globalKiCadSyncStore, useKiCadSync } from '../kicadSyncClient';

interface SchSymbolScreenItem {
  refdes: string;
  uuid: string;
  value: string;
  libId: string;
  screenX: number;
  screenY: number;
}

const MM_TO_NM = 1_000_000;

const OFFLINE_FALLBACK_SCH = `(kicad_sch (version 20250114) (generator "vajra-dhir-fallback")
  (wire (pts (xy 80 70) (xy 130 70)) (stroke (width 0.15) (type default)))
  (wire (pts (xy 80 85) (xy 110 85) (xy 110 70)) (stroke (width 0.15) (type default)))
  (wire (pts (xy 130 70) (xy 150 70) (xy 150 90)) (stroke (width 0.15) (type default)))
  (label "SW_NODE" (at 105 70 0) (effects (font (size 1.27 1.27))))
)`;

export interface Schematic2DPanelProps {
  useLegacySvgTestId?: boolean;
}

export const Schematic2DPanel: React.FC<Schematic2DPanelProps> = ({
  useLegacySvgTestId = true,
}) => {
  const sync = useKiCadSync();
  const probe = useSyncExternalStore(
    globalCrossProbeBus.subscribeSnapshot,
    globalCrossProbeBus.getSnapshot
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerRef = useRef<SchematicViewer | null>(null);
  const schDocRef = useRef<KicadSch | null>(null);
  const kcModuleRef = useRef<typeof import('@vajradhir/kicanvas-core') | null>(null);
  const initialFitDoneRef = useRef(false);

  const [symItems, setSymItems] = useState<SchSymbolScreenItem[]>([]);
  const [wirePolylines, setWirePolylines] = useState<Array<{ key: string; points: string }>>([]);
  const [viewportTick, setViewportTick] = useState(0);
  const [statusNote, setStatusNote] = useState('KiCanvas Schematic synced to P1');

  const selectedRefdes = probe.selection.entityIds[0] ?? 'U2';

  const projectOverlay = useCallback(() => {
    const viewer = viewerRef.current;
    const doc = schDocRef.current;
    const kc = kcModuleRef.current;
    if (!viewer?.viewport?.camera || !doc || !kc) return;
    const cam = viewer.viewport.camera;

    const list: SchSymbolScreenItem[] = [];
    for (const sym of doc.symbols.values()) {
      const ref = sym.reference || sym.uuid;
      if (!ref || ref.startsWith('#')) continue;
      const xMm = sym.at?.position?.x ?? 0;
      const yMm = sym.at?.position?.y ?? 0;
      const pt = cam.world_to_screen(new kc.Vec2(xMm, yMm));
      list.push({
        refdes: ref,
        uuid: sym.uuid,
        value: sym.value || '',
        libId: sym.lib_id || '',
        screenX: pt.x,
        screenY: pt.y,
      });
    }
    const wires: Array<{ key: string; points: string }> = [];
    doc.wires.forEach((w, idx) => {
      if (!w.pts || w.pts.length < 2) return;
      const ptsStr = w.pts
        .map((p) => {
          const sp = cam.world_to_screen(new kc.Vec2(p.x, p.y));
          return `${sp.x.toFixed(1)},${sp.y.toFixed(1)}`;
        })
        .join(' ');
      wires.push({ key: w.uuid || `w-${idx}`, points: ptsStr });
    });
    setSymItems(list);
    setWirePolylines(wires);
    setViewportTick((t) => t + 1);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;

    void import('@vajradhir/kicanvas-core').then(async (kc) => {
      if (disposed) return;
      kcModuleRef.current = kc;
      const viewer = new kc.SchematicViewer(canvas, true, kc.SILICON_DARKROOM_SCHEMATIC_THEME);
      viewerRef.current = viewer;
      await viewer.setup();

      viewer.addEventListener('kicanvas:select', (ev) => {
        const detail = (ev as CustomEvent<{ item?: unknown }>).detail;
        const item = detail?.item as { reference?: string } | undefined;
        if (item?.reference) {
          globalCrossProbeBus.select([item.reference], 'schematic');
        }
        projectOverlay();
      });

      canvas.addEventListener('panzoom', () => projectOverlay());

      const latestSch = globalKiCadSyncStore.getSnapshot().schText || OFFLINE_FALLBACK_SCH;
      const isReal = Boolean(globalKiCadSyncStore.getSnapshot().schText);
      const doc = new kc.KicadSch('active.kicad_sch', latestSch);
      schDocRef.current = doc;
      await viewer.load(doc);
      viewer.zoom_to_page();
      initialFitDoneRef.current = isReal;
      projectOverlay();
    });

    const container = containerRef.current;
    let observer: ResizeObserver | null = null;
    if (container && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        const viewer = viewerRef.current;
        if (viewer?.renderer) {
          viewer.renderer.update_canvas_size();
          viewer.draw();
          projectOverlay();
        }
      });
      observer.observe(container);
    }

    return () => {
      disposed = true;
      observer?.disconnect();
      viewerRef.current?.dispose();
      viewerRef.current = null;
    };
  }, [projectOverlay]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const kc = kcModuleRef.current;
    if (!viewer || !kc || !sync.schText) return;
    let active = true;

    const cam = viewer.viewport?.camera;
    const savedCenter = cam && initialFitDoneRef.current ? cam.center.copy() : null;
    const savedZoom = cam && initialFitDoneRef.current ? cam.zoom : null;

    let doc: KicadSch;
    try {
      doc = new kc.KicadSch('active.kicad_sch', sync.schText);
    } catch (err) {
      setStatusNote(err instanceof Error ? `Schematic parse error: ${err.message}` : 'Schematic parse error');
      return;
    }
    schDocRef.current = doc;
    void viewer.load(doc).then(() => {
      if (!active) return;
      if (savedCenter && savedZoom && viewer.viewport?.camera) {
        viewer.viewport.camera.center = savedCenter;
        viewer.viewport.camera.zoom = savedZoom;
        viewer.draw();
      } else {
        viewer.zoom_to_page();
        initialFitDoneRef.current = true;
      }
      projectOverlay();
    });

    return () => {
      active = false;
    };
  }, [sync.schText, sync.schSha256, projectOverlay]);

  // Cross-ProbeBus incoming selection from PCB / Tree (<16ms)
  useEffect(() => {
    return globalCrossProbeBus.onSelection((ev) => {
      if (ev.source === 'schematic') return;
      const viewer = viewerRef.current;
      const doc = schDocRef.current;
      const kc = kcModuleRef.current;
      if (!viewer || !doc || !kc || !ev.entityIds.length) return;
      const ref = ev.entityIds[0];
      const sym = doc.find_symbol(ref);
      if (sym) {
        viewer.select(sym);
        if (viewer.viewport?.camera && sym.at?.position) {
          viewer.viewport.camera.center = new kc.Vec2(sym.at.position.x, sym.at.position.y);
          viewer.draw();
        }
        projectOverlay();
      }
    });
  }, [projectOverlay]);

  const ercMarkers = useMemo(() => {
    const viewer = viewerRef.current;
    const kc = kcModuleRef.current;
    if (!viewer?.viewport?.camera || !kc) return [];
    return sync.ercFindings.map((f, idx) => {
      const pt = viewer.viewport.camera.world_to_screen(
        new kc.Vec2(f.pos_nm.x_nm / MM_TO_NM, f.pos_nm.y_nm / MM_TO_NM)
      );
      return { ...f, idx, sx: pt.x, sy: pt.y };
    });
  }, [sync.ercFindings, viewportTick]);

  return (
    <div
      ref={containerRef}
      data-testid="schematic-2d-panel"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 340, gap: 6 }}
    >
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
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            type="button"
            data-testid="run-kicad-erc-btn"
            className="vd-btn vd-btn-primary"
            style={{ minHeight: 24, padding: '2px 8px', fontSize: 11 }}
            onClick={() => void globalKiCadSyncStore.runErc()}
          >
            Run ERC
          </button>
          <button
            type="button"
            className="vd-btn"
            style={{ minHeight: 24, padding: '2px 8px', fontSize: 11 }}
            onClick={() => {
              viewerRef.current?.zoom_to_page();
              projectOverlay();
            }}
          >
            Fit Page
          </button>
          <span style={{ color: 'var(--vd-text-secondary)' }}>{sync.ercSummary}</span>
        </div>
        <span style={{ color: 'var(--vd-border-active)' }}>
          Selected: {selectedRefdes} · Symbols: {symItems.length}
        </span>
      </div>

      <div
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 280,
          backgroundColor: '#0B0E14',
          border: '1px solid var(--vd-border-subtle)',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        <canvas
          ref={canvasRef}
          data-testid="schematic-kicanvas-canvas"
          aria-label="KiCanvas 2D Schematic Viewport"
          style={{ width: '100%', height: '100%', display: 'block', backgroundColor: '#0B0E14' }}
        />

        <svg
          data-testid={useLegacySvgTestId ? 'schematic-elk-svg' : 'schematic-interactive-overlay'}
          aria-label="Schematic interactive cross-probe overlay"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        >
          {wirePolylines.map((w) => (
            <polyline
              key={w.key}
              points={w.points}
              fill="none"
              stroke="rgba(96, 165, 250, 0.35)"
              strokeWidth={1.5}
            />
          ))}
          {symItems.map((sym) => {
            const active = sym.refdes === selectedRefdes;
            return (
              <g
                key={sym.uuid}
                data-testid={`sch-hit-${sym.refdes}`}
                style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  globalCrossProbeBus.select([sym.refdes], 'schematic');
                  setStatusNote(`Probed ${sym.refdes} (${sym.value})`);
                }}
              >
                <rect
                  x={sym.screenX - 18}
                  y={sym.screenY - 14}
                  width={36}
                  height={28}
                  rx={4}
                  fill={active ? 'rgba(56, 189, 248, 0.14)' : 'transparent'}
                  stroke={active ? '#38BDF8' : 'rgba(148, 163, 184, 0.25)'}
                  strokeWidth={active ? 2 : 1}
                />
                <text
                  x={sym.screenX}
                  y={sym.screenY - 17}
                  textAnchor="middle"
                  fill={active ? '#38BDF8' : '#FBBF24'}
                  fontSize={10}
                  fontFamily="var(--vd-font-mono)"
                >
                  {sym.refdes}
                </text>
              </g>
            );
          })}

          {ercMarkers.map((m) => (
            <g key={`erc-${m.idx}`} data-testid={`sch-erc-marker-${m.idx}`}>
              <circle
                cx={m.sx}
                cy={m.sy}
                r={8}
                fill={m.severity === 'error' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)'}
                stroke={m.severity === 'error' ? '#EF4444' : '#F59E0B'}
                strokeWidth={2}
              />
            </g>
          ))}
        </svg>
      </div>

      <div className="vd-metric" style={{ fontSize: 11, color: 'var(--vd-text-secondary)', padding: '2px 4px' }}>
        {statusNote} · Sheet rev {sync.revision}
      </div>
    </div>
  );
};
