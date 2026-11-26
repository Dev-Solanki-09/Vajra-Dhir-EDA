#!/usr/bin/env node
/**
 * Cross-platform upstream integrated-project bootstrapper for Vajra-Dhir EDA.
 * Parses `scripts/import-upstream-stack.sh` repo lists and shallow-clones selected
 * license-isolated mirrors cleanly on Windows, macOS, and Linux.
 * Usage: node scripts/sync-integrated-projects.mjs [--dry-run] [--ring1 | --ring2 | --ring3 | --ring4 | --mcp | --all]
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const mode = args.find((a) => ['--ring1', '--ring2', '--ring3', '--ring4', '--mcp', '--all'].includes(a)) || '--ring1';

const FORBIDDEN = /(PyMuPDF|KiBot|Konnect|Part-DB-server|pypsa-app|OpenModelica|surfer-project\/surfer|serde_kicad_sexpr)/i;

function parseShGroups() {
  const shText = fs.readFileSync(path.join(ROOT, 'scripts', 'import-upstream-stack.sh'), 'utf8');
  const groups = {
    ring1: [],
    quarantine: [],
    pack2a: [],
    pack2b: [],
    pack2c: [],
    pack2d: [],
    pack2e: [],
    ring3: [],
    ring4: [],
    mcp: [],
  };

  let cur = null;
  for (const rawLine of shText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('local REPOS=(')) cur = ['ring1', 'vendor/ring1-refs'];
    else if (line.startsWith('local QUARANTINE_STUDY=(')) cur = ['quarantine', 'vendor/quarantine'];
    else if (line.startsWith('local PACK_2A=(')) cur = ['pack2a', 'workers/sources/pack-2a-pcb-physics'];
    else if (line.startsWith('local PACK_2B=(')) cur = ['pack2b', 'workers/sources/pack-2b-virtual-hil'];
    else if (line.startsWith('local PACK_2C=(')) cur = ['pack2c', 'workers/sources/pack-2c-silicon-vlsi'];
    else if (line.startsWith('local PACK_2D=(')) cur = ['pack2d', 'workers/sources/pack-2d-power-machines'];
    else if (line.startsWith('local PACK_2E=(')) cur = ['pack2e', 'workers/sources/pack-2e-comms-photonics'];
    else if (line.startsWith('local RING3=(')) cur = ['ring3', 'plugins/sources'];
    else if (line.startsWith('local RING4=(')) cur = ['ring4', 'evalops/sources'];
    else if (line.startsWith('local MCPS=(')) cur = ['mcp', 'tools/local-mcps'];
    else if (line === ')') cur = null;
    else if (cur && line.startsWith('"http')) {
      const url = line.replace(/^"+|"+$/g, '');
      groups[cur[0]].push({ dest: cur[1], url });
    }
  }
  groups.quarantine.unshift({
    dest: 'vendor/quarantine',
    url: 'https://github.com/kovacsv/occt-import-js.git',
  });
  return groups;
}

const groups = parseShGroups();
const targets = [];
if (mode === '--ring1' || mode === '--all') targets.push(...groups.ring1);
if (mode === '--ring2' || mode === '--all') {
  targets.push(...groups.quarantine, ...groups.pack2a, ...groups.pack2b, ...groups.pack2c, ...groups.pack2d, ...groups.pack2e);
}
if (mode === '--ring3' || mode === '--ring4' || mode === '--all') targets.push(...groups.ring3, ...groups.ring4);
if (mode === '--mcp' || mode === '--all') targets.push(...groups.mcp);

let ok = 0;
let skipped = 0;
let failed = 0;

for (const item of targets) {
  if (FORBIDDEN.test(item.url)) {
    console.error(`[DENY] Blocked forbidden URL: ${item.url}`);
    process.exit(1);
  }
  const name = path.basename(item.url).replace(/\.git$/i, '');
  const destDir = path.join(ROOT, item.dest);
  const targetDir = path.join(destDir, name);

  if (dryRun) {
    console.log(`[DRY-RUN] ${item.url} -> ${item.dest}/${name}`);
    ok += 1;
    continue;
  }

  fs.mkdirSync(destDir, { recursive: true });
  if (fs.existsSync(path.join(targetDir, '.git')) || fs.existsSync(path.join(targetDir, 'package.json')) || fs.existsSync(path.join(targetDir, 'pyproject.toml'))) {
    skipped += 1;
    continue;
  }

  console.log(`[SYNC] ${item.url} -> ${item.dest}/${name}`);
  try {
    execFileSync('git', ['clone', '--depth', '1', '--filter=blob:none', item.url, targetDir], { stdio: 'inherit' });
    ok += 1;
  } catch (err) {
    console.warn(`[WARN] Failed cloning ${item.url}: ${err.message}`);
    failed += 1;
  }
}

console.log(`Integrated projects summary (${mode}): synced=${ok}, existing=${skipped}, failed=${failed}`);
