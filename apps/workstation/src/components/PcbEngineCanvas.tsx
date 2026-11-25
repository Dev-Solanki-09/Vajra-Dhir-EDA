import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  WebGpuCadEngine,
  createSampleBuckScene,
  createGpuFrameBuffers,
  detectRenderCapabilities,
  renderSceneToCanvas2d,
  renderSceneToWebGl2,
  runGeometryWorkerTask,
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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
  const [renderPath, setRenderPath] = useState<string>(engine.getBackend());
  const [bufferSummary, setBufferSummary] = useState<string>('0 traces / 0 pads');

  useEffect(() => {
    const selected = snapshot.selection.entityIds[0] ?? null;
    if (selected) {
      engine.handleCrossProbeEvent({ type: 'SelectComponent', payload: { componentId: selected } });
    }
    engine.handleCrossProbeEvent({
      type: 'HighlightNet',
      payload: { netId: snapshot.activeHighlight.netId ?? undefined },
    });
  }, [engine, snapshot.selection.entityIds, snapshot.activeHighlight.netId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.width;
    const height = canvas.height;
    const flags = { layersVisible, ratsnestVisible, lockRingsVisible };
    const buffers = createGpuFrameBuffers(scene, engine.getViewport(), width, height, flags);

    const ctx2d = canvas.getContext('2d');
    if (ctx2d) {
      renderSceneToCanvas2d(ctx2d, engine, scene, width, height, flags);
      setRenderPath(engine.getBackend() === 'software_canvas' ? 'Canvas2D' : `${engine.getBackend()}+Canvas2D`);
    } else {
      const gl2 = canvas.getContext('webgl2');
      if (gl2) {
        renderSceneToWebGl2(gl2, buffers);
        setRenderPath('webgl2');
      }
    }

    setBufferSummary(`${buffers.traceCount} traces / ${buffers.padCount} pads / ${buffers.lockRingCount} locks`);
  }, [engine, scene, layersVisible, ratsnestVisible, lockRingsVisible, zoomUi, snapshot]);

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
        style={{
          flex: 1,
          minHeight: 0,
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
          width={640}
          height={340}
          data-testid="pcb-engine-canvas"
          onClick={handleCanvasClick}
          style={{ width: '100%', height: '100%', maxHeight: 360, cursor: 'crosshair', display: 'block' }}
          aria-label="Interactive Silicon Darkroom PCB Canvas"
        />
      </div>
    </div>
  );
};
