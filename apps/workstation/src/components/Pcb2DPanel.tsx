import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { globalCrossProbeBus } from '@vajradhir/crossprobe-bus';
import type { BoardViewer, KicadPCB } from '@vajradhir/kicanvas-core';
import { globalKiCadSyncStore, useKiCadSync } from '../kicadSyncClient';
import { globalSpiceOverlayStore, useSpiceOverlay } from '../spiceSimStore';
import { globalPiHeatmapStore, lookupPiSampleAtWorldMm, samplePiColormapHex, usePiHeatmap } from '../piHeatmapStore';

type PcbTool = 'select' | 'drag' | 'route' | 'via';

interface FootprintScreenItem {
  refdes: string;
  uuid: string;
  value: string;
  locked: boolean;
  worldXMm: number;
  worldYMm: number;
  rotDeg: number;
  screenX: number;
  screenY: number;
  screenW: number;
  screenH: number;
}

interface AiGhostSuggestion {
  id: string;
  refdes: string;
  description: string;
  targetXNm: number;
  targetYNm: number;
  routePointsNm?: Array<[number, number]>;
}

const MM_TO_NM = 1_000_000;

const OFFLINE_FALLBACK_PCB = `(kicad_pcb (version 20260101) (generator "vajra-dhir-fallback")
  (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (44 "Edge.Cuts" user))
  (net 0 "") (net 1 "GND") (net 2 "SW_NODE") (net 3 "+3.3V")
  (gr_rect (start 0 0) (end 60 40) (stroke (width 0.15) (type solid)) (fill none) (layer "Edge.Cuts"))
  (footprint "Resistor_SMD:R_0603" (layer "F.Cu") (at 28 20) (locked yes) (property "Reference" "U2") (property "Value" "TPS54302"))
  (footprint "Inductor_SMD:L_4x4" (layer "F.Cu") (at 38 20) (property "Reference" "L1") (property "Value" "4.7uH"))
)`;

export interface Pcb2DPanelProps {
  layersVisible?: boolean;
  ratsnestVisible?: boolean;
  lockRingsVisible?: boolean;
  useLegacyCanvasTestId?: boolean;
}

