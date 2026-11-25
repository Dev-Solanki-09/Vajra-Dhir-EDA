#!/usr/bin/env node
/**
 * scripts/test-x2-collab-hwlock.mjs
 * Behavioral & Negative Gate for X2:
 * - Real Yjs CRDT bidirectional sync across concurrent peers on HW-IR projections
 * - Fail-closed human lock (locked=true) rejection across peer/agent remote CRDT updates
 * - Deterministic 2030-proof hw.lock digest computation + tamper detection
 * - CrossProbeBus < 16 ms measured budget check
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const {
    HwIrCrdtSession,
    computeHwLockDigest,
    verifyHwLockDigest,
  } = await import('../packages/collab/dist/index.js');
  const { CrossProbeBus } = await import('../packages/crossprobe-bus/dist/index.js');

  // 1. Two independent Yjs CRDT sessions syncing unlocked entity
  const human = new HwIrCrdtSession('peer-human', 'human');
  const peer = new HwIrCrdtSession('peer-alice', 'peer');

  const resU1 = human.upsertEntity('human', {
    id: '01950000-0000-7000-8000-000000000001',
    refdes: 'U1',
    x_nm: 12_000_000,
    y_nm: 15_000_000,
    rot_mdeg: 0,
    locked: false,
  });
  assert.equal(resU1.ok, true);

  const resU2Lock = human.upsertEntity('human', {
    id: '01950000-0000-7000-8000-000000000002',
    refdes: 'U2',
    x_nm: 25_000_000,
    y_nm: 18_000_000,
    rot_mdeg: 90_000,
    locked: true,
  });
  assert.equal(resU2Lock.ok, true);

  // Sync human state -> peer
  const syncRes = peer.applyRemoteUpdateGuarded(human.encodeStateAsUpdate(), 'human');
  assert.equal(syncRes.ok, true);
  assert.equal(peer.getEntity('01950000-0000-7000-8000-000000000001')?.x_nm, 12_000_000);
  assert.equal(peer.getEntity('01950000-0000-7000-8000-000000000002')?.locked, true);

  // 2. Concurrent peer updates unlocked U1 -> merges cleanly into human
  const peerMoveU1 = peer.upsertEntity('peer', {
    id: '01950000-0000-7000-8000-000000000001',
    refdes: 'U1',
    x_nm: 14_500_000,
    y_nm: 15_000_000,
    rot_mdeg: 0,
    locked: false,
  });
  assert.equal(peerMoveU1.ok, true);
  const acceptU1 = human.applyRemoteUpdateGuarded(peer.encodeStateAsUpdate(), 'peer');
  assert.equal(acceptU1.ok, true);
  assert.equal(human.getEntity('01950000-0000-7000-8000-000000000001')?.x_nm, 14_500_000);

  // 3. NEGATIVE: Malicious/agent CRDT peer tries to move locked U2 -> FAIL CLOSED
  const rogueAgent = new HwIrCrdtSession('rogue-agent', 'agent');
  // Force-mutate rogue's local doc bypassing guard to simulate an adversarial peer packet
  rogueAgent.forceRawEntityForTest({
    id: '01950000-0000-7000-8000-000000000002',
    refdes: 'U2',
    x_nm: 99_999_000,
    y_nm: 99_999_000,
    rot_mdeg: 180_000,
    locked: false,
  });
  const rogueUpdate = rogueAgent.encodeStateAsUpdate();
  const rejected = human.applyRemoteUpdateGuarded(rogueUpdate, 'agent');
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'KERNEL_LOCK_VIOLATION');
  assert.equal(human.getEntity('01950000-0000-7000-8000-000000000002')?.x_nm, 25_000_000);
  assert.equal(human.getEntity('01950000-0000-7000-8000-000000000002')?.locked, true);

  // Local agent mutation on locked U2 must also fail closed
  const localReject = human.upsertEntity('agent', {
    id: '01950000-0000-7000-8000-000000000002',
    refdes: 'U2',
    x_nm: 1_000_000,
    y_nm: 1_000_000,
    rot_mdeg: 0,
    locked: true,
  });
  assert.equal(localReject.ok, false);
  assert.equal(localReject.code, 'KERNEL_LOCK_VIOLATION');

  // 4. Presence & hw.lock deterministic 2030-proof digest
  peer.updatePresence({ peerId: 'peer-alice', actor: 'peer', selectedEntityIds: ['U1'], cursorNm: [14_500_000, 15_000_000] });
  assert.equal(peer.listPresence().length, 1);

  const snapshotA = {
    symbols: [{ name: 'CH224K', sha256: 'aaaa1111' }],
    footprints: [{ name: 'ESSOP-10', sha256: 'bbbb2222' }],
    spice_models: [{ name: 'TPS54302.lib', sha256: 'cccc3333' }],
    constraints: [{ name: 'USB_HS', min_width_nm: 150000, min_clearance_nm: 150000 }],
    entities: [human.getEntity('01950000-0000-7000-8000-000000000002'), human.getEntity('01950000-0000-7000-8000-000000000001')],
  };
  const snapshotB = {
    entities: [human.getEntity('01950000-0000-7000-8000-000000000001'), human.getEntity('01950000-0000-7000-8000-000000000002')],
    constraints: [{ min_clearance_nm: 150000, min_width_nm: 150000, name: 'USB_HS' }],
    spice_models: [{ sha256: 'cccc3333', name: 'TPS54302.lib' }],
    footprints: [{ sha256: 'bbbb2222', name: 'ESSOP-10' }],
    symbols: [{ sha256: 'aaaa1111', name: 'CH224K' }],
  };
  const lockA = computeHwLockDigest(snapshotA);
  const lockB = computeHwLockDigest(snapshotB);
  assert.equal(lockA.schema, 'vd.hw.lock.v1');
  assert.equal(lockA.digest_sha256, lockB.digest_sha256, 'hw.lock must be canonical order-independent');
  assert.equal(verifyHwLockDigest(lockA, snapshotB), true);

  const tampered = structuredClone(snapshotB);
  tampered.spice_models[0].sha256 = 'deadbeef';
  assert.equal(verifyHwLockDigest(lockA, tampered), false, 'hw.lock must detect SPICE drift');

  // 5. Rust hw-ir digest module present + CrossProbeBus <16 ms check
  assert.ok(fs.existsSync(path.join(ROOT, 'packages/hw-ir/src/digest.rs')), 'Missing Rust hw-ir digest.rs');
  const bus = new CrossProbeBus();
  bus.select(['U1', 'U2'], 'schematic');
  assert.ok(bus.getLastLatencyMs() < 16.0, `CrossProbeBus exceeded 16ms: ${bus.getLastLatencyMs()}`);

  console.log(`X2_COLLAB_HWLOCK_OK (digest=${lockA.digest_sha256.slice(0, 12)}, probe_ms=${bus.getLastLatencyMs().toFixed(4)})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
