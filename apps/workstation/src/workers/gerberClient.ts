import type {
  GerberInputFile,
  GerberWorkerResponse,
} from './gerberWorker.worker';

class GerberWorkerClient {
  private worker: Worker | null = null;
  private reqId = 1;
  private pending = new Map<
    number,
    { resolve: (r: GerberWorkerResponse) => void; reject: (err: Error) => void }
  >();

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./gerberWorker.worker.ts', import.meta.url), {
        type: 'module',
      });
      this.worker.onmessage = (ev: MessageEvent<GerberWorkerResponse>) => {
        const msg = ev.data;
        const entry = this.pending.get(msg.id);
        if (!entry) return;
        this.pending.delete(msg.id);
        if (!msg.ok) {
          entry.reject(new Error(msg.error || 'Gerber parse failed'));
        } else {
          entry.resolve(msg);
        }
      };
      this.worker.onerror = (err) => {
        for (const [, p] of this.pending) {
          p.reject(new Error(err.message || 'Gerber worker crashed'));
        }
        this.pending.clear();
      };
    }
    return this.worker;
  }

  plotFiles(files: GerberInputFile[]): Promise<GerberWorkerResponse> {
    return new Promise((resolve, reject) => {
      const id = this.reqId++;
      this.pending.set(id, { resolve, reject });
      this.getWorker().postMessage({ id, files });
    });
  }
}

export const globalGerberWorkerClient = new GerberWorkerClient();
