import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  HwIrCrdtSession,
  computeHwLockDigest,
  sha256Hex,
  verifyHwLockDigest,
} from '../dist/index.js';

test('pure-TS sha256Hex matches Node crypto FIPS vectors', () => {
  for (const s of ['', 'abc', 'Vajra-Dhir-hw.lock-2030']) {
    const expected = crypto.createHash('sha256').update(s, 'utf8').digest('hex');
    assert.equal(sha256Hex(s), expected);
  }
});

test('CRDT sync fails closed on human-locked entities across peers', () => {
  const human = new HwIrCrdtSession('h1', 'human');
  human.upsertEntity('human', {
    id: '01950000-0000-7000-8000-0000000000aa',
    refdes: 'U2',
    x_nm: 5_000_000,
    y_nm: 6_000_000,
    rot_mdeg: 0,
    locked: true,
  });

  const peer = new HwIrCrdtSession('p1', 'peer');
  peer.forceRawEntityForTest({
    id: '01950000-0000-7000-8000-0000000000aa',
    refdes: 'U2',
    x_nm: 9_999_000,
    y_nm: 6_000_000,
    rot_mdeg: 0,
    locked: false,
  });

  const outcome = human.applyRemoteUpdateGuarded(peer.encodeStateAsUpdate(), 'peer');
  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.equal(outcome.code, 'KERNEL_LOCK_VIOLATION');
  }
  assert.equal(human.getEntity('01950000-0000-7000-8000-0000000000aa')?.x_nm, 5_000_000);
});

test('hw.lock digest verifies cleanly and detects tampering', () => {
  const snap = {
    symbols: [{ name: 'U1', sha256: '1111' }],
    footprints: [{ name: 'SOIC8', sha256: '2222' }],
    spice_models: [{ name: 'buck.lib', sha256: '3333' }],
    constraints: [{ name: 'PWR', min_width_nm: 500_000, min_clearance_nm: 250_000 }],
    entities: [{ id: '0195', refdes: 'U1', x_nm: 1000, y_nm: 2000, rot_mdeg: 0, locked: true }],
  };
  const lock = computeHwLockDigest(snap);
  assert.equal(verifyHwLockDigest(lock, snap), true);
  snap.constraints[0].min_width_nm = 250_000;
  assert.equal(verifyHwLockDigest(lock, snap), false);
});
