// Isolated Runtime Boundary for occt-import-js (LGPL-2.1-with-OCCT-exception)
// Executed solely inside an isolated browser Web Worker; never linked into Ring-1 Rust crates.

export const STEP_WORKER_LICENSE = 'LGPL-2.1-with-OCCT-exception' as const;
export const STEP_WORKER_MODULE = 'occt-import-js' as const;

export interface StepWorkerRequest {
  type: 'DECODE_STEP_AP242';
  licenseIsolation: typeof STEP_WORKER_LICENSE;
  engine: typeof STEP_WORKER_MODULE;
  fileName: string;
  byteLength: number;
}

export interface OcctImportRuntime {
  ImportStepFile: (bytes: Uint8Array) => { success: boolean; meshes: unknown[] };
}

export interface StepWorkerDecodeResult {
  ok: boolean;
  reason?: string;
  engine?: typeof STEP_WORKER_MODULE;
  licenseIsolation: typeof STEP_WORKER_LICENSE;
  meshes: unknown[];
}

export function createStepWorkerRequest(
  fileName: string,
  stepBytes: Uint8Array | ArrayBuffer,
): StepWorkerRequest {
  const bytes = stepBytes instanceof Uint8Array ? stepBytes : new Uint8Array(stepBytes);
  return {
    type: 'DECODE_STEP_AP242',
    licenseIsolation: STEP_WORKER_LICENSE,
    engine: STEP_WORKER_MODULE,
    fileName,
    byteLength: bytes.byteLength,
  };
}

export function decodeStepBufferInWorker(
  stepBytes: Uint8Array | ArrayBuffer,
  occtRuntime: OcctImportRuntime | null = null,
): StepWorkerDecodeResult {
  const bytes = stepBytes instanceof Uint8Array ? stepBytes : new Uint8Array(stepBytes);
  if (bytes.byteLength === 0) {
    return { ok: false, reason: 'EMPTY_STEP_BUFFER', meshes: [], licenseIsolation: STEP_WORKER_LICENSE };
  }
  if (occtRuntime && typeof occtRuntime.ImportStepFile === 'function') {
    const parsed = occtRuntime.ImportStepFile(bytes);
    return {
      ok: Boolean(parsed?.success),
      engine: STEP_WORKER_MODULE,
      licenseIsolation: STEP_WORKER_LICENSE,
      meshes: Array.isArray(parsed?.meshes) ? parsed.meshes : [],
    };
  }
  return {
    ok: false,
    reason: 'OCCT_WASM_UNBUNDLED_IN_OFFLINE_ENV',
    engine: STEP_WORKER_MODULE,
    licenseIsolation: STEP_WORKER_LICENSE,
    meshes: [],
  };
}
