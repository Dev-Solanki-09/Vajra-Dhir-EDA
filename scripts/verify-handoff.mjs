#!/usr/bin/env node
/**
 * scripts/verify-handoff.mjs
 * Machine-enforced anti-hallucination receipt generator for WORKER-GEMINI handoffs.
 * Zero external npm dependencies (Node >= 24 / 26 stdlib only).
 *
 * Usage:
 *   node scripts/verify-handoff.mjs --phase G0 --ticket .ai-sync/tickets/T-02c-gemini.md
 */

import { execSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--phase' || key === '--ticket' || key === '--base') {
      args[key.slice(2)] = argv[i + 1];
      i += 1;
    } else if (key === '--skip-dco-uncommitted') {
      args.skipDcoUncommitted = true;
    }
  }
  return args;
}

function fail(msg) {
  console.error(`[verify-handoff] FAIL: ${msg}`);
  process.exit(1);
}

function normPath(p) {
  return p.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

function extractJsonBlock(markdown, label) {
  const re = new RegExp(`<!--\\s*${label}\\s*-->\\s*\`\`\`json\\s*([\\s\\S]*?)\\s*\`\`\``, 'i');
  const m = markdown.match(re);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch (err) {
    fail(`Invalid JSON in ${label}: ${err.message}`);
  }
}

function parseWriteScopeFallback(markdown) {
  const m = markdown.match(/##\s*WRITE_SCOPE\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  if (!m) return [];
  const raw = m[1]
    .replace(/NOTHING else\.?/gi, '')
    .split(/[,\n]/)
    .map((s) => s.replace(/^[`*\-\s]+|[`*\s.]+$/g, ''))
    .map((s) => s.replace(/`/g, '').trim())
    .filter((s) => s && !s.startsWith('('));
  return raw.map(normPath);
}

function parseVerifyCmdFallback(markdown) {
  const m = markdown.match(/##\s*VERIFY_CMD[\s\S]*?```(?:[a-zA-Z]*)\n([\s\S]*?)```/i);
  if (!m) return [];
  return m[1]
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter(Boolean);
}

function matchesPattern(filePath, pattern) {
  const f = normPath(filePath);
  const p = normPath(pattern);
  if (p.endsWith('/**')) {
    const prefix = p.slice(0, -3);
    return f === prefix || f.startsWith(prefix + '/');
  }
  if (p.endsWith('/*')) {
    const prefix = p.slice(0, -2);
    return f.startsWith(prefix + '/') && !f.slice(prefix.length + 1).includes('/');
  }
  if (p.includes('*')) {
    const escaped = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
    return new RegExp(`^${escaped}$`).test(f);
  }
  return f === p;
}

function isAllowed(filePath, allowlist) {
  return allowlist.some((pat) => matchesPattern(filePath, pat));
}

function gitLines(cmd) {
  const out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return out
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.phase || !args.ticket) {
    fail('Usage: node scripts/verify-handoff.mjs --phase <PHASE> --ticket <TICKET_PATH>');
  }

  const phase = args.phase.trim();
  const ticketPath = resolve(args.ticket);
  if (!existsSync(ticketPath)) {
    fail(`Ticket file not found: ${args.ticket}`);
  }
  const ticketMd = readFileSync(ticketPath, 'utf8');

  const allowlist = (
    extractJsonBlock(ticketMd, 'WRITE_SCOPE_JSON') || parseWriteScopeFallback(ticketMd)
  ).map(normPath);
  if (allowlist.length === 0) {
    fail(`Could not parse WRITE_SCOPE from ${args.ticket}`);
  }

  // Always allow the generated receipt file and phase handoff file for the current phase
  const receiptRel = normPath(`.ai-sync/handoffs/${phase}-receipt.json`);
  const effectiveAllowlist = [...new Set([...allowlist, receiptRel])];

  const commands = extractJsonBlock(ticketMd, 'VERIFY_CMD_JSON') || parseVerifyCmdFallback(ticketMd);
  if (commands.length === 0) {
    fail(`Could not parse VERIFY_CMD from ${args.ticket}`);
  }

  // 1. SCOPE CHECK
  const baseRef = args.base || execSync('git merge-base main HEAD', { encoding: 'utf8' }).trim();
  const committedDiff = gitLines(`git diff --name-only ${baseRef}..HEAD`);
  const statusOut = execSync('git status --porcelain', { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const raw = line.slice(3).trim();
      const arrow = raw.indexOf(' -> ');
      return normPath(arrow >= 0 ? raw.slice(arrow + 4) : raw);
    });

  const touched = [...new Set([...committedDiff.map(normPath), ...statusOut])];
  const outOfScope = touched.filter((f) => !isAllowed(f, effectiveAllowlist));
  if (outOfScope.length > 0) {
    fail(`Out-of-WRITE_SCOPE files detected:\n  - ${outOfScope.join('\n  - ')}`);
  }

  // 2. PRIVACY & QUARANTINE CHECK
  const tracked = gitLines('git ls-files').map(normPath);
  const forbiddenTrackedPrefixes = [
    '.ai-sync/private/',
    'vendor/quarantine/',
    'vendor/ring1-refs/',
    'workers/sources/',
    '.hallmark/',
  ];
  const forbiddenTrackedExact = ['docs/REVERSE_ENGINEERED_ENGINES.md'];
  const privacyViolations = tracked.filter(
    (f) =>
      forbiddenTrackedExact.includes(f) ||
      forbiddenTrackedPrefixes.some((pref) => f.startsWith(pref))
  );
  if (privacyViolations.length > 0) {
    fail(`Tracked private/quarantine paths detected:\n  - ${privacyViolations.join('\n  - ')}`);
  }

  // 3. DCO CHECK on committed range
  const headSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  const commitList = gitLines(`git rev-list ${baseRef}..HEAD`);
  const missingDco = [];
  for (const sha of commitList) {
    const body = execSync(`git log -1 --format=%B ${sha}`, { encoding: 'utf8' });
    if (!/^Signed-off-by:\s+.+$/m.test(body)) {
      missingDco.push(sha);
    }
  }
  if (missingDco.length > 0) {
    fail(`Commits missing Signed-off-by DCO trailer: ${missingDco.join(', ')}`);
  }

  // 4. ANTI-VAPOR & DENY-LIST SCAN (added lines in Ring-1 paths: packages/, apps/, schemas/)
  const scanDiff = (diffText) => {
    const hits = [];
    let currentFile = '';
    const denyPatterns = [
      { name: 'dockview-enterprise', re: /dockview-enterprise/i, scope: 'ring1' },
      { name: 'pymupdf', re: /\bpymupdf\b/i, scope: 'ring1' },
      { name: 'import fitz', re: /\bimport\s+fitz\b|\bfrom\s+fitz\b/i, scope: 'ring1' },
      { name: 'kibot', re: /\bkibot\b/i, scope: 'ring1' },
      { name: 'import pcbnew', re: /\bimport\s+pcbnew\b|\bfrom\s+pcbnew\b/i, scope: 'ring1' },
      { name: 'Uuid::new_v4()', re: /Uuid::new_v4\s*\(/, scope: 'packages' },
      { name: 'hardcoded mesh_triangles_count: 348', re: /mesh_triangles_count["']?\s*[:=]\s*348/, scope: 'ring1' },
      { name: 'setBeautified(true)', re: /setBeautified\s*\(\s*true\s*\)/, scope: 'ring1' },
    ];
    for (const line of diffText.split(/\r?\n/)) {
      if (line.startsWith('+++ b/')) {
        currentFile = normPath(line.slice(6));
        continue;
      }
      if (!line.startsWith('+') || line.startsWith('+++')) continue;
      const isRing1 =
        currentFile.startsWith('packages/') ||
        currentFile.startsWith('apps/') ||
        currentFile.startsWith('schemas/');
      const isPackages = currentFile.startsWith('packages/');
      if (!isRing1) continue;
      const content = line.slice(1);
      for (const pat of denyPatterns) {
        if (pat.scope === 'packages' && !isPackages) continue;
        if (pat.re.test(content)) {
          hits.push(`${currentFile}: matched forbidden pattern "${pat.name}"`);
        }
      }
    }
    return hits;
  };

  const committedPatch = execSync(`git diff -U0 ${baseRef}..HEAD`, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const workingPatch = execSync('git diff -U0', {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const vaporHits = [...scanDiff(committedPatch), ...scanDiff(workingPatch)];
  if (vaporHits.length > 0) {
    fail(`Anti-vapor / deny-list scan failed:\n  - ${vaporHits.join('\n  - ')}`);
  }

  // 5. VERBATIM COMMAND RECEIPT
  const results = [];
  let allPassed = true;
  for (const cmd of commands) {
    const start = Date.now();
    const res = spawnSync(cmd, { shell: true, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    const durationMs = Date.now() - start;
    const stdout = res.stdout || '';
    const stderr = res.stderr || '';
    const exitCode = res.status === null ? 1 : res.status;
    const stdoutSha256 = createHash('sha256').update(stdout).digest('hex');
    const stderrSha256 = createHash('sha256').update(stderr).digest('hex');
    results.push({ cmd, exitCode, durationMs, stdoutSha256, stderrSha256, stdout, stderr });
    if (exitCode !== 0) {
      allPassed = false;
    }
  }

  const receipt = {
    schema: 'vd-handoff-receipt/v1',
    phase,
    ticket: normPath(args.ticket),
    generatedAt: new Date().toISOString(),
    baseRef,
    headSha,
    checks: {
      scope: { passed: true, files: touched },
      privacy: { passed: true, trackedCount: tracked.length },
      dco: { passed: true, commitCount: commitList.length },
      antiVapor: { passed: true },
    },
    commands: results,
    overallPassed: allPassed,
  };

  const receiptAbs = resolve(receiptRel);
  mkdirSync(dirname(receiptAbs), { recursive: true });
  writeFileSync(receiptAbs, JSON.stringify(receipt, null, 2) + '\n', 'utf8');

  console.log(`[verify-handoff] Receipt written: ${receiptRel}`);
  console.log(`[verify-handoff] Base: ${baseRef} | HEAD: ${headSha}`);
  console.log(`[verify-handoff] Scope (${touched.length} files): PASS | Privacy: PASS | DCO (${commitList.length} commits): PASS | Anti-Vapor: PASS`);
  for (const r of results) {
    console.log(`  [${r.exitCode === 0 ? 'PASS' : 'FAIL'}] (${r.exitCode}, ${r.durationMs}ms, sha256:${r.stdoutSha256.slice(0, 12)}) ${r.cmd}`);
  }

  if (!allPassed) {
    fail('One or more VERIFY_CMD commands returned non-zero exit code (see receipt JSON).');
  }
}

main();
