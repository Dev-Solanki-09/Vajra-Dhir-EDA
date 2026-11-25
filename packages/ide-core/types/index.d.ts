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
  line?: number;
  col?: number;
  source?: string;
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

export interface TerminalLinkMatch {
  startIndex: number;
  length: number;
  text: string;
  kind: 'file' | 'refdes';
  path?: string;
  line?: number;
  column?: number;
  refdes?: string;
}

export interface MonarchLanguageSpec {
  tokenizer: {
    root: Array<[RegExp, string]>;
  };
}

export declare const ATO_KEYWORDS: string[];
export declare const ATO_MONARCH_LANGUAGE: MonarchLanguageSpec;
export declare const KICAD_SEXPR_MONARCH_LANGUAGE: MonarchLanguageSpec;
export declare const SPICE_MONARCH_LANGUAGE: MonarchLanguageSpec;
export declare const EXTRA_HW_LANGUAGES: Record<string, MonarchLanguageSpec>;

export declare function buildHardwareSymbolTable(
  files: Array<{ path: string; content: string }>,
  components: HwBoardComponent[],
  extraNets?: string[]
): HardwareSymbolTable;

export declare function extractSymbolAtLineColumn(lineText: string, column1Based: number): string | null;
export declare function findFirstSymbolInText(text: string, targetSymbol: string): SymbolLocation | null;
export declare function mapFindingsToIdeMarkers(fileContent: string, findings: HwDiagnosticFinding[]): MappedIdeMarker[];
export declare function formatComponentHoverMarkdown(comp: HwBoardComponent): string;

export declare class ConPtyStreamCoordinator {
  attachSender(fn: ((payload: string) => boolean) | null): void;
  markOutputReceived(): void;
  isReady(): boolean;
  sendRaw(payload: string): void;
  sendCommand(cmd: string): void;
  sendResize(cols: number, rows: number): void;
}

export declare function extractTerminalLinks(lineText: string): TerminalLinkMatch[];
