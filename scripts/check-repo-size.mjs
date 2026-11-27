#!/usr/bin/env node
/**
 * CI Repo-Size Guardrail (Pillar B):
 * Fails if tracked Git working-tree payload exceeds 150 MiB or any single tracked file exceeds 10 MiB,
 * and ensures heavy runtime/vendor directories remain untracked.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const MAX_TOTAL_BYTES = 150 * 1024 * 1024;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const FORBIDDEN_TRACKED_PREFIXES = ['.vd-runtime/', '.vd-portable/', '.vd-cache/', '.venv/', 'target/', '.pnpm-store/'];

const raw = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT });
const files = raw.toString('utf8').split('\0').filter(Boolean);

let totalBytes = 0;
const oversized = [];
const forbidden = [];

for (const rel of files) {
  const norm = rel.replace(/\\/g, '/');
  if (FORBIDDEN_TRACKED_PREFIXES.some((p) => norm.startsWith(p))) {
    forbidden.push(norm);
  }
  const full = path.join(ROOT, rel);
  if (fs.existsSync(full)) {
    const st = fs.statSync(full);
    if (st.isFile()) {
      totalBytes += st.size;
      if (st.size > MAX_FILE_BYTES) {
        oversized.push({ file: norm, sizeMb: +(st.size / (1024 * 1024)).toFixed(2) });
      }
    }
  }
}

const totalMb = +(totalBytes / (1024 * 1024)).toFixed(2);
if (forbidden.length > 0 || oversized.length > 0 || totalBytes > MAX_TOTAL_BYTES) {
  console.error(JSON.stringify({ ok: false, totalMb, maxTotalMb: 150, oversized, forbidden }, null, 2));
  process.exit(1);
}

console.log(`PASSED: Repo size guardrail clean (${files.length} tracked files, ${totalMb} MiB < 150 MiB limit, 0 files > 10 MiB).`);
