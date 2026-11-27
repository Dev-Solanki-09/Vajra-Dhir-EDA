#!/usr/bin/env node
/**
 * OS-agnostic launcher for Vajra-Dhir EDA Workstation.
 * - Detects `--portable` or `./portable.flag` -> isolates packs, py312 venv, DB, cache into `./.vd-portable/`.
 * - Auto-bootstraps isolated `uv` Python 3.12 venv under `<dataDir>/py312/` (with safe offline fallback).
 * - Builds `apps/workstation/dist` only if missing (never runs vite dev as runtime server).
 * - Claims free loopback port 41900-41950 (or `--strict-port`).
 * - Starts `vd-daemon` with random `VD_SESSION_TOKEN` and waits for `GET /api/health`.
 * - Launches Chrome / Edge / Brave `--app=http://127.0.0.1:<port>/?token=...` or system default browser.
 * - Cleanly terminates daemon on SIGINT / SIGTERM / exit with 0 zombie child processes.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const args = process.argv.slice(2);

const headlessCheck = args.includes('--headless-check');
const noBrowser = args.includes('--no-browser') || headlessCheck;
const offlineMode = args.includes('--offline') || fs.existsSync(path.join(ROOT, '.vd-airgap')) || process.env.VD_OFFLINE === '1';
const portableMode = args.includes('--portable') || fs.existsSync(path.join(ROOT, 'portable.flag')) || process.env.VD_PORTABLE === '1';
const strictPort = args.includes('--strict-port') || process.env.VD_STRICT_PORT === '1';

let preferredPort = Number(process.env.VD_PORT || 41900);
const portIdx = args.indexOf('--port');
if (portIdx !== -1 && args[portIdx + 1]) {
  preferredPort = Number(args[portIdx + 1]) || 41900;
}

const dataDir = process.env.VD_DATA_DIR
  ? path.resolve(process.env.VD_DATA_DIR)
  : path.join(ROOT, portableMode ? '.vd-portable' : '.vd-runtime');
const dbDir = portableMode ? path.join(dataDir, 'db') : (process.env.VD_DB_DIR ? path.resolve(process.env.VD_DB_DIR) : path.join(ROOT, '.vd-dev'));
const cacheDir = portableMode ? path.join(dataDir, 'cache') : (process.env.VD_CACHE_DIR ? path.resolve(process.env.VD_CACHE_DIR) : path.join(ROOT, '.vd-cache'));

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(dbDir, { recursive: true });
fs.mkdirSync(cacheDir, { recursive: true });

function findOnPath(names) {
  return findAllOnPath(names)[0] || null;
}

function findAllOnPath(names) {
  const pathEnv = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const found = [];
  for (const name of names) {
    for (const dir of pathEnv) {
      const full = path.join(dir, name);
      if (fs.existsSync(full) && !found.includes(full)) found.push(full);
    }
  }
  return found;
}

function resolveUvBinary() {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const candidates = [
    process.platform === 'win32' ? path.join(home, '.local', 'bin', 'uv.exe') : path.join(home, '.local', 'bin', 'uv'),
    process.platform === 'win32' ? path.join(home, '.cargo', 'bin', 'uv.exe') : path.join(home, '.cargo', 'bin', 'uv'),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return findOnPath(process.platform === 'win32' ? ['uv.exe', 'uv'] : ['uv']);
}

function hasCoreDeps(pyExe) {
  try {
    execFileSync(pyExe, ['-c', 'import duckdb, z3'], { cwd: ROOT, stdio: 'ignore', timeout: 15000 });
    return true;
  } catch {
    return false;
  }
}

function resolveIsolatedPython() {
  const py312Dir = path.join(dataDir, 'py312');
  const py312Bin = path.join(py312Dir, process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'python.exe' : 'python');

  if (!fs.existsSync(py312Bin) && !offlineMode) {
    const uvBin = resolveUvBinary();
    if (uvBin) {
      try {
        execFileSync(uvBin, ['venv', '--no-python-downloads', '--python', '3.12', py312Dir], { cwd: ROOT, stdio: 'ignore', timeout: 5000 });
      } catch {
        // Offline or no cached CPython 3.12 interpreter: skip cleanly without blocking startup
      }
    }
  }

  const repoVenvPy = path.join(ROOT, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'python.exe' : 'python');
  const hostPyList = findAllOnPath(process.platform === 'win32' ? ['python.exe', 'python3.exe'] : ['python3', 'python']);
  if (process.platform === 'win32') {
    for (const exeCmd of ['python', 'py']) {
      try {
        const realPy = execFileSync(exeCmd, ['-c', 'import sys; print(sys.executable)'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000 }).toString().trim();
        if (realPy && !hostPyList.includes(realPy)) hostPyList.push(realPy);
      } catch {
        /* ignore */
      }
    }
    const localApp = process.env.LOCALAPPDATA || '';
    for (const baseDir of [path.join(localApp, 'Python'), path.join(localApp, 'Programs', 'Python')]) {
      try {
        if (fs.existsSync(baseDir)) {
          for (const entry of fs.readdirSync(baseDir)) {
            const p = path.join(baseDir, entry, 'python.exe');
            if (!hostPyList.includes(p) && fs.existsSync(p)) hostPyList.push(p);
          }
        }
      } catch {
        /* ignore */
      }
    }
  }
  const candidates = [py312Bin, ...hostPyList, repoVenvPy].filter((p) => p && fs.existsSync(p));

  const withDeps = candidates.find((p) => hasCoreDeps(p));
  if (withDeps) return withDeps;
  if (candidates.length > 0) return candidates[0];
  throw new Error('No usable Python interpreter found. Install uv or Python 3.12+.');
}

