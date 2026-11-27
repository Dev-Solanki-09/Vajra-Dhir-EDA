#!/usr/bin/env node
/**
 * Creates a native Desktop / Start Menu shortcut for Vajra-Dhir EDA (Windows / macOS / Linux).
 * Uses assets/icons/vajra-dhir.{ico,icns,svg} and launches silently without CMD clutter on Windows.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const portable = process.argv.includes('--portable');
const desktopOnly = process.argv.includes('--desktop-only');

function createWindowsShortcut(targetVbs, iconPath, shortcutPath, extraArgs = '') {
  const psScript = [
    '$ws = New-Object -ComObject WScript.Shell',
    `$sc = $ws.CreateShortcut('${shortcutPath.replace(/'/g, "''")}')`,
    `$sc.TargetPath = 'wscript.exe'`,
    `$sc.Arguments = '"${targetVbs}"${extraArgs ? ' ' + extraArgs : ''}'`,
    `$sc.WorkingDirectory = '${ROOT.replace(/'/g, "''")}'`,
    fs.existsSync(iconPath) ? `$sc.IconLocation = '${iconPath.replace(/'/g, "''")},0'` : '',
    '$sc.Description = "Vajra-Dhir EDA Local-First Workstation"',
    '$sc.Save()',
  ]
    .filter(Boolean)
    .join('; ');
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], { stdio: 'inherit' });
}

function main() {
  const desktopDir = path.join(os.homedir(), 'Desktop');
  if (process.platform === 'win32') {
    const targetVbs = path.join(ROOT, 'Vajra-Dhir-EDA.vbs');
    const iconIco = path.join(ROOT, 'assets', 'icons', 'vajra-dhir.ico');
    const args = portable ? '--portable' : '';
    if (fs.existsSync(desktopDir)) {
      const desktopLnk = path.join(desktopDir, 'Vajra-Dhir EDA.lnk');
      createWindowsShortcut(targetVbs, iconIco, desktopLnk, args);
      console.log(`[shortcut] Created ${desktopLnk}`);
    }
    if (!desktopOnly && process.env.APPDATA) {
      const startMenuDir = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs');
      if (fs.existsSync(startMenuDir)) {
        const startLnk = path.join(startMenuDir, 'Vajra-Dhir EDA.lnk');
        createWindowsShortcut(targetVbs, iconIco, startLnk, args);
        console.log(`[shortcut] Created ${startLnk}`);
      }
    }
    return;
  }

  if (process.platform === 'linux') {
    const appsDir = path.join(os.homedir(), '.local', 'share', 'applications');
    fs.mkdirSync(appsDir, { recursive: true });
    const iconPng = path.join(ROOT, 'assets', 'icons', 'icon-512.png');
    const desktopEntry = [
      '[Desktop Entry]',
      'Type=Application',
      'Name=Vajra-Dhir EDA',
      'Comment=Deterministic Hardware + Software Co-Design Workstation',
      `Exec="${path.join(ROOT, 'launch.sh')}"${portable ? ' --portable' : ''}`,
      `Icon=${iconPng}`,
      'Terminal=false',
      'Categories=Development;Electronics;Engineering;',
      '',
    ].join('\n');
    const outPath = path.join(appsDir, 'vajra-dhir-eda.desktop');
    fs.writeFileSync(outPath, desktopEntry, 'utf8');
    console.log(`[shortcut] Created ${outPath}`);
    return;
  }

  if (process.platform === 'darwin') {
    const launcher = path.join(ROOT, 'launch.command');
    if (fs.existsSync(desktopDir)) {
      const linkPath = path.join(desktopDir, 'Vajra-Dhir EDA.command');
      fs.copyFileSync(launcher, linkPath);
      fs.chmodSync(linkPath, 0o755);
      console.log(`[shortcut] Created ${linkPath}`);
    }
  }
}

main();
