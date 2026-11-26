import { KeymapPreset } from './useSettingsStore';

export interface KeymapCommandDef {
  id: string;
  label: string;
  category: 'File' | 'Edit' | 'View' | 'Design' | 'Verify' | 'Simulate' | 'Agent' | 'Help';
  defaultShortcut: string;
}

export const KEYMAP_COMMANDS: KeymapCommandDef[] = [
  { id: 'file.new', label: 'New Project', category: 'File', defaultShortcut: 'Ctrl+N' },
  { id: 'file.open', label: 'Open Project', category: 'File', defaultShortcut: 'Ctrl+O' },
  { id: 'file.save', label: 'Save Project', category: 'File', defaultShortcut: 'Ctrl+S' },
  { id: 'file.checkpoint', label: 'Save Named Checkpoint', category: 'File', defaultShortcut: 'Ctrl+Shift+S' },
  { id: 'file.preferences', label: 'Preferences / Settings', category: 'File', defaultShortcut: 'Ctrl+,' },
  { id: 'edit.undo', label: 'Undo', category: 'Edit', defaultShortcut: 'Ctrl+Z' },
  { id: 'edit.redo', label: 'Redo', category: 'Edit', defaultShortcut: 'Ctrl+Shift+Z' },
  { id: 'edit.search', label: 'Global Project Search', category: 'Edit', defaultShortcut: 'Ctrl+Shift+F' },
  { id: 'edit.lock', label: 'Lock Selection', category: 'Edit', defaultShortcut: 'L' },
  { id: 'edit.unlock', label: 'Unlock Selection', category: 'Edit', defaultShortcut: 'Shift+L' },
  { id: 'view.palette', label: 'Command Palette', category: 'View', defaultShortcut: 'Ctrl+K' },
  { id: 'view.toolShelf', label: 'Toggle Left Tool Shelf', category: 'View', defaultShortcut: 'T' },
  { id: 'view.outliner', label: 'Toggle Outliner', category: 'View', defaultShortcut: 'Shift+O' },
  { id: 'view.inspector', label: 'Toggle Inspector', category: 'View', defaultShortcut: 'N' },
  { id: 'view.bottomDrawer', label: 'Toggle Bottom Drawer', category: 'View', defaultShortcut: 'Ctrl+`' },
  { id: 'view.ruler', label: 'Toggle Measurement Ruler', category: 'View', defaultShortcut: 'M' },
  { id: 'design.addComponent', label: 'Add Component', category: 'Design', defaultShortcut: 'A' },
  { id: 'design.wire', label: 'Place Wire / Net', category: 'Design', defaultShortcut: 'W' },
  { id: 'design.route45', label: 'Route 45-Deg Trace', category: 'Design', defaultShortcut: 'X' },
  { id: 'design.via', label: 'Drop Via', category: 'Design', defaultShortcut: 'V' },
  { id: 'design.zone', label: 'Add Copper Zone', category: 'Design', defaultShortcut: 'Z' },
  { id: 'design.refill', label: 'Refill All Copper Pours', category: 'Design', defaultShortcut: 'B' },
  { id: 'verify.suite', label: 'Run Full Senior-EE Verification', category: 'Verify', defaultShortcut: 'F5' },
  { id: 'sim.spice', label: 'Run Quick SPICE Simulation', category: 'Simulate', defaultShortcut: 'F6' },
  { id: 'sim.cosim', label: 'Run Firmware Co-Simulation', category: 'Simulate', defaultShortcut: 'F7' },
  { id: 'sim.probe', label: 'Virtual Oscilloscope Probe', category: 'Simulate', defaultShortcut: 'P' },
  { id: 'agent.toggle', label: 'Toggle Agent Panel', category: 'Agent', defaultShortcut: 'Ctrl+I' },
  { id: 'help.shortcuts', label: 'Keyboard Shortcuts Reference', category: 'Help', defaultShortcut: '?' },
];

const PRESET_OVERRIDES: Record<KeymapPreset, Record<string, string>> = {
  vajra: {},
  kicad: {
    'design.route45': 'X',
    'design.addComponent': 'A',
    'design.wire': 'W',
    'view.ruler': 'Ctrl+Shift+M',
  },
  blender: {
    'view.toolShelf': 'T',
    'view.inspector': 'N',
    'edit.lock': 'L',
  },
  altium: {
    'design.route45': 'P+T',
    'design.via': 'P+V',
    'view.ruler': 'Ctrl+M',
  },
};

export function resolveEffectiveBindings(
  preset: KeymapPreset,
  customBindings: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  const presetMap = PRESET_OVERRIDES[preset] ?? {};
  for (const cmd of KEYMAP_COMMANDS) {
    out[cmd.id] = customBindings[cmd.id] || presetMap[cmd.id] || cmd.defaultShortcut;
  }
  return out;
}

export function findShortcutConflicts(
  bindings: Record<string, string>,
  targetCommandId: string,
  candidateCombo: string
): string[] {
  const norm = candidateCombo.trim().toLowerCase();
  if (!norm) return [];
  return Object.entries(bindings)
    .filter(([id, combo]) => id !== targetCommandId && combo.trim().toLowerCase() === norm)
    .map(([id]) => id);
}

export function formatKeyboardEventCombo(e: KeyboardEvent): string {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return '';
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.shiftKey && e.key !== '?') parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  const k = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
  parts.push(k);
  return parts.join('+');
}
