/**
 * @vajradhir/collab — Real-time Yjs CRDT projection on HW-IR + fail-closed human-lock awareness
 * + canonical 2030-proof `hw.lock` digest engine (pure MIT, zero node-only runtime deps).
 */

import * as Y from 'yjs';

export type ActorRole = 'human' | 'agent' | 'compiler' | 'peer';

export interface HwIrProjectedEntity {
  id: string;
  refdes: string;
  x_nm: number;
  y_nm: number;
  rot_mdeg: number;
  locked: boolean;
}

export interface PeerPresenceState {
  peerId: string;
  actor: ActorRole;
  selectedEntityIds: string[];
  cursorNm: [number, number] | null;
  updatedAtMs: number;
}

export type MutationOutcome =
  | { ok: true }
  | { ok: false; code: 'KERNEL_LOCK_VIOLATION'; lockedEntityIds: string[] };

export interface HwLockAssetRef {
  name: string;
  sha256: string;
}

export interface HwLockConstraintRef {
  name: string;
  min_width_nm: number;
  min_clearance_nm: number;
}

export interface HwLockInputSnapshot {
  symbols: HwLockAssetRef[];
  footprints: HwLockAssetRef[];
  spice_models: HwLockAssetRef[];
  constraints: HwLockConstraintRef[];
  entities: Array<HwIrProjectedEntity | undefined>;
}

