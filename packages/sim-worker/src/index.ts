import type { SpiceWorkerRequest, SpiceWorkerResponse } from './spiceWorker.js';

export type { SpiceWorkerRequest, SpiceWorkerResponse };

export interface WaveformMetrics {
  minV: number;
  maxV: number;
  meanV: number;
  rippleMvPp: number;
  overshootPct: number;
  settlingTimeUs: number;
}

export const SPICE_RECOVERY_LADDER = [
  { step: 1, name: 'gmin_stepping', directive: '.options gmin=1e-8' },
  { step: 2, name: 'source_stepping', directive: '.options gmin=1e-8 srcsteps=10' },
  { step: 3, name: 'tolerance_relaxation', directive: '.options reltol=0.005 abstol=1e-10 chgtol=1e-14' },
  { step: 4, name: 'uic_bypass', directive: 'UIC' },
] as const;

export function applySpiceConvergenceStep(netlist: string, stepIndex: number): string {
  const item = SPICE_RECOVERY_LADDER[Math.max(0, Math.min(SPICE_RECOVERY_LADDER.length - 1, stepIndex))];
  if (item.name === 'uic_bypass') {
    return netlist.replace(/^(\.tran\s+[^\r\n]+)/gim, (m) => (m.toLowerCase().includes('uic') ? m : `${m} uic`));
  }
  const lines = netlist.split(/\r?\n/);
  const endIdx = lines.findIndex((l) => l.trim().toLowerCase() === '.end');
  if (endIdx >= 0) {
    lines.splice(endIdx, 0, item.directive);
    return lines.join('\n');
  }
  return `${netlist}\n${item.directive}\n.end`;
}

export function computeWaveformMetrics(
  timeSeconds: number[],
  voltages: number[],
  targetNominalV = 3.3
): WaveformMetrics {
  if (voltages.length === 0) {
    return { minV: 0, maxV: 0, meanV: 0, rippleMvPp: 0, overshootPct: 0, settlingTimeUs: 0 };
  }
  let minV = Infinity;
  let maxV = -Infinity;
  let sum = 0;
  for (const v of voltages) {
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
    sum += v;
  }
  const meanV = sum / voltages.length;
  // Measure steady-state ripple over final 40% of waveform to exclude initial startup ramp
  const tailStart = Math.floor(voltages.length * 0.6);
  let tailMin = Infinity;
  let tailMax = -Infinity;
  for (let i = tailStart; i < voltages.length; i++) {
    const v = voltages[i];
    if (v < tailMin) tailMin = v;
    if (v > tailMax) tailMax = v;
  }
  const rippleMvPp = Math.max(0, (tailMax - tailMin) * 1000.0);
  const overshootPct = targetNominalV > 0 ? Math.max(0, ((maxV - targetNominalV) / targetNominalV) * 100.0) : 0;

  let settlingIdx = voltages.length - 1;
  const band = Math.max(0.05, Math.abs(targetNominalV) * 0.05);
  for (let i = voltages.length - 1; i >= 0; i--) {
    if (Math.abs(voltages[i] - targetNominalV) > band) {
      settlingIdx = Math.min(voltages.length - 1, i + 1);
      break;
    }
    if (i === 0) settlingIdx = 0;
  }
  const settlingTimeUs = (timeSeconds[settlingIdx] ?? 0) * 1e6;

  return {
    minV: Number(minV.toFixed(4)),
    maxV: Number(maxV.toFixed(4)),
    meanV: Number(meanV.toFixed(4)),
    rippleMvPp: Number(rippleMvPp.toFixed(2)),
    overshootPct: Number(overshootPct.toFixed(2)),
    settlingTimeUs: Number(settlingTimeUs.toFixed(2)),
  };
}

/**
 * Safe Web Worker host with SHA-256 caching and hard worker.terminate() on abort or timeout.
 */
export class SpiceWasmHost {
  private worker: Worker | null = null;
  private cache = new Map<string, SpiceWorkerResponse>();
  private factory: () => Worker;
  private activeReject: ((err: Error) => void) | null = null;

  constructor(workerFactory: () => Worker) {
    this.factory = workerFactory;
  }

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = this.factory();
    }
    return this.worker;
  }

  public abort(reason = 'Aborted by user'): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    if (this.activeReject) {
      const rej = this.activeReject;
      this.activeReject = null;
      rej(new Error(reason));
    }
  }

  public async run(netlist: string, timeoutMs = 15000): Promise<SpiceWorkerResponse & { casCached?: boolean }> {
    const cacheKey = netlist.trim();
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return { ...cached, casCached: true };
    }

    const reqId = `spice-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const worker = this.ensureWorker();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.abort(`ngspice-wasm timed out after ${timeoutMs}ms`);
      }, timeoutMs);

      this.activeReject = (err: Error) => {
        clearTimeout(timer);
        reject(err);
      };

      const onMsg = (ev: MessageEvent<SpiceWorkerResponse>) => {
        const res = ev.data;
        if (!res || res.id !== reqId) return;
        clearTimeout(timer);
        this.activeReject = null;
        worker.removeEventListener('message', onMsg);
        if (res.ok) {
          this.cache.set(cacheKey, res);
        }
        resolve(res);
      };

      worker.addEventListener('message', onMsg);
      worker.postMessage({
        type: 'RUN_SPICE',
        id: reqId,
        netlist,
      } satisfies SpiceWorkerRequest);
    });
  }
}
