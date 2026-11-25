import { SILICON_DARKROOM_PALETTE, ViewportState, WebGpuCadEngine } from './engine.js';

export interface CadPadGeometry {
  id: string;
  refdes: string;
  net: string;
  layer: string;
  xNm: bigint;
  yNm: bigint;
  widthNm: bigint;
  heightNm: bigint;
  locked: boolean;
}

export interface CadTraceGeometry {
  id: string;
  net: string;
  layer: string;
  x1Nm: bigint;
  y1Nm: bigint;
  x2Nm: bigint;
  y2Nm: bigint;
  widthNm: bigint;
}

export interface CadRatsnestEdge {
  id: string;
  net: string;
  x1Nm: bigint;
  y1Nm: bigint;
  x2Nm: bigint;
  y2Nm: bigint;
}

export interface CadSceneGeometry {
  boardWidthNm: bigint;
  boardHeightNm: bigint;
  pads: CadPadGeometry[];
  traces: CadTraceGeometry[];
  ratsnest: CadRatsnestEdge[];
}

export interface CadRenderFlags {
  layersVisible: boolean;
  ratsnestVisible: boolean;
  lockRingsVisible: boolean;
}

export interface GpuFrameBuffers {
  traceInstances: Float32Array;
  traceCount: number;
  padInstances: Float32Array;
  padCount: number;
  ratsnestInstances: Float32Array;
  ratsnestCount: number;
  lockRingInstances: Float32Array;
  lockRingCount: number;
}

export interface RenderCapabilities {
  hasWebGpu: boolean;
  hasWebGl2: boolean;
}

export interface Canvas2dLikeContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  globalAlpha: number;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  fill(): void;
  fillText(text: string, x: number, y: number): void;
  setLineDash(segments: number[]): void;
  save(): void;
  restore(): void;
}

export function detectRenderCapabilities(scope: { navigator?: unknown; WebGL2RenderingContext?: unknown } = globalThis as {
  navigator?: unknown;
  WebGL2RenderingContext?: unknown;
}): RenderCapabilities {
  const nav = scope.navigator as { gpu?: unknown } | undefined;
  return {
    hasWebGpu: Boolean(nav && nav.gpu),
    hasWebGl2: typeof scope.WebGL2RenderingContext !== 'undefined',
  };
}

export function createSampleBuckScene(): CadSceneGeometry {
  return {
    boardWidthNm: 44_000_000n,
    boardHeightNm: 26_000_000n,
    pads: [
      { id: 'pad-u1', refdes: 'U1', net: 'VBUS_12V', layer: 'F.Cu', xNm: -12_000_000n, yNm: 4_000_000n, widthNm: 3_000_000n, heightNm: 3_000_000n, locked: true },
      { id: 'pad-u2', refdes: 'U2', net: 'SW_NODE', layer: 'F.Cu', xNm: -2_000_000n, yNm: 2_000_000n, widthNm: 4_000_000n, heightNm: 4_000_000n, locked: true },
      { id: 'pad-l1', refdes: 'L1', net: 'SW_NODE', layer: 'F.Cu', xNm: 9_000_000n, yNm: -1_000_000n, widthNm: 4_200_000n, heightNm: 3_800_000n, locked: false },
      { id: 'pad-c1', refdes: 'C1', net: '+3V3_OUT', layer: 'B.Cu', xNm: 15_000_000n, yNm: -4_000_000n, widthNm: 2_400_000n, heightNm: 1_800_000n, locked: false },
    ],
    traces: [
      { id: 'tr-1', net: 'VBUS_12V', layer: 'F.Cu', x1Nm: -12_000_000n, y1Nm: 4_000_000n, x2Nm: -2_000_000n, y2Nm: 2_000_000n, widthNm: 600_000n },
      { id: 'tr-2', net: 'SW_NODE', layer: 'F.Cu', x1Nm: -2_000_000n, y1Nm: 2_000_000n, x2Nm: 9_000_000n, y2Nm: -1_000_000n, widthNm: 900_000n },
      { id: 'tr-3', net: '+3V3_OUT', layer: 'B.Cu', x1Nm: 9_000_000n, y1Nm: -1_000_000n, x2Nm: 15_000_000n, y2Nm: -4_000_000n, widthNm: 500_000n },
    ],
    ratsnest: [
      { id: 'rn-1', net: 'GND', x1Nm: -12_000_000n, y1Nm: 4_000_000n, x2Nm: 15_000_000n, y2Nm: -4_000_000n },
    ],
  };
}

