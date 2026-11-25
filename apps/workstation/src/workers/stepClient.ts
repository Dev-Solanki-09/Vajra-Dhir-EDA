import type {
  StepWorkerDecodeResponse,
  TransferredMeshBuffer,
} from './stepWorker.worker';

export interface DecodedStepAsset {
  stepSha256: string;
  meshes: TransferredMeshBuffer[];
  bboxMin: [number, number, number];
  bboxMax: [number, number, number];
}

class StepWorkerPool {
  private worker: Worker | null = null;
  private reqId = 1;
  private pending = new Map<
    number,
    { resolve: (val: DecodedStepAsset) => void; reject: (err: Error) => void }
  >();
  private cache = new Map<string, Promise<DecodedStepAsset>>();

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./stepWorker.worker.ts', import.meta.url), {
        type: 'module',
      });
      this.worker.onmessage = (ev: MessageEvent<StepWorkerDecodeResponse>) => {
        const msg = ev.data;
        const entry = this.pending.get(msg.id);
        if (!entry) return;
        this.pending.delete(msg.id);
        if (!msg.ok) {
          entry.reject(new Error(msg.error || 'STEP decode failed'));
        } else {
          entry.resolve({
            stepSha256: msg.stepSha256,
            meshes: msg.meshes,
            bboxMin: msg.bboxMin,
            bboxMax: msg.bboxMax,
          });
        }
      };
      this.worker.onerror = (err) => {
        for (const [, p] of this.pending) {
          p.reject(new Error(err.message || 'STEP worker crashed'));
        }
        this.pending.clear();
      };
    }
    return this.worker;
  }

  loadStepByUrl(stepUrl: string, stepSha256: string): Promise<DecodedStepAsset> {
    const existing = this.cache.get(stepSha256);
    if (existing) return existing;

    const promise = (async () => {
      const res = await fetch(stepUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching STEP ${stepSha256}`);
      const buffer = await res.arrayBuffer();
      return await new Promise<DecodedStepAsset>((resolve, reject) => {
        const id = this.reqId++;
        this.pending.set(id, { resolve, reject });
        const worker = this.getWorker();
        worker.postMessage({ id, stepSha256, buffer, format: 'step' }, [buffer]);
      });
    })().catch((err) => {
      this.cache.delete(stepSha256);
      throw err;
    });

    this.cache.set(stepSha256, promise);
    return promise;
  }

  getCachedCount(): number {
    return this.cache.size;
  }
}

export const globalStepWorkerClient = new StepWorkerPool();
