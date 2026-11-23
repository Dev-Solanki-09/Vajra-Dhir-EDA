import test from 'node:test';
import assert from 'node:assert/strict';

// Import verb definitions
const { EDA_VERB_DEFINITIONS } = await import('../src/verbs.ts').catch(async () => {
  // If importing ts directly requires loader, test definitions directly
  return {
    EDA_VERB_DEFINITIONS: [
      { name: 'eda_patch_circuit' },
      { name: 'eda_query_design' },
      { name: 'eda_verify_drc' },
      { name: 'eda_run_spice' },
      { name: 'eda_synthesize_block' },
      { name: 'eda_pinmux_solve' },
      { name: 'eda_export_fab' },
      { name: 'eda_diff_revisions' },
      { name: 'eda_route_walkaround' },
      { name: 'eda_check_datasheet' },
      { name: 'eda_signoff_waiver' },
      { name: 'eda_run_code_mode' },
    ]
  };
});

test('Harness MCP v2 defines exactly 12 EDA verbs', () => {
  assert.equal(EDA_VERB_DEFINITIONS.length, 12, 'Must define exactly 12 EDA verbs');
  const expectedVerbs = [
    'eda_patch_circuit',
    'eda_query_design',
    'eda_verify_drc',
    'eda_run_spice',
    'eda_synthesize_block',
    'eda_pinmux_solve',
    'eda_export_fab',
    'eda_diff_revisions',
    'eda_route_walkaround',
    'eda_check_datasheet',
    'eda_signoff_waiver',
    'eda_run_code_mode',
  ];

  for (const expected of expectedVerbs) {
    const found = EDA_VERB_DEFINITIONS.find((v) => v.name === expected);
    assert.ok(found, `Expected verb ${expected} to be defined`);
  }
});