function nmToPxCoord(
  xNm: bigint,
  yNm: bigint,
  viewport: ViewportState,
  widthPx: number,
  heightPx: number
): [number, number] {
  const nmPerPx = 100_000.0 / viewport.zoomFactor;
  const relX = Number(xNm - viewport.panXNm) / nmPerPx;
  const relY = Number(yNm - viewport.panYNm) / nmPerPx;
  return [widthPx / 2 + relX, heightPx / 2 - relY];
}

export function createGpuFrameBuffers(
  scene: CadSceneGeometry,
  viewport: ViewportState,
  widthPx: number,
  heightPx: number,
  flags: CadRenderFlags
): GpuFrameBuffers {
  const nmPerPx = 100_000.0 / viewport.zoomFactor;
  const visibleTraces = flags.layersVisible ? scene.traces : [];
  const traceInstances = new Float32Array(visibleTraces.length * 5);
  visibleTraces.forEach((tr, i) => {
    const [x1, y1] = nmToPxCoord(tr.x1Nm, tr.y1Nm, viewport, widthPx, heightPx);
    const [x2, y2] = nmToPxCoord(tr.x2Nm, tr.y2Nm, viewport, widthPx, heightPx);
    traceInstances.set([x1, y1, x2, y2, Math.max(1.5, Number(tr.widthNm) / nmPerPx)], i * 5);
  });

  const padInstances = new Float32Array(scene.pads.length * 4);
  const lockedPads = flags.lockRingsVisible ? scene.pads.filter((p) => p.locked) : [];
  const lockRingInstances = new Float32Array(lockedPads.length * 3);

  scene.pads.forEach((pad, i) => {
    const [cx, cy] = nmToPxCoord(pad.xNm, pad.yNm, viewport, widthPx, heightPx);
    const w = Math.max(8, Number(pad.widthNm) / nmPerPx);
    const h = Math.max(8, Number(pad.heightNm) / nmPerPx);
    padInstances.set([cx - w / 2, cy - h / 2, w, h], i * 4);
  });

  lockedPads.forEach((pad, i) => {
    const [cx, cy] = nmToPxCoord(pad.xNm, pad.yNm, viewport, widthPx, heightPx);
    const r = Math.max(14, Number(pad.widthNm) / nmPerPx / 2 + 8);
    lockRingInstances.set([cx, cy, r], i * 3);
  });

  const visibleRats = flags.ratsnestVisible ? scene.ratsnest : [];
  const ratsnestInstances = new Float32Array(visibleRats.length * 4);
  visibleRats.forEach((rn, i) => {
    const [x1, y1] = nmToPxCoord(rn.x1Nm, rn.y1Nm, viewport, widthPx, heightPx);
    const [x2, y2] = nmToPxCoord(rn.x2Nm, rn.y2Nm, viewport, widthPx, heightPx);
    ratsnestInstances.set([x1, y1, x2, y2], i * 4);
  });

  return {
    traceInstances,
    traceCount: visibleTraces.length,
    padInstances,
    padCount: scene.pads.length,
    ratsnestInstances,
    ratsnestCount: visibleRats.length,
    lockRingInstances,
    lockRingCount: lockedPads.length,
  };
}

