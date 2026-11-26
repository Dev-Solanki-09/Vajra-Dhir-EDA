import test from 'node:test';
import assert from 'node:assert/strict';

// Import canonical 12-verb definitions from src/verbs.ts
const { CANONICAL_12_MCP_VERBS, EDA_VERB_DEFINITIONS } = await import('../src/verbs.ts');

test('Harness MCP v2 defines exactly 12 canonical hw_* EDA verbs', () => {
  assert.equal(EDA_VERB_DEFINITIONS.length, 12, 'Must define exactly 12 EDA verbs');
  assert.equal(CANONICAL_12_MCP_VERBS.length, 12, 'Must define exactly 12 canonical verb names');
  const expectedVerbs = [
    'hw_discover',
    'hw_inspect',
    'hw_patch',
    'hw_lock',
    'hw_compile',
    'hw_verify',
    'hw_simulate',
    'hw_layout',
    'hw_signoff',
    'hw_firmware',
    'hw_export',
    'hw_diff',
  ];

  for (const expected of expectedVerbs) {
    const found = EDA_VERB_DEFINITIONS.find((v) => v.name === expected);
    assert.ok(found, `Expected verb ${expected} to be defined`);
    assert.ok(CANONICAL_12_MCP_VERBS.includes(expected), `Expected ${expected} in CANONICAL_12_MCP_VERBS`);
  }
});
