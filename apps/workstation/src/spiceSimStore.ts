import { useSyncExternalStore } from 'react';

export interface SpiceOverlayState {
  activeProbeNet: string;
  dcNodes: Record<string, number>;
  powerMw: Record<string, number>;
  lastRippleMvPp: number;
  lastMode: string;
  p9AlertCount: number;
}

class SpiceOverlayStore {
  private state: SpiceOverlayState = {
    activeProbeNet: 'vout_3v3',
    dcNodes: {},
    powerMw: {},
    lastRippleMvPp: 0,
    lastMode: 'tran',
    p9AlertCount: 0,
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
