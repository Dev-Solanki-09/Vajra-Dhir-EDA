import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STARTER_COMPOSITE_TEMPLATES,
  analyzeSystemArchitecture,
  createGoldenBuckArchitecture,
  instantiateCompositeTemplate,
  parseSystemYaml,
  scaffoldAtoStubFromArchitecture,
  serializeSystemYaml,
} from '../dist/index.js';

test('arch-core ships 4 composite templates and detects 5V->3.3V mismatch and overcurrent', () => {
  assert.equal(STARTER_COMPOSITE_TEMPLATES.length, 4);
  const arch = createGoldenBuckArchitecture();
  const cleanReport = analyzeSystemArchitecture(arch);
  assert.equal(cleanReport.findings.length, 0);
  assert.equal(cleanReport.totalLoadMa, 210);

  // Add Raspberry Pi 40-pin SBC & wire unsafe 5V rail straight into non-5V-tolerant GPIO/power
  const existingIds = new Set(arch.blocks.map((b) => b.id));
  const rpi = instantiateCompositeTemplate('raspberry-pi-40pin', existingIds);
  assert.ok(rpi);
  arch.blocks.push(rpi);
  arch.buses.push({
    id: 'bus-unsafe-5v',
    source: 'blk-power-in',
    target: rpi.id,
    protocol: 'PowerRail',
    railVoltageV: 5.0,
    expectedMa: 3500,
    netNames: ['VBUS_5V_UNSAFE'],
  });

  const faultReport = analyzeSystemArchitecture(arch);
  assert.ok(faultReport.findings.some((f) => f.ruleId === 'VOLTAGE_MISMATCH'));
  assert.ok(faultReport.findings.some((f) => f.ruleId === 'POWER_OVERCURRENT'));
  assert.equal(faultReport.blockSeverityById[rpi.id], 'error');
});

test('system.yaml serializes and round-trips losslessly with .ato scaffolding', () => {
  const arch = createGoldenBuckArchitecture();
  const yaml = serializeSystemYaml(arch);
  const parsed = parseSystemYaml(yaml);
  assert.equal(parsed.project, arch.project);
  assert.equal(parsed.blocks.length, arch.blocks.length);
  assert.equal(parsed.buses.length, arch.buses.length);
  assert.deepEqual(parsed.blocks[1].memberRefdes, ['U2', 'L1', 'C1']);

  const ato = scaffoldAtoStubFromArchitecture(parsed);
  assert.match(ato, /component U2/);
  assert.match(ato, /signal VBUS_12V/);
});
