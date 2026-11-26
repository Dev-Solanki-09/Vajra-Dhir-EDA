import { useSyncExternalStore } from 'react';
import { globalKiCadSyncStore } from './kicadSyncClient';

export interface EnclosureWallBox {
  id: string;
  kind: 'base' | 'lid' | 'wall' | 'standoff';
  min_mm: [number, number, number];
  max_mm: [number, number, number];
}

export interface EnclosureCutout {
  refdes: string;
  kind: string;
  x_mm: number;
  y_mm: number;
  width_mm: number;
  height_mm: number;
  z_top_mm: number;
  bbox_mm: [number, number, number, number, number, number];
}

export interface EnclosurePayload {
  params: {
    wall_thickness_mm: number;
    side_margin_mm: number;
    base_clearance_mm: number;
    lid_height_mm: number;
    vent_slots: number;
  };
  outer_bounds_mm: {
    min: [number, number, number];
    max: [number, number, number];
    width_mm: number;
    depth_mm: number;
    height_mm: number;
  };
  inner_cavity_mm: {
    min: [number, number, number];
    max: [number, number, number];
    headroom_top_mm: number;
    clearance_bottom_mm: number;
  };
  walls: EnclosureWallBox[];
  cutouts: EnclosureCutout[];
  vent_slots: Array<{ id: string; x_mm: number; y_mm: number; width_mm: number; length_mm: number; z_mm: number }>;
  keepouts_2d_mm: Array<{ id: string; x_min: number; y_min: number; x_max: number; y_max: number }>;
}

export interface McadClashEntry {
  refdes: string;
  enclosure_part: string;
  clash_mm3: number;
  penetration_z_mm: number;
  overlap_box_mm: [number, number, number, number, number, number];
  component_height_mm: number;
  message: string;
}

export interface McadClashResult {
  ok: boolean;
  engine: string;
  passed: boolean;
  clash_mm3: number;
  checked_pairs: number;
  clash_count: number;
  clashing_refdes: string[];
  clashes: McadClashEntry[];
}

export interface ThermalSurfacePoint {
  ix: number;
  iy: number;
  x_mm: number;
  y_mm: number;
  temp_c: number;
  norm: number;
  color: string;
}

export interface ThermalComponentResult {
  refdes: string;
  power_w: number;
  t_surface_c: number;
  t_junction_c: number;
  t_j_max_c: number;
  thermal_margin_c: number;
  norm: number;
  color: string;
  passed: boolean;
}

export interface ThermalSolveResult {
  ok: boolean;
  engine: string;
  mesh_resolution: 'fast_preview' | 'signoff_fine';
  mesh_nodes: number;
  mesh_elements: number;
  ambient_temp_c: number;
  h_conv_w_m2k: number;
  pi_joule_loss_w: number;
  min_temp_c: number;
  max_temp_c: number;
  peak_junction_temp_c: number;
  passed: boolean;
  color_stops: string[];
  grid_cols: number;
  grid_rows: number;
  surface_grid: ThermalSurfacePoint[];
  components: ThermalComponentResult[];
  vtu_artifact?: { sha256: string; url: string };
}

export interface McadThermalState {
  showEnclosure: boolean;
  enclosureOpacity: number;
  sliceEnabled: boolean;
  sliceOffsetMm: number;
  showThermal: boolean;
  thermalResolution: 'fast_preview' | 'signoff_fine';
  loadingEnclosure: boolean;
  loadingThermal: boolean;
  enclosure: EnclosurePayload | null;
  clash: McadClashResult | null;
  stepSha256: string;
  thermal: ThermalSolveResult | null;
  error: string | null;
}

class McadThermalStore {
  private state: McadThermalState = {
    showEnclosure: false,
    enclosureOpacity: 0.34,
    sliceEnabled: false,
    sliceOffsetMm: 10.0,
    showThermal: false,
    thermalResolution: 'fast_preview',
    loadingEnclosure: false,
    loadingThermal: false,
    enclosure: null,
    clash: null,
    stepSha256: '',
    thermal: null,
    error: null,
  };
  private listeners = new Set<() => void>();

  public subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  public getSnapshot = (): McadThermalState => this.state;

