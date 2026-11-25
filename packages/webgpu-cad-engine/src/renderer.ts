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

export interface WebGl2LikeContext {
  VERTEX_SHADER: number;
  FRAGMENT_SHADER: number;
  ARRAY_BUFFER: number;
  DYNAMIC_DRAW: number;
  FLOAT: number;
  LINES: number;
  TRIANGLES: number;
  COLOR_BUFFER_BIT: number;
  COMPILE_STATUS: number;
  LINK_STATUS: number;
  createShader(type: number): unknown;
  shaderSource(shader: unknown, source: string): void;
  compileShader(shader: unknown): void;
  getShaderParameter(shader: unknown, pname: number): unknown;
  createProgram(): unknown;
  attachShader(program: unknown, shader: unknown): void;
  linkProgram(program: unknown): void;
  getProgramParameter(program: unknown, pname: number): unknown;
  useProgram(program: unknown): void;
  createBuffer(): unknown;
  bindBuffer(target: number, buffer: unknown): void;
  bufferData(target: number, data: ArrayBufferView, usage: number): void;
  getAttribLocation(program: unknown, name: string): number;
  getUniformLocation(program: unknown, name: string): unknown;
  enableVertexAttribArray(index: number): void;
  vertexAttribPointer(index: number, size: number, type: number, normalized: boolean, stride: number, offset: number): void;
  uniform2f(loc: unknown, x: number, y: number): void;
  uniform4f(loc: unknown, r: number, g: number, b: number, a: number): void;
  viewport(x: number, y: number, w: number, h: number): void;
  clearColor(r: number, g: number, b: number, a: number): void;
  clear(mask: number): void;
  drawArrays(mode: number, first: number, count: number): void;
}

export interface WebGl2PipelineHandle {
  program: unknown;
  vbo: unknown;
  posLoc: number;
  resLoc: unknown;
  colorLoc: unknown;
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

  const halfW = scene.boardWidthNm / 2n;
  const halfH = scene.boardHeightNm / 2n;
  const [bx1, by1] = engine.transformCoordinatesNmToPixels(-halfW, halfH, widthPx, heightPx);
  const [bx2, by2] = engine.transformCoordinatesNmToPixels(halfW, -halfH, widthPx, heightPx);
  ctx.strokeStyle = SILICON_DARKROOM_PALETTE['Edge.Cuts'].color;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bx1, by1, Math.max(10, bx2 - bx1), Math.max(10, by2 - by1));

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

const VERT_SHADER_300 = `#version 300 es
in vec2 a_pos;
uniform vec2 u_res;
void main() {
  vec2 clip = vec2((a_pos.x / u_res.x) * 2.0 - 1.0, 1.0 - (a_pos.y / u_res.y) * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
}`;

const FRAG_SHADER_300 = `#version 300 es
precision mediump float;
uniform vec4 u_color;
out vec4 outColor;
void main() {
  outColor = u_color;
}`;

export function initWebGl2Pipeline(gl: WebGl2LikeContext): WebGl2PipelineHandle | null {
  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, VERT_SHADER_300);
  gl.compileShader(vs);
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) return null;

  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, FRAG_SHADER_300);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) return null;

  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;

  const vbo = gl.createBuffer();
  return {
    program,
    vbo,
    posLoc: gl.getAttribLocation(program, 'a_pos'),
    resLoc: gl.getUniformLocation(program, 'u_res'),
    colorLoc: gl.getUniformLocation(program, 'u_color'),
  };
}

export function renderSceneToWebGl2(
  gl: WebGl2LikeContext,
  pipeline: WebGl2PipelineHandle,
  buffers: GpuFrameBuffers,
  widthPx: number,
  heightPx: number
): number {
  gl.viewport(0, 0, widthPx, heightPx);
  gl.clearColor(0.043, 0.055, 0.078, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(pipeline.program);
  gl.uniform2f(pipeline.resLoc, widthPx, heightPx);
  gl.bindBuffer(gl.ARRAY_BUFFER, pipeline.vbo);
  gl.enableVertexAttribArray(pipeline.posLoc);
  gl.vertexAttribPointer(pipeline.posLoc, 2, gl.FLOAT, false, 0, 0);

  let primitivesDrawn = 0;

  // Draw pad rectangles as triangle pairs
  if (buffers.padCount > 0) {
    const padVerts = new Float32Array(buffers.padCount * 12);
    for (let i = 0; i < buffers.padCount; i++) {
      const b = i * 4;
      const x = buffers.padInstances[b];
      const y = buffers.padInstances[b + 1];
      const w = buffers.padInstances[b + 2];
      const h = buffers.padInstances[b + 3];
      padVerts.set([x, y, x + w, y, x, y + h, x + w, y, x + w, y + h, x, y + h], i * 12);
    }
    gl.uniform4f(pipeline.colorLoc, 0.082, 0.102, 0.141, 1.0);
    gl.bufferData(gl.ARRAY_BUFFER, padVerts, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, buffers.padCount * 6);
    primitivesDrawn += buffers.padCount;
  }

  // Draw copper traces as lines
  if (buffers.traceCount > 0) {
    const traceVerts = new Float32Array(buffers.traceCount * 4);
    for (let i = 0; i < buffers.traceCount; i++) {
      const b = i * 5;
      traceVerts.set(
        [
          buffers.traceInstances[b],
          buffers.traceInstances[b + 1],
          buffers.traceInstances[b + 2],
          buffers.traceInstances[b + 3],
        ],
        i * 4
      );
    }
    gl.uniform4f(pipeline.colorLoc, 0.878, 0.365, 0.267, 0.9);
    gl.bufferData(gl.ARRAY_BUFFER, traceVerts, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.LINES, 0, buffers.traceCount * 2);
    primitivesDrawn += buffers.traceCount;
  }

  // Draw ratsnest guides as cool gray lines
  if (buffers.ratsnestCount > 0) {
    gl.uniform4f(pipeline.colorLoc, 0.58, 0.64, 0.72, 0.7);
    gl.bufferData(gl.ARRAY_BUFFER, buffers.ratsnestInstances, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.LINES, 0, buffers.ratsnestCount * 2);
    primitivesDrawn += buffers.ratsnestCount;
  }

  // Draw lock rings around locked components (amber line loops approximated by 16 segments)
  if (buffers.lockRingCount > 0) {
    const segs = 16;
    const lockVerts = new Float32Array(buffers.lockRingCount * segs * 4);
    let idx = 0;
    for (let i = 0; i < buffers.lockRingCount; i++) {
      const b = i * 3;
      const cx = buffers.lockRingInstances[b];
      const cy = buffers.lockRingInstances[b + 1];
      const r = buffers.lockRingInstances[b + 2];
      for (let s = 0; s < segs; s++) {
        const a1 = (s / segs) * Math.PI * 2;
        const a2 = ((s + 1) / segs) * Math.PI * 2;
        lockVerts[idx++] = cx + Math.cos(a1) * r;
        lockVerts[idx++] = cy + Math.sin(a1) * r;
        lockVerts[idx++] = cx + Math.cos(a2) * r;
        lockVerts[idx++] = cy + Math.sin(a2) * r;
      }
    }
    gl.uniform4f(pipeline.colorLoc, 0.984, 0.749, 0.141, 1.0);
    gl.bufferData(gl.ARRAY_BUFFER, lockVerts, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.LINES, 0, buffers.lockRingCount * segs * 2);
    primitivesDrawn += buffers.lockRingCount;
  }

  return primitivesDrawn;
}
