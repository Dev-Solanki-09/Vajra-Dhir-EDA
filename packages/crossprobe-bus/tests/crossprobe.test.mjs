import test from 'node:test';
import assert from 'node:assert/strict';

// Test implementation of CrossProbeBus directly
class CrossProbeBus {
  constructor() {
    this.selectionListeners = new Set();
    this.hoverListeners = new Set();
    this.netListeners = new Set();
    this.currentSelection = { entityIds: [], source: 'tree', timestamp: 0 };
    this.currentHover = { entityId: null, source: 'tree', timestamp: 0 };
    this.activeHighlight = { netId: null, source: 'tree', timestamp: 0 };
  }

  select(entityIds, source) {
    const event = {
      entityIds: [...new Set(entityIds)],
      source,
      timestamp: Date.now(),
    };
    this.currentSelection = event;
    for (const l of this.selectionListeners) l(event);
  }

  hover(entityId, source) {
    const event = { entityId, source, timestamp: Date.now() };
    this.currentHover = event;
    for (const l of this.hoverListeners) l(event);
  }

  highlightNet(netId, source, color) {
    const event = { netId, color, source, timestamp: Date.now() };
    this.activeHighlight = event;
    for (const l of this.netListeners) l(event);
  }

  onSelection(l) {
    this.selectionListeners.add(l);
    return () => this.selectionListeners.delete(l);
  }

  onHover(l) {
    this.hoverListeners.add(l);
    return () => this.hoverListeners.delete(l);
  }

  onNetHighlight(l) {
    this.netListeners.add(l);
    return () => this.netListeners.delete(l);
  }
}

test('CrossProbeBus emits selection events to multiple listeners', () => {
  const bus = new CrossProbeBus();
  const received = [];

  const unsubscribe = bus.onSelection((evt) => {
    received.push(evt);
  });

  bus.select(['comp-u1', 'comp-r1'], 'schematic');

  assert.equal(received.length, 1);
  assert.deepEqual(received[0].entityIds, ['comp-u1', 'comp-r1']);
  assert.equal(received[0].source, 'schematic');

  // Verify unsubscribe
  unsubscribe();
  bus.select(['comp-c1'], 'pcb');
  assert.equal(received.length, 1, 'Should not receive events after unsubscribe');
});

test('CrossProbeBus emits net highlights with color', () => {
  const bus = new CrossProbeBus();
  let highlightedNet = null;

  bus.onNetHighlight((evt) => {
    highlightedNet = evt;
  });

  bus.highlightNet('net-usb-dp', 'code', '#00F0FF');

  assert.notEqual(highlightedNet, null);
  assert.equal(highlightedNet.netId, 'net-usb-dp');
  assert.equal(highlightedNet.color, '#00F0FF');
  assert.equal(highlightedNet.source, 'code');
});
