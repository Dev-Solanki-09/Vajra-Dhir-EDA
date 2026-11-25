import type { Nm } from "./types";

export interface DropViaInput {
  boardId: string;
  netId: string;
  xNm: Nm;
  yNm: Nm;
  activeLayer: "F.Cu" | "B.Cu";
  expectedLamport: number;
}

export interface ExplicitLockInput {
  entityType: string;
  entityId: string;
  locked: boolean;
  expectedLamport: number;
  reason?: string | null;
}

/**
 * Generates an RFC-9562 UUIDv7 string using native Node 26 `crypto.randomUUIDv7()`
 * when available, or `crypto.getRandomValues` fallback for browser / Node 24 runtimes.
 */
export function uuidv7(): string {
  const nativeCrypto = globalThis.crypto as Crypto & { randomUUIDv7?: () => string };
  if (typeof nativeCrypto?.randomUUIDv7 === "function") {
    return nativeCrypto.randomUUIDv7();
  }
  const bytes = new Uint8Array(16);
  nativeCrypto.getRandomValues(bytes);
  const ms = BigInt(Date.now());
  bytes[0] = Number((ms >> 40n) & 0xffn);
  bytes[1] = Number((ms >> 32n) & 0xffn);
  bytes[2] = Number((ms >> 24n) & 0xffn);
  bytes[3] = Number((ms >> 16n) & 0xffn);
  bytes[4] = Number((ms >> 8n) & 0xffn);
  bytes[5] = Number(ms & 0xffn);
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * F-08: Via-drop emits an unlocked ADD_VIA geometry operation (never SET_LOCK).
 * Locks are mutated exclusively via `createExplicitLockPatch`.
 */
export function createDropViaPatch(input: DropViaInput) {
  const nextLayer = input.activeLayer === "F.Cu" ? "B.Cu" : "F.Cu";
  return {
    expected_lamport: input.expectedLamport,
    actor_kind: "human" as const,
    actor_id: "engineer",
    summary: `Dropped through-via (${input.activeLayer} -> ${nextLayer})`,
    ops: [
      {
        op: "ADD_VIA" as const,
        via: {
          id: uuidv7(),
          board_id: input.boardId,
          net_id: input.netId,
          x_nm: input.xNm,
          y_nm: input.yNm,
          drill_nm: 300_000,
          diameter_nm: 600_000,
          start_layer: "F.Cu",
          end_layer: "B.Cu",
          via_kind: "through",
          provenance: "human" as const,
          locked: false,
          rev_lamport: input.expectedLamport + 1,
        },
      },
    ],
  };
}

export function createExplicitLockPatch(input: ExplicitLockInput) {
  return {
    expected_lamport: input.expectedLamport,
    actor_kind: "human" as const,
    actor_id: "engineer",
    summary: `${input.locked ? "Lock" : "Unlock"} ${input.entityType} ${input.entityId}`,
    ops: [
      {
        op: "SET_LOCK" as const,
        entity_type: input.entityType,
        entity_id: input.entityId,
        locked: input.locked,
        reason: input.reason ?? (input.locked ? "human_explicit_lock" : null),
      },
    ],
  };
}