function ensureWorkstationDist() {
  const distIndex = path.join(ROOT, 'apps', 'workstation', 'dist', 'index.html');
  const srcDir = path.join(ROOT, 'apps', 'workstation', 'src');
  const pubDir = path.join(ROOT, 'apps', 'workstation', 'public');
  let needsBuild = !fs.existsSync(distIndex);
  if (!needsBuild) {
    const distMtime = fs.statSync(distIndex).mtimeMs;
    const newestMtime = (dir) => {
      let maxT = 0;
      if (!fs.existsSync(dir)) return maxT;
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) maxT = Math.max(maxT, newestMtime(full));
        else maxT = Math.max(maxT, fs.statSync(full).mtimeMs);
      }
      return maxT;
    };
    if (Math.max(newestMtime(srcDir), newestMtime(pubDir)) > distMtime + 500) {
      needsBuild = true;
    }
  }
  if (!needsBuild) return;
  console.log('[launch] apps/workstation/dist missing or stale; building production workstation bundle...');
  const pnpmBin = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  execFileSync(pnpmBin, ['--filter', '@vajradhir/workstation', 'build'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '127.0.0.1');
  });
}

async function pickFreePort(preferred, strict) {
  const candidates = strict ? [preferred] : [preferred, ...Array.from({ length: 51 }, (_, i) => 41900 + i).filter((p) => p !== preferred)];
  for (const p of candidates) {
    if (await isPortFree(p)) return p;
  }
  throw new Error(`No free loopback port available in range 41900-41950 (preferred=${preferred}, strict=${strict})`);
}

async function waitForHealth(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  const url = `http://127.0.0.1:${port}/api/health`;
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(url);
      if (resp.ok) return await resp.json();
    } catch {
      // retry until timeout
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Timed out waiting for vd-daemon at ${url}`);
}

function findAppBrowser() {
  if (process.platform === 'win32') {
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const pf = process.env.ProgramFiles || 'C:\\Program Files';
    const localApp = process.env.LOCALAPPDATA || '';
    const candidates = [
      path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(localApp, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(pf, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
    ];
    return candidates.find((p) => p && fs.existsSync(p)) || null;
  }
  if (process.platform === 'darwin') {
    const candidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    ];
    return candidates.find((p) => fs.existsSync(p)) || null;
  }
  return findOnPath(['google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge', 'brave-browser']);
}

function launchBrowser(appUrl) {
  const bin = findAppBrowser();
  if (bin) {
    const profileDir = path.join(dataDir, 'app-profile');
    fs.mkdirSync(profileDir, { recursive: true });
    const child = spawn(bin, [`--app=${appUrl}`, `--user-data-dir=${profileDir}`, '--no-first-run'], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return { mode: 'chromium-app', binary: bin, child };
  }
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', appUrl], { detached: true, stdio: 'ignore' }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', [appUrl], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [appUrl], { detached: true, stdio: 'ignore' }).unref();
  }
  return { mode: 'default-browser', binary: null, child: null };
}

async function stopDaemon(daemonProc, port, token) {
  if (!daemonProc || daemonProc.exitCode !== null) return;
  try {
    await fetch(`http://127.0.0.1:${port}/api/v1/system/shutdown`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
  } catch {
    // ignore HTTP errors during shutdown
  }
  const waitStart = Date.now();
  while (daemonProc.exitCode === null && Date.now() - waitStart < 1500) {
    await new Promise((r) => setTimeout(r, 50));
  }
  if (daemonProc.exitCode === null) {
    try {
      daemonProc.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 400));
    if (daemonProc.exitCode === null) {
      try {
        daemonProc.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    }
  }
}

