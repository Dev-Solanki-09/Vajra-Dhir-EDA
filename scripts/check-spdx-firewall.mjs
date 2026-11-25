import fs from "node:fs";
import path from "node:path";

const FORBIDDEN_LICENSES = new Set([
  "AGPL-3.0-only",
  "AGPL-3.0-or-later",
  "AGPL-1.0-only",
  "AGPL-1.0-or-later",
  "GPL-2.0-only",
  "GPL-3.0-only",
  "GPL-3.0-or-later",
  "EUPL-1.2",
  "SSPL-1.0",
  "CC-BY-NC-4.0",
  "OSMC-PL-1.2",
]);

const FORBIDDEN_PACKAGES = [
  "kibot",
  "konnect",
  "part-db",
  "pypsa-app",
  "openmodelica",
  "pcbworld-weights",
  "pymupdf",
  "fitz",
  "surfer",
  "ngspice-agpl",
  "serde_kicad_sexpr",
];

// Parse optional --root <dir>
let scanRoot = ".";
const rootFlagIdx = process.argv.indexOf("--root");
if (rootFlagIdx !== -1 && process.argv[rootFlagIdx + 1]) {
  scanRoot = path.resolve(process.argv[rootFlagIdx + 1]);
}

function isForbiddenPackageName(pkgName) {
  const lower = String(pkgName || "").trim().toLowerCase();
  if (!lower) return null;
  for (const forbidden of FORBIDDEN_PACKAGES) {
    if (lower === forbidden || lower.startsWith(`${forbidden}-`) || lower.startsWith(`${forbidden}/`) || lower.includes(`/${forbidden}`)) {
      return forbidden;
    }
  }
  return null;
}

console.log("=== Checking SPDX & Dependency License Firewall for Ring 1 Core ===");

let hasError = false;

// 1. Check root package.json, packages/*/package.json, and apps/*/package.json
const pkgJsonPaths = [];
if (fs.existsSync(path.join(scanRoot, "package.json"))) {
  pkgJsonPaths.push(path.join(scanRoot, "package.json"));
}
for (const workspaceDir of ["packages", "apps"]) {
  const fullWorkspaceDir = path.join(scanRoot, workspaceDir);
  if (fs.existsSync(fullWorkspaceDir)) {
    for (const dir of fs.readdirSync(fullWorkspaceDir)) {
      const p = path.join(fullWorkspaceDir, dir, "package.json");
      if (fs.existsSync(p)) pkgJsonPaths.push(p);
    }
  }
}

for (const pkgPath of pkgJsonPaths) {
  const content = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  if (content.license && FORBIDDEN_LICENSES.has(String(content.license).trim())) {
    console.error(`VIOLATION: Forbidden SPDX license '${content.license}' declared in ${path.relative(scanRoot, pkgPath)}`);
    hasError = true;
  }
  const deps = { ...content.dependencies, ...content.devDependencies };
  for (const dep of Object.keys(deps)) {
    const matched = isForbiddenPackageName(dep);
    if (matched) {
      console.error(`VIOLATION: Forbidden package '${dep}' (rule '${matched}') found in ${path.relative(scanRoot, pkgPath)}`);
      hasError = true;
    }
  }
}

// 2. Scan pnpm-lock.yaml package keys
const pnpmLockPath = path.join(scanRoot, "pnpm-lock.yaml");
if (fs.existsSync(pnpmLockPath)) {
  const lines = fs.readFileSync(pnpmLockPath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const pkgKeyMatch = rawLine.match(/^\s{2}['"]?([^@\s':]+(?:\/[^@\s':]+)?)@/);
    if (pkgKeyMatch) {
      const pkgName = pkgKeyMatch[1];
      const matched = isForbiddenPackageName(pkgName);
      if (matched) {
        console.error(`VIOLATION: Forbidden package '${pkgName}' (rule '${matched}') found in pnpm-lock.yaml`);
        hasError = true;
      }
    }
  }
}

// 3. Scan TOML lockfiles (uv.lock and Cargo.lock) package entries
for (const lockName of ["uv.lock", "Cargo.lock"]) {
  const lockPath = path.join(scanRoot, lockName);
  if (!fs.existsSync(lockPath)) continue;
  const content = fs.readFileSync(lockPath, "utf8");
  const pkgNameMatches = content.matchAll(/^\s*name\s*=\s*"([^"]+)"/gm);
  for (const m of pkgNameMatches) {
    const pkgName = m[1];
    const matched = isForbiddenPackageName(pkgName);
    if (matched) {
      console.error(`VIOLATION: Forbidden package '${pkgName}' (rule '${matched}') found in ${lockName}`);
      hasError = true;
    }
  }
}

// 4. Scan for committed vendor PDF files (Copyright & Security Quarantine)
function scanPdf(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== ".git" && entry.name !== "node_modules" && entry.name !== ".pnpm-store" && entry.name !== "target") {
      scanPdf(full);
    } else if (entry.isFile() && entry.name.endsWith(".pdf")) {
      const normalized = path.relative(scanRoot, full).replace(/\\/g, "/");
      if (!normalized.startsWith("docs/public-examples/")) {
        console.error(`VIOLATION: Vendor PDF staged/committed: ${normalized}. Cache PDFs locally via datasheet-lens!`);
        hasError = true;
      }
    }
  }
}

scanPdf(scanRoot);

if (hasError) {
  console.error("\nFAILED: SPDX & Dependency Firewall Violations Detected.");
  process.exit(1);
} else {
  console.log("PASSED: SPDX & Dependency License Firewall Verified Clean (Ring 1 packages/apps/lockfiles).");
}
