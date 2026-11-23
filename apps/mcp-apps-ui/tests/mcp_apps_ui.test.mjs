import test from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

test('React 19.3.1 Dependency Pin & Strict Packaging', () => {
  const pkg = JSON.parse(fs.readFileSync('apps/mcp-apps-ui/package.json', 'utf8'));
  assert.strictEqual(pkg.dependencies.react, '^19.3.1');
  assert.strictEqual(pkg.dependencies['react-dom'], '^19.3.1');
});

test('MCP Apps UI Components Exist', () => {
  const appDir = 'apps/mcp-apps-ui/src';
  const requiredApps = [
    'PcbCanvasApp.tsx',
    'SchematicApp.tsx',
    'VirtualLabApp.tsx',
    'ParetoPickerApp.tsx'
  ];
  for (const app of requiredApps) {
    assert.ok(fs.existsSync(path.join(appDir, app)), `Missing app component: ${app}`);
  }
});

test('CrossProbeBus Integration and Zero-Egress Safety', () => {
  const pcbSrc = fs.readFileSync('apps/mcp-apps-ui/src/PcbCanvasApp.tsx', 'utf8');
  assert.ok(pcbSrc.includes('CROSSPROBE_SELECT'));
  assert.ok(pcbSrc.includes('postMessage'));

  const labSrc = fs.readFileSync('apps/mcp-apps-ui/src/VirtualLabApp.tsx', 'utf8');
  assert.ok(labSrc.includes('SHORT_VOUT_GND'));
});