async function main() {
  const pythonBin = resolveIsolatedPython();
  ensureWorkstationDist();
  const port = await pickFreePort(preferredPort, strictPort);
  const token = crypto.randomBytes(32).toString('hex');

  const daemonEnv = {
    ...process.env,
    PYTHONUTF8: '1',
    PYTHONUNBUFFERED: '1',
    VD_PORT: String(port),
    VD_DATA_DIR: dataDir,
    VD_DB_DIR: dbDir,
    VD_CACHE_DIR: cacheDir,
    VD_PORTABLE: portableMode ? '1' : '0',
    VD_OFFLINE: offlineMode ? '1' : '0',
    VD_SESSION_TOKEN: token,
    VD_PARENT_PID: String(process.pid),
    PYTHONPATH: [ROOT, path.join(ROOT, 'packages', 'vd-daemon', 'src'), process.env.PYTHONPATH || ''].filter(Boolean).join(path.delimiter),
  };
  if (portableMode) {
    daemonEnv.HOME = dataDir;
    daemonEnv.USERPROFILE = dataDir;
  }

  const daemonScript = path.join(ROOT, 'packages', 'vd-daemon', 'src', 'daemon.py');
  const daemonArgs = [daemonScript, '--port', String(port)];
  if (strictPort) daemonArgs.push('--strict-port');

  const daemonProc = spawn(pythonBin, daemonArgs, {
    cwd: ROOT,
    env: daemonEnv,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const daemonLogs = [];
  daemonProc.stdout?.on('data', (c) => {
    const text = String(c);
    if (headlessCheck) daemonLogs.push(text);
    else process.stdout.write(text);
  });
  daemonProc.stderr?.on('data', (c) => {
    const text = String(c);
    if (headlessCheck) daemonLogs.push(text);
    else process.stderr.write(text);
  });

  let daemonExited = false;
  daemonProc.once('exit', () => {
    daemonExited = true;
  });

  const cleanup = () => {
    if (!daemonExited && daemonProc.exitCode === null) {
      try {
        daemonProc.kill();
      } catch {
        /* ignore */
      }
    }
  };
  process.on('SIGINT', async () => {
    await stopDaemon(daemonProc, port, token);
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await stopDaemon(daemonProc, port, token);
    process.exit(0);
  });
  process.on('exit', cleanup);

  try {
    const t0 = Date.now();
    const health = await waitForHealth(port);
    const bootMs = Date.now() - t0;

    if (headlessCheck) {
      const authHeaders = { Authorization: `Bearer ${token}`, Connection: 'close' };
      const doctor = await (await fetch(`http://127.0.0.1:${port}/api/doctor`, { headers: authHeaders })).json();
      const mem = await (await fetch(`http://127.0.0.1:${port}/api/v1/system/memory`, { headers: authHeaders })).json();
      const bootStatus = await (await fetch(`http://127.0.0.1:${port}/api/bootstrap/status`, { headers: authHeaders })).json();
      const htmlResp = await fetch(`http://127.0.0.1:${port}/?token=${token}`, { headers: { Connection: 'close' } });
      const unauthResp = await fetch(`http://127.0.0.1:${port}/api/doctor`, { headers: { Connection: 'close' } });

      const summary = {
        ok: htmlResp.status === 200 && unauthResp.status === 401 && mem.rss_mb > 0,
        boot_ms: bootMs,
        port,
        portable_mode: portableMode,
        offline_mode: offlineMode,
        python_bin: pythonBin,
        health,
        doctor_tools_count: Array.isArray(doctor.tools) ? doctor.tools.length : 0,
        rss_mb: mem.rss_mb,
        unauth_status: unauthResp.status,
        html_status: htmlResp.status,
        auto_skip: bootStatus.auto_skip,
      };
      console.log(JSON.stringify(summary, null, 2));
      await stopDaemon(daemonProc, port, token);
      process.exit(summary.ok ? 0 : 1);
    }

    const appUrl = `http://127.0.0.1:${port}/?token=${token}`;
    console.log(`[launch] Ready in ${bootMs} ms -> ${appUrl} (portable=${portableMode}, offline=${offlineMode})`);
    if (!noBrowser) {
      launchBrowser(appUrl);
    }

    await new Promise((resolve) => daemonProc.once('exit', resolve));
  } catch (err) {
    if (daemonLogs.length > 0) {
      console.error('[launch] Daemon logs:\n' + daemonLogs.join(''));
    }
    await stopDaemon(daemonProc, port, token);
    throw err;
  }
}

main().catch((err) => {
  console.error('[launch] Fatal error:', err);
  process.exit(1);
});
