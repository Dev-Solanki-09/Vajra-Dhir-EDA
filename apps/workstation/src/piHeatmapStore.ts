import { useSyncExternalStore } from 'react';
import { globalKiCadSyncStore } from './kicadSyncClient';

export type PiMetric = 'ir_drop_mv' | 'current_density_a_mm2';
export type PiColormap = 'viridis' | 'inferno';

export interface PiBottleneck {
  entity_type: string;
  uuid: string;
  net: string;
  layer: string;
  x_mm: number;
  y_mm: number;
  x_nm: number;
  y_nm: number;
  width_mm: number;
  current_a: number;
  current_density_a_mm2: number;
  ir_drop_mv: number;
  voltage_v: number;
  suggested_width_mm: number;
  repair_action: string;
}

export interface PiSegmentResult {
  uuid: string;
  x1_mm: number;
  y1_mm: number;
  x2_mm: number;
  y2_mm: number;
  width_mm: number;
  layer: string;
  net: string;
  v_start: number;
  v_end: number;
  ir_drop_mv: number;
  seg_delta_mv: number;
  current_a: number;
  current_density_a_mm2: number;
  power_mw: number;
  norm_ir_drop: number;
  norm_current_density: number;
  color_ir_drop: string;
  color_current_density: string;
}

export interface PiPadResult {
  refdes: string;
  pad: string;
  x_mm: number;
  y_mm: number;
  layer: string;
  net: string;
  voltage_v: number;
  ir_drop_mv: number;
  reachable: boolean;
  norm_ir_drop: number;
  color_ir_drop: string;
}

export interface PiViaResult {
  x_mm: number;
  y_mm: number;
  size_mm: number;
  drill_mm: number;
  net: string;
  ir_drop_mv: number;
  current_a: number;
  current_density_a_mm2: number;
  norm_current_density: number;
  color_current_density: string;
}

export interface PiGridCell {
  ix: number;
  iy: number;
  x_mm: number;
  y_mm: number;
  valid: boolean;
  net: string;
  voltage_v: number;
  ir_drop_mv: number;
  current_density_a_mm2: number;
  norm_ir_drop: number;
  norm_current_density: number;
  color_ir_drop: string;
  color_current_density: string;
}

export interface PiSolveResult {
  ok: boolean;
  engine: string;
  ring_isolation: string;
  passed: boolean;
  cas_sha256: string;
  cache_hit: boolean;
  load_current_a: number;
  board_bounds_mm: {
    min_x_mm: number;
    min_y_mm: number;
    max_x_mm: number;
    max_y_mm: number;
    width_mm: number;
    height_mm: number;
  };
  worst_case: {
    net: string;
    nominal_v: number;
    min_delivered_v: number;
    max_ir_drop_mv: number;
    max_ir_drop_pct: number;
    peak_current_density_a_mm2: number;
    total_joule_loss_mw: number;
    vdd_min_threshold_v: number;
    brownout_risk: boolean;
    passed: boolean;
    bottleneck: PiBottleneck | null;
  } | null;
  heatmap: {
    colormap: PiColormap;
    metric: PiMetric;
    min_value: number;
    max_value: number;
    unit: string;
    max_ir_drop_mv: number;
    max_current_density_a_mm2: number;
    color_stops: string[];
    grid_cols: number;
    grid_rows: number;
    segments: PiSegmentResult[];
    pads: PiPadResult[];
    vias: PiViaResult[];
    grid: PiGridCell[];
  };
}

export interface PiHoverSample {
  xMm: number;
  yMm: number;
  voltageV: number;
  irDropMv: number;
  currentDensityAMm2: number;
  net: string;
}

export interface PiOverlayState {
  enabled: boolean;
  loading: boolean;
  metric: PiMetric;
  colormap: PiColormap;
  netFilter: string;
  loadCurrentA: number;
  error: string | null;
  result: PiSolveResult | null;
  hoverSample: PiHoverSample | null;
}

