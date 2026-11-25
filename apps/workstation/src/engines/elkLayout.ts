import ELK from 'elkjs/lib/elk.bundled.js';

export interface SchematicInputPin {
  id: string;
  label: string;
  side: 'WEST' | 'EAST' | 'NORTH' | 'SOUTH';
}

export interface SchematicInputNode {
  id: string;
  refdes: string;
  value: string;
  width: number;
  height: number;
  tier: 'power_up' | 'signal' | 'ground_down';
  pins: SchematicInputPin[];
}

export interface SchematicInputEdge {
  id: string;
  netName: string;
  sourceNode: string;
  sourcePin: string;
  targetNode: string;
  targetPin: string;
  colorToken: string;
}

export interface SchematicInputGraph {
  id: string;
  sheet: string;
  nodes: SchematicInputNode[];
  edges: SchematicInputEdge[];
}

export interface LaidOutNode {
  id: string;
  refdes: string;
  value: string;
  tier: SchematicInputNode['tier'];
  x: number;
  y: number;
  width: number;
  height: number;
  pins: Array<SchematicInputPin & { x: number; y: number }>;
}

export interface LaidOutEdge {
  id: string;
  netName: string;
  colorToken: string;
  points: Array<[number, number]>;
}

export interface LaidOutSchematic {
  width: number;
  height: number;
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  algorithm: string;
}

export const BUCK_PD_SCHEMATIC_INPUT: SchematicInputGraph = {
  id: 'buck-pd-root',
  sheet: 'root',
  nodes: [
    {
      id: 'U1',
      refdes: 'U1',
      value: 'CH224K USB-PD Sink',
      width: 160,
      height: 88,
      tier: 'signal',
      pins: [
        { id: 'U1.CC1', label: 'CC1', side: 'WEST' },
        { id: 'U1.VBUS', label: 'VBUS', side: 'EAST' },
        { id: 'U1.GND', label: 'GND', side: 'SOUTH' },
      ],
    },
    {
      id: 'U2',
      refdes: 'U2',
      value: 'TPS54302 Buck 3A',
      width: 176,
      height: 104,
      tier: 'signal',
      pins: [
        { id: 'U2.VIN', label: 'VIN', side: 'WEST' },
        { id: 'U2.SW', label: 'SW', side: 'EAST' },
        { id: 'U2.GND', label: 'GND', side: 'SOUTH' },
      ],
    },
    {
      id: 'L1',
      refdes: 'L1',
      value: '4.7uH SWPA4020',
      width: 120,
      height: 64,
      tier: 'power_up',
      pins: [
        { id: 'L1.1', label: '1', side: 'WEST' },
        { id: 'L1.2', label: '2', side: 'EAST' },
      ],
    },
    {
      id: 'C1',
      refdes: 'C1',
      value: '22uF X7R Output',
      width: 128,
      height: 64,
      tier: 'ground_down',
      pins: [
        { id: 'C1.1', label: '+3V3', side: 'WEST' },
        { id: 'C1.2', label: 'GND', side: 'SOUTH' },
      ],
    },
  ],
  edges: [
    {
      id: 'e-vbus',
      netName: 'VBUS_12V',
      sourceNode: 'U1',
      sourcePin: 'U1.VBUS',
      targetNode: 'U2',
      targetPin: 'U2.VIN',
      colorToken: 'var(--vd-layer-f-cu)',
    },
    {
      id: 'e-sw',
      netName: 'SW_NODE',
      sourceNode: 'U2',
      sourcePin: 'U2.SW',
      targetNode: 'L1',
      targetPin: 'L1.1',
      colorToken: 'var(--vd-human-lock)',
    },
    {
      id: 'e-3v3',
      netName: '+3V3_OUT',
      sourceNode: 'L1',
      sourcePin: 'L1.2',
      targetNode: 'C1',
      targetPin: 'C1.1',
      colorToken: 'var(--vd-pass)',
    },
  ],
};

interface ElkPoint {
  x?: number;
  y?: number;
}

interface ElkSection {
  startPoint?: ElkPoint;
  bendPoints?: ElkPoint[];
  endPoint?: ElkPoint;
}

interface ElkPortOut {
  id: string;
  x?: number;
  y?: number;
}

interface ElkNodeOut {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  ports?: ElkPortOut[];
}

interface ElkEdgeOut {
  id: string;
  sections?: ElkSection[];
}

interface ElkGraphOut {
  width?: number;
  height?: number;
  children?: ElkNodeOut[];
  edges?: ElkEdgeOut[];
}

const elkInstance = new ELK();

export async function runElkSchematicLayout(input: SchematicInputGraph): Promise<LaidOutSchematic> {
  const elkInput = {
    id: input.id,
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': '48',
      'elk.layered.spacing.nodeNodeBetweenLayers': '64',
    },
    children: input.nodes.map((node) => ({
      id: node.id,
      width: node.width,
      height: node.height,
      layoutOptions: {
        'elk.portConstraints': 'FIXED_SIDE',
      },
      ports: node.pins.map((p) => ({
        id: p.id,
        width: 8,
        height: 8,
        layoutOptions: { 'elk.port.side': p.side },
      })),
    })),
    edges: input.edges.map((edge) => ({
      id: edge.id,
      sources: [edge.sourcePin],
      targets: [edge.targetPin],
    })),
  };

  const laidOut = (await elkInstance.layout(elkInput)) as ElkGraphOut;
  const nodeMeta = new Map(input.nodes.map((n) => [n.id, n]));
  const edgeMeta = new Map(input.edges.map((e) => [e.id, e]));

  const nodes: LaidOutNode[] = (laidOut.children ?? []).map((child) => {
    const meta = nodeMeta.get(child.id)!;
    const x = Math.round((child.x ?? 0) + 24);
    const y = Math.round((child.y ?? 0) + 24);
    const portCoords = new Map((child.ports ?? []).map((p) => [p.id, p]));
    return {
      id: meta.id,
      refdes: meta.refdes,
      value: meta.value,
      tier: meta.tier,
      x,
      y,
      width: child.width ?? meta.width,
      height: child.height ?? meta.height,
      pins: meta.pins.map((pin) => {
        const ep = portCoords.get(pin.id);
        return {
          ...pin,
          x: Math.round(x + (ep?.x ?? 0)),
          y: Math.round(y + (ep?.y ?? meta.height / 2)),
        };
      }),
    };
  });

  const edges: LaidOutEdge[] = (laidOut.edges ?? []).map((edge) => {
    const meta = edgeMeta.get(edge.id)!;
    const points: Array<[number, number]> = [];
    for (const section of edge.sections ?? []) {
      if (section.startPoint) {
        points.push([Math.round((section.startPoint.x ?? 0) + 24), Math.round((section.startPoint.y ?? 0) + 24)]);
      }
      for (const bend of section.bendPoints ?? []) {
        points.push([Math.round((bend.x ?? 0) + 24), Math.round((bend.y ?? 0) + 24)]);
      }
      if (section.endPoint) {
        points.push([Math.round((section.endPoint.x ?? 0) + 24), Math.round((section.endPoint.y ?? 0) + 24)]);
      }
    }
    return {
      id: meta.id,
      netName: meta.netName,
      colorToken: meta.colorToken,
      points,
    };
  });

  return {
    width: Math.max(640, Math.round((laidOut.width ?? 600) + 48)),
    height: Math.max(340, Math.round((laidOut.height ?? 300) + 48)),
    nodes,
    edges,
    algorithm: 'elkjs/layered-orthogonal',
  };
}
