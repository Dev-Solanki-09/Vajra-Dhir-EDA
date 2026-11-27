import { useSyncExternalStore } from 'react';

export interface SpiceOverlayState {
  activeProbeNet: string;
  xrayEnabled: boolean;
  dcNodes: Record<string, number>;
  powerMw: Record<string, number>;
  lastRippleMvPp: number;
  lastMode: string;
  p9AlertCount: number;
  latestWaveX: number[];
  latestWaveY: number[];
  latestWaveXLabel: string;
  latestWaveSeriesLabel: string;
}

class SpiceOverlayStore {
  private state: SpiceOverlayState = {
    activeProbeNet: 'vout_3v3',
    xrayEnabled: false,
    dcNodes: {},
    powerMw: {},
    lastRippleMvPp: 0,
    lastMode: 'tran',
    p9AlertCount: 0,
    latestWaveX: [],
    latestWaveY: [],
    latestWaveXLabel: 'Time (us)',
    latestWaveSeriesLabel: 'v(vout_3v3)',
  };
  private listeners = new Set<() => void>();

  public subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  public getSnapshot = (): SpiceOverlayState => this.state;

  public update(patch: Partial<SpiceOverlayState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }
}

export const globalSpiceOverlayStore = new SpiceOverlayStore();

export function useSpiceOverlay(): SpiceOverlayState {
  return useSyncExternalStore(globalSpiceOverlayStore.subscribe, globalSpiceOverlayStore.getSnapshot);
}
