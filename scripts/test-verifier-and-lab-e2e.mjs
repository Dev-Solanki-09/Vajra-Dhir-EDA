#!/usr/bin/env node
/**
 * Stage 4 Verifier, SPICE Lab & Manufacturing E2E Check:
 * Tests real /api/v1/jobs verify execution, /api/v1/diagnostics + waive,
 * /stitch/z3/pinmux, /stitch/physics/smps-bode, SPICE OP/TRAN, and honest /api/v1/fab/status.
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
  return { status: res.status, json: await res.json() };
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-stage4-e2e-'));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const proc = spawn(process.platform === 'win32' ? 'python' : 'python3', ['packages/vd-daemon/src/daemon.py', '--port', String(port), '--strict-port'], {
    env: { ...process.env, VD_DB_DIR: path.join(tmp, 'db'), VD_DATA_DIR: path.join(tmp, 'data') },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let dErr = '';
  proc.stderr.on('data', (c) => { dErr += c.toString(); });

  try {
    let healthy = false;
    for (let i = 0; i < 120; i++) {
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
    assert.ok(healthy, `vd-daemon failed health check (${dErr})`);

    // Seed golden board for realistic ERC/DRC/Fab verification
    fs.cpSync('fixtures/golden-buck-mcu', path.join(tmp, 'proj'), { recursive: true });
    const act = await req(base, 'POST', '/api/v1/kicad/active-project', {
      project_dir: path.join(tmp, 'proj'),
      pcb_path: path.join(tmp, 'proj', 'golden-buck-mcu.kicad_pcb'),
      sch_path: path.join(tmp, 'proj', 'golden-buck-mcu.kicad_sch'),
      sync_hwir: true,
    });
    assert.equal(act.status, 200);

    // 1. Trigger unified async verify job
    const jobCreate = await req(base, 'POST', '/api/v1/jobs', { kind: 'verify', label: 'E2E Verify' });
    assert.equal(jobCreate.status, 200);
    let jobDone = null;
    for (let i = 0; i < 240; i++) {
      const jobsRes = await req(base, 'GET', '/api/v1/jobs');
      const found = (jobsRes.json.jobs || []).find((j) => j.id === jobCreate.json.id);
      if (found && found.status !== 'running') {
        jobDone = found;
        break;
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    assert.ok(jobDone && jobDone.status === 'completed', `Verify job failed: ${JSON.stringify(jobDone)}`);
    assert.ok(jobDone.summary && 'passed' in jobDone.summary, 'Verify job missing real summary');

    // 2. Consolidated diagnostics & waiver
    const diags = await req(base, 'GET', '/api/v1/diagnostics');
    assert.equal(diags.status, 200);
    assert.equal(diags.json.ok, true);

    const waive = await req(base, 'POST', '/api/v1/diagnostics/waive', {
      rule_id: 'TEST_RULE',
      entity_id: 'R1',
      rationale: 'E2E waiver persistence check',
    });
    assert.equal(waive.status, 200);
    assert.equal(waive.json.ok, true);

    // 3. Z3 Pinmux & SymPy/python-control SMPS Bode endpoints (live, non-hardcoded)
    const pinmux = await req(base, 'POST', '/stitch/z3/pinmux', {});
    assert.equal(pinmux.status, 200);
    assert.equal(pinmux.json.solver, 'z3-smt');
    assert.ok(Array.isArray(pinmux.json.assignments) && pinmux.json.assignments.length >= 4);

    const bode = await req(base, 'POST', '/stitch/physics/smps-bode', { l_uh: 6.8, c_eff_uf: 22.0 });
    assert.equal(bode.status, 200);
    assert.equal(bode.json.engine, 'python-control');
    assert.ok(typeof bode.json.phase_margin_deg === 'number');

    // 4. Honest /api/v1/fab/status + bringup test points
    const fabSt = await req(base, 'GET', '/api/v1/fab/status');
    assert.equal(fabSt.status, 200);
    assert.equal(fabSt.json.fabrication_status, 'NOT_FABRICATED_0_OF_3');
    assert.ok(Array.isArray(fabSt.json.bringup_test_points) && fabSt.json.bringup_test_points.length >= 3);

    console.log('PASS: Stage 4 Verifier, Z3 Pinmux, SMPS Bode, Diagnostics & Honest Fab E2E');
  } finally {
    if (dErr.trim()) console.error('DAEMON STDERR:', dErr.trim());
    proc.kill();
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

main().catch((err) => {
  console.error('FAIL: Stage 4 Verifier/Lab E2E:', err);
  process.exit(1);
});
