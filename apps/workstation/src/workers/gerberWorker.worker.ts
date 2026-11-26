// Dedicated Web Worker running MIT @tracespace/identify-layers, @tracespace/parser, and @tracespace/plotter
import { identifyLayers } from '@tracespace/identify-layers';
import { parse } from '@tracespace/parser';
import {
  ARC,
  BoundingBox,
  CIRCLE,
  IMAGE_PATH,
  IMAGE_REGION,
  IMAGE_SHAPE,
  LAYERED_SHAPE,
  LINE,
  OUTLINE,
  POLYGON,
  RECTANGLE,
  plot,
  type ImageGraphic,
  type PathSegment,
  type Shape,
  type SimpleShape,
  type SizeEnvelope,
} from '@tracespace/plotter';

export interface GerberInputFile {
  filename: string;
  content: string;
  sha256?: string;
}

export interface GerberWorkerRequest {
  id: number;
  files: GerberInputFile[];
}

export interface PlottedGerberLayerResult {
  id: string;
  filename: string;
  type: string;
  side: string;
  units: 'mm' | 'in';
  viewBox: [number, number, number, number];
  svgFragment: string;
  itemCount: number;
  drillCount: number;
  minDrillMm: number | null;
}

export interface FabSanityCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface GerberWorkerResponse {
  id: number;
  ok: boolean;
  error?: string;
  viewBox: [number, number, number, number];
  boardSizeMm: [number, number];
  layers: PlottedGerberLayerResult[];
  sanityChecks: FabSanityCheck[];
}

function segmentsToPathD(segments: PathSegment[]): string {
  if (!segments.length) return '';
  const parts: string[] = [];
  let prevX: number | null = null;
  let prevY: number | null = null;

  for (const seg of segments) {
    if (seg.type === LINE) {
      const [x1, y1] = seg.start;
      const [x2, y2] = seg.end;
      if (prevX !== x1 || prevY !== y1) {
        parts.push(`M${x1.toFixed(4)} ${(-y1).toFixed(4)}`);
      }
      parts.push(`L${x2.toFixed(4)} ${(-y2).toFixed(4)}`);
      prevX = x2;
      prevY = y2;
    } else if (seg.type === ARC) {
      const [x1, y1, t1] = seg.start;
      const [x2, y2, t2] = seg.end;
      const r = seg.radius;
      if (prevX !== x1 || prevY !== y1) {
        parts.push(`M${x1.toFixed(4)} ${(-y1).toFixed(4)}`);
      }
      const sweep = t2 - t1;
      const largeArc = Math.abs(sweep) > Math.PI ? 1 : 0;
      const sweepFlag = sweep >= 0 ? 0 : 1; // inverted Y
      parts.push(`A${r.toFixed(4)} ${r.toFixed(4)} 0 ${largeArc} ${sweepFlag} ${x2.toFixed(4)} ${(-y2).toFixed(4)}`);
      prevX = x2;
      prevY = y2;
    }
  }
  return parts.join(' ');
}

function simpleShapeToSvg(shape: SimpleShape, fillAttr: string): string {
  switch (shape.type) {
    case CIRCLE:
      return `<circle cx="${shape.cx.toFixed(4)}" cy="${(-shape.cy).toFixed(4)}" r="${shape.r.toFixed(4)}" fill="${fillAttr}" />`;
    case RECTANGLE:
      return `<rect x="${shape.x.toFixed(4)}" y="${(-(shape.y + shape.ySize)).toFixed(4)}" width="${shape.xSize.toFixed(4)}" height="${shape.ySize.toFixed(4)}" ${shape.r ? `rx="${shape.r.toFixed(4)}"` : ''} fill="${fillAttr}" />`;
    case POLYGON: {
      const pts = shape.points.map(([px, py]) => `${px.toFixed(4)},${(-py).toFixed(4)}`).join(' ');
      return `<polygon points="${pts}" fill="${fillAttr}" />`;
    }
    case OUTLINE: {
      const d = segmentsToPathD(shape.segments);
      return d ? `<path d="${d} Z" fill="${fillAttr}" />` : '';
    }
    default:
      return '';
  }
}

function shapeToSvg(shape: Shape): string {
  if (shape.type === LAYERED_SHAPE) {
    return shape.shapes
      .map((s) => simpleShapeToSvg(s, s.erase ? '#0B0E14' : 'currentColor'))
      .join('');
  }
  return simpleShapeToSvg(shape, 'currentColor');
}

function graphicToSvg(g: ImageGraphic): string {
  if (g.type === IMAGE_SHAPE) {
    return shapeToSvg(g.shape);
  }
  if (g.type === IMAGE_PATH) {
    const d = segmentsToPathD(g.segments);
    return d
      ? `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${Math.max(0.05, g.width).toFixed(4)}" stroke-linecap="round" stroke-linejoin="round" />`
      : '';
  }
  if (g.type === IMAGE_REGION) {
    const d = segmentsToPathD(g.segments);
    return d ? `<path d="${d} Z" fill="currentColor" />` : '';
  }
  return '';
}

