import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('Canonical workstation keeps 18 offline EDA commands and 7 workspaces', () => {
  const cmdBus = fs.readFileSync(new URL('../src/commandBus.ts', import.meta.url), 'utf8');
  const cmdSection = cmdBus.slice(cmdBus.indexOf('CLIENT_EDA_COMMANDS'));
  const cmdIds = cmdSection.match(/\{\s*id:\s*'[^']+'/g) ?? [];
  assert.equal(cmdIds.length, 18, 'Expected all 18 EdaCommands offline');
  assert.ok(!cmdBus.includes('requiresAi: true'), 'No command may require AI');
  const falseFlags = cmdSection.match(/requiresAi:\s*false/g) ?? [];
  assert.equal(falseFlags.length, 18, 'All 18 EdaCommands must explicitly mark requiresAi: false');
  for (const id of [
    'schematic',
    'pcb_layout',
    'mcad_3d',
    'sim_lab',
    'library_bom',
    'firmware_pinmux',
    'mfg_diff',
  ]) {
    assert.ok(cmdBus.includes(`'${id}'`), `Missing workspace ${id}`);
  }
});