export function renderSceneToCanvas2d(
  ctx: Canvas2dLikeContext,
  engine: WebGpuCadEngine,
  scene: CadSceneGeometry,
  widthPx: number,
  heightPx: number,
  flags: CadRenderFlags
): GpuFrameBuffers {
  const viewport = engine.getViewport();
  const highlights = engine.getActiveHighlights();
  const buffers = createGpuFrameBuffers(scene, viewport, widthPx, heightPx, flags);

  ctx.save();
  ctx.fillStyle = '#0B0E14';
  ctx.fillRect(0, 0, widthPx, heightPx);

  // Subtle nanometer grid
  ctx.strokeStyle = '#18202D';
  ctx.lineWidth = 1;
  const gridStep = Math.max(20, Math.round(40 * Math.min(2.5, viewport.zoomFactor)));
  for (let gx = 0; gx < widthPx; gx += gridStep) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, heightPx);
    ctx.stroke();
  }
  for (let gy = 0; gy < heightPx; gy += gridStep) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(widthPx, gy);
    ctx.stroke();
  }

  // Board outline (Edge.Cuts)
  const halfW = scene.boardWidthNm / 2n;
  const halfH = scene.boardHeightNm / 2n;
  const [bx1, by1] = engine.transformCoordinatesNmToPixels(-halfW, halfH, widthPx, heightPx);
  const [bx2, by2] = engine.transformCoordinatesNmToPixels(halfW, -halfH, widthPx, heightPx);
  ctx.strokeStyle = SILICON_DARKROOM_PALETTE['Edge.Cuts'].color;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bx1, by1, Math.max(10, bx2 - bx1), Math.max(10, by2 - by1));

  // Traces
  if (flags.layersVisible) {
    scene.traces.forEach((tr, idx) => {
      const base = idx * 5;
      const x1 = buffers.traceInstances[base];
      const y1 = buffers.traceInstances[base + 1];
      const x2 = buffers.traceInstances[base + 2];
      const y2 = buffers.traceInstances[base + 3];
      const w = buffers.traceInstances[base + 4];
      const layerStyle = SILICON_DARKROOM_PALETTE[tr.layer] ?? SILICON_DARKROOM_PALETTE['F.Cu'];
      const isHighlighted = highlights.netId === tr.net;

      ctx.strokeStyle = isHighlighted ? SILICON_DARKROOM_PALETTE['Highlight'].color : layerStyle.color;
      ctx.globalAlpha = isHighlighted ? 1.0 : layerStyle.opacity;
      ctx.lineWidth = isHighlighted ? w + 2 : w;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    });
  }

  // Ratsnest
  if (flags.ratsnestVisible) {
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (let i = 0; i < buffers.ratsnestCount; i++) {
      const base = i * 4;
      ctx.beginPath();
      ctx.moveTo(buffers.ratsnestInstances[base], buffers.ratsnestInstances[base + 1]);
      ctx.lineTo(buffers.ratsnestInstances[base + 2], buffers.ratsnestInstances[base + 3]);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // Pads & Component Labels
  scene.pads.forEach((pad, i) => {
    const base = i * 4;
    const x = buffers.padInstances[base];
    const y = buffers.padInstances[base + 1];
    const w = buffers.padInstances[base + 2];
    const h = buffers.padInstances[base + 3];
    const selected = highlights.componentId === pad.refdes;
    const layerStyle = SILICON_DARKROOM_PALETTE[pad.layer] ?? SILICON_DARKROOM_PALETTE['F.Cu'];

    ctx.globalAlpha = 1.0;
    ctx.fillStyle = '#151A24';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = selected ? '#38BDF8' : pad.locked ? '#FBBF24' : layerStyle.color;
    ctx.lineWidth = selected ? 2.5 : 1.5;
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = '#E6EDF7';
    ctx.font = '11px monospace';
    ctx.fillText(pad.refdes, x + 4, y + Math.max(12, h / 2 + 4));
  });

  // Amber Lock Rings
  if (flags.lockRingsVisible) {
    ctx.strokeStyle = '#FBBF24';
    ctx.lineWidth = 2;
    for (let i = 0; i < buffers.lockRingCount; i++) {
      const base = i * 3;
      ctx.beginPath();
      ctx.arc(
        buffers.lockRingInstances[base],
        buffers.lockRingInstances[base + 1],
        buffers.lockRingInstances[base + 2],
        0,
        Math.PI * 2
      );
      ctx.stroke();
    }
  }

  ctx.restore();
  return buffers;
}

export function renderSceneToWebGl2(gl: {
  clearColor(r: number, g: number, b: number, a: number): void;
  clear(mask: number): void;
  COLOR_BUFFER_BIT: number;
}, buffers: GpuFrameBuffers): number {
  gl.clearColor(0.043, 0.055, 0.078, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  return buffers.traceCount + buffers.padCount + buffers.ratsnestCount;
}