const VIRIDIS_STOPS: ReadonlyArray<[number, number, number]> = [
  [0.267004, 0.004874, 0.329415],
  [0.281412, 0.155834, 0.469201],
  [0.253935, 0.265254, 0.529983],
  [0.206756, 0.371758, 0.553117],
  [0.163625, 0.471133, 0.558148],
  [0.127568, 0.566949, 0.550556],
  [0.134692, 0.658636, 0.517649],
  [0.266941, 0.748751, 0.440573],
  [0.477504, 0.821444, 0.318195],
  [0.741388, 0.873449, 0.149561],
  [0.993248, 0.906157, 0.143936],
];

const INFERNO_STOPS: ReadonlyArray<[number, number, number]> = [
  [0.001462, 0.000466, 0.013866],
  [0.122312, 0.047081, 0.282086],
  [0.280267, 0.062834, 0.431554],
  [0.44496, 0.100196, 0.433756],
  [0.602081, 0.156229, 0.391917],
  [0.752157, 0.228661, 0.316879],
  [0.878223, 0.33384, 0.214069],
  [0.958853, 0.483397, 0.090627],
  [0.988648, 0.658636, 0.045966],
  [0.967262, 0.843307, 0.25613],
  [0.988362, 0.998364, 0.644924],
];

export function samplePiColormapRgb(colormap: PiColormap, t: number): [number, number, number] {
  const stops = colormap === 'inferno' ? INFERNO_STOPS : VIRIDIS_STOPS;
  const u = Math.max(0, Math.min(1, t));
  const scaled = u * (stops.length - 1);
  const idx = Math.min(stops.length - 2, Math.floor(scaled));
  const frac = scaled - idx;
  const c0 = stops[idx];
  const c1 = stops[idx + 1];
  return [
    c0[0] + (c1[0] - c0[0]) * frac,
    c0[1] + (c1[1] - c0[1]) * frac,
    c0[2] + (c1[2] - c0[2]) * frac,
  ];
}

export function samplePiColormapHex(colormap: PiColormap, t: number): string {
  const [r, g, b] = samplePiColormapRgb(colormap, t);
  const hex = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export function lookupPiSampleAtWorldMm(result: PiSolveResult | null, xMm: number, yMm: number): PiHoverSample | null {
  if (!result?.heatmap) return null;
  let bestDist = 3.0;
  let best: PiHoverSample | null = null;

  for (const s of result.heatmap.segments) {
    const dx = s.x2_mm - s.x1_mm;
    const dy = s.y2_mm - s.y1_mm;
    const l2 = dx * dx + dy * dy;
    const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((xMm - s.x1_mm) * dx + (yMm - s.y1_mm) * dy) / l2)) : 0;
    const px = s.x1_mm + t * dx;
    const py = s.y1_mm + t * dy;
    const d = Math.max(0, Math.hypot(xMm - px, yMm - py) - s.width_mm * 0.5);
    if (d < bestDist) {
      bestDist = d;
      best = {
        xMm,
        yMm,
        voltageV: s.v_start + t * (s.v_end - s.v_start),
        irDropMv: s.ir_drop_mv,
        currentDensityAMm2: s.current_density_a_mm2,
        net: s.net,
      };
    }
  }
  for (const p of result.heatmap.pads) {
    const d = Math.hypot(xMm - p.x_mm, yMm - p.y_mm);
    if (d < bestDist) {
      bestDist = d;
      best = {
        xMm,
        yMm,
        voltageV: p.voltage_v,
        irDropMv: p.ir_drop_mv,
        currentDensityAMm2: 0,
        net: p.net,
      };
    }
  }
  if (!best) {
    for (const c of result.heatmap.grid) {
      if (!c.valid) continue;
      const d = Math.hypot(xMm - c.x_mm, yMm - c.y_mm);
      if (d < bestDist) {
        bestDist = d;
        best = {
          xMm,
          yMm,
          voltageV: c.voltage_v,
          irDropMv: c.ir_drop_mv,
          currentDensityAMm2: c.current_density_a_mm2,
          net: c.net,
        };
      }
    }
  }
  return best;
}

