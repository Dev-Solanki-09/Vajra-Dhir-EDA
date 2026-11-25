// Isolated Runtime Boundary for occt-import-js (LGPL-2.1-with-OCCT-exception)
// Executed solely inside an isolated browser Web Worker; never linked into Ring-1 Rust crates.

export const STEP_WORKER_LICENSE = 'LGPL-2.1-with-OCCT-exception';
export const STEP_WORKER_MODULE = 'occt-import-js';

/**
 * Builds a structured postMessage decode request for the isolated OCCT Web Worker.
 * @param {string} fileName
 * @param {Uint8Array | ArrayBuffer} stepBytes
 */
export function createStepWorkerRequest(fileName, stepBytes) {
  const bytes = stepBytes instanceof Uint8Array ? stepBytes : new Uint8Array(stepBytes);
  return {
    type: 'DECODE_STEP_AP242',
    licenseIsolation: STEP_WORKER_LICENSE,
    engine: STEP_WORKER_MODULE,
    fileName,
    byteLength: bytes.byteLength,
  };
}

/**
 * Safe Web Worker dispatch wrapper. Invokes occt-import-js only inside a Worker context
 * when bundled in the workstation runtime; returns an honest structured deferral in offline tests.
 * @param {Uint8Array | ArrayBuffer} stepBytes
 * @param {{ ImportStepFile?: (bytes: Uint8Array) => { success: boolean, meshes: unknown[] } } | null} occtRuntime
 */
export function decodeStepBufferInWorker(stepBytes, occtRuntime = null) {
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