self.onmessage = (ev: MessageEvent<GerberWorkerRequest>) => {
  const { id, files } = ev.data;
  try {
    const names = files.map((f) => f.filename);
    const idMap = identifyLayers(names);

    let globalEnv: SizeEnvelope = [];
    const layers: PlottedGerberLayerResult[] = [];
    let hasOutline = false;
    let hasTopCopper = false;
    let hasTopMask = false;
    let pthDrills = 0;
    let npthDrills = 0;
    let minDrillMm: number | null = null;

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const ident = idMap[f.filename] ?? { type: undefined, side: undefined };
      const tree = parse(f.content);
      const image = plot(tree);
      const scale = image.units === 'in' ? 25.4 : 1.0;

      if (!BoundingBox.isEmpty(image.size)) {
        const scaledSize: SizeEnvelope = [
          image.size[0] * scale,
          image.size[1] * scale,
          image.size[2] * scale,
          image.size[3] * scale,
        ];
        globalEnv = BoundingBox.add(globalEnv, scaledSize);
      }

      const layerType = ident.type ?? (f.filename.toLowerCase().endsWith('.drl') ? 'drill' : 'drawing');
      const layerSide = ident.side ?? 'all';
      if (layerType === 'outline') hasOutline = true;
      if (layerType === 'copper' && layerSide === 'top') hasTopCopper = true;
      if (layerType === 'soldermask' && layerSide === 'top') hasTopMask = true;

      let drillCount = 0;
      let layerMinDrill: number | null = null;
      if (layerType === 'drill') {
        const isNpth = f.filename.toUpperCase().includes('NPTH');
        for (const ch of image.children) {
          if (ch.type === IMAGE_SHAPE && ch.shape.type === CIRCLE) {
            drillCount += 1;
            const dMm = ch.shape.r * 2.0 * scale;
            if (layerMinDrill === null || dMm < layerMinDrill) layerMinDrill = dMm;
            if (minDrillMm === null || dMm < minDrillMm) minDrillMm = dMm;
          }
        }
        if (isNpth) npthDrills += drillCount;
        else pthDrills += drillCount;
      }

      const innerSvg = image.children.map(graphicToSvg).join('');
      const wrappedSvg = scale !== 1.0 ? `<g transform="scale(${scale})">${innerSvg}</g>` : innerSvg;
      const vb: [number, number, number, number] = BoundingBox.isEmpty(image.size)
        ? [0, -40, 60, 40]
        : [
            image.size[0] * scale,
            -image.size[3] * scale,
            Math.max(1, (image.size[2] - image.size[0]) * scale),
            Math.max(1, (image.size[3] - image.size[1]) * scale),
          ];

      layers.push({
        id: `gbr-${i}-${f.filename}`,
        filename: f.filename,
        type: layerType,
        side: layerSide,
        units: image.units === 'in' ? 'in' : 'mm',
        viewBox: vb,
        svgFragment: wrappedSvg,
        itemCount: image.children.length,
        drillCount,
        minDrillMm: layerMinDrill !== null ? Number(layerMinDrill.toFixed(3)) : null,
      });
    }

    const viewBox: [number, number, number, number] = BoundingBox.isEmpty(globalEnv)
      ? [0, -40, 60, 40]
      : [
          globalEnv[0],
          -globalEnv[3],
          Math.max(1, globalEnv[2] - globalEnv[0]),
          Math.max(1, globalEnv[3] - globalEnv[1]),
        ];

    const sanityChecks: FabSanityCheck[] = [
      {
        id: 'outline',
        label: 'Edge.Cuts Outline',
        passed: hasOutline,
        detail: hasOutline ? `Closed board outline (${viewBox[2].toFixed(1)}×${viewBox[3].toFixed(1)} mm)` : 'Missing Edge.Cuts Gerber',
      },
      {
        id: 'copper_mask',
        label: 'Copper & Solder Mask',
        passed: hasTopCopper && hasTopMask,
        detail: hasTopCopper && hasTopMask ? 'F.Cu & F.Mask aperture layers present' : 'Missing copper or mask layer',
      },
      {
        id: 'drills',
        label: 'Excellon PTH/NPTH Drills',
        passed: pthDrills + npthDrills > 0 && (minDrillMm === null || minDrillMm >= 0.2),
        detail: `${pthDrills} PTH, ${npthDrills} NPTH · min drill ${minDrillMm !== null ? `${minDrillMm.toFixed(2)} mm` : '—'}`,
      },
    ];

    const resp: GerberWorkerResponse = {
      id,
      ok: true,
      viewBox,
      boardSizeMm: [Number(viewBox[2].toFixed(2)), Number(viewBox[3].toFixed(2))],
      layers,
      sanityChecks,
    };
    self.postMessage(resp);
  } catch (err) {
    const fail: GerberWorkerResponse = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : 'Tracespace Gerber worker failed',
      viewBox: [0, -40, 60, 40],
      boardSizeMm: [60, 40],
      layers: [],
      sanityChecks: [],
    };
    self.postMessage(fail);
  }
};
