import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 1. Live repository lockfiles must pass
const liveOut = execFileSync('node', ['scripts/check-spdx-firewall.mjs'], { encoding: 'utf8' });
assert.match(liveOut, /PASSED: SPDX & Dependency License Firewall Verified Clean/i);

// 2. Negative tests using isolated temporary directories (--root)
function runFirewallExpectFail(tmpRoot, label) {
  let failed = false;
  let output = '';
  try {
    execFileSync('node', ['scripts/check-spdx-firewall.mjs', '--root', tmpRoot], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    failed = true;
    output = `${err.stdout || ''}${err.stderr || ''}`;
  }
  assert.ok(failed, `Firewall MUST fail closed on injected violation: ${label}`);
  assert.match(output, /VIOLATION:/, `Expected VIOLATION output for ${label}`);
}

const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-spdx-test-'));
try {
  // Case A: AGPL package in apps/*/package.json
  const dirA = path.join(tmpBase, 'case-app');
  fs.mkdirSync(path.join(dirA, 'apps', 'bad-ui'), { recursive: true });
  fs.writeFileSync(path.join(dirA, 'package.json'), JSON.stringify({ name: 'root', license: 'MIT' }));
  fs.writeFileSync(
    path.join(dirA, 'apps', 'bad-ui', 'package.json'),
    JSON.stringify({ name: 'bad-ui', license: 'MIT', dependencies: { kibot: '^1.0.0' } })
  );
  runFirewallExpectFail(dirA, 'apps/bad-ui/package.json kibot');

  // Case B: Forbidden package in uv.lock
  const dirB = path.join(tmpBase, 'case-uv');
  fs.mkdirSync(dirB, { recursive: true });
  fs.writeFileSync(path.join(dirB, 'package.json'), JSON.stringify({ name: 'root', license: 'MIT' }));
  fs.writeFileSync(
    path.join(dirB, 'uv.lock'),
    'version = 1\n\n[[package]]\nname = "pymupdf"\nversion = "1.24.0"\n'
  );
  runFirewallExpectFail(dirB, 'uv.lock pymupdf (AGPL)');

  // Case C: Forbidden/EUPL package in Cargo.lock
  const dirC = path.join(tmpBase, 'case-cargo');
  fs.mkdirSync(dirC, { recursive: true });
  fs.writeFileSync(path.join(dirC, 'package.json'), JSON.stringify({ name: 'root', license: 'MIT' }));
  fs.writeFileSync(
    path.join(dirC, 'Cargo.lock'),
    'version = 4\n\n[[package]]\nname = "surfer"\nversion = "0.2.0"\n'
  );
  runFirewallExpectFail(dirC, 'Cargo.lock surfer (EUPL-1.2)');

  // Case D: Forbidden package in pnpm-lock.yaml
  const dirD = path.join(tmpBase, 'case-pnpm');
  fs.mkdirSync(dirD, { recursive: true });
  fs.writeFileSync(path.join(dirD, 'package.json'), JSON.stringify({ name: 'root', license: 'MIT' }));
  fs.writeFileSync(
    path.join(dirD, 'pnpm-lock.yaml'),
    "lockfileVersion: '9.0'\npackages:\n  konnect@1.2.3:\n    resolution: {integrity: sha512-abc}\n"
  );
  runFirewallExpectFail(dirD, 'pnpm-lock.yaml konnect');
} finally {
  fs.rmSync(tmpBase, { recursive: true, force: true });
}

console.log('G8_LOCKFILE_SPDX_FIREWALL_OK');
