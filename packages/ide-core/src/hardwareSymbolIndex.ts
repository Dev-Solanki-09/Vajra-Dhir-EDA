export interface HwBoardComponent {
  refdes: string;
  value?: string;
  footprint?: string;
  mpn?: string;
  xNm?: number;
  yNm?: number;
  rotMdeg?: number;
  locked?: boolean;
  nets?: string[];
}

export interface HwDiagnosticFinding {
  ruleId: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  refdes?: string;
  netName?: string;
}

export interface SymbolLocation {
  path: string;
  line: number;
  startCol: number;
  endCol: number;
  kind: 'component' | 'net' | 'pin';
  symbol: string;
}

export interface MappedIdeMarker {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  source: string;
  code: string;
}

export interface HardwareSymbolTable {
  componentsByRefdes: Record<string, HwBoardComponent>;
  netNames: string[];
  locationsBySymbol: Record<string, SymbolLocation[]>;
}

const TOKEN_RE = /\b([UJCRLDQ][0-9]+|VCC_3V3|\+3V3_OUT|VBUS_12V|SW_NODE|GND|GPIO_[A-Z0-9_]+|PIN_[A-Z0-9_]+)\b/g;

export function buildHardwareSymbolTable(
  files: Array<{ path: string; content: string }>,
  components: HwBoardComponent[],
  extraNets: string[] = []
): HardwareSymbolTable {
  const componentsByRefdes: Record<string, HwBoardComponent> = {};
  const netSet = new Set<string>(['VBUS_12V', 'SW_NODE', '+3V3_OUT', 'VCC_3V3', 'GND', ...extraNets]);

  for (const c of components) {
    if (!c.refdes) continue;
    componentsByRefdes[c.refdes] = c;
    for (const n of c.nets ?? []) {
      if (n) netSet.add(n);
    }
  }

  const locationsBySymbol: Record<string, SymbolLocation[]> = {};
  for (const file of files) {
    const lines = file.content.split(/\r?\n/);
    lines.forEach((lineText, idx) => {
      TOKEN_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = TOKEN_RE.exec(lineText)) !== null) {
        const sym = m[1];
        const kind: SymbolLocation['kind'] =
          componentsByRefdes[sym] || /^[UJCRLDQ][0-9]+$/.test(sym)
            ? 'component'
            : sym.startsWith('GPIO_') || sym.startsWith('PIN_')
              ? 'pin'
              : 'net';
        if (kind === 'net') netSet.add(sym);
        if (!locationsBySymbol[sym]) locationsBySymbol[sym] = [];
        locationsBySymbol[sym].push({
          path: file.path,
          line: idx + 1,
          startCol: m.index + 1,
          endCol: m.index + 1 + sym.length,
          kind,
          symbol: sym,
        });
      }
    });
  }

  return {
    componentsByRefdes,
    netNames: Array.from(netSet).sort(),
    locationsBySymbol,
  };
}

export function extractSymbolAtLineColumn(lineText: string, column1Based: number): string | null {
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(lineText)) !== null) {
    const start1 = m.index + 1;
    const end1 = start1 + m[1].length;
    if (column1Based >= start1 && column1Based <= end1 + 1) {
      return m[1];
    }
  }
  return null;
}

export function findFirstSymbolInText(text: string, targetSymbol: string): SymbolLocation | null {
  if (!targetSymbol) return null;
  const escaped = targetSymbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(`(^|[^A-Za-z0-9_])(${escaped})(?=$|[^A-Za-z0-9_])`);
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const match = rx.exec(lines[i]);
    if (match) {
      const startCol = match.index + match[1].length + 1;
      return {
        path: '',
        line: i + 1,
        startCol,
        endCol: startCol + targetSymbol.length,
        kind: /^[UJCRLDQ][0-9]+$/.test(targetSymbol) ? 'component' : 'net',
        symbol: targetSymbol,
      };
    }
  }
  return null;
}

export function mapFindingsToIdeMarkers(
  fileContent: string,
  findings: HwDiagnosticFinding[]
): MappedIdeMarker[] {
  const markers: MappedIdeMarker[] = [];
  for (const f of findings) {
    let targetLine = 1;
    let startColumn = 1;
    let endColumn = 2;

    if (f.refdes) {
      const loc = findFirstSymbolInText(fileContent, f.refdes);
      if (loc) {
        targetLine = loc.line;
        startColumn = loc.startCol;
        endColumn = loc.endCol;
      }
    } else if (f.netName) {
      const loc = findFirstSymbolInText(fileContent, f.netName);
      if (loc) {
        targetLine = loc.line;
        startColumn = loc.startCol;
        endColumn = loc.endCol;
      }
    } else {
      // Fallback: match refdes pattern inside finding message (e.g. "U1", "C1")
      const refMatch = f.message.match(/\b([UJCRLDQ]\d+)\b/);
      if (refMatch) {
        const loc = findFirstSymbolInText(fileContent, refMatch[1]);
        if (loc) {
          targetLine = loc.line;
          startColumn = loc.startCol;
          endColumn = loc.endCol;
        }
      }
    }

    markers.push({
      startLineNumber: targetLine,
      startColumn,
      endLineNumber: targetLine,
      endColumn,
      message: `[${f.ruleId}] ${f.message}`,
      severity: f.severity,
      source: 'kicad10-diagnostics',
      code: f.ruleId,
    });
  }
  return markers;
}

export function formatComponentHoverMarkdown(comp: HwBoardComponent): string {
  const parts: string[] = [`**${comp.refdes}**`];
  if (comp.value) parts.push(`Value: \`${comp.value}\``);
  if (comp.mpn) parts.push(`MPN: \`${comp.mpn}\``);
  if (comp.footprint) parts.push(`Footprint: \`${comp.footprint}\``);
  if (typeof comp.xNm === 'number' && typeof comp.yNm === 'number') {
    parts.push(`HW-IR Position: \`(${(comp.xNm / 1_000_000).toFixed(3)} mm, ${(comp.yNm / 1_000_000).toFixed(3)} mm)\` · \`${comp.xNm} nm\``);
  }
  parts.push(`Lock State: ${comp.locked ? 'LOCKED (`locked = 1` human protected)' : 'Unlocked'}`);
  if (comp.nets && comp.nets.length > 0) {
    parts.push(`Nets: ${comp.nets.map((n) => `\`${n}\``).join(', ')}`);
  }
  return parts.join('\n\n');
}
