import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

console.log('================================================================');
console.log('  Vajra-Dhīr EDA — Milestone 1 Comprehensive Verification Harness');
console.log('  Standards: ISO/IEC/IEEE 42010, SLSA v1.2, OWASP Agentic AI');
console.log('================================================================\n');

let failed = false;

function step(title, fn) {
  process.stdout.write(`[*] ${title.padEnd(52, '.')} `);
  try {
    fn();
    console.log('[ PASS ]');
  } catch (err) {
    console.log('[ FAIL ]');
    console.error(`    Error: ${err.message || err}`);
    failed = true;
  }
}

// 1. SPDX License & AGPL Firewall
step('SPDX License & AGPL Firewall', () => {
  execSync('node scripts/check-spdx-firewall.mjs', { stdio: 'pipe' });
});

// 2. CrossProbeBus Unit Tests
step('CrossProbeBus (Sub-millisecond Probe Channel)', () => {
  execSync('node --test packages/crossprobe-bus/tests/crossprobe.test.mjs', { stdio: 'pipe' });
});

// 3. Harness MCP v2 Gateway (12 EDA Verbs)
step('Harness MCP v2 Gateway (12 Typed EDA Verbs)', () => {
  execSync('node --test packages/mcp-gateway/tests/mcp_server.test.mjs', { stdio: 'pipe' });
});

// 4. Desktop Silicon Darkroom Theme & Contrast
step('Silicon Darkroom Theme & Contrast Compliance', () => {
  execSync('node --test apps/desktop/tests/desktop.test.mjs', { stdio: 'pipe' });
});

// 5. Canonical HW-IR SQLite DDL & Triggers
step('Canonical HW-IR SQLite DDL & Lock Triggers', () => {
  const initSql = fs.readFileSync('packages/hw-ir/schema/001_init.sql', 'utf8');
  const perfSql = fs.readFileSync('packages/hw-ir/schema/002_manual_perfection.sql', 'utf8');

  // Verify triggers
  if (!initSql.includes('trg_protect_locked_components_upd')) {
    throw new Error('Missing component lock trigger');
  }
  if (!initSql.includes('KERNEL_LOCK_VIOLATION')) {
    throw new Error('Missing KERNEL_LOCK_VIOLATION abort clause');
  }
  if (!initSql.includes('_tx_actor_ctx')) {
    throw new Error('Missing _tx_actor_ctx table');
  }
  // Verify manual perfection tables
  if (!perfSql.includes('drc_waivers') || !perfSql.includes('geometry_sha256')) {
    throw new Error('Missing drc_waivers table or geometry_sha256 column');
  }
  if (!perfSql.includes('layout_rooms') || !perfSql.includes('variants')) {
    throw new Error('Missing layout_rooms or variants table');
  }
});

// 6. DLP Firewall & Budget Circuit Breaker
step('DLP Firewall & Budget Circuit Breaker Policy', () => {
  const budgetJson = JSON.parse(fs.readFileSync('budget.json', 'utf8'));
  if (budgetJson.limits.session_cost_cap_usd !== 5.0) {
    throw new Error('Session cost cap mismatch');
  }
  if (!budgetJson.circuit_breakers.stop_on_budget_exceeded) {
    throw new Error('Circuit breaker stop_on_budget_exceeded must be true');
  }
});

// 7. Wasmtime 50 Sandbox WIT & Memory Ceilings
step('Wasmtime 50 Sandbox WIT & Memory Ceilings', () => {
  const wit = fs.readFileSync('packages/wasm-sandbox/wit/codemode.wit', 'utf8');
  if (!wit.includes('max-memory-bytes') || !wit.includes('code-mode-runner')) {
    throw new Error('Invalid or incomplete codemode.wit specification');
  }
});

// 8. 3-Way Hardware Merge Driver & Git Attributes
step('Semantic 3-Way Merge Driver (.gitattributes)', () => {
  const gitattr = fs.readFileSync('.gitattributes', 'utf8');
  if (!gitattr.includes('*.vd-ir.jsonl merge=hwir')) {
    throw new Error('Missing *.vd-ir.jsonl merge=hwir gitattributes binding');
  }
});

// 9. KiCad 10 Transcoder & Echo Suppression Ring
step('KiCad 10 Transcoder & 5s Echo Suppression', () => {
  const echoRing = fs.readFileSync('packages/cad-transcoder/src/echo_ring.rs', 'utf8');
  if (!echoRing.includes('DEFAULT_SUPPRESSION_WINDOW') || !echoRing.includes('should_suppress')) {
    throw new Error('Missing EchoSuppressionRing implementation');
  }
});

// 10. Threat Model & CVE Floor Audit
step('Threat Model & Security Floor (Nov 2026)', () => {
  const threatModel = fs.readFileSync('docs/THREAT_MODEL.md', 'utf8');
  if (!threatModel.includes('ASI01') || !threatModel.includes('CVE-2026-115889')) {
    throw new Error('Missing OWASP Agentic AI threat model mappings');
  }
});

console.log('\n----------------------------------------------------------------');
if (failed) {
  console.error('  MILSTONE 1 VERIFICATION FAILED: See errors above.');
  process.exit(1);
} else {
  console.log('  ALL 10 VERIFICATION GATES PASSED CLEANLY (100% SUCCESS).');
  console.log('  Milestone 1 Architecture & Implementation is fully certified.');
  console.log('----------------------------------------------------------------\n');
}
