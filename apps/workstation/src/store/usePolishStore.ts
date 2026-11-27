import { create } from '../shims/zustand';
import type { WorkspaceId } from '../commandBus';

export type UnitMode = 'mm' | 'mil';
export type FocusedPresetId = 'plan' | 'sch_code' | 'pcb_3d' | 'mcad_3d' | 'virtual_lab' | 'fab_release';

export const FOCUSED_PRESETS: Array<{ id: FocusedPresetId; label: string; targetWorkspace: WorkspaceId }> = [
  { id: 'plan', label: 'Plan', targetWorkspace: 'firmware_pinmux' },
  { id: 'sch_code', label: 'Schematic', targetWorkspace: 'schematic' },
  { id: 'pcb_3d', label: 'PCB', targetWorkspace: 'pcb_layout' },
  { id: 'mcad_3d', label: '3D', targetWorkspace: 'mcad_3d' },
  { id: 'virtual_lab', label: 'Test & Lab', targetWorkspace: 'sim_lab' },
  { id: 'fab_release', label: 'Make', targetWorkspace: 'mfg_diff' },
];

export interface FabPresetInfo {
  id: string;
  name: string;
  region: string;
  min_trace_mm: number;
  min_clearance_mm: number;
  min_drill_mm: number;
  base_cost_inr: number;
  feeder_fee_note: string;
  impedance_targets: {
    '50_ohm_se_mm': number;
    '90_ohm_usb_diff_mm': number;
    '90_ohm_gap_mm': number;
    '100_ohm_diff_mm': number;
    '100_ohm_gap_mm': number;
  };
}

export interface PolishStoreState {
  unitMode: UnitMode;
  activePreset: FocusedPresetId;
  activeFabPresetId: string;
  activeFabPreset: FabPresetInfo | null;
  rulerActive: boolean;
  rulerMm: number;
  webglActiveContexts: number;
  webglMaxContexts: number;
  showWelcomeModal: boolean;
  showToolManagerModal: boolean;
  toggleUnitMode: () => void;
  setActivePreset: (p: FocusedPresetId) => void;
  setRulerActive: (v: boolean) => void;
  setShowWelcomeModal: (v: boolean) => void;
  setShowToolManagerModal: (v: boolean) => void;
  selectFabPreset: (id: string) => Promise<void>;
  registerWebglContext: () => boolean;
  releaseWebglContext: () => void;
}

export function formatCoordUnit(mm: number, unit: UnitMode): string {
  if (unit === 'mil') {
    return `${(mm * 39.3700787).toFixed(1)} mil`;
  }
  return `${mm.toFixed(3)} mm`;
}

export const usePolishStore = create<PolishStoreState>((set, get) => ({
  unitMode: 'mm',
  activePreset: 'pcb_3d',
  activeFabPresetId: 'jlcpcb_4l',
  activeFabPreset: null,
  rulerActive: false,
  rulerMm: 12.5,
  webglActiveContexts: 0,
  webglMaxContexts: 6,
  showWelcomeModal: false,
  showToolManagerModal: false,

  toggleUnitMode: () => set((s) => ({ unitMode: s.unitMode === 'mm' ? 'mil' : 'mm' })),
  setActivePreset: (p) => set({ activePreset: p }),
  setRulerActive: (v) => set({ rulerActive: v }),
  setShowWelcomeModal: (v) => set({ showWelcomeModal: v }),
  setShowToolManagerModal: (v) => set({ showToolManagerModal: v }),

  selectFabPreset: async (id: string) => {
    set({ activeFabPresetId: id });
    try {
      const res = await fetch('/api/v1/polish/fab-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset_id: id }),
      });
      if (res.ok) {
        const data = await res.json();
        set({ activeFabPreset: data.active ?? null });
      }
    } catch {
      /* daemon offline */
    }
  },

  registerWebglContext: () => {
    const cur = get().webglActiveContexts;
    if (cur >= get().webglMaxContexts) return false;
    set({ webglActiveContexts: cur + 1 });
    return true;
  },

  releaseWebglContext: () => set((s) => ({ webglActiveContexts: Math.max(0, s.webglActiveContexts - 1) })),
}));