class PiHeatmapStore {
  private state: PiOverlayState = {
    enabled: false,
    loading: false,
    metric: 'current_density_a_mm2',
    colormap: 'viridis',
    netFilter: '+3.3V',
    loadCurrentA: 2.0,
    error: null,
    result: null,
    hoverSample: null,
  };
  private listeners = new Set<() => void>();

  public subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  public getSnapshot = (): PiOverlayState => this.state;

  private update(patch: Partial<PiOverlayState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  public setMetric(metric: PiMetric): void {
    this.update({ metric });
  }

  public setColormap(colormap: PiColormap): void {
    this.update({ colormap });
  }

  public setHoverSample(hoverSample: PiHoverSample | null): void {
    this.update({ hoverSample });
  }

  public async toggle(pcbPath?: string): Promise<void> {
    const next = !this.state.enabled;
    this.update({ enabled: next });
    if (next) {
      await this.runSolve({ pcbPath });
    }
  }

  public async runSolve(opts?: {
    pcbPath?: string;
    net?: string;
    loadCurrentA?: number;
    metric?: PiMetric;
    colormap?: PiColormap;
    useCache?: boolean;
  }): Promise<PiSolveResult | null> {
    const pcbPath = opts?.pcbPath || globalKiCadSyncStore.getSnapshot().pcbPath || undefined;
    const net = opts?.net ?? this.state.netFilter;
    const loadCurrentA = opts?.loadCurrentA ?? this.state.loadCurrentA;
    const metric = opts?.metric ?? this.state.metric;
    const colormap = opts?.colormap ?? this.state.colormap;

    this.update({ loading: true, error: null, metric, colormap, enabled: true });
    try {
      const res = await fetch('/api/v1/pi/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(pcbPath ? { pcb_path: pcbPath } : {}),
          ...(net ? { net } : {}),
          load_current_a: loadCurrentA,
          metric,
          colormap,
          use_cache: opts?.useCache ?? true,
        }),
      });
      const data = (await res.json()) as PiSolveResult & { error?: string };
      if (!res.ok || !data.ok) {
        this.update({ loading: false, error: data.error || `HTTP ${res.status}` });
        return null;
      }
      this.update({ loading: false, error: null, result: data });
      return data;
    } catch (err) {
      this.update({ loading: false, error: err instanceof Error ? err.message : 'PI solve failed' });
      return null;
    }
  }

  public async repairBottleneck(opts?: {
    pcbPath?: string;
    net?: string;
    targetWidthMm?: number;
    loadCurrentA?: number;
  }): Promise<PiSolveResult | null> {
    const pcbPath = opts?.pcbPath || globalKiCadSyncStore.getSnapshot().pcbPath || undefined;
    const net = opts?.net || this.state.result?.worst_case?.net || this.state.netFilter || '+3.3V';
    const targetWidthMm =
      opts?.targetWidthMm ?? this.state.result?.worst_case?.bottleneck?.suggested_width_mm ?? 1.9;
    const loadCurrentA = opts?.loadCurrentA ?? this.state.loadCurrentA;

    this.update({ loading: true, error: null });
    try {
      const res = await fetch('/api/v1/pi/repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(pcbPath ? { pcb_path: pcbPath } : {}),
          net,
          target_width_mm: targetWidthMm,
          load_current_a: loadCurrentA,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        this.update({ loading: false, error: data.error || `HTTP ${res.status}` });
        return null;
      }
      const nextSolve = data.solve_after as PiSolveResult | undefined;
      if (nextSolve?.ok) {
        this.update({ loading: false, error: null, result: nextSolve, enabled: true });
      } else {
        this.update({ loading: false });
      }
      await globalKiCadSyncStore.fetchFiles();
      return nextSolve ?? null;
    } catch (err) {
      this.update({ loading: false, error: err instanceof Error ? err.message : 'PI repair failed' });
      return null;
    }
  }
}

export const globalPiHeatmapStore = new PiHeatmapStore();

export function usePiHeatmap(): PiOverlayState {
  return useSyncExternalStore(globalPiHeatmapStore.subscribe, globalPiHeatmapStore.getSnapshot);
}
