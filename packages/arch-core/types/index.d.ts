export type BlockKind =
  | 'power_source'
  | 'regulator'
  | 'mcu'
  | 'sbc'
  | 'premade_module'
  | 'sensor'
  | 'custom_subcircuit';

export type PinTolerance =
  | '3.3V_NON_5V_TOLERANT'
  | '5V_TOLERANT'
  | 'HIGH_VOLTAGE_POWER'
  | 'ISOLATED';

export type BusProtocol =
  | 'PowerRail'
  | 'I2C'
  | 'SPI'
  | 'UART'
  | 'CAN'
  | 'USB'
  | 'PWM'
  | 'ADC'
  | 'GPIO';

export interface ArchBlock {
  id: string;
  name: string;
  kind: BlockKind;
  templateId?: string;
  role: string;
  voltageV: number;
  maxOutputMa: number;
  drawMa: number;
  tolerance: PinTolerance;
  builtinPullups: boolean;
  bootstrapNotes: string;
  mountingFootprint: string;
  stepModelRef: string;
  kicadSheetUuid: string;
  memberRefdes: string[];
  x: number;
  y: number;
}

export interface ArchBus {
  id: string;
  source: string;
  target: string;
  protocol: BusProtocol;
  railVoltageV: number;
  expectedMa: number;
  netNames: string[];
}

export interface SystemArchitecture {
  project: string;
  version: string;
  purpose: string;
  requirements: string[];
  blocks: ArchBlock[];
  buses: ArchBus[];
}

export interface ArchFinding {
  id: string;
  ruleId: 'VOLTAGE_MISMATCH' | 'POWER_OVERCURRENT' | 'POWER_MARGIN_LOW' | 'I2C_PULLUP_HINT';
  severity: 'error' | 'warning' | 'info';
  sourceBlockId?: string;
  targetBlockId?: string;
  busId?: string;
  message: string;
}

export interface RailRollup {
  sourceBlockId: string;
  sourceName: string;
  voltageV: number;
  capacityMa: number;
  loadMa: number;
  powerMw: number;
  utilizationPct: number;
  overloaded: boolean;
}

export interface ArchAuditReport {
  totalLoadMw: number;
  totalLoadMa: number;
  railRollups: RailRollup[];
  findings: ArchFinding[];
  blockSeverityById: Record<string, 'ok' | 'warning' | 'error'>;
}

export declare const BUS_PROTOCOL_COLORS: Record<BusProtocol, string>;
export declare const STARTER_COMPOSITE_TEMPLATES: ArchBlock[];
export declare function instantiateCompositeTemplate(templateId: string, existingIds: Set<string>): ArchBlock | null;
export declare function createGoldenBuckArchitecture(): SystemArchitecture;
export declare function analyzeSystemArchitecture(arch: SystemArchitecture): ArchAuditReport;
export declare function serializeSystemYaml(arch: SystemArchitecture): string;
export declare function parseSystemYaml(yamlText: string): SystemArchitecture;
export declare function scaffoldAtoStubFromArchitecture(arch: SystemArchitecture): string;
