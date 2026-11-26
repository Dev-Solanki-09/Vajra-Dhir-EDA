import assert from 'node:assert/strict';
import test from 'node:test';
import { Simulation } from 'eecircuit-engine';
import {
  SpiceWasmHost,
  applySpiceConvergenceStep,
  computeWaveformMetrics,
} from '../dist/index.js';

test('Real ngspice-wasm executes RC step transient cleanly', async () => {
  const sim = new Simulation();
  await sim.start();
  sim.setNetList(`* RC Step Response Test
Vin in 0 PULSE(0 5 0 1u 1u 2m 4m)
R1 in out 1k
C1 out 0 1u
.tran 20u 2m
.end
`);
  const res = await sim.runSim();
  assert.ok(res && Array.isArray(res.data) && res.data.length >= 2, 'Expected transient variables from ngspice-wasm');
  const timeVec = res.data.find((d) => String(d.name).toLowerCase() === 'time');
  const outVec = res.data.find((d) => String(d.name).toLowerCase().includes('out'));
  assert.ok(timeVec && outVec, 'Expected time and v(out) vectors');
  const times = timeVec.values.map((v) => Number(v));
  const volts = outVec.values.map((v) => Number(v));
  assert.ok(volts[volts.length - 1] > 3.5 && volts[volts.length - 1] < 5.0, `RC charge curve check failed: ${volts[volts.length - 1]}`);
  const metrics = computeWaveformMetrics(times, volts, 3.3);
  assert.ok(metrics.maxV > 0.8);
});

test('SPICE convergence recovery ladder and abortable SpiceWasmHost contract', async () => {
  const baseDeck = '* Deck\nV1 a 0 5\nR1 a 0 1k\n.tran 1u 100u\n.end';
  assert.match(applySpiceConvergenceStep(baseDeck, 0), /\.options gmin=1e-8/);
  assert.match(applySpiceConvergenceStep(baseDeck, 3), /\.tran 1u 100u uic/);

  let terminated = false;
  const fakeWorker = {
    addEventListener: () => {},
    removeEventListener: () => {},
    postMessage: () => {},
    terminate: () => {
      terminated = true;
    },
  };
  const host = new SpiceWasmHost(() => fakeWorker);
  const runPromise = host.run(baseDeck, 5000);
  host.abort('Cancelled by user');
  await assert.rejects(runPromise, /Cancelled by user/);
  assert.equal(terminated, true);
});
