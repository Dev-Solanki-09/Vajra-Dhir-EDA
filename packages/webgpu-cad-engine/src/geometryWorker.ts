import type { CadSceneGeometry } from './renderer.js';

export type GeometryWorkerTaskRequest =
  | {
      kind: 'HIT_TEST';
      scene: CadSceneGeometry;
      targetNm: [bigint, bigint];
      toleranceNm: bigint;
    }
  | {
      kind: 'COMPUTE_BBOX';
      scene: CadSceneGeometry;
    };

export interface GeometryWorkerHitResult {
  kind: 'HIT_TEST';
  refdes: string | null;
  padId: string | null;
  net: string | null;
  distanceSqNm: string | null;
}

export interface GeometryWorkerBboxResult {
  kind: 'COMPUTE_BBOX';
  minXNm: bigint;
  minYNm: bigint;
  maxXNm: bigint;
  maxYNm: bigint;
  padCount: number;
  traceCount: number;
}

export type GeometryWorkerResult = GeometryWorkerHitResult | GeometryWorkerBboxResult;

export function solveGeometryWorkerRequest(req: GeometryWorkerTaskRequest): GeometryWorkerResult {
  if (req.kind === 'HIT_TEST') {
    const [tx, ty] = req.targetNm;
    const tolSq = req.toleranceNm * req.toleranceNm;
    let bestPadId: string | null = null;
    let bestRefdes: string | null = null;
    let bestNet: string | null = null;
    let bestDistSq: bigint | null = null;

    for (const pad of req.scene.pads) {
      const dx = pad.xNm - tx;
      const dy = pad.yNm - ty;
      const distSq = dx * dx + dy * dy;
      if (distSq <= tolSq && (bestDistSq === null || distSq < bestDistSq)) {
        bestDistSq = distSq;
        bestPadId = pad.id;
        bestRefdes = pad.refdes;
        bestNet = pad.net;
      }
    }

    return {
      kind: 'HIT_TEST',
      refdes: bestRefdes,
      padId: bestPadId,
      net: bestNet,
      distanceSqNm: bestDistSq !== null ? bestDistSq.toString() : null,
    };
  }

  let minX = req.scene.boardWidthNm / -2n;
  let maxX = req.scene.boardWidthNm / 2n;
  let minY = req.scene.boardHeightNm / -2n;
  let maxY = req.scene.boardHeightNm / 2n;
  for (const pad of req.scene.pads) {
    if (pad.xNm < minX) minX = pad.xNm;
    if (pad.xNm > maxX) maxX = pad.xNm;
    if (pad.yNm < minY) minY = pad.yNm;
    if (pad.yNm > maxY) maxY = pad.yNm;
  }
  return {
    kind: 'COMPUTE_BBOX',
    minXNm: minX,
    minYNm: minY,
    maxXNm: maxX,
    maxYNm: maxY,
    padCount: req.scene.pads.length,
    traceCount: req.scene.traces.length,
  };
}

// Web Worker entrypoint guard when loaded as a dedicated Worker module
if (typeof self !== 'undefined' && typeof (self as { document?: unknown }).document === 'undefined') {
  const workerScope = self as unknown as {
    onmessage: ((event: MessageEvent<GeometryWorkerTaskRequest>) => void) | null;
    postMessage: (data: GeometryWorkerResult) => void;
  };
  workerScope.onmessage = (event) => {
    workerScope.postMessage(solveGeometryWorkerRequest(event.data));
  };
}