export const Pcb2DPanel: React.FC<Pcb2DPanelProps> = ({
  layersVisible = true,
  lockRingsVisible = true,
  useLegacyCanvasTestId = true,
}) => {
  const sync = useKiCadSync();
  const probe = useSyncExternalStore(
    globalCrossProbeBus.subscribeSnapshot,
    globalCrossProbeBus.getSnapshot
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerRef = useRef<BoardViewer | null>(null);
  const pcbDocRef = useRef<KicadPCB | null>(null);
  const kcModuleRef = useRef<typeof import('@vajradhir/kicanvas-core') | null>(null);
  const initialFitDoneRef = useRef(false);

  const spiceOverlay = useSpiceOverlay();
  const piHeatmap = usePiHeatmap();
  const [tool, setTool] = useState<PcbTool>('select');
  const [backendLabel, setBackendLabel] = useState<'WebGL2' | 'Canvas2D' | 'Initializing'>('Initializing');
  const [statusNote, setStatusNote] = useState('KiCanvas WebGL2/Canvas2D synced to P1');
  const [fpItems, setFpItems] = useState<FootprintScreenItem[]>([]);
  const [dragRefdes, setDragRefdes] = useState<string | null>(null);
  const [dragPreviewMm, setDragPreviewMm] = useState<{ refdes: string; xMm: number; yMm: number } | null>(null);
  const [routeStartMm, setRouteStartMm] = useState<{ xMm: number; yMm: number } | null>(null);
  const [cursorWorldMm, setCursorWorldMm] = useState<{ xMm: number; yMm: number } | null>(null);
  const [aiGhost, setAiGhost] = useState<AiGhostSuggestion | null>(null);
  const [viewportTick, setViewportTick] = useState(0);
  const [routeBusy, setRouteBusy] = useState(false);
  const [routeSummary, setRouteSummary] = useState('');
  const [ghostSegments, setGhostSegments] = useState<
    Array<{ x1_nm: number; y1_nm: number; x2_nm: number; y2_nm: number; layer: string; net_name: string }>
  >([]);
  const [lockedTraceOverlay, setLockedTraceOverlay] = useState<{
    trace_id: string;
    net_name: string;
    x1_nm: number;
    y1_nm: number;
    x2_nm: number;
    y2_nm: number;
    sha256: string;
  } | null>(null);

  const selectedRefdes = probe.selection.entityIds[0] ?? 'J1';

  const projectOverlay = useCallback(() => {
    const viewer = viewerRef.current;
    const doc = pcbDocRef.current;
    const kc = kcModuleRef.current;
    if (!viewer || !doc || !kc || !viewer.viewport?.camera) return;
    const cam = viewer.viewport.camera;

    const nextItems: FootprintScreenItem[] = [];
    for (const fp of doc.footprints) {
      const ref = fp.reference || fp.uuid || 'FP';
      const xMm = fp.at?.position?.x ?? 0;
      const yMm = fp.at?.position?.y ?? 0;
      const rotDeg = fp.at?.rotation ?? 0;
      const centerScreen = cam.world_to_screen(new kc.Vec2(xMm, yMm));
      const bbox = fp.bbox;
      let screenW = 28;
      let screenH = 22;
      if (bbox && bbox.valid) {
        const tl = cam.world_to_screen(new kc.Vec2(bbox.x, bbox.y));
        const br = cam.world_to_screen(new kc.Vec2(bbox.x2, bbox.y2));
        screenW = Math.max(18, Math.abs(br.x - tl.x));
        screenH = Math.max(18, Math.abs(br.y - tl.y));
      }
      nextItems.push({
        refdes: ref,
        uuid: fp.uuid || ref,
        value: fp.value || '',
        locked: Boolean(fp.locked),
        worldXMm: xMm,
        worldYMm: yMm,
        rotDeg,
        screenX: centerScreen.x,
        screenY: centerScreen.y,
        screenW,
        screenH,
      });
    }
    setFpItems(nextItems);
    setViewportTick((t) => t + 1);
  }, []);

  // Initialize KiCanvas BoardViewer lazily so entry chunk < 400KB
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;

    void import('@vajradhir/kicanvas-core').then(async (kc) => {
      if (disposed) return;
      kcModuleRef.current = kc;
      const viewer = new kc.BoardViewer(canvas, true, kc.SILICON_DARKROOM_BOARD_THEME);
      viewerRef.current = viewer;

      await viewer.setup();
      setBackendLabel(viewer.rendererBackend === 'webgl2' ? 'WebGL2' : 'Canvas2D');

      viewer.addEventListener('kicanvas:select', (ev) => {
        const detail = (ev as CustomEvent<{ item?: unknown }>).detail;
        const item = detail?.item as { reference?: string } | undefined;
        if (item?.reference) {
          globalCrossProbeBus.select([item.reference], 'pcb');
        }
        projectOverlay();
      });

      const onRedraw = () => projectOverlay();
      canvas.addEventListener('panzoom', onRedraw);
      canvas.addEventListener('kicanvas:context-lost', () => {
        setStatusNote('WebGL context lost — Canvas2D fallback ready');
      });
      canvas.addEventListener('kicanvas:context-restored', () => {
        setStatusNote('WebGL context restored');
        projectOverlay();
      });

      const latestText = globalKiCadSyncStore.getSnapshot().pcbText || OFFLINE_FALLBACK_PCB;
      const isReal = Boolean(globalKiCadSyncStore.getSnapshot().pcbText);
      const doc = new kc.KicadPCB('active.kicad_pcb', latestText);
      pcbDocRef.current = doc;
      await viewer.load(doc);
      viewer.zoom_to_board();
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

  // Reload PCB file when P1 pushes a delta while strictly preserving pan/zoom
  useEffect(() => {
    const viewer = viewerRef.current;
    const kc = kcModuleRef.current;
    if (!viewer || !kc || !sync.pcbText) return;
    let active = true;

    const cam = viewer.viewport?.camera;
    const savedCenter = cam && initialFitDoneRef.current ? cam.center.copy() : null;
    const savedZoom = cam && initialFitDoneRef.current ? cam.zoom : null;

    let nextDoc: KicadPCB;
    try {
      nextDoc = new kc.KicadPCB('active.kicad_pcb', sync.pcbText);
    } catch (err) {
      setStatusNote(err instanceof Error ? `PCB parse error: ${err.message}` : 'PCB parse error');
      return;
    }
    pcbDocRef.current = nextDoc;
    void viewer.load(nextDoc).then(() => {
      if (!active) return;
      if (savedCenter && savedZoom && viewer.viewport?.camera) {
        viewer.viewport.camera.center = savedCenter;
        viewer.viewport.camera.zoom = savedZoom;
        viewer.draw();
      } else {
        viewer.zoom_to_board();
        initialFitDoneRef.current = true;
      }
      projectOverlay();
    });

    return () => {
      active = false;
    };
  }, [sync.pcbText, sync.pcbSha256, projectOverlay]);

  // Toggle copper opacity when Layers button changes in shell
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !viewer.layers) return;
    try {
      viewer.track_opacity = layersVisible ? 1.0 : 0.25;
    } catch {
      /* ignore before initial load */
    }
  }, [layersVisible]);

  // Cross-ProbeBus incoming selection & DRC marker framing (<16ms)
  useEffect(() => {
    const unsubSel = globalCrossProbeBus.onSelection((ev) => {
      if (ev.source === 'pcb') return;
      const viewer = viewerRef.current;
      const doc = pcbDocRef.current;
      const kc = kcModuleRef.current;
      if (!viewer || !doc || !kc || !ev.entityIds.length) return;
      const targetRef = ev.entityIds[0];
      const fp = doc.find_footprint(targetRef);
      if (fp) {
        viewer.select(fp);
        if (viewer.viewport?.camera && fp.at?.position) {
          viewer.viewport.camera.center = new kc.Vec2(fp.at.position.x, fp.at.position.y);
          viewer.draw();
        }
        projectOverlay();
      }
    });

    const unsubDrc = globalCrossProbeBus.onDrcFocus((ev) => {
      const viewer = viewerRef.current;
      const kc = kcModuleRef.current;
      if (!viewer?.viewport?.camera || !kc) return;
      const cx = (ev.bboxNm[0] + ev.bboxNm[2]) / 2 / MM_TO_NM;
      const cy = (ev.bboxNm[1] + ev.bboxNm[3]) / 2 / MM_TO_NM;
      viewer.viewport.camera.center = new kc.Vec2(cx, cy);
      viewer.viewport.camera.zoom = Math.max(viewer.viewport.camera.zoom, 18);
      viewer.draw();
      projectOverlay();
    });

    return () => {
      unsubSel();
      unsubDrc();
    };
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

  const commitMove = async (refdes: string, xMm: number, yMm: number, rotDeg = 0) => {
    const xNm = Math.round(xMm * MM_TO_NM);
    const yNm = Math.round(yMm * MM_TO_NM);
    const rotMdeg = Math.round(rotDeg * 1000);
    setStatusNote(`Moved ${refdes} -> (${xNm} nm, ${yNm} nm)`);
    await globalKiCadSyncStore.dispatchOps(
      `Move ${refdes} in Pcb2DPanel`,
      [{ op: 'MOVE_COMPONENT', component_id: refdes, x_nm: xNm, y_nm: yNm, rot_mdeg: rotMdeg }],
      'human',
      refdes
    );
  };

  const handleToggleLock = async (targetRef: string) => {
    const item = fpItems.find((f) => f.refdes === targetRef);
    const nextLocked = item ? !item.locked : true;
    await globalKiCadSyncStore.dispatchOps(
      `${nextLocked ? 'Lock' : 'Unlock'} ${targetRef}`,
      [{ op: 'SET_LOCK', entity_id: targetRef, locked: nextLocked, reason: nextLocked ? 'human-panel-lock' : null }],
      'human',
      targetRef,
      'edit.lock_toggle'
    );
  };

  const handleRotate = async (targetRef: string) => {
    const item = fpItems.find((f) => f.refdes === targetRef);
    const nextDeg = ((item?.rotDeg ?? 0) + 90) % 360;
    await globalKiCadSyncStore.dispatchOps(
      `Rotate ${targetRef} +90 deg`,
      [{ op: 'ROTATE_COMPONENT', component_id: targetRef, rot_mdeg: Math.round(nextDeg * 1000) }],
      'human',
      targetRef
    );
  };

  const handleSpawnAiGhost = () => {
    const unlocked = fpItems.find((f) => !f.locked) ?? fpItems[0];
    const targetRef = unlocked?.refdes ?? 'C1';
    const xMm = (unlocked?.worldXMm ?? 20) + 1.5;
    const yMm = (unlocked?.worldYMm ?? 20) + 0.5;
    setAiGhost({
      id: `ghost-${Date.now()}`,
      refdes: targetRef,
      description: `Shift ${targetRef} +1.5 mm for shorter SW loop`,
      targetXNm: Math.round(xMm * MM_TO_NM),
      targetYNm: Math.round(yMm * MM_TO_NM),
    });
  };

  const handleTestAgentLockViolation = async () => {
    const locked = fpItems.find((f) => f.locked)?.refdes ?? 'J1';
    await globalKiCadSyncStore.dispatchOps(
      `Agent attempted relocation of human-locked ${locked}`,
      [{ op: 'MOVE_COMPONENT', component_id: locked, x_nm: 10_000_000, y_nm: 20_000_000 }],
      'agent',
      locked
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const k = e.key.toLowerCase();
    if (k === 'g') {
      e.preventDefault();
      setTool((t) => (t === 'drag' ? 'select' : 'drag'));
    } else if (k === 'r') {
      e.preventDefault();
      void handleRotate(selectedRefdes);
    } else if (k === 'l') {
      e.preventDefault();
      void handleToggleLock(selectedRefdes);
    } else if (k === 'v') {
      e.preventDefault();
      setTool('via');
    } else if (k === 'escape') {
      setDragRefdes(null);
      setDragPreviewMm(null);
      setRouteStartMm(null);
      setTool('select');
    }
  };

  // Compute 45-degree two-segment preview polyline in screen coordinates
  const routePreviewSvgPoints = useMemo(() => {
    const viewer = viewerRef.current;
    const kc = kcModuleRef.current;
    if (!routeStartMm || !cursorWorldMm || !viewer?.viewport?.camera || !kc) return null;
    const dx = cursorWorldMm.xMm - routeStartMm.xMm;
    const dy = cursorWorldMm.yMm - routeStartMm.yMm;
    const diag = Math.min(Math.abs(dx), Math.abs(dy));
    const midX = routeStartMm.xMm + Math.sign(dx) * diag;
    const midY = routeStartMm.yMm + Math.sign(dy) * diag;
    const p1 = viewer.viewport.camera.world_to_screen(new kc.Vec2(routeStartMm.xMm, routeStartMm.yMm));
    const pMid = viewer.viewport.camera.world_to_screen(new kc.Vec2(midX, midY));
    const p2 = viewer.viewport.camera.world_to_screen(new kc.Vec2(cursorWorldMm.xMm, cursorWorldMm.yMm));
    return { p1, pMid, p2, midX, midY };
  }, [routeStartMm, cursorWorldMm, viewportTick]);

  // Project DRC markers to screen space
  const drcScreenMarkers = useMemo(() => {
    const viewer = viewerRef.current;
    const kc = kcModuleRef.current;
    if (!viewer?.viewport?.camera || !kc) return [];
    return sync.drcFindings.map((f, idx) => {
      const xMm = f.pos_nm.x_nm / MM_TO_NM;
      const yMm = f.pos_nm.y_nm / MM_TO_NM;
      const pt = viewer.viewport.camera.world_to_screen(new kc.Vec2(xMm, yMm));
      return { ...f, idx, sx: pt.x, sy: pt.y };
    });
  }, [sync.drcFindings, viewportTick]);

  return (
    <div
      ref={containerRef}
      data-testid="pcb-2d-panel"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 360,
        gap: 6,
        outline: 'none',
        position: 'relative',
      }}
    >
      {/* Top interactive KiCanvas toolbar */}
      <div
        className="vd-metric"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          padding: '6px 8px',
          backgroundColor: 'var(--vd-bg-panel)',
          border: '1px solid var(--vd-border-subtle)',
          borderRadius: 6,
          fontSize: 11,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
          {([
            { id: 'select', label: 'Select' },
            { id: 'drag', label: 'Drag (G)' },
            { id: 'route', label: 'Route 45°' },
            { id: 'via', label: 'Via (V)' },
          ] as Array<{ id: PcbTool; label: string }>).map((btn) => (
            <button
              key={btn.id}
              type="button"
              className={`vd-btn ${tool === btn.id ? 'vd-btn-primary' : ''}`}
              style={{ minHeight: 24, padding: '2px 8px', fontSize: 11 }}
              onClick={() => setTool(btn.id)}
            >
              {btn.label}
            </button>
          ))}
          <button
            type="button"
            className="vd-btn"
            style={{ minHeight: 24, padding: '2px 8px', fontSize: 11 }}
            onClick={() => void handleRotate(selectedRefdes)}
          >
            Rotate +90° (R)
          </button>
          <button
            type="button"
            className="vd-btn vd-btn-lock"
            style={{ minHeight: 24, padding: '2px 8px', fontSize: 11 }}
            onClick={() => void handleToggleLock(selectedRefdes)}
          >
            Lock Toggle (L)
          </button>
          <button
            type="button"
            className="vd-btn"
            style={{ minHeight: 24, padding: '2px 8px', fontSize: 11, borderColor: 'var(--vd-agent-pulse)' }}
            onClick={handleSpawnAiGhost}
          >
            AI Suggest
          </button>
          <button
            type="button"
            data-testid="test-agent-lock-guard-btn"
            className="vd-btn"
            style={{ minHeight: 24, padding: '2px 8px', fontSize: 11, color: 'var(--vd-human-lock)' }}
            onClick={() => void handleTestAgentLockViolation()}
          >
            Test Lock Guard
          </button>
          <button
            type="button"
            data-testid="run-kicad-drc-btn"
            className="vd-btn vd-btn-primary"
            style={{ minHeight: 24, padding: '2px 8px', fontSize: 11 }}
            onClick={() => void globalKiCadSyncStore.runDrc()}
          >
            Run DRC
          </button>
          <button
            type="button"
            className="vd-btn"
            style={{ minHeight: 24, padding: '2px 8px', fontSize: 11 }}
            onClick={() => {
              viewerRef.current?.zoom_to_board();
              projectOverlay();
            }}
          >
            Fit
          </button>
          {(['vout_3v3', 'sw_node', 'v_mcu_3v3', 'vin_12v'] as const).map((net) => {
            const vDc = spiceOverlay.dcNodes[net];
            const isProbed = spiceOverlay.activeProbeNet === net;
            return (
              <button
                key={net}
                type="button"
                data-testid={`pcb-probe-net-${net}`}
                className={isProbed ? 'vd-btn vd-btn-primary' : 'vd-btn'}
                style={{ minHeight: 24, padding: '2px 6px', fontSize: 10 }}
                onClick={() => {
                  globalSpiceOverlayStore.update({ activeProbeNet: net });
                  globalCrossProbeBus.highlightNet(net, 'pcb', '#F59E0B');
                  setStatusNote(`SPICE Probe -> v(${net})${vDc !== undefined ? ` (${vDc.toFixed(2)}V)` : ''}`);
                }}
              >
                Probe {net}
                {vDc !== undefined ? ` ${vDc.toFixed(2)}V` : ''}
              </button>
            );
          })}
          <button
            type="button"
            data-testid="pcb-lock-trace-btn"
            className="vd-btn"
            style={{ minHeight: 24, padding: '2px 6px', fontSize: 10, color: '#FBBF24' }}
            disabled={routeBusy}
            onClick={() => {
              setRouteBusy(true);
              void fetch('/api/v1/route/lock-trace', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ locked: true }),
              })
                .then((r) => r.json())
                .then((d) => {
                  if (d.ok) {
                    setLockedTraceOverlay(d);
                    setRouteSummary(`Locked trace ${d.net_name} · SHA ${String(d.sha256).slice(0, 10)}`);
                  }
                })
                .catch(() => {})
                .finally(() => setRouteBusy(false));
            }}
          >
            Lock Trace
          </button>
          <button
            type="button"
            data-testid="pcb-autoroute-preview-btn"
            className="vd-btn"
            style={{ minHeight: 24, padding: '2px 6px', fontSize: 10, color: '#C4B5FD' }}
            disabled={routeBusy}
            onClick={() => {
              setRouteBusy(true);
              void fetch('/api/v1/route/auto', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reroute_unlocked: true, preview_only: true, run_drc: false }),
              })
                .then((r) => r.json())
                .then((d) => {
                  if (d.ok) {
                    setGhostSegments(Array.isArray(d.ghost_segments) ? d.ghost_segments : []);
                    setRouteSummary(`Ghost Route: ${d.new_segments_count ?? 0} segs (${d.wirelength_mm ?? 0}mm) · Locks verified: ${d.locked_traces_verified ?? 0}`);
                  }
                })
                .catch(() => {})
                .finally(() => setRouteBusy(false));
            }}
          >
            Preview Route
          </button>
          <button
            type="button"
            data-testid="pcb-autoroute-btn"
            className="vd-btn vd-btn-primary"
            style={{ minHeight: 24, padding: '2px 6px', fontSize: 10 }}
            disabled={routeBusy}
            onClick={() => {
              setRouteBusy(true);
              void fetch('/api/v1/route/auto', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reroute_unlocked: true, preview_only: false, run_drc: false }),
              })
                .then((r) => r.json())
                .then(async (d) => {
                  if (d.ok) {
                    setGhostSegments([]);
                    setRouteSummary(`Routed ${d.total_segments ?? 0} segs (${d.wirelength_mm ?? 0}mm, ${d.parasitic_mohm ?? 0}mOhm) · Locks Verified: ${d.locked_traces_verified ?? 0}`);
                    await globalKiCadSyncStore.fetchFiles();
                  } else {
                    setRouteSummary(`Route error: ${d.error ?? 'failed'}`);
                  }
                })
                .catch(() => {})
                .finally(() => setRouteBusy(false));
            }}
          >
            Auto-Route (KRT)
          </button>
          {routeBusy && (
            <button
              type="button"
              data-testid="pcb-autoroute-cancel-btn"
              className="vd-btn"
              style={{ minHeight: 24, padding: '2px 6px', fontSize: 10, color: '#ef4444' }}
              onClick={() => {
                void fetch('/api/v1/route/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
                setRouteBusy(false);
                setRouteSummary('Autorouting cancelled');
              }}
            >
              Cancel
            </button>
          )}
          {routeSummary && (
            <span data-testid="pcb-autoroute-status" style={{ fontSize: 10, color: '#6ee7b7' }}>
              {routeSummary}
            </span>
          )}
          <button
            type="button"
            data-testid="pcb-pi-heatmap-toggle"
            className={`vd-btn ${piHeatmap.enabled ? 'vd-btn-primary' : ''}`}
            style={{ minHeight: 24, padding: '2px 6px', fontSize: 10 }}
            disabled={piHeatmap.loading}
            onClick={() => void globalPiHeatmapStore.toggle(sync.pcbPath)}
          >
            {piHeatmap.loading ? 'Solving PI...' : piHeatmap.enabled ? 'PI Heatmap: On' : 'PI Heatmap'}
          </button>
          {piHeatmap.enabled && (
            <select
              data-testid="pcb-pi-metric-select"
              aria-label="Power Integrity Metric"
              value={piHeatmap.metric}
              onChange={(e) => {
                const m = e.target.value as 'ir_drop_mv' | 'current_density_a_mm2';
                globalPiHeatmapStore.setMetric(m);
              }}
              style={{
                backgroundColor: 'var(--vd-bg-canvas)',
                color: 'var(--vd-text-primary)',
                border: '1px solid var(--vd-border-subtle)',
                borderRadius: 4,
                padding: '1px 4px',
                fontSize: 10,
              }}
            >
              <option value="current_density_a_mm2">J (A/mm²)</option>
              <option value="ir_drop_mv">IR Drop (mV)</option>
            </select>
          )}
          {piHeatmap.enabled && piHeatmap.result?.worst_case && !piHeatmap.result.passed && (
            <button
              type="button"
              data-testid="pcb-pi-widen-btn"
              className="vd-btn"
              style={{ minHeight: 24, padding: '2px 6px', fontSize: 10, color: '#FBBF24', borderColor: '#FBBF24' }}
              disabled={piHeatmap.loading}
              onClick={() => void globalPiHeatmapStore.repairBottleneck({ pcbPath: sync.pcbPath })}
            >
              Widen Bottleneck ({piHeatmap.result.worst_case.bottleneck?.suggested_width_mm ?? 1.9}mm)
            </button>
          )}
          {piHeatmap.enabled && piHeatmap.result?.worst_case && (
            <span
              data-testid="pcb-pi-status"
              style={{
                fontSize: 10,
                color: piHeatmap.result.passed ? '#6ee7b7' : '#fca5a5',
              }}
            >
              PI {piHeatmap.result.passed ? 'PASS' : 'BOTTLENECK'} · ΔV {piHeatmap.result.worst_case.max_ir_drop_mv.toFixed(1)}mV · J {piHeatmap.result.worst_case.peak_current_density_a_mm2.toFixed(1)}A/mm² · Vmin {piHeatmap.result.worst_case.min_delivered_v.toFixed(3)}V
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, color: 'var(--vd-text-secondary)' }}>
          <span>KiCanvas {backendLabel}</span>
          <span style={{ color: sync.wsConnected ? 'var(--vd-pass)' : 'var(--vd-text-secondary)' }}>
            {sync.wsConnected ? 'WS Live' : 'Poll 3s'} · rev {sync.revision}
          </span>
          <span>{sync.drcSummary}</span>
        </div>
      </div>

      {/* Fail-closed KERNEL_LOCK_VIOLATION Toast + Ghost Diff Card */}
      {sync.lockViolation && (
        <div
          data-testid="kernel-lock-violation-toast"
          role="alert"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
            padding: '8px 12px',
            borderRadius: 6,
            backgroundColor: 'rgba(239, 68, 68, 0.14)',
            border: '1px solid var(--vd-human-lock)',
            fontSize: 12,
          }}
        >
          <div>
            <strong style={{ color: 'var(--vd-human-lock)' }}>KERNEL_LOCK_VIOLATION</strong>{' '}
            <span>
              Blocked non-human mutation on locked <code>{sync.lockViolation.entityRef}</code> — rendered as ghost proposal only.
            </span>
          </div>
          <button
            type="button"
            className="vd-btn"
            style={{ minHeight: 24, padding: '2px 8px', fontSize: 11 }}
            onClick={() => globalKiCadSyncStore.clearLockViolation()}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main KiCanvas + Direct-Manipulation Overlay Viewport */}
      <div
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 300,
          backgroundColor: '#0B0E14',
          border: '1px solid var(--vd-border-subtle)',
          borderRadius: 6,
          overflow: 'hidden',
        }}
        onPointerMove={(e) => {
          const w = toWorldMm(e.clientX, e.clientY);
          if (w) {
            setCursorWorldMm(w);
            if (piHeatmap.enabled && piHeatmap.result) {
              globalPiHeatmapStore.setHoverSample(lookupPiSampleAtWorldMm(piHeatmap.result, w.xMm, w.yMm));
            }
          }
          if (dragRefdes && w) {
            setDragPreviewMm({ refdes: dragRefdes, xMm: w.xMm, yMm: w.yMm });
          }
        }}
        onPointerUp={async (e) => {
          if (dragRefdes && dragPreviewMm) {
            const target = fpItems.find((f) => f.refdes === dragRefdes);
            const r = dragPreviewMm.refdes;
            const x = dragPreviewMm.xMm;
            const y = dragPreviewMm.yMm;
            setDragRefdes(null);
            setDragPreviewMm(null);
            await commitMove(r, x, y, target?.rotDeg ?? 0);
            return;
          }
          if (tool === 'via') {
            const w = toWorldMm(e.clientX, e.clientY);
            if (w) {
              const xNm = Math.round(w.xMm * MM_TO_NM);
              const yNm = Math.round(w.yMm * MM_TO_NM);
              setStatusNote(`Dropped via at (${xNm} nm, ${yNm} nm)`);
              await globalKiCadSyncStore.dispatchOps(
                'Drop via from Pcb2DPanel',
                [{ op: 'ADD_VIA', net_name: 'GND', x_nm: xNm, y_nm: yNm, diameter_nm: 600000, drill_nm: 300000 }],
                'human',
                'via'
              );
              setTool('select');
            }
          } else if (tool === 'route') {
            const w = toWorldMm(e.clientX, e.clientY);
            if (!w) return;
            if (!routeStartMm) {
              setRouteStartMm(w);
              setStatusNote(`Route anchor (${w.xMm.toFixed(2)}, ${w.yMm.toFixed(2)} mm) — click target`);
            } else {
              const dx = w.xMm - routeStartMm.xMm;
              const dy = w.yMm - routeStartMm.yMm;
              const diag = Math.min(Math.abs(dx), Math.abs(dy));
              const midX = routeStartMm.xMm + Math.sign(dx) * diag;
              const midY = routeStartMm.yMm + Math.sign(dy) * diag;
              const ops: Array<Record<string, unknown>> = [
                {
                  op: 'ADD_TRACE_SEGMENT',
                  net_name: 'SW_NODE',
                  layer_name: 'F.Cu',
                  x1_nm: Math.round(routeStartMm.xMm * MM_TO_NM),
                  y1_nm: Math.round(routeStartMm.yMm * MM_TO_NM),
                  x2_nm: Math.round(midX * MM_TO_NM),
                  y2_nm: Math.round(midY * MM_TO_NM),
                  width_nm: 250000,
                },
              ];
              if (Math.hypot(w.xMm - midX, w.yMm - midY) > 0.05) {
                ops.push({
                  op: 'ADD_TRACE_SEGMENT',
                  net_name: 'SW_NODE',
                  layer_name: 'F.Cu',
                  x1_nm: Math.round(midX * MM_TO_NM),
                  y1_nm: Math.round(midY * MM_TO_NM),
                  x2_nm: Math.round(w.xMm * MM_TO_NM),
                  y2_nm: Math.round(w.yMm * MM_TO_NM),
                  width_nm: 250000,
                });
              }
              setRouteStartMm(null);
              await globalKiCadSyncStore.dispatchOps('Add 45-deg route segment', ops, 'human', 'SW_NODE');
              setStatusNote('Committed 45° route segment to HW-IR + .kicad_pcb');
            }
          }
        }}
      >
        <canvas
          ref={canvasRef}
          data-testid={useLegacyCanvasTestId ? 'pcb-engine-canvas' : 'pcb-kicanvas-canvas'}
          aria-label="KiCanvas 2D PCB Viewport"
          style={{ width: '100%', height: '100%', display: 'block', backgroundColor: '#0B0E14' }}
        />

        {/* Synchronized Overlay Layer (World-to-Screen) */}
        <svg
          data-testid="pcb-interactive-overlay"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
        >
          {/* Footprint hit targets + Amber Human Lock Halos */}
          {fpItems.map((fp) => {
            const isSelected = fp.refdes === selectedRefdes;
            const x = fp.screenX - fp.screenW / 2;
            const y = fp.screenY - fp.screenH / 2;
            return (
              <g key={fp.uuid} style={{ pointerEvents: tool === 'select' || tool === 'drag' ? 'auto' : 'none', cursor: tool === 'drag' ? 'grab' : 'pointer' }}>
                {lockRingsVisible && fp.locked && (
                  <rect
                    data-testid={`pcb-lock-halo-${fp.refdes}`}
                    x={x - 5}
                    y={y - 5}
                    width={fp.screenW + 10}
                    height={fp.screenH + 10}
                    rx={4}
                    fill="none"
                    stroke="#FBBF24"
                    strokeWidth={2}
                    strokeDasharray="4 2"
                  />
                )}
                {isSelected && (
                  <rect
                    x={x - 2}
                    y={y - 2}
                    width={fp.screenW + 4}
                    height={fp.screenH + 4}
                    rx={3}
                    fill="rgba(56, 189, 248, 0.08)"
                    stroke="#38BDF8"
                    strokeWidth={1.75}
                  />
                )}
                <rect
                  data-testid={`pcb-hit-${fp.refdes}`}
                  x={x}
                  y={y}
                  width={fp.screenW}
                  height={fp.screenH}
                  fill="transparent"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    globalCrossProbeBus.select([fp.refdes], 'pcb');
                    if (tool === 'drag') {
                      if (fp.locked) {
                        void globalKiCadSyncStore.dispatchOps(
                          `Agent/Drag attempt on locked ${fp.refdes}`,
                          [{ op: 'MOVE_COMPONENT', component_id: fp.refdes, x_nm: Math.round(fp.worldXMm * MM_TO_NM), y_nm: Math.round(fp.worldYMm * MM_TO_NM) }],
                          'agent',
                          fp.refdes
                        );
                      } else {
                        setDragRefdes(fp.refdes);
                        setDragPreviewMm({ refdes: fp.refdes, xMm: fp.worldXMm, yMm: fp.worldYMm });
                      }
                    }
                  }}
                />
                <text
                  x={fp.screenX}
                  y={y - 6}
                  textAnchor="middle"
                  fill={fp.locked ? '#FBBF24' : isSelected ? '#38BDF8' : '#94A3B8'}
                  fontSize={10}
                  fontFamily="var(--vd-font-mono)"
                >
                  {fp.refdes}{fp.locked ? ' 🔒' : ''}
                  {spiceOverlay.powerMw[fp.refdes] !== undefined ? ` (${spiceOverlay.powerMw[fp.refdes]}mW)` : ''}
                </text>
              </g>
            );
          })}

          {/* 45-degree rubberband trace preview */}
          {routePreviewSvgPoints && (
            <polyline
              points={`${routePreviewSvgPoints.p1.x},${routePreviewSvgPoints.p1.y} ${routePreviewSvgPoints.pMid.x},${routePreviewSvgPoints.pMid.y} ${routePreviewSvgPoints.p2.x},${routePreviewSvgPoints.p2.y}`}
              fill="none"
              stroke="#E05D44"
              strokeWidth={3}
              strokeDasharray="6 3"
            />
          )}

          {/* Drag Ghost Preview */}
          {dragPreviewMm && viewerRef.current?.viewport?.camera && kcModuleRef.current && (() => {
            const pt = viewerRef.current!.viewport.camera.world_to_screen(
              new kcModuleRef.current!.Vec2(dragPreviewMm.xMm, dragPreviewMm.yMm)
            );
            return (
              <g>
                <circle cx={pt.x} cy={pt.y} r={14} fill="rgba(56, 189, 248, 0.2)" stroke="#38BDF8" strokeWidth={2} strokeDasharray="4 2" />
                <text x={pt.x} y={pt.y - 18} textAnchor="middle" fill="#38BDF8" fontSize={10} fontFamily="var(--vd-font-mono)">
                  {dragPreviewMm.refdes}: {dragPreviewMm.xMm.toFixed(2)}, {dragPreviewMm.yMm.toFixed(2)} mm
                </text>
              </g>
            );
          })()}

          {/* Power Integrity 2.5D FEM Heatmap Overlay (P13 padne) */}
          {piHeatmap.enabled && piHeatmap.result && viewerRef.current?.viewport?.camera && kcModuleRef.current && (() => {
            const cam = viewerRef.current!.viewport.camera;
            const kc = kcModuleRef.current!;
            const hm = piHeatmap.result!.heatmap;
            const bn = piHeatmap.result!.worst_case?.bottleneck;
            const useJ = piHeatmap.metric === 'current_density_a_mm2';
            const denom = Math.max(1e-3, useJ ? hm.max_current_density_a_mm2 : hm.max_ir_drop_mv);
            const bnPt = bn ? cam.world_to_screen(new kc.Vec2(bn.x_mm, bn.y_mm)) : null;
            return (
              <g data-testid="pcb-pi-heatmap-overlay">
                {hm.segments.map((seg, idx) => {
                  const p1 = cam.world_to_screen(new kc.Vec2(seg.x1_mm, seg.y1_mm));
                  const p2 = cam.world_to_screen(new kc.Vec2(seg.x2_mm, seg.y2_mm));
                  const norm = Math.min(1, (useJ ? seg.current_density_a_mm2 : seg.ir_drop_mv) / denom);
                  const col = samplePiColormapHex(piHeatmap.colormap, norm);
                  return (
                    <line
                      key={`pi-seg-${idx}`}
                      x1={p1.x}
                      y1={p1.y}
                      x2={p2.x}
                      y2={p2.y}
                      stroke={col}
                      strokeWidth={Math.max(4, seg.width_mm * cam.zoom * 1.1)}
                      strokeLinecap="round"
                      opacity={0.9}
                    />
                  );
                })}
                {bn && bnPt && !piHeatmap.result!.passed && (
                  <g data-testid="pcb-pi-bottleneck-marker">
                    <circle cx={bnPt.x} cy={bnPt.y} r={12} fill="rgba(239, 68, 68, 0.2)" stroke="#EF4444" strokeWidth={2} strokeDasharray="3 2" />
                    <text x={bnPt.x} y={bnPt.y - 16} textAnchor="middle" fill="#FCA5A5" fontSize={9} fontFamily="var(--vd-font-mono)">
                      {bn.current_density_a_mm2.toFixed(0)} A/mm²
                    </text>
                  </g>
                )}
              </g>
            );
          })()}

          {/* Locked Trace Amber Indicator (P12) */}
          {lockedTraceOverlay && viewerRef.current?.viewport?.camera && kcModuleRef.current && (() => {
            const p1 = viewerRef.current!.viewport.camera.world_to_screen(
              new kcModuleRef.current!.Vec2(lockedTraceOverlay.x1_nm / MM_TO_NM, lockedTraceOverlay.y1_nm / MM_TO_NM)
            );
            const p2 = viewerRef.current!.viewport.camera.world_to_screen(
              new kcModuleRef.current!.Vec2(lockedTraceOverlay.x2_nm / MM_TO_NM, lockedTraceOverlay.y2_nm / MM_TO_NM)
            );
            return (
              <g data-testid="pcb-locked-trace-line">
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#F59E0B" strokeWidth={5} opacity={0.85} />
                <text x={(p1.x + p2.x) / 2} y={(p1.y + p2.y) / 2 - 6} textAnchor="middle" fill="#FBBF24" fontSize={9}>
                  🔒 {lockedTraceOverlay.net_name}
                </text>
              </g>
            );
          })()}

          {/* Violet Ghost Route Preview (P12) */}
          {ghostSegments.length > 0 && viewerRef.current?.viewport?.camera && kcModuleRef.current && (
            <g data-testid="pcb-route-ghost-overlay">
              {ghostSegments.slice(0, 60).map((gs, idx) => {
                const p1 = viewerRef.current!.viewport.camera.world_to_screen(
                  new kcModuleRef.current!.Vec2(gs.x1_nm / MM_TO_NM, gs.y1_nm / MM_TO_NM)
                );
                const p2 = viewerRef.current!.viewport.camera.world_to_screen(
                  new kcModuleRef.current!.Vec2(gs.x2_nm / MM_TO_NM, gs.y2_nm / MM_TO_NM)
                );
                return (
                  <line
                    key={`ghost-seg-${idx}`}
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    stroke="#8B5CF6"
                    strokeWidth={2.5}
                    strokeDasharray="4 3"
                    opacity={0.9}
                  />
                );
              })}
            </g>
          )}

          {/* Violet AI Ghost Overlay */}
          {aiGhost && viewerRef.current?.viewport?.camera && kcModuleRef.current && (() => {
            const pt = viewerRef.current!.viewport.camera.world_to_screen(
              new kcModuleRef.current!.Vec2(aiGhost.targetXNm / MM_TO_NM, aiGhost.targetYNm / MM_TO_NM)
            );
            return (
              <g data-testid="pcb-ai-ghost">
                <rect
                  x={pt.x - 16}
                  y={pt.y - 12}
                  width={32}
                  height={24}
                  rx={4}
                  fill="rgba(139, 92, 246, 0.22)"
                  stroke="#8B5CF6"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                />
                <text x={pt.x} y={pt.y - 16} textAnchor="middle" fill="#C4B5FD" fontSize={10} fontFamily="var(--vd-font-mono)">
                  AI Ghost: {aiGhost.refdes}
                </text>
              </g>
            );
          })()}

          {/* Clickable P1 DRC Markers */}
          {drcScreenMarkers.map((m) => (
            <g
              key={`drc-${m.idx}`}
              data-testid={`pcb-drc-marker-${m.idx}`}
              style={{ pointerEvents: 'auto', cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation();
                globalCrossProbeBus.focusDrc(
                  `drc-${m.idx}`,
                  [m.pos_nm.x_nm - 1_000_000, m.pos_nm.y_nm - 1_000_000, m.pos_nm.x_nm + 1_000_000, m.pos_nm.y_nm + 1_000_000],
                  'pcb'
                );
                setStatusNote(`DRC ${m.severity}: ${m.message}`);
              }}
            >
              <circle
                cx={m.sx}
                cy={m.sy}
                r={9}
                fill={m.severity === 'error' ? 'rgba(239, 68, 68, 0.28)' : 'rgba(245, 158, 11, 0.28)'}
                stroke={m.severity === 'error' ? '#EF4444' : '#F59E0B'}
                strokeWidth={2}
              />
              <text x={m.sx} y={m.sy + 3} textAnchor="middle" fill="#F8FAFC" fontSize={10} fontWeight={700}>
                !
              </text>
            </g>
          ))}
        </svg>

        {/* PI Heatmap Scale Bar & Hover Readout (P13) */}
        {piHeatmap.enabled && piHeatmap.result && (
          <div
            data-testid="pcb-pi-scale-bar"
            className="vd-metric"
            style={{
              position: 'absolute',
              left: 10,
              bottom: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              padding: '6px 10px',
              backgroundColor: 'rgba(11, 14, 20, 0.92)',
              border: '1px solid var(--vd-border-subtle)',
              borderRadius: 6,
              fontSize: 10,
              pointerEvents: 'none',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: 'var(--vd-text-primary)' }}>
              <span>{piHeatmap.metric === 'current_density_a_mm2' ? 'Current Density (A/mm²)' : 'IR Drop (mV)'}</span>
              <span style={{ color: 'var(--vd-text-secondary)' }}>
                0.0 — {(piHeatmap.metric === 'current_density_a_mm2'
                  ? piHeatmap.result.heatmap.max_current_density_a_mm2
                  : piHeatmap.result.heatmap.max_ir_drop_mv
                ).toFixed(1)} {piHeatmap.metric === 'current_density_a_mm2' ? 'A/mm²' : 'mV'}
              </span>
            </div>
            <div
              style={{
                height: 8,
                width: 210,
                borderRadius: 4,
                background: `linear-gradient(90deg, ${piHeatmap.result.heatmap.color_stops.join(', ')})`,
              }}
            />
            <span data-testid="pcb-pi-hover-readout" style={{ color: '#93C5FD' }}>
              {piHeatmap.hoverSample
                ? `${piHeatmap.hoverSample.voltageV.toFixed(3)} V @ ${piHeatmap.hoverSample.currentDensityAMm2.toFixed(1)} A/mm² (${piHeatmap.hoverSample.net})`
                : `${(piHeatmap.result.worst_case?.min_delivered_v ?? 3.3).toFixed(3)} V @ ${(piHeatmap.result.worst_case?.peak_current_density_a_mm2 ?? 0).toFixed(1)} A/mm²`}
            </span>
          </div>
        )}

        {/* AI Ghost Accept/Reject floating pill */}
        {aiGhost && (
          <div
            data-testid="pcb-ai-ghost-card"
            className="vd-metric"
            style={{
              position: 'absolute',
              right: 10,
              bottom: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 10px',
              backgroundColor: 'rgba(16, 20, 28, 0.94)',
              border: '1px solid #8B5CF6',
              borderRadius: 6,
              fontSize: 11,
            }}
          >
            <span style={{ color: '#C4B5FD' }}>{aiGhost.description}</span>
            <button
              type="button"
              className="vd-btn vd-btn-primary"
              style={{ minHeight: 22, padding: '2px 8px', fontSize: 11 }}
              onClick={async () => {
                const ghost = aiGhost;
                setAiGhost(null);
                await globalKiCadSyncStore.dispatchOps(
                  `Accept AI Ghost ${ghost.refdes}`,
                  [{ op: 'MOVE_COMPONENT', component_id: ghost.refdes, x_nm: ghost.targetXNm, y_nm: ghost.targetYNm }],
                  'human',
                  ghost.refdes
                );
              }}
            >
              Accept Ghost
            </button>
            <button
              type="button"
              className="vd-btn"
              style={{ minHeight: 22, padding: '2px 8px', fontSize: 11 }}
              onClick={() => setAiGhost(null)}
            >
              Reject
            </button>
          </div>
        )}
      </div>

      {/* Bottom coordinate & layer legend readout */}
      <div
        className="vd-metric"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 11,
          color: 'var(--vd-text-secondary)',
          padding: '2px 4px',
        }}
      >
        <span>{statusNote}</span>
        <span>
          Cursor:{' '}
          {cursorWorldMm
            ? `${Math.round(cursorWorldMm.xMm * MM_TO_NM)} nm, ${Math.round(cursorWorldMm.yMm * MM_TO_NM)} nm`
            : '—'}{' '}
          · Selected: {selectedRefdes}
        </span>
      </div>
    </div>
  );
};
