import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  WebGpuCadEngine,
  createSampleBuckScene,
  createGpuFrameBuffers,
  detectRenderCapabilities,
  initWebGl2Pipeline,
  renderSceneToCanvas2d,
  renderSceneToWebGl2,
  runGeometryWorkerTask,
  WebGl2LikeContext,
  WebGl2PipelineHandle,
} from '@vajradhir/webgpu-cad-engine';
import { globalCrossProbeBus } from '@vajradhir/crossprobe-bus';

export interface PcbEngineCanvasProps {
  layersVisible: boolean;
  ratsnestVisible: boolean;
  lockRingsVisible: boolean;
}

export const PcbEngineCanvas: React.FC<PcbEngineCanvasProps> = ({
  layersVisible,
  ratsnestVisible,
  lockRingsVisible,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glPipelineRef = useRef<WebGl2PipelineHandle | null>(null);
  const snapshot = useSyncExternalStore(
    globalCrossProbeBus.subscribeSnapshot,
    globalCrossProbeBus.getSnapshot
  );

  const engine = useMemo(() => {
    const caps = detectRenderCapabilities();
    return new WebGpuCadEngine(caps.hasWebGpu, caps.hasWebGl2);
  }, []);

  const scene = useMemo(() => createSampleBuckScene(), []);
  const [zoomUi, setZoomUi] = useState(1.0);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({ w: 640, h: 340 });
  const [renderPath, setRenderPath] = useState<string>('Canvas2D');
  const [bufferSummary, setBufferSummary] = useState<string>('0 traces / 0 pads');

  useEffect(() => {
    const selected = snapshot.selection.entityIds[0] ?? '';
    engine.handleCrossProbeEvent({
      type: 'SelectComponent',
      payload: { componentId: selected },
    });
    engine.handleCrossProbeEvent({
      type: 'HighlightNet',
      payload: { netId: snapshot.activeHighlight.netId ?? '' },
    });
  }, [engine, snapshot.selection.entityIds, snapshot.activeHighlight.netId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width < 32 || rect.height < 32) return;
      const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
      setCanvasSize({
        w: Math.max(160, Math.round(rect.width * dpr)),
        h: Math.max(120, Math.round(rect.height * dpr)),
      });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvasSize.w;
    const height = canvasSize.h;
    canvas.width = width;
    canvas.height = height;

    const flags = { layersVisible, ratsnestVisible, lockRingsVisible };
    const buffers = createGpuFrameBuffers(scene, engine.getViewport(), width, height, flags);

    const gl2 =
      engine.getBackend() !== 'software_canvas'
        ? (canvas.getContext('webgl2') as unknown as WebGl2LikeContext | null)
        : null;

    if (gl2) {
      if (!glPipelineRef.current) {
        glPipelineRef.current = initWebGl2Pipeline(gl2);
      }
      if (glPipelineRef.current) {
        renderSceneToWebGl2(gl2, glPipelineRef.current, buffers, width, height);
        setRenderPath('webgl2');
        setBufferSummary(`${buffers.traceCount} traces / ${buffers.padCount} pads / ${buffers.lockRingCount} locks`);
        return;
      }
    }

    const ctx2d = canvas.getContext('2d');
    if (ctx2d) {
      renderSceneToCanvas2d(ctx2d, engine, scene, width, height, flags);
      setRenderPath('Canvas2D');
    }

    setBufferSummary(`${buffers.traceCount} traces / ${buffers.padCount} pads / ${buffers.lockRingCount} locks`);
  }, [engine, scene, canvasSize, layersVisible, ratsnestVisible, lockRingsVisible, zoomUi, snapshot]);

  const handleCanvasClick = async (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(1, rect.width);
    const scaleY = canvas.height / Math.max(1, rect.height);
    const sx = (event.clientX - rect.left) * scaleX;
    const sy = (event.clientY - rect.top) * scaleY;

    const targetNm = engine.screenPixelsToNm(sx, sy, canvas.width, canvas.height);
    const result = await runGeometryWorkerTask({
      kind: 'HIT_TEST',
      scene,
      targetNm,
      toleranceNm: 3_500_000n,
    });
    if (result.kind === 'HIT_TEST' && result.refdes) {
      globalCrossProbeBus.select([result.refdes], 'pcb');
      if (result.net) {
        globalCrossProbeBus.highlightNet(result.net, 'pcb');
      }
    } else {
      globalCrossProbeBus.select([], 'pcb');
      globalCrossProbeBus.highlightNet(null, 'pcb');
    }
  };

  const adjustZoom = (factorDelta: number) => {
    const next = Number(Math.max(0.4, Math.min(4.0, zoomUi + factorDelta)).toFixed(2));
    engine.setZoom(next);
    setZoomUi(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 8 }}>
      <div
        className="vd-metric"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          backgroundColor: 'var(--vd-bg-panel)',
          border: '1px solid var(--vd-border-subtle)',
          borderRadius: 4,
          fontSize: 12,
        }}
      >
        <span>
          Backend: <strong>{renderPath}</strong> · Target {engine.getTargetFps()} FPS · {bufferSummary}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>CrossProbe: {snapshot.lastLatencyMs.toFixed(2)} ms</span>
          <button type="button" className="vd-btn" onClick={() => adjustZoom(-0.2)} aria-label="Zoom out PCB">
            -
          </button>
          <span>{Math.round(zoomUi * 100)}%</span>
          <button type="button" className="vd-btn" onClick={() => adjustZoom(0.2)} aria-label="Zoom in PCB">
            +
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        style={{
          flex: 1,
          minHeight: 200,
          border: '1px solid var(--vd-border-subtle)',
          borderRadius: 6,
          backgroundColor: 'var(--vd-bg-canvas)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <canvas
          ref={canvasRef}
          width={canvasSize.w}
          height={canvasSize.h}
          data-testid="pcb-engine-canvas"
          onClick={handleCanvasClick}
          style={{ width: '100%', height: '100%', cursor: 'crosshair', display: 'block' }}
          aria-label="Interactive Silicon Darkroom PCB Canvas"
        />
      </div>
    </div>
  );
};
