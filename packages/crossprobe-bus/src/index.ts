/**
 * Vajra-Dhīr EDA — High-Performance Cross-Probe Bus
 * 
 * Provides sub-millisecond bidirectional cross-probing between Schematic,
 * Layout (WebGPU 2D/3D), Monaco Code Editor (.ato/.v), and Inspector panes.
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
  bboxNm: [number, number, number, number]; // [min_x, min_y, max_x, max_y]
  source: ProbeSource;
  timestamp: number;
}

export type CrossProbeEventType =
  | 'selection_changed'
  | 'hover_changed'
  | 'net_highlight'
  | 'drc_focus';

export type CrossProbeListener<T> = (event: T) => void;

export class CrossProbeBus {
  private selectionListeners = new Set<CrossProbeListener<SelectionEvent>>();
  private hoverListeners = new Set<CrossProbeListener<HoverEvent>>();
  private netListeners = new Set<CrossProbeListener<NetHighlightEvent>>();
  private drcListeners = new Set<CrossProbeListener<DrcFocusEvent>>();

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

  public select(entityIds: string[], source: ProbeSource): void {
    const event: SelectionEvent = {
      entityIds: [...new Set(entityIds)],
      source,
      timestamp: Date.now(),
    };
    this.currentSelection = event;
    for (const listener of this.selectionListeners) {
      listener(event);
    }
  }

  public hover(entityId: string | null, source: ProbeSource): void {
    if (this.currentHover.entityId === entityId) return;
    const event: HoverEvent = {
      entityId,
      source,
      timestamp: Date.now(),
    };
    this.currentHover = event;
    for (const listener of this.hoverListeners) {
      listener(event);
    }
  }

  public highlightNet(netId: string | null, source: ProbeSource, color?: string): void {
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
  }

  public focusDrc(markerId: string, bboxNm: [number, number, number, number], source: ProbeSource): void {
    const event: DrcFocusEvent = {
      markerId,
      bboxNm,
      source,
      timestamp: Date.now(),
    };
    for (const listener of this.drcListeners) {
      listener(event);
    }
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

  public getSelection(): SelectionEvent {
    return this.currentSelection;
  }

  public getHover(): HoverEvent {
    return this.currentHover;
  }

  public getActiveHighlight(): NetHighlightEvent {
    return this.activeHighlight;
  }
}

// Global singleton instance for UI runtime
export const globalCrossProbeBus = new CrossProbeBus();
