#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'manifest', 'packs.lock.json'), 'utf8'));
if (!Array.isArray(lock.packs) || lock.packs.length === 0) {
  throw new Error('packs.lock.json has no packs');
}
for (const p of lock.packs) {
  if (!/^[0-9a-f]{40}$/.test(p.commit_sha || '')) {
    throw new Error(`Invalid commit_sha on ${p.pack_id}`);
  }
  if (/agpl|eupl|osmc-pl/i.test(p.license_spdx || '')) {
    throw new Error(`Forbidden license ${p.license_spdx} on ${p.pack_id}`);
  }
}
console.log(`Pack lock smoke passed (${lock.packs.length} packs validated).`);
