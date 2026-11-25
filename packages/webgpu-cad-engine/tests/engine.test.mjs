import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..');
const distIndex = path.join(pkgRoot, 'dist', 'index.js');

if (!fs.existsSync(distIndex)) {
  const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  execFileSync(pnpmCmd, ['run', 'build'], { cwd: pkgRoot, stdio: 'pipe', shell: process.platform === 'win32' });
}

const {
  WebGpuCadEngine,
  SILICON_DARKROOM_PALETTE,
  STEP_WORKER_LICENSE,
  createStepWorkerRequest,
  decodeStepBufferInWorker,
  createSampleBuckScene,
  createGpuFrameBuffers,
  initWebGl2Pipeline,
  renderSceneToWebGl2,
  renderSceneToCanvas2d,
  detectRenderCapabilities,
  runGeometryWorkerTask,
} = await import(new URL('../dist/index.js', import.meta.url).href);

test('WebGPU CAD Engine Hardware Acceleration & Fallback Selection', () => {
  const engineWebGPU = new WebGpuCadEngine(true, true);
  assert.equal(engineWebGPU.getBackend(), 'webgpu');
  assert.equal(engineWebGPU.getTargetFps(), 120);

  const engineWebGL2 = new WebGpuCadEngine(false, true);
  assert.equal(engineWebGL2.getBackend(), 'webgl2');
  assert.equal(engineWebGL2.getTargetFps(), 60);

  const engineFallback = new WebGpuCadEngine(false, false);
  assert.equal(engineFallback.getBackend(), 'software_canvas');
  assert.equal(engineFallback.getTargetFps(), 30);

  const caps = detectRenderCapabilities({});
  assert.equal(caps.hasWebGpu, false);
  assert.equal(caps.hasWebGl2, false);
});

test('Silicon Darkroom Palette High-Contrast Invariants', () => {
  assert.ok(SILICON_DARKROOM_PALETTE['F.Cu']);
  assert.ok(SILICON_DARKROOM_PALETTE['In1.Cu']);
  assert.ok(SILICON_DARKROOM_PALETTE['In2.Cu']);
  assert.ok(SILICON_DARKROOM_PALETTE['B.Cu']);
  assert.ok(SILICON_DARKROOM_PALETTE['Edge.Cuts']);
  assert.equal(SILICON_DARKROOM_PALETTE['Highlight'].color, '#38BDF8');
});

test('CrossProbeBus Integration and Coordinate Transformation', () => {
  const engine = new WebGpuCadEngine(false, true);
  engine.setPan(10000000n, 10000000n);
  engine.setZoom(2.0);

  const [pxX, pxY] = engine.transformCoordinatesNmToPixels(10000000n, 10000000n, 1920, 1080);
  assert.equal(pxX, 960);
  assert.equal(pxY, 540);

  engine.handleCrossProbeEvent({
    type: 'HighlightNet',
    payload: { netId: '018f6c31-7b40-7001-a000-000000000020' },
  });
  assert.equal(engine.getActiveHighlights().netId, '018f6c31-7b40-7001-a000-000000000020');
});

