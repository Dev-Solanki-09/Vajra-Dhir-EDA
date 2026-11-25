import type { ArchBlock, ArchBus, BlockKind, BusProtocol, PinTolerance, SystemArchitecture } from './types.ts';
import { createGoldenBuckArchitecture } from './templates.ts';

function q(val: string): string {
  return JSON.stringify(val ?? '');
}

function unq(val: string): string {
  const t = val.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function parseList(raw: string): string[] {
  const inner = raw.trim().replace(/^\[/, '').replace(/\]$/, '');
  if (!inner.trim()) return [];
  return inner.split(',').map((s) => unq(s.trim())).filter(Boolean);
}

export function serializeSystemYaml(arch: SystemArchitecture): string {
  const lines: string[] = [];
  lines.push(`project: ${arch.project}`);
  lines.push(`version: ${q(arch.version || '0.0.5')}`);
  lines.push(`purpose: ${q(arch.purpose)}`);
  lines.push('requirements:');
  for (const req of arch.requirements) {
    lines.push(`  - ${q(req)}`);
  }
  lines.push('blocks:');
  for (const b of arch.blocks) {
    lines.push(`  - id: ${b.id}`);
    lines.push(`    name: ${q(b.name)}`);
    lines.push(`    kind: ${b.kind}`);
    if (b.templateId) lines.push(`    template_id: ${b.templateId}`);
    lines.push(`    role: ${q(b.role)}`);
    lines.push(`    voltage_v: ${b.voltageV}`);
    lines.push(`    max_output_ma: ${b.maxOutputMa}`);
    lines.push(`    draw_ma: ${b.drawMa}`);
    lines.push(`    tolerance: ${b.tolerance}`);
    lines.push(`    builtin_pullups: ${b.builtinPullups ? 'true' : 'false'}`);
    lines.push(`    bootstrap_notes: ${q(b.bootstrapNotes)}`);
    lines.push(`    mounting_footprint: ${q(b.mountingFootprint)}`);
    lines.push(`    step_model_ref: ${q(b.stepModelRef)}`);
    lines.push(`    kicad_sheet_uuid: ${q(b.kicadSheetUuid)}`);
    lines.push(`    member_refdes: [${b.memberRefdes.join(', ')}]`);
    lines.push(`    x: ${Math.round(b.x)}`);
    lines.push(`    y: ${Math.round(b.y)}`);
  }
  lines.push('buses:');
  for (const edge of arch.buses) {
    lines.push(`  - id: ${edge.id}`);
    lines.push(`    source: ${edge.source}`);
    lines.push(`    target: ${edge.target}`);
    lines.push(`    protocol: ${edge.protocol}`);
    lines.push(`    rail_voltage_v: ${edge.railVoltageV}`);
    lines.push(`    expected_ma: ${edge.expectedMa}`);
    lines.push(`    net_names: [${edge.netNames.join(', ')}]`);
  }
  return lines.join('\n') + '\n';
}

export function parseSystemYaml(yamlText: string): SystemArchitecture {
  const base = createGoldenBuckArchitecture();
  if (!yamlText || !yamlText.trim()) return base;

  const lines = yamlText.split(/\r?\n/);
  let section: 'root' | 'requirements' | 'blocks' | 'buses' = 'root';
  let project = base.project;
  let version = base.version;
  let purpose = base.purpose;
  const requirements: string[] = [];
  const blocks: ArchBlock[] = [];
  const buses: ArchBus[] = [];
  let curBlock: ArchBlock | null = null;
  let curBus: ArchBus | null = null;

  const flushBlock = () => {
    if (curBlock) {
      blocks.push(curBlock);
      curBlock = null;
    }
  };
  const flushBus = () => {
    if (curBus) {
      buses.push(curBus);
      curBus = null;
    }
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+#.*$/, '').trimEnd();
    if (!line.trim() || line.trim().startsWith('#')) continue;

    if (line === 'requirements:') {
      flushBlock();
      flushBus();
      section = 'requirements';
      continue;
    }
    if (line === 'blocks:') {
      flushBlock();
      flushBus();
      section = 'blocks';
      continue;
    }
    if (line === 'buses:') {
      flushBlock();
      flushBus();
      section = 'buses';
      continue;
    }

    if (section === 'root') {
      const m = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
      if (!m) continue;
      if (m[1] === 'project') project = unq(m[2]) || project;
      else if (m[1] === 'version') version = unq(m[2]) || version;
      else if (m[1] === 'purpose') purpose = unq(m[2]) || purpose;
    } else if (section === 'requirements') {
      const m = /^\s*-\s*(.+)$/.exec(line);
      if (m) requirements.push(unq(m[1]));
    } else if (section === 'blocks') {
      const start = /^\s*-\s*id:\s*(.+)$/.exec(line);
      if (start) {
        flushBlock();
        const idx = blocks.length;
        curBlock = {
          id: unq(start[1]),
          name: unq(start[1]),
          kind: 'custom_subcircuit',
          role: '',
          voltageV: 3.3,
          maxOutputMa: 500,
          drawMa: 50,
          tolerance: '3.3V_NON_5V_TOLERANT',
          builtinPullups: false,
          bootstrapNotes: '',
          mountingFootprint: '',
          stepModelRef: '',
          kicadSheetUuid: '',
          memberRefdes: [],
          x: 60 + idx * 300,
          y: 150,
        };
        continue;
      }
      if (!curBlock) continue;
      const kv = /^\s+([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
      if (!kv) continue;
      const [, k, vRaw] = kv;
      const v = unq(vRaw);
      if (k === 'name') curBlock.name = v;
      else if (k === 'kind') curBlock.kind = v as BlockKind;
      else if (k === 'template_id') curBlock.templateId = v;
      else if (k === 'role') curBlock.role = v;
      else if (k === 'voltage_v') curBlock.voltageV = Number(v) || 0;
      else if (k === 'max_output_ma') curBlock.maxOutputMa = Number(v) || 0;
      else if (k === 'draw_ma') curBlock.drawMa = Number(v) || 0;
      else if (k === 'tolerance') curBlock.tolerance = v as PinTolerance;
      else if (k === 'builtin_pullups') curBlock.builtinPullups = v === 'true';
      else if (k === 'bootstrap_notes') curBlock.bootstrapNotes = v;
      else if (k === 'mounting_footprint') curBlock.mountingFootprint = v;
      else if (k === 'step_model_ref') curBlock.stepModelRef = v;
      else if (k === 'kicad_sheet_uuid') curBlock.kicadSheetUuid = v;
      else if (k === 'member_refdes' || k === 'members') curBlock.memberRefdes = parseList(vRaw);
      else if (k === 'refdes' && curBlock.memberRefdes.length === 0) curBlock.memberRefdes = [v];
      else if (k === 'x') curBlock.x = Number(v) || curBlock.x;
      else if (k === 'y') curBlock.y = Number(v) || curBlock.y;
    } else if (section === 'buses') {
      const start = /^\s*-\s*id:\s*(.+)$/.exec(line);
      if (start) {
        flushBus();
        curBus = {
          id: unq(start[1]),
          source: '',
          target: '',
          protocol: 'PowerRail',
          railVoltageV: 3.3,
          expectedMa: 100,
          netNames: [],
        };
        continue;
      }
      if (!curBus) continue;
      const kv = /^\s+([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
      if (!kv) continue;
      const [, k, vRaw] = kv;
      const v = unq(vRaw);
      if (k === 'source') curBus.source = v;
      else if (k === 'target') curBus.target = v;
      else if (k === 'protocol') curBus.protocol = v as BusProtocol;
      else if (k === 'rail_voltage_v') curBus.railVoltageV = Number(v) || 0;
      else if (k === 'expected_ma') curBus.expectedMa = Number(v) || 0;
      else if (k === 'net_names') curBus.netNames = parseList(vRaw);
    }
  }

  flushBlock();
  flushBus();

  return {
    project,
    version,
    purpose,
    requirements: requirements.length ? requirements : base.requirements,
    blocks: blocks.length ? blocks : base.blocks,
    buses: buses.length ? buses : (blocks.length ? [] : base.buses),
  };
}

export function scaffoldAtoStubFromArchitecture(arch: SystemArchitecture): string {
  const lines: string[] = [`# Auto-synced from system.yaml (${arch.project})`, 'module SystemArchitecture:'];
  for (const blk of arch.blocks) {
    lines.push(`    # ${blk.name}: ${blk.role} (${blk.voltageV}V, maxOut=${blk.maxOutputMa}mA, draw=${blk.drawMa}mA)`);
    for (const ref of blk.memberRefdes) {
      lines.push(`    component ${ref} "${blk.templateId || blk.name}"`);
    }
  }
  for (const bus of arch.buses) {
    const netLabel = bus.netNames[0] || bus.id.toUpperCase();
    lines.push(`    # ${bus.protocol} (${bus.railVoltageV}V, ${bus.expectedMa}mA): ${bus.source} -> ${bus.target}`);
    lines.push(`    signal ${netLabel}`);
  }
  return lines.join('\n') + '\n';
}
