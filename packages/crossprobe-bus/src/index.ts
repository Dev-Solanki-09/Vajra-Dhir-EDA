/**
 * Vajra-Dhīr EDA — High-Performance Cross-Probe Bus
 *
 * Provides sub-millisecond bidirectional cross-probing between Schematic,
 * Layout (WebGPU 2D/3D), Monaco Code Editor (.ato/.v), and Inspector panes,
 * with BroadcastChannel multi-panel sync and React useSyncExternalStore snapshots.
 */

export type ProbeSource = 'schematic' | 'pcb' | 'code' | '3d' | 'tree' | 'inspector' | 'agent';

export interface SelectionEvent {
  entityIds: string[];
  source: ProbeSource;
  timestamp: number;
}

export interface HoverEvent {
  entityId: string | null;
  source: ProbeSource;
  timestamp: number;
}

export interface NetHighlightEvent {
  netId: string | null;
  color?: string;
  source: ProbeSource;
  timestamp: number;
}

export interface DrcFocusEvent {
  markerId: string;
  bboxNm: [number, number, number, number];
  source: ProbeSource;
  timestamp: number;
}

export type CrossProbeEventType =
  | 'selection_changed'
  | 'hover_changed'
  | 'net_highlight'
  | 'drc_focus';

export interface CrossProbeSnapshot {
  selection: SelectionEvent;
  hover: HoverEvent;
  activeHighlight: NetHighlightEvent;
  lastDrcFocus: DrcFocusEvent | null;
  lastLatencyMs: number;
}

export type CrossProbeListener<T> = (event: T) => void;

export interface BroadcastChannelLike {
  setHandler?: (fn: ((ev: { data: unknown }) => void) | null) => void;
  onmessage: ((ev: MessageEvent) => unknown) | ((ev: { data: unknown }) => void) | null;
  postMessage: (data: unknown) => void;
  close: () => void;
}

export type BroadcastChannelFactory = (name: string) => BroadcastChannelLike;

interface WireBroadcastEnvelope {
  originId: string;
  kind: 'selection' | 'hover' | 'net' | 'drc';
  payload: SelectionEvent | HoverEvent | NetHighlightEvent | DrcFocusEvent;
}

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

export class CrossProbeBus {
  private readonly instanceId: string;
  private selectionListeners = new Set<CrossProbeListener<SelectionEvent>>();
  private hoverListeners = new Set<CrossProbeListener<HoverEvent>>();
  private netListeners = new Set<CrossProbeListener<NetHighlightEvent>>();
  private drcListeners = new Set<CrossProbeListener<DrcFocusEvent>>();
  private snapshotListeners = new Set<() => void>();
  private channel: BroadcastChannelLike | null = null;

  private currentSelection: SelectionEvent = {
    entityIds: [],
    source: 'tree',
    timestamp: 0,
  };

  private currentHover: HoverEvent = {
    entityId: null,
    source: 'tree',
    timestamp: 0,
  };

  private activeHighlight: NetHighlightEvent = {
    netId: null,
    source: 'tree',
    timestamp: 0,
  };

  private lastDrcFocus: DrcFocusEvent | null = null;
  private lastLatencyMs = 0;
  private snapshotCache: CrossProbeSnapshot;

  constructor(channelName?: string, channelFactory?: BroadcastChannelFactory) {
    this.instanceId = `bus-${Math.random().toString(36).slice(2, 10)}`;
    this.snapshotCache = {
      selection: this.currentSelection,
      hover: this.currentHover,
      activeHighlight: this.activeHighlight,
      lastDrcFocus: this.lastDrcFocus,
      lastLatencyMs: this.lastLatencyMs,
    };

    const targetName = channelName ?? 'vajradhir-crossprobe-bus';
    if (channelFactory) {
      this.channel = channelFactory(targetName);
    } else if (channelName && typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(channelName);
    }

    if (this.channel) {
      const maybeUnref = (this.channel as unknown as { unref?: () => void }).unref;
      if (typeof maybeUnref === 'function') {
        maybeUnref.call(this.channel);
      }
      this.channel.onmessage = (msg: { data: unknown }) => {
        const envelope = msg.data as WireBroadcastEnvelope | undefined;
        if (!envelope || envelope.originId === this.instanceId) return;
        this.applyRemoteEnvelope(envelope);
      };
    }
  }

  private refreshSnapshot(startedMs: number): void {
    this.lastLatencyMs = Math.max(0, Number((nowMs() - startedMs).toFixed(4)));
    this.snapshotCache = {
      selection: this.currentSelection,
      hover: this.currentHover,
      activeHighlight: this.activeHighlight,
      lastDrcFocus: this.lastDrcFocus,
      lastLatencyMs: this.lastLatencyMs,
    };
    for (const notify of this.snapshotListeners) {
      notify();
    }
  }