test('GPU Instance Buffers, Software Canvas2D Draw Trace, and Geometry Worker Hit-Test', async () => {
  const engine = new WebGpuCadEngine(true, true);
  const scene = createSampleBuckScene();
  const buffers = createGpuFrameBuffers(scene, engine.getViewport(), 800, 480, {
    layersVisible: true,
    ratsnestVisible: true,
    lockRingsVisible: true,
  });

  assert.ok(buffers.traceInstances instanceof Float32Array);
  assert.ok(buffers.traceCount >= 2);
  assert.ok(buffers.padCount >= 4);
  assert.ok(buffers.ratsnestCount >= 1);

  const recordedCalls = [];
  const mockCtx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    globalAlpha: 1,
    beginPath() { recordedCalls.push('beginPath'); },
    moveTo() { recordedCalls.push('moveTo'); },
    lineTo() { recordedCalls.push('lineTo'); },
    stroke() { recordedCalls.push('stroke'); },
    fillRect() { recordedCalls.push('fillRect'); },
    strokeRect() { recordedCalls.push('strokeRect'); },
    arc() { recordedCalls.push('arc'); },
    fill() { recordedCalls.push('fill'); },
    fillText(txt) { recordedCalls.push(`text:${txt}`); },
    setLineDash() {},
    save() {},
    restore() {},
  };

  renderSceneToCanvas2d(mockCtx, engine, scene, 800, 480, {
    layersVisible: true,
    ratsnestVisible: true,
    lockRingsVisible: true,
  });
  assert.ok(recordedCalls.includes('stroke'), 'Canvas2D fallback should draw traces and locks');
  assert.ok(recordedCalls.some((c) => c.startsWith('text:U2')), 'Locked component U2 label must render');

  const hit = await runGeometryWorkerTask({
    kind: 'HIT_TEST',
    scene,
    targetNm: [scene.pads[0].xNm, scene.pads[0].yNm],
    toleranceNm: 2_000_000n,
  });
  assert.equal(hit.refdes, scene.pads[0].refdes);

  const bbox = await runGeometryWorkerTask({
    kind: 'COMPUTE_BBOX',
    scene,
  });
  assert.equal(bbox.kind, 'COMPUTE_BBOX');
  assert.equal(bbox.padCount, scene.pads.length);
  assert.equal(bbox.traceCount, scene.traces.length);

  // Real WebGL2 shader pipeline test
  const glCalls = [];
  const mockGl = {
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    ARRAY_BUFFER: 0x8892,
    DYNAMIC_DRAW: 0x88e8,
    FLOAT: 0x1406,
    LINES: 0x0001,
    TRIANGLES: 0x0004,
    COLOR_BUFFER_BIT: 0x4000,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    createShader: () => ({}),
    shaderSource: () => {},
    compileShader: () => {},
    getShaderParameter: () => true,
    createProgram: () => ({}),
    attachShader: () => {},
    linkProgram: () => {},
    getProgramParameter: () => true,
    useProgram: () => glCalls.push('useProgram'),
    createBuffer: () => ({}),
    bindBuffer: () => {},
    bufferData: (_t, data) => glCalls.push(`bufferData:${data.length}`),
    getAttribLocation: () => 0,
    getUniformLocation: () => ({}),
    enableVertexAttribArray: () => {},
    vertexAttribPointer: () => {},
    uniform2f: () => {},
    uniform4f: () => {},
    viewport: () => {},
    clearColor: () => {},
    clear: () => glCalls.push('clear'),
    drawArrays: (mode, _first, count) => glCalls.push(`draw:${mode}:${count}`),
  };
  const pipeline = initWebGl2Pipeline(mockGl);
  assert.ok(pipeline);
  const drawn = renderSceneToWebGl2(mockGl, pipeline, buffers, 800, 480);
  assert.ok(drawn >= buffers.padCount + buffers.traceCount);
  assert.ok(glCalls.some((c) => c.startsWith('draw:4:')));
  assert.ok(glCalls.some((c) => c.startsWith('draw:1:')));
});

test('LGPL-2.1-with-OCCT-exception Isolated STEP Web Worker Boundary', () => {
  const sample = new TextEncoder().encode('ISO-10303-21;\nHEADER;\nENDSEC;\nEND-ISO-10303-21;');
  const req = createStepWorkerRequest('board.step', sample);
  assert.equal(req.licenseIsolation, STEP_WORKER_LICENSE);
  assert.equal(req.byteLength, sample.byteLength);

  const offlineRes = decodeStepBufferInWorker(sample, null);
  assert.equal(offlineRes.ok, false);
  assert.equal(offlineRes.reason, 'OCCT_WASM_UNBUNDLED_IN_OFFLINE_ENV');

  const mockedRes = decodeStepBufferInWorker(sample, {
    ImportStepFile: () => ({ success: true, meshes: [{ name: 'PCB_Substrate' }] }),
  });
  assert.equal(mockedRes.ok, true);
  assert.equal(mockedRes.meshes.length, 1);
});
