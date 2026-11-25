import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ATO_KEYWORDS,
  ATO_MONARCH_LANGUAGE,
  ConPtyStreamCoordinator,
  buildHardwareSymbolTable,
  extractSymbolAtLineColumn,
  extractTerminalLinks,
  formatComponentHoverMarkdown,
  mapFindingsToIdeMarkers,
} from '../dist/index.js';

test('hardwareSymbolIndex builds multi-file symbol table and maps KiCad findings', () => {
  const sampleAto = [
    'module GoldenBuck:',
    '  U1 = new TPS54302DDCR',
    '  L1 = new SWPA5040S100MT',
    '  VBUS_12V ~ U1.VIN',
    '  SW_NODE ~ L1.1',
  ].join('\n');

  const sampleHeader = [
    '#pragma once',
    '#define PIN_BUCK_EN GPIO_PA0',
    '// Drives U1 enable pin',
  ].join('\n');

  const table = buildHardwareSymbolTable(
    [
      { path: 'elec/src/main.ato', content: sampleAto },
      { path: 'firmware/board_pins.h', content: sampleHeader },
    ],
    [
      {
        refdes: 'U1',
        mpn: 'TPS54302DDCR',
        footprint: 'SOT-23-6',
        xNm: 100_000_000,
        yNm: 80_000_000,
        locked: true,
        nets: ['VBUS_12V', 'SW_NODE'],
      },
    ]
  );

  assert.equal(ATO_KEYWORDS.includes('module'), true);
  assert.ok(ATO_MONARCH_LANGUAGE.tokenizer.root.length >= 4);
  assert.equal(table.componentsByRefdes.U1.locked, true);
  assert.ok(table.netNames.includes('SW_NODE'));
  assert.equal(table.locationsBySymbol.U1.length, 3);
  assert.equal(extractSymbolAtLineColumn('  SW_NODE ~ L1.1', 14), 'L1');

  const hover = formatComponentHoverMarkdown(table.componentsByRefdes.U1);
  assert.match(hover, /TPS54302DDCR/);
  assert.match(hover, /locked = 1/);

  const markers = mapFindingsToIdeMarkers(sampleAto, [
    { ruleId: 'ERC_POWER_FLAG', severity: 'warning', message: 'Check regulator U1 VIN flag', refdes: 'U1' },
    { ruleId: 'DRC_CLEARANCE', severity: 'error', message: 'Copper clearance near SW_NODE', netName: 'SW_NODE' },
  ]);
  assert.equal(markers.length, 2);
  assert.equal(markers[0].startLineNumber, 2);
  assert.equal(markers[1].startLineNumber, 5);
  assert.equal(markers[1].severity, 'error');
});

test('ConPtyStreamCoordinator queues commands until ready and extracts clickable terminal links', () => {
  const sent = [];
  const coord = new ConPtyStreamCoordinator();
  coord.attachSender((payload) => {
    sent.push(payload);
    return true;
  });

  // Before first ConPTY output, commands & resizes wait in queue (node-pty readiness pattern)
  coord.sendResize(120, 40);
  coord.sendCommand('echo VD_TERMINAL_OK');
  assert.equal(coord.isReady(), false);
  assert.equal(sent.length, 0);

  coord.markOutputReceived();
  assert.equal(coord.isReady(), true);
  assert.equal(sent.length, 2);
  assert.match(sent[0], /"type":"resize"/);
  assert.equal(sent[1], 'echo VD_TERMINAL_OK\r');

  coord.sendCommand('dir');
  assert.equal(sent[2], 'dir\r');

  const links = extractTerminalLinks('DRC error at elec/src/main.ato:14:5 near U1 and C1');
  assert.equal(links.length, 3);
  assert.equal(links[0].kind, 'file');
  assert.equal(links[0].path, 'elec/src/main.ato');
  assert.equal(links[0].line, 14);
  assert.equal(links[0].column, 5);
  assert.equal(links[1].kind, 'refdes');
  assert.equal(links[1].refdes, 'U1');
  assert.equal(links[2].refdes, 'C1');
});
