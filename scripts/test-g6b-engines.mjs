import { execSync } from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';

execSync('pnpm --filter @vajradhir/crossprobe-bus run build', { stdio: 'inherit' });
execSync('pnpm --filter @vajradhir/crossprobe-bus run test', { stdio: 'inherit' });

execSync('pnpm --filter @vajradhir/webgpu-cad-engine run build', { stdio: 'inherit' });
execSync('pnpm --filter @vajradhir/webgpu-cad-engine run test', { stdio: 'inherit' });

execSync('pnpm --filter @vajradhir/workstation run build', { stdio: 'inherit' });
execSync('node --test apps/workstation/tests/workstation.test.mjs', { stdio: 'inherit' });

// 4. Verify G6B integration & G6A accessibility/token hardening in workstation sources
const shellSrc = fs.readFileSync('apps/workstation/src/components/WorkstationShell.tsx', 'utf8');
const workspacesSrc = fs.readFileSync('apps/workstation/src/components/Workspaces.tsx', 'utf8');
const baseCss = fs.readFileSync('apps/workstation/src/base.css', 'utf8');
assert.ok(shellSrc.includes('ActiveWorkspaceView'), 'ViewportPanel must mount ActiveWorkspaceView');
assert.ok(workspacesSrc.includes('PcbEngineCanvas'), 'Workspaces must embed engine-backed PcbEngineCanvas');
assert.ok(workspacesSrc.includes('SchematicElkCanvas'), 'Workspaces must embed real elkjs canvas');
assert.ok(shellSrc.includes('aria-modal="true"'), 'Modals must set aria-modal="true"');
assert.ok(shellSrc.includes('Escape'), 'Modals must support Escape close');
assert.ok(shellSrc.includes('aria-current'), 'Workspace tabs must expose aria-current');
assert.ok(baseCss.includes('--dv-background-color'), 'base.css must override Dockview theme variables cleanly');

console.log('G6B_ENGINES_OK');
