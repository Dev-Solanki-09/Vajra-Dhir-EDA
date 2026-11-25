import {
  solveGeometryWorkerRequest,
  type GeometryWorkerResult,
  type GeometryWorkerTaskRequest,
} from './geometryWorker.js';

/**
 * Dispatches CAD geometry tasks off the main thread in browser runtimes
 * with a deterministic synchronous fallback in headless/Node test contexts.
 */
export async function runGeometryWorkerTask(
  req: GeometryWorkerTaskRequest,
  workerUrl?: string | URL
): Promise<GeometryWorkerResult> {
  if (typeof Worker !== 'undefined' && workerUrl) {
    return new Promise<GeometryWorkerResult>((resolve, reject) => {
      const worker = new Worker(workerUrl, { type: 'module' });
      worker.onmessage = (evt: MessageEvent<GeometryWorkerResult>) => {
        worker.terminate();
        resolve(evt.data);
      };
      worker.onerror = (err) => {
        worker.terminate();
        reject(err);
      };
      worker.postMessage(req);
    });
  }

  return solveGeometryWorkerRequest(req);
}
