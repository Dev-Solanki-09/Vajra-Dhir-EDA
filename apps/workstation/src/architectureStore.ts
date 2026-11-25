import { useSyncExternalStore } from 'react';
import ELK from 'elkjs/lib/elk.bundled.js';
import {
  analyzeSystemArchitecture,
  createGoldenBuckArchitecture,
  instantiateCompositeTemplate,
  parseSystemYaml,
  scaffoldAtoStubFromArchitecture,
  serializeSystemYaml,
  type ArchAuditReport,
  type ArchBlock,
  type ArchBus,
  type BusProtocol,
  type SystemArchitecture,
} from '@vajradhir/arch-core';
import { globalIdeWorkspaceStore } from './ideFileStore';

export interface ArchStoreSnapshot {
  architecture: SystemArchitecture;
  report: ArchAuditReport;
  selectedBlockId: string | null;
  canUndo: boolean;
  canRedo: boolean;
  statusNote: string;
}

const elk = new ELK();

class ArchitectureStore {
  private undoStack: SystemArchitecture[] = [];
  private redoStack: SystemArchitecture[] = [];
  private lastSyncedYaml = '';
  private snapshot: ArchStoreSnapshot;
  private listeners = new Set<() => void>();
  private ideSubscribed = false;

  constructor() {
    const initial = createGoldenBuckArchitecture();
    this.snapshot = {
      architecture: initial,
      report: analyzeSystemArchitecture(initial),
      selectedBlockId: initial.blocks[1]?.id ?? null,
      canUndo: false,
      canRedo: false,
      statusNote: 'Architecture synced',
    };
  }

  subscribe = (cb: () => void) => {
    this.ensureIdeSync();
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  getSnapshot = () => this.snapshot;

  private emit() {
    for (const cb of this.listeners) cb();
  }

  private ensureIdeSync() {
    if (this.ideSubscribed || typeof window === 'undefined') return;
    this.ideSubscribed = true;
    globalIdeWorkspaceStore.ensureStarted();
    void globalIdeWorkspaceStore.openFile('system.yaml', true);

    const syncFromIde = () => {
      const tab = globalIdeWorkspaceStore.getSnapshot().tabs.find((t) => t.path === 'system.yaml');
      if (!tab || !tab.content.trim()) return;
      if (tab.content === this.lastSyncedYaml) return;
      this.lastSyncedYaml = tab.content;
      const parsed = parseSystemYaml(tab.content);
      this.snapshot = {
        ...this.snapshot,
        architecture: parsed,
        report: analyzeSystemArchitecture(parsed),
        statusNote: 'Synced live from system.yaml (Monaco)',
      };
      this.emit();
    };

    syncFromIde();
    globalIdeWorkspaceStore.subscribe(syncFromIde);
  }

  private applyArchitectureMutation(
    nextArch: SystemArchitecture,
    note: string,
    recordUndo = true,
    persistDisk = true
  ) {
    if (recordUndo) {
      this.undoStack.push(structuredClone(this.snapshot.architecture));
      if (this.undoStack.length > 40) this.undoStack.shift();
      this.redoStack = [];
    }
    const yamlText = serializeSystemYaml(nextArch);
    this.lastSyncedYaml = yamlText;

    // Sync directly to Monaco / IDE file store + disk
    const tabs = globalIdeWorkspaceStore.getSnapshot().tabs;
    if (tabs.some((t) => t.path === 'system.yaml')) {
      globalIdeWorkspaceStore.updateTabContent('system.yaml', yamlText);
      if (persistDisk) {
        void globalIdeWorkspaceStore.saveActiveFile('system.yaml');
      }
    } else if (persistDisk) {
      void fetch('/api/v1/fs/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'system.yaml', content: yamlText }),
      }).catch(() => {});
    }

    this.snapshot = {
      ...this.snapshot,
      architecture: nextArch,
      report: analyzeSystemArchitecture(nextArch),
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      statusNote: note,
    };
    this.emit();
  }

  selectBlock(blockId: string | null) {
    if (this.snapshot.selectedBlockId === blockId) return;
    this.snapshot = { ...this.snapshot, selectedBlockId: blockId };
    this.emit();
  }

  selectBlockForRefdes(refdes: string): ArchBlock | null {
    const match = this.snapshot.architecture.blocks.find((b) =>
      b.memberRefdes.includes(refdes)
    );
    if (match) {
      this.snapshot = {
        ...this.snapshot,
        selectedBlockId: match.id,
        statusNote: `Probed ${refdes} -> ${match.name}`,
      };
      this.emit();
      return match;
    }
    return null;
  }

