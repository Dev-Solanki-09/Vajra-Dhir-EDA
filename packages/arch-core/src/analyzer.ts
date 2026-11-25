import type { ArchAuditReport, ArchBlock, ArchFinding, RailRollup, SystemArchitecture } from './types.ts';

export function analyzeSystemArchitecture(arch: SystemArchitecture): ArchAuditReport {
  const byId = new Map<string, ArchBlock>();
  const severity: Record<string, 'ok' | 'warning' | 'error'> = {};
  for (const b of arch.blocks) {
    byId.set(b.id, b);
    severity[b.id] = 'ok';
  }

  const findings: ArchFinding[] = [];
  const loadBySource = new Map<string, number>();

  const bumpSeverity = (id: string | undefined, level: 'warning' | 'error') => {
    if (!id || !(id in severity)) return;
    if (level === 'error' || severity[id] === 'ok') {
      severity[id] = level;
    }
  };

  for (const bus of arch.buses) {
    const src = byId.get(bus.source);
    const dst = byId.get(bus.target);
    if (!src || !dst) continue;

    if (bus.protocol === 'PowerRail') {
      const prev = loadBySource.get(src.id) ?? 0;
      const edgeMa = bus.expectedMa > 0 ? bus.expectedMa : dst.drawMa;
      loadBySource.set(src.id, prev + edgeMa);
    }

    const busVoltage = bus.railVoltageV > 0 ? bus.railVoltageV : src.voltageV;
    // Check 5V / high-voltage rail connected into non-5V-tolerant 3.3V SBC/MCU pins or rails
    if (dst.tolerance === '3.3V_NON_5V_TOLERANT' && busVoltage > 3.6) {
      findings.push({
        id: `volt-${bus.id}`,
        ruleId: 'VOLTAGE_MISMATCH',
        severity: 'error',
        sourceBlockId: src.id,
        targetBlockId: dst.id,
        busId: bus.id,
        message: `${busVoltage.toFixed(1)}V ${bus.protocol} from "${src.name}" drives 3.3V_NON_5V_TOLERANT block "${dst.name}" (max 3.6V)! Insert regulator or level shifter.`,
      });
      bumpSeverity(src.id, 'error');
      bumpSeverity(dst.id, 'error');
    }

    if (bus.protocol === 'I2C' && !src.builtinPullups && !dst.builtinPullups) {
      findings.push({
        id: `i2c-${bus.id}`,
        ruleId: 'I2C_PULLUP_HINT',
        severity: 'warning',
        sourceBlockId: src.id,
        targetBlockId: dst.id,
        busId: bus.id,
        message: `I2C bus "${src.name}" -> "${dst.name}" lacks built-in pullups on both blocks; ensure external 2.2k-4.7k pullup resistors.`,
      });
      bumpSeverity(dst.id, 'warning');
    }
  }

  const railRollups: RailRollup[] = [];
  for (const b of arch.blocks) {
    if (b.kind !== 'power_source' && b.kind !== 'regulator') continue;
    const loadMa = loadBySource.get(b.id) ?? 0;
    const capacityMa = Math.max(1, b.maxOutputMa);
    const utilizationPct = Math.round((loadMa / capacityMa) * 1000) / 10;
    const overloaded = loadMa > b.maxOutputMa;
    const powerMw = Math.round(loadMa * b.voltageV);

    railRollups.push({
      sourceBlockId: b.id,
      sourceName: b.name,
      voltageV: b.voltageV,
      capacityMa: b.maxOutputMa,
      loadMa,
      powerMw,
      utilizationPct,
      overloaded,
    });

    if (overloaded) {
      findings.push({
        id: `oc-${b.id}`,
        ruleId: 'POWER_OVERCURRENT',
        severity: 'error',
        sourceBlockId: b.id,
        message: `Power rail "${b.name}" load (${loadMa} mA) exceeds capacity (${b.maxOutputMa} mA, ${utilizationPct}%).`,
      });
      bumpSeverity(b.id, 'error');
    } else if (utilizationPct >= 85) {
      findings.push({
        id: `margin-${b.id}`,
        ruleId: 'POWER_MARGIN_LOW',
        severity: 'warning',
        sourceBlockId: b.id,
        message: `Power rail "${b.name}" running near ceiling (${loadMa}/${b.maxOutputMa} mA, ${utilizationPct}%).`,
      });
      bumpSeverity(b.id, 'warning');
    }
  }

  let totalLoadMa = 0;
  let totalLoadMw = 0;
  for (const b of arch.blocks) {
    if (b.kind === 'power_source') continue;
    totalLoadMa += b.drawMa;
    totalLoadMw += b.drawMa * b.voltageV;
  }

  return {
    totalLoadMw: Math.round(totalLoadMw),
    totalLoadMa: Math.round(totalLoadMa),
    railRollups,
    findings,
    blockSeverityById: severity,
  };
}
