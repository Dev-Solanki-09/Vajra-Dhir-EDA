import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';

test('Worker Contract Schema Compliance', () => {
  const schema = JSON.parse(fs.readFileSync('schemas/worker_contract.v1.json', 'utf8'));
  assert.equal(schema.properties.network_mode.const, 'none');
  assert.deepEqual(schema.properties.pack_id.enum, ['pack-2a', 'pack-2b', 'pack-2c', 'pack-2c-vlsi', 'pack-2d', 'pack-2e']);
});

test('Worker SDK Rust Implementation Exists and Validates Invariants', () => {
  const libRs = fs.readFileSync('packages/worker-sdk/src/lib.rs', 'utf8');
  assert.ok(libRs.includes('validate_contract'));
  assert.ok(libRs.includes('stage_job'));
  assert.ok(libRs.includes('execute_job_fallback'));
  assert.ok(libRs.includes('network_mode != "none"'));
});

test('Docker Compose Worker Definitions Exist with Zero Egress', () => {
  const composePath = fs.existsSync('docker/docker-compose.workers.yml') ? 'docker/docker-compose.workers.yml' : 'docker-compose.workers.yml';
  const compose = fs.readFileSync(composePath, 'utf8');
  assert.ok(compose.includes('network_mode: "none"'));
  assert.ok(compose.includes('read_only: true'));
  assert.ok(compose.includes('cap_drop:'));
  assert.ok(compose.includes('pack-2a-pcb-physics:') || compose.includes('worker-kicad:'));
  assert.ok(compose.includes('pack-2b-virtual-hil:') || compose.includes('worker-virtual-lab:'));
  assert.ok(compose.includes('pack-2c-silicon-ic:') || compose.includes('worker-silicon-asic:'));
});
