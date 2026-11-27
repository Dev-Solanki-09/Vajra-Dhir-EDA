#!/usr/bin/env node
/**
 * Stage 6 Product Polish, Icons, Offline Docs & No-Slop Guardrail Check.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function main() {
  // 1. Multi-OS app icons & public PWA/favicon assets
  for (const rel of [
    'assets/icons/vajra-dhir.svg',
    'assets/icons/vajra-dhir.ico',
    'assets/icons/vajra-dhir.icns',
    'assets/icons/icon-192.png',
    'assets/icons/icon-512.png',
    'apps/workstation/public/favicon.svg',
    'apps/workstation/public/icon-192.png',
    'apps/workstation/public/icon-512.png',
  ]) {
    assert.ok(fs.existsSync(rel) && fs.statSync(rel).size > 100, `Missing or empty icon asset: ${rel}`);
  }

  // 2. Offline documentation & interactive help center
  for (const doc of [
    'docs/guides/01-first-board-30-minutes.md',
    'docs/guides/02-schematic-and-atopile.md',
    'docs/guides/03-pcb-layout-and-routing.md',
    'docs/guides/04-verification-and-spice-lab.md',
    'docs/guides/05-manufacturing-and-bringup.md',
    'docs/guides/06-ai-agent-and-mcp.md',
    'docs/FAQ.md',
    'docs/TROUBLESHOOTING.md',
    'docs/KEYMAP.md',
    'docs/PACKS_AND_STORAGE.md',
    'apps/workstation/src/components/HelpCenterModal.tsx',
  ]) {
    assert.ok(fs.existsSync(doc) && fs.statSync(doc).size > 200, `Missing offline doc/component: ${doc}`);
  }

  // 3. Visual Discipline & Anti-Jargon / Zero-Fake Check in primary UI components
  const shell = fs.readFileSync('apps/workstation/src/components/WorkstationShell.tsx', 'utf8');
  assert.ok(shell.includes('HelpCenterModal') && shell.includes('status-cursor-coords'), 'WorkstationShell missing HelpCenterModal or status-cursor-coords');
  assert.ok(!shell.includes('SPICE Virtual Lab (P10)') && !shell.includes('Gerber Fab (P15)'), 'WorkstationShell still has internal P10/P15 labels');

  const fab = fs.readFileSync('apps/workstation/src/components/FabReleasePanel.tsx', 'utf8');
  assert.ok(!fab.includes("'2581check Ready'"), 'FabReleasePanel must not show fake-green 2581check Ready');
  assert.ok(fab.includes('fab-bringup-companion'), 'FabReleasePanel missing Bring-Up Companion');

  for (const uiFile of fs.readdirSync('apps/workstation/src/components')) {
    if (!uiFile.endsWith('.tsx')) continue;
    const src = fs.readFileSync(path.join('apps/workstation/src/components', uiFile), 'utf8');
    assert.ok(!/\bwindow\.(alert|confirm|prompt)\s*\(/.test(src), `Native browser alert/confirm/prompt forbidden in ${uiFile}`);
  }

  console.log('PASS: Stage 6 Product Polish, Multi-OS Icons, Offline Docs & Anti-Jargon Guardrails');
}

main();
