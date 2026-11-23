import test from 'node:test';
import assert from 'node:assert/strict';
import { WebGpuCadEngine, SILICON_DARKROOM_PALETTE } from '../src/engine.js';

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
  engine.setPan(10000000n, 10000000n); // 10mm, 10mm
  engine.setZoom(2.0);

  const [pxX, pxY] = engine.transformCoordinatesNmToPixels(10000000n, 10000000n, 1920, 1080);
  assert.equal(pxX, 960); // Centered
  assert.equal(pxY, 540); // Centered

  engine.handleCrossProbeEvent({
    type: 'HighlightNet',
    payload: { netId: '018f6c31-7b40-7001-a000-000000000020' }
  });
  assert.equal(engine.getActiveHighlights().netId, '018f6c31-7b40-7001-a000-000000000020');
});
