// Isolated LGPL-2.1-with-OCCT-exception Web Worker for STEP/IGES geometry tessellation.
// Communicates solely via zero-copy Transferable TypedArrays with main UI thread.
import occtimportjs, { type OcctModule } from 'occt-import-js';
import occtWasmUrl from 'occt-import-js/dist/occt-import-js.wasm?url';

let occtPromise: Promise<OcctModule> | null = null;

function getOcct(): Promise<OcctModule> {
  if (!occtPromise) {
    occtPromise = (async () => {
      const wasmRes = await fetch(occtWasmUrl, { credentials: 'same-origin' });
      if (!wasmRes.ok) throw new Error(`HTTP ${wasmRes.status} loading OCCT WASM`);
      const wasmBinary = await wasmRes.arrayBuffer();
      return await (occtimportjs as unknown as (arg: Record<string, unknown>) => Promise<OcctModule>)({
        wasmBinary,
        locateFile: (file: string) => (file.endsWith('.wasm') ? occtWasmUrl : file),
      });
    })();
  }
  return occtPromise;
}

export interface StepWorkerDecodeRequest {
  id: number;
  stepSha256: string;
  buffer: ArrayBuffer;
  format?: 'step' | 'iges';
}

export interface TransferredMeshBuffer {
  color: [number, number, number];
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

export interface StepWorkerDecodeResponse {
  id: number;
  stepSha256: string;
  ok: boolean;
  error?: string;
  meshes: TransferredMeshBuffer[];
  bboxMin: [number, number, number];
  bboxMax: [number, number, number];
}

self.onmessage = async (ev: MessageEvent<StepWorkerDecodeRequest>) => {
  const { id, stepSha256, buffer, format = 'step' } = ev.data;
  try {
    const occt = await getOcct();
    const bytes = new Uint8Array(buffer);
    const result =
      format === 'iges' && typeof occt.ReadIgesFile === 'function'
        ? occt.ReadIgesFile(bytes, null)
        : occt.ReadStepFile(bytes, null);

    if (!result || !result.success || !Array.isArray(result.meshes)) {
      const failResp: StepWorkerDecodeResponse = {
        id,
        stepSha256,
        ok: false,
        error: 'OCCT_STEP_DECODE_FAILED',
        meshes: [],
        bboxMin: [0, 0, 0],
        bboxMax: [0, 0, 0],
      };
      self.postMessage(failResp);
      return;
    }

    const meshes: TransferredMeshBuffer[] = [];
    const transferables: Transferable[] = [];
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;

    for (const rawMesh of result.meshes) {
      const posArr = rawMesh?.attributes?.position?.array;
      if (!posArr || posArr.length < 3) continue;
      const positions =
        posArr instanceof Float32Array ? new Float32Array(posArr) : Float32Array.from(posArr);

      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const y = positions[i + 1];
        const z = positions[i + 2];
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (z < minZ) minZ = z;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        if (z > maxZ) maxZ = z;
      }

      const normArr = rawMesh.attributes?.normal?.array;
      const normals =
        normArr && normArr.length === positions.length
          ? normArr instanceof Float32Array
            ? new Float32Array(normArr)
            : Float32Array.from(normArr)
          : new Float32Array(positions.length);

      const idxArr = rawMesh.index?.array;
      let indices: Uint32Array;
      if (idxArr && idxArr.length > 0) {
        indices = idxArr instanceof Uint32Array ? new Uint32Array(idxArr) : Uint32Array.from(idxArr);
      } else {
        const vertCount = Math.floor(positions.length / 3);
        indices = new Uint32Array(vertCount);
        for (let k = 0; k < vertCount; k++) indices[k] = k;
      }

      const color: [number, number, number] = Array.isArray(rawMesh.color) && rawMesh.color.length >= 3
        ? [Number(rawMesh.color[0]), Number(rawMesh.color[1]), Number(rawMesh.color[2])]
        : [0.68, 0.72, 0.78];

      meshes.push({ color, positions, normals, indices });
      transferables.push(positions.buffer, normals.buffer, indices.buffer);
    }

    if (!Number.isFinite(minX)) {
      minX = minY = minZ = 0;
      maxX = maxY = maxZ = 0;
    }

    const resp: StepWorkerDecodeResponse = {
      id,
      stepSha256,
      ok: true,
      meshes,
      bboxMin: [minX, minY, minZ],
      bboxMax: [maxX, maxY, maxZ],
    };
    (self as unknown as { postMessage: (msg: unknown, transfer: Transferable[]) => void }).postMessage(
      resp,
      transferables
    );
  } catch (err) {
    const errResp: StepWorkerDecodeResponse = {
      id,
      stepSha256,
      ok: false,
      error: err instanceof Error ? err.message : 'STEP worker error',
      meshes: [],
      bboxMin: [0, 0, 0],
      bboxMax: [0, 0, 0],
    };
    self.postMessage(errResp);
  }
};
