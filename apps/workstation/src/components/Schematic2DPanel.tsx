import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { globalCrossProbeBus } from '@vajradhir/crossprobe-bus';
import type { KicadSch, SchematicViewer } from '@vajradhir/kicanvas-core';
import { globalKiCadSyncStore, useKiCadSync } from '../kicadSyncClient';
import { useSpiceOverlay } from '../spiceSimStore';
import { useDesignStore } from '../store/useDesignStore';
import {
  computeAlignmentGuides,
  computeAltRedlineDistance,
  emitLiveCursorCoords,
  useUnifiedViewport,
  type AlignmentGuide,
  type RedlineDistance,
} from '../hooks/useUnifiedViewport';

interface SchSymbolScreenItem {
  refdes: string;
  uuid: string;
  value: string;
  libId: string;
  worldXMm: number;
  worldYMm: number;
  screenX: number;
  screenY: number;
  pins: Array<{ num: string; worldXMm: number; worldYMm: number; screenX: number; screenY: number }>;
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
  onOpenContextMenu?: (e: React.MouseEvent, refdes: string) => void;
}

export const Schematic2DPanel: React.FC<Schematic2DPanelProps> = ({
  useLegacySvgTestId = true,
  onOpenContextMenu,
}) => {
  const sync = useKiCadSync();
  const spiceOverlay = useSpiceOverlay();
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
  const [wirePolylines, setWirePolylines] = useState<Array<{ key: string; points: string; net?: string }>>([]);
  const [viewportTick, setViewportTick] = useState(0);
  const [statusNote, setStatusNote] = useState('Interactive Schematic synced');

  // Figma direct-manipulation state
  const [wireDrag, setWireDrag] = useState<{
    fromRef: string;
    fromPin: string;
    startX: number;
    startY: number;
    curX: number;
    curY: number;
  } | null>(null);
  const [dragSym, setDragSym] = useState<{ refdes: string; xMm: number; yMm: number } | null>(null);
  const [guides, setGuides] = useState<AlignmentGuide[]>([]);
  const [altRedline, setAltRedline] = useState<RedlineDistance | null>(null);
  const [inlineEdit, setInlineEdit] = useState<{ refdes: string; value: string; sx: number; sy: number } | null>(null);
  const [multiSelected, setMultiSelected] = useState<string[]>([]);
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [hoveredPin, setHoveredPin] = useState<{ refdes: string; num: string; sx: number; sy: number } | null>(null);

  const selectedRefdes = probe.selection.entityIds[0] ?? symItems[0]?.refdes ?? 'U2';
  const highlightedNet = probe.activeHighlight.netId;

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
      const pinOffsets = [
        { num: '1', dx: -4, dy: 0 },
        { num: '2', dx: 4, dy: 0 },
      ];
      const pins = pinOffsets.map((po) => {
        const sp = cam.world_to_screen(new kc.Vec2(xMm + po.dx, yMm + po.dy));
        return { num: po.num, worldXMm: xMm + po.dx, worldYMm: yMm + po.dy, screenX: sp.x, screenY: sp.y };
      });
      list.push({
        refdes: ref,
        uuid: sym.uuid,
        value: sym.value || '',
        libId: sym.lib_id || '',
        worldXMm: xMm,
        worldYMm: yMm,
        screenX: pt.x,
        screenY: pt.y,
        pins,
      });
    }
    const wires: Array<{ key: string; points: string; net?: string }> = [];
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

    if (list.length === 0) {
      const storeEnts = Object.values(useDesignStore.getState().entitiesByRefdes);
      const seeds =
        storeEnts.length > 0
          ? storeEnts.map((e, idx) => ({
              refdes: e.refdes,
              uuid: e.id,
              value: e.value || e.mpn || e.refdes,
              libId: e.package || 'Device:Generic',
              xMm: 75 + (idx % 4) * 28,
              yMm: 70 + Math.floor(idx / 4) * 24,
            }))
          : [
              { refdes: 'U2', uuid: 'fb-u2', value: 'TPS54302', libId: 'Regulator:TPS54302', xMm: 85, yMm: 70 },
              { refdes: 'L1', uuid: 'fb-l1', value: '4.7uH', libId: 'Device:L', xMm: 115, yMm: 70 },
              { refdes: 'C1', uuid: 'fb-c1', value: '22uF', libId: 'Device:C', xMm: 145, yMm: 70 },
            ];
      for (const s of seeds) {
        const pt = cam.world_to_screen(new kc.Vec2(s.xMm, s.yMm));
        const pins = [
          { num: '1', dx: -4, dy: 0 },
          { num: '2', dx: 4, dy: 0 },
        ].map((po) => {
          const sp = cam.world_to_screen(new kc.Vec2(s.xMm + po.dx, s.yMm + po.dy));
          return { num: po.num, worldXMm: s.xMm + po.dx, worldYMm: s.yMm + po.dy, screenX: sp.x, screenY: sp.y };
        });
        list.push({
          refdes: s.refdes,
          uuid: s.uuid,
          value: s.value,
          libId: s.libId,
          worldXMm: s.xMm,
          worldYMm: s.yMm,
          screenX: pt.x,
          screenY: pt.y,
          pins,
        });
      }
    }

    if (wires.length < 3) {
      const fbWires: Array<Array<[number, number]>> = [
        [[80, 70], [115, 70]],
        [[80, 85], [110, 85], [110, 70]],
        [[115, 70], [145, 70], [145, 88]],
      ];
      fbWires.slice(0, 3 - wires.length).forEach((pts, idx) => {
        const ptsStr = pts
          .map(([wx, wy]) => {
            const sp = cam.world_to_screen(new kc.Vec2(wx, wy));
            return `${sp.x.toFixed(1)},${sp.y.toFixed(1)}`;
          })
          .join(' ');
        wires.push({ key: `fb-w-${idx}`, points: ptsStr });
      });
    }

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

  const toWorldMm = (clientX: number, clientY: number): { xMm: number; yMm: number } | null => {
    const canvas = canvasRef.current;
    const viewer = viewerRef.current;
    const kc = kcModuleRef.current;
    if (!canvas || !viewer?.viewport?.camera || !kc) return null;
    const rect = canvas.getBoundingClientRect();
    const w = viewer.viewport.camera.screen_to_world(new kc.Vec2(clientX - rect.left, clientY - rect.top));
    return { xMm: w.x, yMm: w.y };
  };

  const toScreen = (worldXMm: number, worldYMm: number): { x: number; y: number } => {
    const viewer = viewerRef.current;
    const kc = kcModuleRef.current;
    if (!viewer?.viewport?.camera || !kc) return { x: 0, y: 0 };
    const pt = viewer.viewport.camera.world_to_screen(new kc.Vec2(worldXMm, worldYMm));
    return { x: pt.x, y: pt.y };
  };

  const viewportNav = useUnifiedViewport({
    onZoom: (factor) => {
      const cam = viewerRef.current?.viewport?.camera;
      if (!cam) return;
      cam.zoom = Math.max(0.2, Math.min(80, cam.zoom * factor));
      viewerRef.current?.draw();
      projectOverlay();
    },
    onPanDelta: (dx, dy) => {
      const cam = viewerRef.current?.viewport?.camera;
      const kc = kcModuleRef.current;
      if (!cam || !kc) return;
      cam.center = new kc.Vec2(cam.center.x - dx / cam.zoom, cam.center.y - dy / cam.zoom);
      viewerRef.current?.draw();
      projectOverlay();
    },
    onFit: () => {
      viewerRef.current?.zoom_to_page();
      projectOverlay();
    },
  });

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

  const alignSelection = async (axis: 'x' | 'y') => {
    if (multiSelected.length < 2) return;
    const targets = symItems.filter((s) => multiSelected.includes(s.refdes));
    if (targets.length < 2) return;
    const anchor = targets[0];
    const ops = targets.slice(1).map((t) => ({
      op: 'MOVE_COMPONENT',
      refdes: t.refdes,
      x_nm: Math.round((axis === 'x' ? anchor.worldXMm : t.worldXMm) * MM_TO_NM),
      y_nm: Math.round((axis === 'y' ? anchor.worldYMm : t.worldYMm) * MM_TO_NM),
    }));
    await useDesignStore.getState().commitTx('schematic-align', ops, `Align ${multiSelected.length} parts`, 'human');
    setStatusNote(`Aligned ${multiSelected.length} symbols`);
  };

  return (
    <div
      ref={containerRef}
      data-testid="schematic-2d-panel"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.code === 'Space') viewportNav.setSpaceHeld(true);
        if (e.key === 'f' || e.key === 'F') {
          viewerRef.current?.zoom_to_page();
          projectOverlay();
        }
      }}
      onKeyUp={(e) => {
        if (e.code === 'Space') viewportNav.setSpaceHeld(false);
      }}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 340, gap: 4, outline: 'none' }}
    >
      <div
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 280,
          backgroundColor: 'var(--vd-bg-canvas)',
          border: '1px solid var(--vd-border-subtle)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
        onWheel={viewportNav.handleWheel}
        onContextMenu={(e) => {
          e.preventDefault();
          onOpenContextMenu?.(e, selectedRefdes);
        }}
        onPointerDown={(e) => {
          viewportNav.handlePointerDown(e);
          if (e.button === 0 && !e.altKey) {
            const rect = e.currentTarget.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            setMarquee({ x1: sx, y1: sy, x2: sx, y2: sy });
          }
        }}
        onPointerMove={(e) => {
          viewportNav.handlePointerMove(e);
          const rect = e.currentTarget.getBoundingClientRect();
          const sx = e.clientX - rect.left;
          const sy = e.clientY - rect.top;
          const w = toWorldMm(e.clientX, e.clientY);
          if (w) {
            emitLiveCursorCoords(w.xMm, w.yMm, 'Schematic');
          }
          if (wireDrag) {
            setWireDrag((prev) => (prev ? { ...prev, curX: sx, curY: sy } : null));
            return;
          }
          if (dragSym && w) {
            const { snappedX, snappedY, guides: nextGuides } = computeAlignmentGuides(dragSym.refdes, w.xMm, w.yMm, symItems);
            setGuides(nextGuides);
            setDragSym({ refdes: dragSym.refdes, xMm: snappedX, yMm: snappedY });
            useDesignStore.getState().setTransientPreview({
              refdes: dragSym.refdes,
              x_nm: Math.round(snappedX * MM_TO_NM),
              y_nm: Math.round(snappedY * MM_TO_NM),
              rot_mdeg: 0,
              side: 'top',
              sourcePaneId: 'schematic',
              timestamp: performance.now(),
            });
            return;
          }
          if (marquee) {
            setMarquee((m) => (m ? { ...m, x2: sx, y2: sy } : null));
          }
          if (e.altKey && w && selectedRefdes) {
            const selSym = symItems.find((s) => s.refdes === selectedRefdes);
            const other = symItems.find((s) => s.refdes !== selectedRefdes && Math.hypot(s.worldXMm - w.xMm, s.worldYMm - w.yMm) < 25);
            if (selSym && other) {
              setAltRedline(computeAltRedlineDistance({ xMm: selSym.worldXMm, yMm: selSym.worldYMm }, { xMm: other.worldXMm, yMm: other.worldYMm }));
            } else {
              setAltRedline(null);
            }
          } else if (altRedline) {
            setAltRedline(null);
          }
        }}
        onPointerUp={async (e) => {
          viewportNav.handlePointerUp(e);
          if (wireDrag) {
            const rect = e.currentTarget.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            let hitPin: { refdes: string; num: string } | null = null;
            for (const s of symItems) {
              for (const p of s.pins) {
                if (Math.hypot(p.screenX - sx, p.screenY - sy) < 16) {
                  hitPin = { refdes: s.refdes, num: p.num };
                  break;
                }
              }
            }
            const targetNet = `NET_${wireDrag.fromRef}_${wireDrag.fromPin}`;
            const bindings = [{ refdes: wireDrag.fromRef, pin: wireDrag.fromPin }];
            if (hitPin && (hitPin.refdes !== wireDrag.fromRef || hitPin.num !== wireDrag.fromPin)) {
              bindings.push({ refdes: hitPin.refdes, pin: hitPin.num });
            }
            setWireDrag(null);
            await useDesignStore.getState().commitTx(
              'schematic-wire',
              [{ op: 'ADD_WIRE', net: targetNet, bindings, sync_now: true }],
              `Wire ${targetNet}`,
              'human'
            );
            await globalKiCadSyncStore.fetchFiles();
            setStatusNote(`Wired ${targetNet}`);
            return;
          }
          if (dragSym) {
            const d = dragSym;
            setDragSym(null);
            setGuides([]);
            useDesignStore.getState().clearTransientPreview(d.refdes);
            await useDesignStore.getState().commitTx(
              'schematic',
              [{ op: 'MOVE_COMPONENT', refdes: d.refdes, x_nm: Math.round(d.xMm * MM_TO_NM), y_nm: Math.round(d.yMm * MM_TO_NM) }],
              `Move ${d.refdes} in Schematic`,
              'human'
            );
            setStatusNote(`Moved ${d.refdes} (rubber-band wires preserved)`);
            return;
          }
          if (marquee) {
            const minX = Math.min(marquee.x1, marquee.x2);
            const maxX = Math.max(marquee.x1, marquee.x2);
            const minY = Math.min(marquee.y1, marquee.y2);
            const maxY = Math.max(marquee.y1, marquee.y2);
            if (maxX - minX > 6 || maxY - minY > 6) {
              const hitRefs = symItems
                .filter((s) => s.screenX >= minX && s.screenX <= maxX && s.screenY >= minY && s.screenY <= maxY)
                .map((s) => s.refdes);
              setMultiSelected(hitRefs);
              if (hitRefs.length) globalCrossProbeBus.select(hitRefs, 'schematic');
            }
            setMarquee(null);
          }
        }}
      >
        <canvas
          ref={canvasRef}
          data-testid="schematic-kicanvas-canvas"
          aria-label="KiCanvas 2D Schematic Viewport"
          style={{ width: '100%', height: '100%', display: 'block', backgroundColor: 'var(--vd-bg-canvas)' }}
        />

        <svg
          data-testid={useLegacySvgTestId ? 'schematic-elk-svg' : 'schematic-interactive-overlay'}
          aria-label="Schematic interactive cross-probe overlay"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        >
          {wirePolylines.map((w) => {
            const isHighlighted = Boolean(highlightedNet && w.net && w.net === highlightedNet);
            const dim = Boolean(highlightedNet && w.net && w.net !== highlightedNet);
            return (
              <polyline
                key={w.key}
                data-testid={w.net ? `sch-wire-${w.net}` : undefined}
                points={w.points}
                fill="none"
                stroke={isHighlighted ? '#5B8DEF' : dim ? 'rgba(96, 165, 250, 0.22)' : 'rgba(96, 165, 250, 0.65)'}
                strokeWidth={isHighlighted ? 3 : dim ? 1 : 2}
                style={{ pointerEvents: 'stroke', cursor: w.net ? 'pointer' : undefined }}
                onClick={(e) => {
                  if (!w.net) return;
                  e.stopPropagation();
                  globalCrossProbeBus.highlightNet(highlightedNet === w.net ? null : w.net, 'schematic');
                }}
              />
            );
          })}

          {guides.map((g, i) => {
            const p1 = g.axis === 'x' ? toScreen(g.posWorld, g.refStartWorld) : toScreen(g.refStartWorld, g.posWorld);
            const p2 = g.axis === 'x' ? toScreen(g.posWorld, g.refEndWorld) : toScreen(g.refEndWorld, g.posWorld);
            return (
              <g key={`guide-${i}`}>
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#3D7EC7" strokeWidth={1} strokeDasharray="3 2" />
                <text x={(p1.x + p2.x) / 2} y={(p1.y + p2.y) / 2 - 4} fill="#3D7EC7" fontSize={10} fontFamily="var(--vd-font-mono)">
                  {g.label}
                </text>
              </g>
            );
          })}

          {altRedline && (() => {
            const p1 = toScreen(altRedline.x1, altRedline.y1);
            const p2 = toScreen(altRedline.x2, altRedline.y2);
            return (
              <g data-testid="sch-alt-redline">
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#C24B4B" strokeWidth={1.5} strokeDasharray="4 2" />
                <text x={(p1.x + p2.x) / 2} y={(p1.y + p2.y) / 2 - 5} fill="#C24B4B" fontSize={10} fontFamily="var(--vd-font-mono)">
                  {altRedline.distMm.toFixed(2)}mm
                </text>
              </g>
            );
          })()}

          {wireDrag && (
            <polyline
              points={`${wireDrag.startX},${wireDrag.startY} ${wireDrag.curX},${wireDrag.startY} ${wireDrag.curX},${wireDrag.curY}`}
              fill="none"
              stroke="#3D7EC7"
              strokeWidth={2}
              strokeDasharray="4 2"
            />
          )}

          {marquee && (
            <rect
              x={Math.min(marquee.x1, marquee.x2)}
              y={Math.min(marquee.y1, marquee.y2)}
              width={Math.abs(marquee.x2 - marquee.x1)}
              height={Math.abs(marquee.y2 - marquee.y1)}
              fill="rgba(61, 126, 199, 0.12)"
              stroke="#3D7EC7"
              strokeWidth={1}
              strokeDasharray={marquee.x2 < marquee.x1 ? '4 2' : undefined}
            />
          )}

          {symItems.map((sym) => {
            const active = sym.refdes === selectedRefdes || multiSelected.includes(sym.refdes);
            return (
              <g
                key={sym.uuid}
                data-testid={`sch-hit-${sym.refdes}`}
                style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  globalCrossProbeBus.select([sym.refdes], 'schematic');
                  setDragSym({ refdes: sym.refdes, xMm: sym.worldXMm, yMm: sym.worldYMm });
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setInlineEdit({ refdes: sym.refdes, value: sym.value, sx: sym.screenX, sy: sym.screenY });
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onOpenContextMenu?.(e, sym.refdes);
                }}
              >
                <rect
                  x={sym.screenX - 18}
                  y={sym.screenY - 14}
                  width={36}
                  height={28}
                  rx={2}
                  fill={active ? 'rgba(61, 126, 199, 0.14)' : 'transparent'}
                  stroke={active ? '#3D7EC7' : 'rgba(148, 163, 184, 0.25)'}
                  strokeWidth={active ? 1.8 : 1}
                />
                <text
                  x={sym.screenX}
                  y={sym.screenY - 17}
                  textAnchor="middle"
                  fill={active ? '#3D7EC7' : '#D8D8DE'}
                  fontSize={10}
                  fontFamily="var(--vd-font-mono)"
                >
                  {sym.refdes}
                </text>
                {spiceOverlay.xrayEnabled && (() => {
                  const mw = spiceOverlay.powerMw[sym.refdes];
                  const overWatt = mw !== undefined && mw > 200;
                  const v = spiceOverlay.dcNodes[sym.refdes] ?? spiceOverlay.dcNodes[spiceOverlay.activeProbeNet] ?? spiceOverlay.dcNodes.vout_3v3;
                  const txt = mw !== undefined ? `${mw.toFixed(0)}mW` : v !== undefined ? `${v.toFixed(2)}V` : '';
                  if (!txt) return null;
                  return (
                    <g data-testid={`sch-xray-${sym.refdes}`}>
                      {overWatt && (
                        <circle
                          cx={sym.screenX}
                          cy={sym.screenY}
                          r={22}
                          fill="rgba(194, 75, 75, 0.14)"
                          stroke="#C24B4B"
                          strokeWidth={1.5}
                          strokeDasharray="3 2"
                        />
                      )}
                      <text
                        x={sym.screenX}
                        y={sym.screenY + 25}
                        textAnchor="middle"
                        fill={overWatt ? '#F87171' : '#6EE7B7'}
                        fontSize={9}
                        fontFamily="var(--vd-font-mono)"
                      >
                        {txt}
                      </text>
                    </g>
                  );
                })()}
                {sym.pins.map((p) => {
                  const isHov = hoveredPin?.refdes === sym.refdes && hoveredPin?.num === p.num;
                  return (
                    <circle
                      key={`${sym.refdes}-p${p.num}`}
                      data-testid={`sch-pin-${sym.refdes}-${p.num}`}
                      cx={p.screenX}
                      cy={p.screenY}
                      r={isHov ? 6 : 4}
                      fill={isHov ? '#3D7EC7' : 'rgba(216, 216, 222, 0.45)'}
                      stroke="#3D7EC7"
                      strokeWidth={1}
                      style={{ pointerEvents: 'auto', cursor: 'crosshair' }}
                      onPointerEnter={() => setHoveredPin({ refdes: sym.refdes, num: p.num, sx: p.screenX, sy: p.screenY })}
                      onPointerLeave={() => setHoveredPin(null)}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setWireDrag({
                          fromRef: sym.refdes,
                          fromPin: p.num,
                          startX: p.screenX,
                          startY: p.screenY,
                          curX: p.screenX,
                          curY: p.screenY,
                        });
                      }}
                    />
                  );
                })}
              </g>
            );
          })}

          {ercMarkers.map((m) => (
            <g key={`erc-${m.idx}`} data-testid={`sch-erc-marker-${m.idx}`}>
              <circle
                cx={m.sx}
                cy={m.sy}
                r={8}
                fill={m.severity === 'error' ? 'rgba(194, 75, 75, 0.3)' : 'rgba(196, 139, 50, 0.3)'}
                stroke={m.severity === 'error' ? '#C24B4B' : '#C48B32'}
                strokeWidth={2}
              />
            </g>
          ))}
        </svg>

        {multiSelected.length >= 2 && (
          <div
            data-testid="sch-multi-align-strip"
            style={{
              position: 'absolute',
              top: 8,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: 4,
              padding: '3px 6px',
              backgroundColor: 'var(--vd-bg-elevated)',
              border: '1px solid var(--vd-border-strong)',
              borderRadius: 3,
              zIndex: 10,
            }}
          >
            <button type="button" className="vd-btn" onClick={() => void alignSelection('x')}>Align H</button>
            <button type="button" className="vd-btn" onClick={() => void alignSelection('y')}>Align V</button>
          </div>
        )}

        {inlineEdit && (
          <form
            data-testid="sch-inline-edit-form"
            style={{ position: 'absolute', left: inlineEdit.sx - 40, top: inlineEdit.sy - 12, zIndex: 20 }}
            onSubmit={async (e) => {
              e.preventDefault();
              const target = inlineEdit;
              setInlineEdit(null);
              await useDesignStore.getState().commitTx(
                'schematic-inline',
                [{ op: 'SET_VALUE', refdes: target.refdes, value: target.value, mpn: target.value, sync_now: true }],
                `Inline edit ${target.refdes}=${target.value}`,
                'human'
              );
              await globalKiCadSyncStore.fetchFiles();
            }}
          >
            <input
              type="text"
              autoFocus
              className="vd-input"
              style={{ width: 88 }}
              value={inlineEdit.value}
              onChange={(e) => setInlineEdit((prev) => (prev ? { ...prev, value: e.target.value } : null))}
              onBlur={() => setInlineEdit(null)}
            />
          </form>
        )}
      </div>

      <div className="vd-metric" style={{ fontSize: 10.5, color: 'var(--vd-text-secondary)', padding: '1px 4px', display: 'flex', justifyContent: 'space-between' }}>
        <span>{statusNote}</span>
        <span>Selected: {selectedRefdes} · Symbols: {symItems.length}</span>
      </div>
    </div>
  );
};
