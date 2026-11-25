import test from 'node:test';
import assert from 'node:assert/strict';
import { CrossProbeBus, globalCrossProbeBus } from '../src/index.ts';

test('CrossProbeBus emits selection events to multiple listeners within <16ms budget', () => {
  const bus = new CrossProbeBus();
  const received = [];

  const unsubscribe = bus.onSelection((evt) => {
    received.push(evt);
  });

  bus.select(['comp-u1', 'comp-r1'], 'schematic');

  assert.equal(received.length, 1);
  assert.deepEqual(received[0].entityIds, ['comp-u1', 'comp-r1']);
  assert.equal(received[0].source, 'schematic');
  assert.ok(bus.getLastLatencyMs() >= 0 && bus.getLastLatencyMs() < 16, `Expected <16ms, got ${bus.getLastLatencyMs()}`);

  unsubscribe();
  bus.select(['comp-c1'], 'pcb');
  assert.equal(received.length, 1, 'Should not receive events after unsubscribe');
});

test('CrossProbeBus emits net highlights and supports React useSyncExternalStore snapshots', () => {
  const bus = new CrossProbeBus();
  let snapshotHits = 0;
  const unsubSnap = bus.subscribeSnapshot(() => {
    snapshotHits += 1;
  });

  const before = bus.getSnapshot();
  bus.highlightNet('net-usb-dp', 'code', '#38BDF8');
  const after = bus.getSnapshot();

  assert.notEqual(after, before);
  assert.equal(after.activeHighlight.netId, 'net-usb-dp');
  assert.equal(after.activeHighlight.color, '#38BDF8');
  assert.equal(snapshotHits, 1);
  assert.ok(bus.getLastLatencyMs() < 16);

  unsubSnap();
});

test('CrossProbeBus BroadcastChannel syncs peer instances without echo loops', () => {
  const messagesA = [];
  class FakeBroadcastChannel {
    constructor(name) {
      this.name = name;
      this.onmessage = null;
      FakeBroadcastChannel.peers.add(this);
    }
    postMessage(data) {
      for (const peer of FakeBroadcastChannel.peers) {
        if (peer !== this && peer.name === this.name && typeof peer.onmessage === 'function') {
          peer.onmessage({ data });
        }
      }
    }
    close() {
      FakeBroadcastChannel.peers.delete(this);
    }
  }
  FakeBroadcastChannel.peers = new Set();

  const busA = new CrossProbeBus('vd-test-channel', (name) => new FakeBroadcastChannel(name));
  const busB = new CrossProbeBus('vd-test-channel', (name) => new FakeBroadcastChannel(name));
  busB.onSelection((evt) => messagesA.push(evt));

  busA.select(['U2'], 'pcb');
  assert.equal(messagesA.length, 1);
  assert.deepEqual(messagesA[0].entityIds, ['U2']);
  assert.ok(globalCrossProbeBus instanceof CrossProbeBus);

  busA.dispose();
  busB.dispose();
});