  private applyRemoteEnvelope(envelope: WireBroadcastEnvelope): void {
    const startedMs = nowMs();
    if (envelope.kind === 'selection') {
      const event = envelope.payload as SelectionEvent;
      this.currentSelection = event;
      for (const listener of this.selectionListeners) listener(event);
    } else if (envelope.kind === 'hover') {
      const event = envelope.payload as HoverEvent;
      this.currentHover = event;
      for (const listener of this.hoverListeners) listener(event);
    } else if (envelope.kind === 'net') {
      const event = envelope.payload as NetHighlightEvent;
      this.activeHighlight = event;
      for (const listener of this.netListeners) listener(event);
    } else if (envelope.kind === 'drc') {
      const event = envelope.payload as DrcFocusEvent;
      this.lastDrcFocus = event;
      for (const listener of this.drcListeners) listener(event);
    }
    this.refreshSnapshot(startedMs);
  }

  private postEnvelope(envelope: WireBroadcastEnvelope): void {
    if (!this.channel) return;
    this.channel.postMessage(envelope);
  }

  public select(entityIds: string[], source: ProbeSource): void {
    const startedMs = nowMs();
    const event: SelectionEvent = {
      entityIds: [...new Set(entityIds)],
      source,
      timestamp: Date.now(),
    };
    this.currentSelection = event;
    for (const listener of this.selectionListeners) {
      listener(event);
    }
    this.postEnvelope({ originId: this.instanceId, kind: 'selection', payload: event });
    this.refreshSnapshot(startedMs);
  }

  public hover(entityId: string | null, source: ProbeSource): void {
    if (this.currentHover.entityId === entityId) return;
    const startedMs = nowMs();
    const event: HoverEvent = {
      entityId,
      source,
      timestamp: Date.now(),
    };
    this.currentHover = event;
    for (const listener of this.hoverListeners) {
      listener(event);
    }
    this.postEnvelope({ originId: this.instanceId, kind: 'hover', payload: event });
    this.refreshSnapshot(startedMs);
  }

  public highlightNet(netId: string | null, source: ProbeSource, color?: string): void {
    const startedMs = nowMs();
    const event: NetHighlightEvent = {
      netId,
      color,
      source,
      timestamp: Date.now(),
    };
    this.activeHighlight = event;
    for (const listener of this.netListeners) {
      listener(event);
    }
    this.postEnvelope({ originId: this.instanceId, kind: 'net', payload: event });
    this.refreshSnapshot(startedMs);
  }

  public focusDrc(markerId: string, bboxNm: [number, number, number, number], source: ProbeSource): void {
    const startedMs = nowMs();
    const event: DrcFocusEvent = {
      markerId,
      bboxNm,
      source,
      timestamp: Date.now(),
    };
    this.lastDrcFocus = event;
    for (const listener of this.drcListeners) {
      listener(event);
    }
    this.postEnvelope({ originId: this.instanceId, kind: 'drc', payload: event });
    this.refreshSnapshot(startedMs);
  }

  public onSelection(listener: CrossProbeListener<SelectionEvent>): () => void {
    this.selectionListeners.add(listener);
    return () => this.selectionListeners.delete(listener);
  }

  public onHover(listener: CrossProbeListener<HoverEvent>): () => void {
    this.hoverListeners.add(listener);
    return () => this.hoverListeners.delete(listener);
  }

  public onNetHighlight(listener: CrossProbeListener<NetHighlightEvent>): () => void {
    this.netListeners.add(listener);
    return () => this.netListeners.delete(listener);
  }

  public onDrcFocus(listener: CrossProbeListener<DrcFocusEvent>): () => void {
    this.drcListeners.add(listener);
    return () => this.drcListeners.delete(listener);
  }

  public subscribeSnapshot = (listener: () => void): (() => void) => {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  };

  public getSnapshot = (): CrossProbeSnapshot => {
    return this.snapshotCache;
  };

  public getSelection(): SelectionEvent {
    return this.currentSelection;
  }

  public getHover(): HoverEvent {
    return this.currentHover;
  }

  public getActiveHighlight(): NetHighlightEvent {
    return this.activeHighlight;
  }

  public getLastLatencyMs(): number {
    return this.lastLatencyMs;
  }

  public dispose(): void {
    this.channel?.close();
    this.channel = null;
    this.selectionListeners.clear();
    this.hoverListeners.clear();
    this.netListeners.clear();
    this.drcListeners.clear();
    this.snapshotListeners.clear();
  }
}

export const globalCrossProbeBus = new CrossProbeBus('vajradhir-crossprobe-bus');
