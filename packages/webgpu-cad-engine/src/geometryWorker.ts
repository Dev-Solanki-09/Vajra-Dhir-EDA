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
      const absDx = dx < 0n ? -dx : dx;
      const absDy = dy < 0n ? -dy : dy;
      const halfW = pad.widthNm / 2n + req.toleranceNm;
      const halfH = pad.heightNm / 2n + req.toleranceNm;
      const distSq = dx * dx + dy * dy;
      const insideExpandedBox = absDx <= halfW && absDy <= halfH;
      if ((insideExpandedBox || distSq <= tolSq) && (bestDistSq === null || distSq < bestDistSq)) {
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
  const expandPoint = (x: bigint, y: bigint) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const pad of req.scene.pads) {
    expandPoint(pad.xNm - pad.widthNm / 2n, pad.yNm - pad.heightNm / 2n);
    expandPoint(pad.xNm + pad.widthNm / 2n, pad.yNm + pad.heightNm / 2n);
  }
  for (const trace of req.scene.traces) {
    expandPoint(trace.x1Nm, trace.y1Nm);
    expandPoint(trace.x2Nm, trace.y2Nm);
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

if (typeof self !== 'undefined' && typeof (self as { document?: unknown }).document === 'undefined') {
  const workerScope = self as unknown as {
    onmessage: ((event: MessageEvent<GeometryWorkerTaskRequest>) => void) | null;
    postMessage: (data: GeometryWorkerResult) => void;
  };
  workerScope.onmessage = (event) => {
    workerScope.postMessage(solveGeometryWorkerRequest(event.data));
  };
}