export interface HwLockDigest {
  schema: 'vd.hw.lock.v1';
  digest_sha256: string;
  entry_digests: {
    symbols: string;
    footprints: string;
    spice_models: string;
    constraints: string;
    hw_ir_projection: string;
  };
}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** Synchronous FIPS 180-4 SHA-256 over UTF-8 strings (browser + Node safe, zero native deps). */
export function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const buf = new Uint8Array(paddedLen);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  return Array.from(h, (v) => v.toString(16).padStart(8, '0')).join('');
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function computeHwLockDigest(snapshot: HwLockInputSnapshot): HwLockDigest {
  const symbols = [...snapshot.symbols]
    .map((s) => ({ name: s.name, sha256: s.sha256 }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const footprints = [...snapshot.footprints]
    .map((f) => ({ name: f.name, sha256: f.sha256 }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const spiceModels = [...snapshot.spice_models]
    .map((m) => ({ name: m.name, sha256: m.sha256 }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const constraints = [...snapshot.constraints]
    .map((c) => ({ name: c.name, min_width_nm: Math.trunc(c.min_width_nm), min_clearance_nm: Math.trunc(c.min_clearance_nm) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const entities = snapshot.entities
    .filter((e): e is HwIrProjectedEntity => Boolean(e))
    .map((e) => ({
      id: e.id,
      refdes: e.refdes,
      x_nm: Math.trunc(e.x_nm),
      y_nm: Math.trunc(e.y_nm),
      rot_mdeg: Math.trunc(e.rot_mdeg),
      locked: Boolean(e.locked),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const entry_digests = {
    symbols: sha256Hex(canonicalJson(symbols)),
    footprints: sha256Hex(canonicalJson(footprints)),
    spice_models: sha256Hex(canonicalJson(spiceModels)),
    constraints: sha256Hex(canonicalJson(constraints)),
    hw_ir_projection: sha256Hex(canonicalJson(entities)),
  };
  return {
    schema: 'vd.hw.lock.v1',
    digest_sha256: sha256Hex(canonicalJson(entry_digests)),
    entry_digests,
  };
}

export function verifyHwLockDigest(lock: HwLockDigest, snapshot: HwLockInputSnapshot): boolean {
  if (lock.schema !== 'vd.hw.lock.v1') return false;
  return computeHwLockDigest(snapshot).digest_sha256 === lock.digest_sha256;
}

function sameEntityState(a: HwIrProjectedEntity | undefined, b: HwIrProjectedEntity | undefined): boolean {
  if (!a || !b) return a === b;
  return (
    a.id === b.id &&
    a.refdes === b.refdes &&
    a.x_nm === b.x_nm &&
    a.y_nm === b.y_nm &&
    a.rot_mdeg === b.rot_mdeg &&
    a.locked === b.locked
  );
}

export class HwIrCrdtSession {
  public readonly peerId: string;
  public readonly actor: ActorRole;
  private doc: Y.Doc;
  private entitiesMap: Y.Map<HwIrProjectedEntity>;
  private presenceMap: Y.Map<PeerPresenceState>;

  constructor(peerId: string, actor: ActorRole = 'human') {
    this.peerId = peerId;
    this.actor = actor;
    this.doc = new Y.Doc();
    this.entitiesMap = this.doc.getMap<HwIrProjectedEntity>('entities');
    this.presenceMap = this.doc.getMap<PeerPresenceState>('presence');
  }

  public getEntity(id: string): HwIrProjectedEntity | undefined {
    const val = this.entitiesMap.get(id);
    return val ? { ...val } : undefined;
  }

  public listEntities(): HwIrProjectedEntity[] {
    const out: HwIrProjectedEntity[] = [];
    this.entitiesMap.forEach((v) => out.push({ ...v }));
    return out.sort((a, b) => a.id.localeCompare(b.id));
  }

  public upsertEntity(actor: ActorRole, next: HwIrProjectedEntity): MutationOutcome {
    const existing = this.entitiesMap.get(next.id);
    if (existing?.locked && actor !== 'human' && !sameEntityState(existing, next)) {
      return { ok: false, code: 'KERNEL_LOCK_VIOLATION', lockedEntityIds: [next.id] };
    }
    this.entitiesMap.set(next.id, {
      ...next,
      x_nm: Math.trunc(next.x_nm),
      y_nm: Math.trunc(next.y_nm),
      rot_mdeg: Math.trunc(next.rot_mdeg),
    });
    return { ok: true };
  }

  /** Test-only escape hatch simulating an unguarded remote peer packet. */
  public forceRawEntityForTest(next: HwIrProjectedEntity): void {
    this.entitiesMap.set(next.id, { ...next });
  }

  public encodeStateAsUpdate(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc);
  }

  /**
   * Apply a remote Yjs CRDT update with fail-closed human-lock awareness:
   * verifies against an isolated shadow doc first so any remote peer/agent mutation
   * touching a locked entity never commits into the live Y.Doc.
   */
  public applyRemoteUpdateGuarded(update: Uint8Array, remoteActor: ActorRole): MutationOutcome {
    if (remoteActor !== 'human') {
      const incoming = new Y.Doc();
      Y.applyUpdate(incoming, update);
      const incomingMap = incoming.getMap<HwIrProjectedEntity>('entities');

      const shadow = new Y.Doc();
      Y.applyUpdate(shadow, Y.encodeStateAsUpdate(this.doc));
      Y.applyUpdate(shadow, update);
      const shadowMap = shadow.getMap<HwIrProjectedEntity>('entities');

      const violations: string[] = [];
      this.entitiesMap.forEach((current, id) => {
        if (current.locked) {
          const shadowCandidate = shadowMap.get(id);
          const incomingCandidate = incomingMap.get(id);
          if (
            !sameEntityState(current, shadowCandidate) ||
            (incomingCandidate !== undefined && !sameEntityState(current, incomingCandidate))
          ) {
            violations.push(id);
          }
        }
      });
      incoming.destroy();
      shadow.destroy();
      if (violations.length > 0) {
        return { ok: false, code: 'KERNEL_LOCK_VIOLATION', lockedEntityIds: violations };
      }
    }
    Y.applyUpdate(this.doc, update);
    return { ok: true };
  }

  public updatePresence(state: Omit<PeerPresenceState, 'updatedAtMs'>): void {
    this.presenceMap.set(state.peerId, {
      ...state,
      updatedAtMs: Date.now(),
    });
  }

  public listPresence(): PeerPresenceState[] {
    const out: PeerPresenceState[] = [];
    this.presenceMap.forEach((v) => out.push({ ...v }));
    return out.sort((a, b) => a.peerId.localeCompare(b.peerId));
  }
}
