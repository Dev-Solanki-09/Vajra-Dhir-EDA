import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  KicadPCB,
  KicadSch,
  Vec2,
  Camera2,
  SILICON_DARKROOM_BOARD_THEME,
  SILICON_DARKROOM_SCHEMATIC_THEME,
} from '../dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

test('KiCanvas parses real KiCad 10 golden-buck-mcu board & schematic', () => {
  const pcbText = fs.readFileSync(
    path.join(repoRoot, 'fixtures/golden-buck-mcu/golden-buck-mcu.kicad_pcb'),
    'utf8'
  );
  const schText = fs.readFileSync(
    path.join(repoRoot, 'fixtures/golden-buck-mcu/golden-buck-mcu.kicad_sch'),
    'utf8'
  );

  const pcb = new KicadPCB('golden-buck-mcu.kicad_pcb', pcbText);
  const sch = new KicadSch('golden-buck-mcu.kicad_sch', schText);

  assert.ok(pcb.footprints.length >= 1, 'Expected footprints parsed from golden-buck-mcu.kicad_pcb');
  assert.ok(pcb.nets.length >= 1, 'Expected nets parsed from golden-buck-mcu.kicad_pcb');
  assert.ok(sch.symbols.size >= 1 || sch.wires.length >= 1, 'Expected schematic primitives parsed');
});

test('Silicon Darkroom theme colors match workstation tokens.css', () => {
  assert.equal(SILICON_DARKROOM_BOARD_THEME.background.to_css().toLowerCase(), 'rgba(11, 14, 20, 1)');
  assert.equal(SILICON_DARKROOM_BOARD_THEME.copper.f.to_css().toLowerCase(), 'rgba(224, 93, 68, 1)');
  assert.equal(SILICON_DARKROOM_BOARD_THEME.copper.b.to_css().toLowerCase(), 'rgba(59, 130, 246, 1)');
  assert.equal(SILICON_DARKROOM_SCHEMATIC_THEME.background.to_css().toLowerCase(), 'rgba(11, 14, 20, 1)');
});

test('Camera2 world_to_screen and screen_to_world round-trip deterministically', () => {
  const cam = new Camera2(new Vec2(1000, 600), new Vec2(50, 30), 8.0, 0);
  const world = new Vec2(42.5, 19.25);
  const screen = cam.world_to_screen(world);
  const back = cam.screen_to_world(screen);
  assert.ok(Math.abs(back.x - world.x) < 1e-6);
  assert.ok(Math.abs(back.y - world.y) < 1e-6);
});
