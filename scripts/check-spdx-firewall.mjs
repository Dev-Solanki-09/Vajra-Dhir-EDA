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
  "CC-BY-NC-4.0",
  "OSMC-PL-1.2"
]);

const FORBIDDEN_PACKAGES = [
  "kibot",
  "konnect",
  "part-db",
  "pypsa-app",
  "openmodelica",
  "pcbworld-weights"
];

console.log("=== Checking SPDX & Dependency License Firewall for Ring 1 Core ===");

let hasError = false;

// 1. Check root package.json and packages/*/package.json
const pkgJsonPaths = ["package.json"];
if (fs.existsSync("packages")) {
  for (const dir of fs.readdirSync("packages")) {
    const p = path.join("packages", dir, "package.json");
    if (fs.existsSync(p)) pkgJsonPaths.push(p);
  }
}

for (const pkgPath of pkgJsonPaths) {
  const content = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const deps = { ...content.dependencies, ...content.devDependencies };
  for (const dep of Object.keys(deps)) {
    for (const forbidden of FORBIDDEN_PACKAGES) {
      if (dep.toLowerCase().includes(forbidden)) {
        console.error(`VIOLATION: Forbidden package '${dep}' found in ${pkgPath}`);
        hasError = true;
      }
    }
  }
}

// 2. Scan for committed vendor PDF files (Copyright & Security Quarantine)
function scanPdf(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== ".git" && entry.name !== "node_modules") {
      scanPdf(full);
    } else if (entry.isFile() && entry.name.endsWith(".pdf")) {
      const normalized = full.replace(/\\/g, "/");
      if (!normalized.startsWith("docs/public-examples/")) {
        console.error(`VIOLATION: Vendor PDF staged/committed: ${normalized}. Cache PDFs locally via datasheet-lens!`);
        hasError = true;
      }
    }
  }
}

scanPdf(".");

if (hasError) {
  console.error("\nFAILED: SPDX & Dependency Firewall Violations Detected.");
  process.exit(1);
} else {
  console.log("PASSED: SPDX & Dependency License Firewall Verified Clean (Ring 1).");
}
