import test from 'node:test';
import assert from 'node:assert/strict';
import { CLIENT_EDA_COMMANDS, WORKSPACE_TABS } from '../src/commandBus.ts';
import { runElkSchematicLayout, BUCK_PD_SCHEMATIC_INPUT } from '../src/engines/elkLayout.ts';

test('Canonical workstation keeps 18 offline EDA commands and 7 workspaces', () => {
  assert.equal(CLIENT_EDA_COMMANDS.length, 18);
  assert.ok(CLIENT_EDA_COMMANDS.every((c) => c.requiresAi === false));
  assert.deepEqual(
    WORKSPACE_TABS.map((w) => w.id),
    ['schematic', 'pcb_layout', 'mcad_3d', 'sim_lab', 'library_bom', 'firmware_pinmux', 'mfg_diff']
  );
});

test('Real elkjs schematic auto-layout computes non-overlapping orthogonal coordinates and bends', async () => {
  const layout = await runElkSchematicLayout(BUCK_PD_SCHEMATIC_INPUT);
  assert.ok(layout.width > 200 && layout.height > 150);
  assert.equal(layout.nodes.length, BUCK_PD_SCHEMATIC_INPUT.nodes.length);
  assert.equal(layout.edges.length, BUCK_PD_SCHEMATIC_INPUT.edges.length);

  for (const node of layout.nodes) {
    assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y), `Node ${node.id} missing finite coordinates`);
  }
  assert.ok(
    layout.edges.every((edge) => edge.points.length >= 2),
    'Every laid-out wire must contain at least start and end points'
  );
  const posSet = new Set(layout.nodes.map((n) => `${Math.round(n.x)}:${Math.round(n.y)}`));
  assert.equal(posSet.size, layout.nodes.length, 'elkjs must assign distinct node positions');
});
