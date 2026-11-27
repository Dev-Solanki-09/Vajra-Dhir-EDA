#!/usr/bin/env node
/**
 * Stage 7 Comprehensive Runtime & Performance Torture Gate:
 * Validates cold boot launcher health, repo size firewall, daemon RSS bounds,
 * and optional live Chromium browser render & workspace switching telemetry.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
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

async function main() {
  // 1. Tracked repo size & dist artifact guardrails
  execFileSync('node', ['scripts/check-repo-size.mjs'], { stdio: 'inherit' });
  assert.ok(fs.existsSync('apps/workstation/dist/index.html'), 'Built apps/workstation/dist/index.html required');

  // 2. Boot vd-daemon against dist static build + measure cold startup & idle RSS
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-torture-'));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const t0 = performance.now();
  const proc = spawn(process.platform === 'win32' ? 'python' : 'python3', ['packages/vd-daemon/src/daemon.py', String(port)], {
    env: { ...process.env, VD_DB_DIR: path.join(tmp, 'db'), VD_DATA_DIR: path.join(tmp, 'data') },
    stdio: 'ignore',
  });

  try {
    let bootMs = -1;
    for (let i = 0; i < 60; i++) {
      try {
        const res = await fetch(`${base}/api/v1/health`);
        if (res.status === 200) {
          bootMs = performance.now() - t0;
          break;
        }
      } catch {
        await new Promise((r) => setTimeout(r, 80));
      }
    }
    assert.ok(bootMs > 0 && bootMs < 4500, `Daemon cold boot too slow or failed: ${bootMs.toFixed(1)}ms`);

    const memRes = await fetch(`${base}/api/v1/system/memory`);
    const memJson = await memRes.json();
    assert.equal(memRes.status, 200);
    assert.ok(memJson.rss_mb > 0 && memJson.rss_mb < 350, `Unexpected daemon RSS: ${memJson.rss_mb} MB`);

    // Verify dist HTML + favicon served on root
    const htmlRes = await fetch(`${base}/`);
    assert.equal(htmlRes.status, 200);
    const htmlTxt = await htmlRes.text();
    assert.ok(htmlTxt.includes('favicon.svg'), 'Served index.html missing favicon.svg');

    // Optional Playwright Chromium interactive verification
    let pw = null;
    try {
      pw = await import('playwright');
    } catch {
      pw = null;
    }
    if (pw) {
      const browser = await pw.chromium.launch({ headless: true });
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-testid="zone2-transport-bar"]', { timeout: 15000 });
      // Cycle all 6 Personas cleanly without errors
      for (const pid of ['plan', 'sch_code', 'pcb_3d', 'mcad_3d', 'virtual_lab', 'fab_release']) {
        const btn = page.locator(`[data-testid="preset-btn-${pid}"]`);
        if (await btn.count()) {
          await btn.click();
        }
      }
      assert.equal(errors.length, 0, `Browser runtime pageerrors: ${errors.join('; ')}`);
      await browser.close();
      console.log(`PASS: Playwright headless torture check passed (boot=${bootMs.toFixed(0)}ms, rss=${memJson.rss_mb}MB)`);
    } else {
      console.log(`PASS: Daemon + Static Torture Gate passed (boot=${bootMs.toFixed(0)}ms, rss=${memJson.rss_mb}MB; playwright skipped cleanly)`);
    }
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
  console.error('FAIL: Stage 7 Torture Gate:', err);
  process.exit(1);
});
