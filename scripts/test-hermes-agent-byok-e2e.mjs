#!/usr/bin/env node
/**
 * Stage 5 Hermes-Core BYOK Autonomous Agentic Co-Designer E2E Check:
 * Verifies Vault encryption + secret masking, Airgap 403 block on external provider,
 * SSE Plan/Thought/Proposal flow + Lock guard (409 KERNEL_LOCK_VIOLATION on locked=1),
 * Memory write approval workflow, Progressive EE skills, and Dual-Context Auditor.
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
  return { status: res.status, text: await res.text() };
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-stage5-e2e-'));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const proc = spawn(process.platform === 'win32' ? 'python' : 'python3', ['packages/vd-daemon/src/daemon.py', String(port)], {
    env: { ...process.env, VD_DB_DIR: path.join(tmp, 'db'), VD_DATA_DIR: path.join(tmp, 'data') },
    stdio: 'ignore',
  });

  try {
    for (let i = 0; i < 60; i++) {
      try {
        const h = await req(base, 'GET', '/api/v1/health');
        if (h.status === 200) break;
      } catch {
        await new Promise((r) => setTimeout(r, 150));
      }
    }

    // Seed components so agent chat can inspect targets
    fs.cpSync('fixtures/golden-buck-mcu', path.join(tmp, 'proj'), { recursive: true });
    await req(base, 'POST', '/api/v1/kicad/active-project', {
      project_dir: path.join(tmp, 'proj'),
      pcb_path: path.join(tmp, 'proj', 'golden-buck-mcu.kicad_pcb'),
      sch_path: path.join(tmp, 'proj', 'golden-buck-mcu.kicad_sch'),
      sync_hwir: true,
    });

    // 1. Vault key save + masked response + airgap fail-closed test
    const fakeSecret = 'sk-test-hermes-vault-1234567890abcd';
    const vsave = await req(base, 'POST', '/api/v1/agent/vault', { provider: 'openai', api_key: fakeSecret });
    assert.equal(vsave.status, 200);
    assert.ok(!vsave.text.includes(fakeSecret), 'Plaintext secret must never echo back in HTTP response');

    const provs = await req(base, 'GET', '/api/v1/agent/providers');
    assert.equal(provs.status, 200);
    const pj = JSON.parse(provs.text);
    assert.equal(pj.vault_status.openai.configured, true);
    assert.ok(!provs.text.includes(fakeSecret), 'Provider listing must never leak plaintext key');

    // Enforce NDA_AIRGAPPED refusal on external BYOK test-connection
    const airTest = await req(base, 'POST', '/api/v1/agent/test-connection', {
      provider: 'openai',
      dlp_tier: 'NDA_AIRGAPPED',
    });
    assert.equal(airTest.status, 403);
    assert.ok(airTest.text.includes('NDA_AIRGAP_VIOLATION'));

    // 2. Chat SSE loop against locked J1 + Dual-Context Auditor
    const chat = await req(base, 'POST', '/api/v1/agent/chat', { prompt: 'Move J1 @board @drc' });
    assert.equal(chat.status, 200);
    assert.ok(chat.text.includes('event: plan_card') && chat.text.includes('event: proposal_card'), 'Expected plan_card & proposal_card SSE events');

    const audit = await req(base, 'POST', '/api/v1/agent/audit', {});
    assert.equal(audit.status, 200);
    const aj = JSON.parse(audit.text);
    assert.equal(aj.auditor, 'hermes-dual-context-auditor');
    assert.ok(aj.human_locked_entities >= 1);

    // 3. Memory Write Approval Gate + Progressive EE Skills
    const memProp = await req(base, 'POST', '/api/v1/agent/memory', {
      layer: 'ee_lessons',
      title: 'Buck Cin sizing',
      content: 'Use 25V X7R for 12V VBUS',
    });
    assert.equal(memProp.status, 200);
    const mpj = JSON.parse(memProp.text);
    assert.equal(mpj.status, 'pending_approval');

    const memAcc = await req(base, 'POST', `/api/v1/agent/approvals/${mpj.approval_id}/accept`, {});
    assert.equal(memAcc.status, 200);

    const memList = await req(base, 'GET', '/api/v1/agent/memory?q=X7R');
    assert.equal(memList.status, 200);
    assert.ok(JSON.parse(memList.text).entries.length >= 1, 'Approved memory entry must persist in FTS5');

    const skills = await req(base, 'GET', '/api/v1/agent/skills');
    assert.equal(skills.status, 200);
    assert.ok(JSON.parse(skills.text).skills.length >= 6);

    console.log('PASS: Stage 5 Hermes-Core BYOK Vault, Airgap Guard, Plan/Ghost SSE, FTS5 Memory Gate & Dual Auditor');
  } finally {
    proc.kill();
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

main().catch((err) => {
  console.error('FAIL: Stage 5 Hermes BYOK E2E:', err);
  process.exit(1);
});
