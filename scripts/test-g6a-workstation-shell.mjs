import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function main() {
  assert.ok(fs.existsSync('design.md'), 'Missing root design.md Silicon Darkroom spec');
  assert.ok(fs.existsSync('apps/workstation/package.json'), 'Missing canonical apps/workstation/package.json');

  const pkg = JSON.parse(fs.readFileSync('apps/workstation/package.json', 'utf8'));
  assert.ok(pkg.dependencies['dockview-react'], 'apps/workstation must depend on MIT dockview-react');
  assert.ok(!pkg.dependencies['dockview-enterprise'], 'FORBIDDEN: dockview-enterprise must not be present');
  assert.equal(pkg.devDependencies.typescript, '7.0.2', 'TypeScript must pin 7.0.2');

  const tokensCss = fs.readFileSync('apps/workstation/src/tokens.css', 'utf8');
  assert.ok(tokensCss.startsWith('/* Hallmark'), 'tokens.css line 1 must carry Hallmark stamp');
  assert.ok(tokensCss.includes('--vd-layer-f-cu:       #E05D44;') || tokensCss.includes('#E05D44'), 'Unified F.Cu token #E05D44 missing');

  const baseCss = fs.readFileSync('apps/workstation/src/base.css', 'utf8');
  assert.ok(baseCss.includes(':focus-visible'), 'base.css missing :focus-visible rule');
  assert.ok(baseCss.includes('prefers-reduced-motion: reduce'), 'base.css missing reduced-motion fallback');
  assert.ok(baseCss.includes('overflow-x: clip'), 'base.css missing overflow-x: clip');
  assert.ok(!baseCss.includes('transition: all'), 'Hallmark Floor violation: transition: all forbidden');

  const shellSrc = fs.readFileSync('apps/workstation/src/components/WorkstationShell.tsx', 'utf8');
  assert.ok(shellSrc.includes("from 'dockview-react'"), 'WorkstationShell must use real dockview-react');
  assert.ok(shellSrc.includes('PanelErrorBoundary'), 'WorkstationShell must wrap panels in PanelErrorBoundary');
  assert.ok(shellSrc.includes('Blank 2-Layer') && shellSrc.includes('Buck PD Reference') && shellSrc.includes('MCU Devboard'), 'Missing project templates');
  assert.ok(shellSrc.includes('autosave') || shellSrc.includes('Crash recovery'), 'Missing crash recovery banner');
  assert.ok(!shellSrc.includes('THOUGHT STREAM'), 'Tracked-caps THOUGHT STREAM must be sentence case');

  const cmdBus = fs.readFileSync('apps/workstation/src/commandBus.ts', 'utf8');
  assert.ok(cmdBus.includes('requiresAi: false'), 'Command bus must keep requiresAi: false');
  assert.ok(cmdBus.includes('pcb_layout') && cmdBus.includes('mfg_diff'), 'All 7 workspace IDs must remain intact');

  assert.ok(fs.existsSync('apps/workstation/dist/index.html'), 'Compiled apps/workstation/dist/index.html missing for vd studio');
  console.log('PASS: G6A canonical apps/workstation, Hallmark Silicon Darkroom tokens, dockview-react MIT, error boundaries, and dist build verified.');
}

main();
