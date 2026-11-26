import { Simulation } from 'eecircuit-engine';

export interface SpiceWorkerRequest {
  type: 'RUN_SPICE';
  id: string;
  netlist: string;
  maxRecoverySteps?: number;
}

export interface SpiceWorkerResponse {
  type: 'SPICE_RESULT';
  id: string;
  ok: boolean;
  header?: string;
  numVariables?: number;
  numPoints?: number;
  variableNames?: string[];
  signals?: Record<string, number[]>;
  info: string;
  errors: string[];
  ladderStep: number;
  ladderLabel: string;
}

const RECOVERY_STEPS: Array<{ label: string; optionLine: string | null }> = [
  { label: 'nominal', optionLine: null },
  { label: 'gmin_stepping', optionLine: '.options gmin=1e-8' },
  { label: 'source_stepping', optionLine: '.options gmin=1e-8 srcsteps=10' },
  { label: 'tolerance_relaxation', optionLine: '.options reltol=0.005 abstol=1e-10 chgtol=1e-14' },
];

function injectOptionLine(netlist: string, optionLine: string | null): string {
  if (!optionLine) return netlist;
  const lines = netlist.split(/\r?\n/);
  const endIdx = lines.findIndex((l) => l.trim().toLowerCase() === '.end');
  if (endIdx >= 0) {
    lines.splice(endIdx, 0, optionLine);
    return lines.join('\n');
  }
  return `${netlist}\n${optionLine}\n.end`;
}

let simInstance: Simulation | null = null;

async function getSim(): Promise<Simulation> {
  if (!simInstance) {
    simInstance = new Simulation();
    await simInstance.start();
  }
  return simInstance;
}

if (typeof self !== 'undefined' && typeof (self as unknown as DedicatedWorkerGlobalScope).postMessage === 'function') {
  const scope = self as unknown as DedicatedWorkerGlobalScope;
  scope.onmessage = async (event: MessageEvent<SpiceWorkerRequest>) => {
    const req = event.data;
    if (!req || req.type !== 'RUN_SPICE') return;

    const maxSteps = Math.max(1, Math.min(RECOVERY_STEPS.length, req.maxRecoverySteps ?? RECOVERY_STEPS.length));
    let lastErr: string[] = [];
    let lastInfo = '';

    for (let i = 0; i < maxSteps; i++) {
      const step = RECOVERY_STEPS[i];
      const deck = injectOptionLine(req.netlist, step.optionLine);
      try {
        const sim = await getSim();
        sim.setNetList(deck);
        const result = await sim.runSim();
        lastInfo = sim.getInfo();
        lastErr = sim.getError();

        const signals: Record<string, number[]> = {};
        if (result && Array.isArray(result.data)) {
          for (const entry of result.data) {
            if (!entry || !entry.name) continue;
            if (Array.isArray(entry.values)) {
              signals[entry.name] = entry.values.map((v: unknown) =>
                typeof v === 'number'
                  ? v
                  : v && typeof v === 'object' && 'real' in v
                    ? Number((v as { real: number }).real)
                    : Number(v ?? 0)
              );
            }
          }
        }

        if (result && Object.keys(signals).length > 0) {
          scope.postMessage({
            type: 'SPICE_RESULT',
            id: req.id,
            ok: true,
            header: result.header,
            numVariables: result.numVariables,
            numPoints: result.numPoints,
            variableNames: result.variableNames,
            signals,
            info: lastInfo,
            errors: lastErr,
            ladderStep: i,
            ladderLabel: step.label,
          } satisfies SpiceWorkerResponse);
          return;
        }
      } catch (err) {
        lastErr = [err instanceof Error ? err.message : String(err)];
        // Reset potentially corrupted WASM heap before next ladder step
        simInstance = null;
      }
    }

    scope.postMessage({
      type: 'SPICE_RESULT',
      id: req.id,
      ok: false,
      info: lastInfo,
      errors: lastErr.length > 0 ? lastErr : ['ngspice-wasm failed all convergence ladder steps'],
      ladderStep: maxSteps - 1,
      ladderLabel: 'exhausted',
    } satisfies SpiceWorkerResponse);
  };
}
