#!/usr/bin/env node
/**
 * Cross-platform pinned pack & developer-reference syncer for Vajra-Dhir EDA.
 * - Runtime entries (`audience === "runtime"`, `source_kind === "pinned_archive"`) NEVER run floating
 *   `git clone --depth 1`, `:latest`, or `main` pulls. They verify pinned commit/archive SHAs and
 *   unpack into `<data_dir>/packs/<pack_id>/<sha12>/` via dual-source failover (Vajra-Dhir-Packs mirror
 *   -> pinned upstream `<commit_sha>` archive).
 * - Developer-reference cloning requires explicit `--dev-refs`.
 *
 * Usage:
 *   node scripts/sync-integrated-projects.mjs [--dry-run] [--portable] [--tier1] [--tier2] [--pack <id>] [--dev-refs]
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const MANIFEST_PATH = path.join(ROOT, 'vendor', 'MANIFEST.json');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const portable = args.includes('--portable') || fs.existsSync(path.join(ROOT, 'portable.flag')) || process.env.VD_PORTABLE === '1';
const devRefsMode = args.includes('--dev-refs') || args.includes('--ring1') || args.includes('--ring2') || args.includes('--all');
const includeTier2 = args.includes('--tier2') || args.includes('--all');
const packFlagIdx = args.indexOf('--pack');
const singlePack = packFlagIdx !== -1 ? (args[packFlagIdx + 1] || '').toLowerCase() : null;

const dataDir = process.env.VD_DATA_DIR
  ? path.resolve(process.env.VD_DATA_DIR)
  : path.join(ROOT, portable ? '.vd-portable' : '.vd-runtime');
const packsDir = path.join(dataDir, 'packs');

const FORBIDDEN = /(PyMuPDF|KiBot|Konnect|Part-DB-server|pypsa-app|OpenModelica|surfer-project\/surfer|serde_kicad_sexpr)/i;

function isFloatingUrl(u) {
  return /(\/refs\/heads\/|\/archive\/(main|master)\.(zip|tar\.gz)|:latest)/i.test(u);
}

function targetTriple() {
  const plat = process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  return `${plat}-${arch}`;
}

async function downloadFile(urls, tmpPath, expectedSha256) {
  let lastErr = null;
  for (const url of urls) {
    if (!url) continue;
    if (isFloatingUrl(url)) {
      throw new Error(`SECURITY VIOLATION: Refusing floating branch/:latest URL in runtime pack sync: ${url}`);
    }
    try {
      const resp = await fetch(url, { headers: { 'User-Agent': 'Vajra-Dhir-PackSync/2.0' } });
      if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
      const buf = Buffer.from(await resp.arrayBuffer());
      const digest = crypto.createHash('sha256').update(buf).digest('hex');
      if (expectedSha256 && digest.toLowerCase() !== expectedSha256.toLowerCase()) {
        throw new Error(`SHA256 mismatch for ${url}: got ${digest}, expected ${expectedSha256}`);
      }
      fs.writeFileSync(tmpPath, buf);
      return digest;
    } catch (err) {
      lastErr = err;
      try { fs.rmSync(tmpPath, { force: true }); } catch { /* ignore */ }
    }
  }
  throw lastErr || new Error('No downloadable pinned archive URLs configured');
}

function extractArchive(archivePath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  execFileSync('tar', ['-xzf', archivePath, '-C', destDir], { stdio: 'inherit' });
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
  const triple = targetTriple();

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const entry of entries) {
    if (FORBIDDEN.test(entry.url || '')) {
      console.error(`[DENY] Blocked forbidden URL: ${entry.url}`);
      process.exit(1);
    }

    const packId = String(entry.pack_id || entry.name || '').toLowerCase();
    const audience = String(entry.audience || 'developer_reference');
    const tier = Number.isFinite(entry.tier) ? entry.tier : 2;
    const sourceKind = String(entry.source_kind || 'lockfile');

    if (singlePack && packId !== singlePack) continue;

    if (audience !== 'runtime') {
      if (!devRefsMode) continue;
      skipped += 1;
      if (dryRun) {
        console.log(`[DRY-RUN][DEV-REF] ${entry.name} (${entry.commit_sha || 'unpinned-ref'})`);
      }
      continue;
    }

    if (sourceKind !== 'pinned_archive') {
      if (dryRun) {
        console.log(`[DRY-RUN][TIER-${tier}:${sourceKind}] ${packId} (${entry.license_spdx || entry.license})`);
      }
      skipped += 1;
      continue;
    }

    if (!singlePack && tier > (includeTier2 ? 2 : 1)) {
      continue;
    }

    const commitSha = String(entry.commit_sha || '');
    if (!/^[0-9a-f]{40}$/i.test(commitSha)) {
      console.error(`[FAIL] Runtime pack '${packId}' lacks a pinned 40-char commit_sha.`);
      failed += 1;
      continue;
    }

    const sha12 = commitSha.slice(0, 12);
    const destDir = path.join(packsDir, packId, sha12);
    const markerPath = path.join(destDir, '.verified.json');
    const artifacts = entry.artifacts || {};
    const targetUrls = (artifacts.targets && artifacts.targets[triple]) ? [artifacts.targets[triple]] : [];
    const urls = [...targetUrls, artifacts.mirror_url, artifacts.upstream_archive].filter(Boolean);
    const expectedSha = String(artifacts.archive_sha256 || '');

    for (const u of urls) {
      if (isFloatingUrl(u)) {
        console.error(`[DENY] Floating ref/tag detected in MANIFEST for '${packId}': ${u}`);
        process.exit(1);
      }
    }

    if (fs.existsSync(markerPath)) {
      skipped += 1;
      continue;
    }

    if (dryRun) {
      console.log(`[DRY-RUN][TIER-${tier}] ${packId} -> ${path.relative(ROOT, destDir)} (sha=${sha12}, urls=${urls.length})`);
      ok += 1;
      continue;
    }

    fs.mkdirSync(packsDir, { recursive: true });
    const tmpArchive = path.join(packsDir, `.tmp-${packId}-${Date.now()}.tar.gz`);
    const tmpExtract = path.join(packsDir, `.extract-${packId}-${Date.now()}`);
    console.log(`[SYNC] ${packId}@${sha12} -> ${path.relative(ROOT, destDir)}`);
    try {
      const digest = await downloadFile(urls, tmpArchive, expectedSha);
      extractArchive(tmpArchive, tmpExtract);
      if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(destDir), { recursive: true });
      fs.renameSync(tmpExtract, destDir);
      fs.writeFileSync(
        markerPath,
        JSON.stringify(
          {
            pack_id: packId,
            commit_sha: commitSha,
            archive_sha256: digest,
            license_spdx: entry.license_spdx || entry.license,
            verified_at: new Date().toISOString(),
          },
          null,
          2,
        ),
        'utf8',
      );
      ok += 1;
    } catch (err) {
      console.warn(`[WARN] Failed syncing ${packId}: ${err.message}`);
      failed += 1;
    } finally {
      try { fs.rmSync(tmpArchive, { force: true }); } catch { /* ignore */ }
      try { fs.rmSync(tmpExtract, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }

  console.log(`Pinned pack sync summary (portable=${portable}, dryRun=${dryRun}): synced=${ok}, existing=${skipped}, failed=${failed}`);
  if (failed > 0 && !dryRun) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
