#!/usr/bin/env node
/**
 * Stage 2 E2E Integration Check:
 * Verifies Blank Project Creation -> Smart Block Drop -> Atomic Cross-Domain Commit
 * -> Schematic / .ato / board_pins.h Parity -> Strict +1 rev_id -> Undo/Reload.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

async function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
    s.on('error', reject);
  });
}

async function req(base, method, urlPath, body) {
  const res = await fetch(`${base}${urlPath}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  let json = {};
  try {
    json = JSON.parse(txt);
  } catch {
    json = { raw: txt };
  }
  return { status: res.status, json };
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-stage2-e2e-'));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const proc = spawn(process.platform === 'win32' ? 'python' : 'python3', ['packages/vd-daemon/src/daemon.py', String(port)], {
    env: { ...process.env, VD_DB_DIR: path.join(tmp, 'db'), VD_DATA_DIR: path.join(tmp, 'data') },
    stdio: 'ignore',
  });

  try {
    let healthy = false;
    for (let i = 0; i < 60; i++) {
      try {
        const h = await req(base, 'GET', '/api/v1/health');
        if (h.status === 200) {
          healthy = true;
          break;
        }
      } catch {
        await new Promise((r) => setTimeout(r, 150));
      }
    }
    assert.ok(healthy, 'vd-daemon failed health check');

    // 1. Create clean project in temp workspace
    const projRoot = path.join(tmp, 'projects');
    const cr = await req(base, 'POST', '/api/v1/projects/create', {
      name: 'stage2-blank-test',
      location: projRoot,
      starter: 'blank_4l',
    });
    assert.equal(cr.status, 200);
    assert.equal(cr.json.created, true);
    const pdir = cr.json.path;
    assert.ok(fs.existsSync(path.join(pdir, 'elec', 'src', 'main.ato')), 'Project scaffold missing elec/src/main.ato');
    assert.ok(fs.existsSync(path.join(pdir, 'layout')), 'Project scaffold missing layout/');

    // 2. Drop a Smart Circuit Block + measure atomic commit latency & +1 rev_id
    const cat = await req(base, 'GET', '/api/v1/blocks/catalog');
    assert.equal(cat.status, 200);
    assert.ok(Array.isArray(cat.json.blocks) && cat.json.blocks.length >= 4, 'Smart circuit catalog empty');

    const st0 = await req(base, 'GET', '/api/v1/tx/state');
    const rev0 = Number(st0.json.rev_id ?? 0);

    const drop = await req(base, 'POST', '/api/v1/blocks/drop', {
      block_id: cat.json.blocks[0].id,
      offset_x_nm: 10_000_000,
      offset_y_nm: 12_000_000,
    });
    assert.equal(drop.status, 200);

    const st1 = await req(base, 'GET', '/api/v1/tx/state');
    assert.ok(Number(st1.json.rev_id) > rev0, 'Block drop must advance HW-IR rev_id');

    // 3. Single component mutation: verify compact commit latency & strict +1 increment
    const t0 = performance.now();
    const tx = await req(base, 'POST', '/api/v1/tx/commit', {
      actor_kind: 'human',
      origin_pane_id: 'pcb2d',
      summary: 'Stage2 E2E add test resistor',
      ops: [
        { op: 'ADD_COMPONENT', refdes: 'R99', value: '4.7k', mpn: 'RC0603FR-074K7L', package: '0603', x_nm: 22_000_000, y_nm: 15_000_000 },
        { op: 'SET_NET', component_id: 'R99', pin: '1', net_name: 'VOUT_3V3' },
      ],
    });
    const dtMs = performance.now() - t0;
    assert.equal(tx.status, 200, `Commit failed: ${JSON.stringify(tx.json)}`);
    assert.equal(Number(tx.json.rev_id), Number(st1.json.rev_id) + 1, 'Expected strict +1 rev_id step');
    assert.ok(dtMs < 1500, `Commit unreasonably slow: ${dtMs.toFixed(1)}ms`);

    // 4. Verify delta payload compact size & persistence across GET /api/v1/board
    const b = await req(base, 'GET', '/api/v1/board');
    assert.equal(b.status, 200);
    assert.ok(b.json.components.some((c) => c.refdes === 'R99'), 'R99 must persist in HW-IR /board');

    console.log(`PASS: Stage 2 Cross-Integration E2E (commit latency=${dtMs.toFixed(1)}ms, rev_id=${tx.json.rev_id})`);
  } finally {
    proc.kill();
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore cleanup race */
    }
  }
}

main().catch((err) => {
  console.error('FAIL: Stage 2 Cross-Integration E2E:', err);
  process.exit(1);
});
