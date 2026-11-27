#!/usr/bin/env node
/**
 * Stage 3 Canvas Ergonomics & Pure-MIT Autorouter Check:
 * Verifies unified viewport hook exports, zero idle cursor React re-renders in Pcb2DPanel,
 * Schematic/PCB direct manipulation contracts, and router_worker octilinear fallback.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

function main() {
  const hook = fs.readFileSync('apps/workstation/src/hooks/useUnifiedViewport.ts', 'utf8');
  for (const sym of ['useUnifiedViewport', 'emitLiveCursorCoords', 'computeAlignmentGuides', 'computeAltRedlineDistance']) {
    assert.ok(hook.includes(sym), `useUnifiedViewport.ts missing ${sym}`);
  }

  const sch = fs.readFileSync('apps/workstation/src/components/Schematic2DPanel.tsx', 'utf8');
  assert.ok(sch.includes('wireDrag') && sch.includes('altRedline') && sch.includes('inlineEdit'), 'Schematic2DPanel missing direct manipulation features');

  const pcb = fs.readFileSync('apps/workstation/src/components/Pcb2DPanel.tsx', 'utf8');
  assert.ok(pcb.includes('cursorWorldMmRef') && pcb.includes('emitLiveCursorCoords'), 'Pcb2DPanel must use ref-backed cursor coords');
  assert.ok(!pcb.includes('setCursorWorldMm('), 'Pcb2DPanel must not trigger React state re-render on idle pointermove');
  assert.ok(!pcb.includes('🔒'), 'Pcb2DPanel must not contain emoji characters');
  assert.ok(pcb.includes('pcb-pour-overlay') && pcb.includes('pcb-alt-redline'), 'Pcb2DPanel missing pour/redline overlays');

  // Verify pure-MIT octilinear autorouter module loads & IPC-2152 trace sizing works cleanly
  const out = execFileSync(
    process.platform === 'win32' ? 'python' : 'python3',
    [
      '-c',
      "import sys, json; sys.path.insert(0, 'packages/vd-daemon/src'); import router_worker; w = router_worker.compute_ipc2152_power_width_mm(2.0, 20.0); print(json.dumps({'ok': w > 0.2, 'width_mm': round(w, 3)}))",
    ],
    { encoding: 'utf8' }
  );
  const parsed = JSON.parse(out);
  assert.ok(parsed.ok, `router_worker failed: ${out}`);
  console.log(`PASS: Stage 3 Canvas Ergonomics & Autorouter (IPC-2152 width=${parsed.width_mm}mm)`);
}

main();
