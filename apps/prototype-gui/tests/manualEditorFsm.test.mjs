import test from "node:test";
import assert from "node:assert/strict";
import {
  createDropViaPatch,
  createExplicitLockPatch,
  uuidv7,
} from "../src/manualEditorFsm.ts";

const UUIDV7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("uuidv7 produces RFC-9562 version-7 UUID strings", () => {
  const id1 = uuidv7();
  const id2 = uuidv7();
  assert.match(id1, UUIDV7_RE);
  assert.match(id2, UUIDV7_RE);
  assert.notEqual(id1, id2);
});

test("via-drop emits ADD_VIA geometry op (never SET_LOCK) with unlocked default", () => {
  const patch = createDropViaPatch({
    boardId: "018e0000-0000-7000-8000-000000000002",
    netId: "018e0000-0000-7000-8000-000000000010",
    xNm: 12_500_000,
    yNm: 8_000_000,
    activeLayer: "F.Cu",
    expectedLamport: 7,
  });

  assert.equal(patch.actor_kind, "human");
  assert.equal(patch.expected_lamport, 7);
  assert.equal(patch.ops.length, 1);
  assert.equal(patch.ops[0].op, "ADD_VIA");
  assert.notEqual(patch.ops[0].op, "SET_LOCK");
  assert.equal(patch.ops[0].via.x_nm, 12_500_000);
  assert.equal(patch.ops[0].via.y_nm, 8_000_000);
  assert.equal(patch.ops[0].via.locked, false);
  assert.match(patch.ops[0].via.id, UUIDV7_RE);
});

test("lock mutations happen only through explicit lock command", () => {
  const lockPatch = createExplicitLockPatch({
    entityType: "via",
    entityId: "018e0000-0000-7000-8000-000000000099",
    locked: true,
    expectedLamport: 8,
    reason: "human_explicit_lock",
  });

  assert.equal(lockPatch.ops.length, 1);
  assert.equal(lockPatch.ops[0].op, "SET_LOCK");
  assert.equal(lockPatch.ops[0].locked, true);
});