  private update(patch: Partial<McadThermalState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  public setEnclosureOpacity(enclosureOpacity: number): void {
    this.update({ enclosureOpacity: Math.max(0.1, Math.min(0.95, enclosureOpacity)) });
  }

  public setSliceEnabled(sliceEnabled: boolean): void {
    this.update({ sliceEnabled });
  }

  public setSliceOffsetMm(sliceOffsetMm: number): void {
    this.update({ sliceOffsetMm });
  }

  public setThermalResolution(thermalResolution: 'fast_preview' | 'signoff_fine'): void {
    this.update({ thermalResolution });
  }

  public toggleThermalOff(): void {
    this.update({ showThermal: false });
  }

  public toggleEnclosureOff(): void {
    this.update({ showEnclosure: false });
  }

  public async generateEnclosure(opts?: {
    pcbPath?: string;
    lidHeightMm?: number;
    wallThicknessMm?: number;
    ventSlots?: number;
    scriptText?: string;
  }): Promise<boolean> {
    const pcbPath = opts?.pcbPath || globalKiCadSyncStore.getSnapshot().pcbPath || undefined;
    this.update({ loadingEnclosure: true, error: null, showEnclosure: true });
    try {
      const overrides: Record<string, number> = {};
      if (opts?.lidHeightMm !== undefined) overrides.lid_height_mm = opts.lidHeightMm;
      if (opts?.wallThicknessMm !== undefined) overrides.wall_thickness_mm = opts.wallThicknessMm;
      if (opts?.ventSlots !== undefined) overrides.vent_slots = opts.ventSlots;

      const res = await fetch('/api/v1/mcad/enclosure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(pcbPath ? { pcb_path: pcbPath } : {}),
          ...(opts?.scriptText ? { script_text: opts.scriptText } : {}),
          ...(Object.keys(overrides).length > 0 ? { overrides } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        this.update({ loadingEnclosure: false, error: data.error || `HTTP ${res.status}` });
        return false;
      }
      this.update({
        loadingEnclosure: false,
        showEnclosure: true,
        enclosure: data.enclosure as EnclosurePayload,
        clash: data.clash as McadClashResult,
        stepSha256: String(data.step_artifact?.sha256 ?? ''),
      });
      return true;
    } catch (err) {
      this.update({
        loadingEnclosure: false,
        error: err instanceof Error ? err.message : 'Enclosure generation failed',
      });
      return false;
    }
  }

  public async solveThermal(opts?: {
    pcbPath?: string;
    resolution?: 'fast_preview' | 'signoff_fine';
    ambientTempC?: number;
  }): Promise<boolean> {
    const pcbPath = opts?.pcbPath || globalKiCadSyncStore.getSnapshot().pcbPath || undefined;
    const meshResolution = opts?.resolution ?? this.state.thermalResolution;
    this.update({ loadingThermal: true, error: null, showThermal: true, thermalResolution: meshResolution });
    try {
      const res = await fetch('/api/v1/thermal/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(pcbPath ? { pcb_path: pcbPath } : {}),
          mesh_resolution: meshResolution,
          ambient_temp_c: opts?.ambientTempC ?? 25.0,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        this.update({ loadingThermal: false, error: data.error || `HTTP ${res.status}` });
        return false;
      }
      this.update({
        loadingThermal: false,
        showThermal: true,
        thermal: data as ThermalSolveResult,
      });
      return true;
    } catch (err) {
      this.update({
        loadingThermal: false,
        error: err instanceof Error ? err.message : 'Thermal FEM solve failed',
      });
      return false;
    }
  }

  public async syncFromStatus(): Promise<void> {
    try {
      const res = await fetch('/api/v1/mcad/status');
      if (!res.ok) return;
      const data = await res.json();
      if (data.last_enclosure?.enclosure) {
        this.update({
          enclosure: data.last_enclosure.enclosure as EnclosurePayload,
          clash: (data.last_clash ?? data.last_enclosure.clash) as McadClashResult,
          stepSha256: String(data.last_enclosure.step_artifact?.sha256 ?? ''),
          showEnclosure: true,
        });
      }
    } catch {
      /* daemon offline */
    }
  }
}

export const globalMcadThermalStore = new McadThermalStore();

export function useMcadThermal(): McadThermalState {
  return useSyncExternalStore(globalMcadThermalStore.subscribe, globalMcadThermalStore.getSnapshot);
}