  addTemplateBlock(templateId: string): ArchBlock | null {
    const existing = new Set(this.snapshot.architecture.blocks.map((b) => b.id));
    const blk = instantiateCompositeTemplate(templateId, existing);
    if (!blk) return null;
    const next: SystemArchitecture = {
      ...this.snapshot.architecture,
      blocks: [...this.snapshot.architecture.blocks, blk],
    };
    this.snapshot = { ...this.snapshot, selectedBlockId: blk.id };
    this.applyArchitectureMutation(next, `Added composite block: ${blk.name}`);
    return blk;
  }

  connectBus(source: string, target: string, protocol: BusProtocol, railVoltageV?: number, expectedMa?: number) {
    const src = this.snapshot.architecture.blocks.find((b) => b.id === source);
    const dst = this.snapshot.architecture.blocks.find((b) => b.id === target);
    if (!src || !dst) return;
    const bus: ArchBus = {
      id: `bus-${protocol.toLowerCase()}-${Date.now().toString(36)}`,
      source,
      target,
      protocol,
      railVoltageV: railVoltageV ?? src.voltageV,
      expectedMa: expectedMa ?? (protocol === 'PowerRail' ? dst.drawMa : 10),
      netNames: [protocol === 'PowerRail' ? `PWR_${src.voltageV}V` : `${protocol}_${dst.name.split(' ')[0].toUpperCase()}`],
    };
    const next: SystemArchitecture = {
      ...this.snapshot.architecture,
      buses: [...this.snapshot.architecture.buses, bus],
    };
    this.applyArchitectureMutation(next, `Wired ${protocol} (${bus.railVoltageV}V): ${src.name} -> ${dst.name}`);
  }

  updateBlockPositions(updates: Record<string, { x: number; y: number }>, persist = true) {
    let changed = false;
    const blocks = this.snapshot.architecture.blocks.map((b) => {
      const pos = updates[b.id];
      if (!pos) return b;
      const rx = Math.round(pos.x);
      const ry = Math.round(pos.y);
      if (rx === b.x && ry === b.y) return b;
      changed = true;
      return { ...b, x: rx, y: ry };
    });
    if (!changed) return;
    this.applyArchitectureMutation(
      { ...this.snapshot.architecture, blocks },
      'Updated block layout -> system.yaml',
      true,
      persist
    );
  }

  async autoLayoutWithElk(): Promise<void> {
    const arch = this.snapshot.architecture;
    const graph = {
      id: 'arch-root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'RIGHT',
        'elk.spacing.nodeNode': '48',
        'elk.layered.spacing.nodeNodeBetweenLayers': '90',
      },
      children: arch.blocks.map((b) => ({ id: b.id, width: 240, height: 120 })),
      edges: arch.buses.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
    };
    const laidOut = await elk.layout(graph);
    const posMap: Record<string, { x: number; y: number }> = {};
    for (const child of laidOut.children ?? []) {
      posMap[child.id] = { x: Math.round(child.x ?? 40), y: Math.round(child.y ?? 80) };
    }
    this.updateBlockPositions(posMap, true);
  }

  async generateAtoCircuitStub(): Promise<string> {
    const atoText = scaffoldAtoStubFromArchitecture(this.snapshot.architecture);
    await fetch('/api/v1/fs/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'elec/src/arch_blocks.ato', content: atoText }),
    }).catch(() => {});
    await globalIdeWorkspaceStore.openFile('elec/src/arch_blocks.ato', true);
    this.snapshot = { ...this.snapshot, statusNote: 'Generated elec/src/arch_blocks.ato' };
    this.emit();
    return atoText;
  }

  undo() {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(structuredClone(this.snapshot.architecture));
    this.applyArchitectureMutation(prev, 'Undo architecture edit (CommandBus)', false, true);
  }

  redo() {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(structuredClone(this.snapshot.architecture));
    this.applyArchitectureMutation(next, 'Redo architecture edit (CommandBus)', false, true);
  }
}

export const globalArchitectureStore = new ArchitectureStore();

export function useArchitectureSnapshot(): ArchStoreSnapshot {
  return useSyncExternalStore(globalArchitectureStore.subscribe, globalArchitectureStore.getSnapshot);
}
