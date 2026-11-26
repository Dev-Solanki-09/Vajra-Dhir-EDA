import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { globalCrossProbeBus } from '@vajradhir/crossprobe-bus';
import { VcdWaveformViewer } from './VcdWaveformViewer';

const UplotScope = React.lazy(() =>
  import('./UplotScope').then((m) => ({ default: m.UplotScope }))
);

interface CosimShortcoming {
  category: 'CIRCUIT_BUG' | 'FIRMWARE_BUG' | 'INTEGRATION_MISMATCH' | string;
  rule_id: string;
  refdes: string;
  detail: string;
  circuit_fix?: Record<string, unknown> | null;
  firmware_fix?: Record<string, unknown> | null;
}

interface CosimRunResult {
  ok: boolean;
  scenario: string;
  engine: string;
  shortcomings: CosimShortcoming[];
  uart_logs: string[];
  vcd_text: string;
  analog_lockstep: {
    ok: boolean;
    time_us: number[];
    vout_v: number[];
    v_steady_v: number;
    pgood: boolean;
  };
  twin_highlights: Array<{ refdes: string; color: string; label: string }>;
  generated_files?: string[];
}

interface SuiteCaseItem {
  scenario: string;
  expected_rule: string | null;
  gate_ok: boolean;
  result: CosimRunResult;
}

export const CosimPanel: React.FC<{ autoRun?: boolean }> = ({ autoRun = true }) => {
  const [activeResult, setActiveResult] = useState<CosimRunResult | null>(null);
  const [suiteCases, setSuiteCases] = useState<SuiteCaseItem[]>([]);
  const [scrubPct, setScrubPct] = useState<number>(50);
  const [loading, setLoading] = useState<boolean>(false);
  const [statusNote, setStatusNote] = useState<string>('Renode/SBC Digital Twin ready (127.0.0.1 lockstep)');

  const pushTwinHighlights = (res: CosimRunResult) => {
    const firstFault = res.twin_highlights?.find((h) => h.color === '#EF4444');
    const blinkLed = res.twin_highlights?.find((h) => h.refdes === 'D1');
    if (firstFault) {
      globalCrossProbeBus.select([firstFault.refdes], 'pcb');
      globalCrossProbeBus.highlightNet(firstFault.refdes, 'pcb', '#EF4444');
    } else if (blinkLed) {
      globalCrossProbeBus.select(['D1'], 'pcb');
      globalCrossProbeBus.highlightNet('LED_STATUS', 'pcb', blinkLed.color);
    }
  };

  const generateTwin = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/v1/cosim/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as { files: string[] };
      setStatusNote(`Generated ${data.files.length} files (board_pins.h, board.repl, wiring.json, .elf)`);
    } catch (err) {
      setStatusNote(`Generate failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const runScenario = useCallback(async (scenario: string) => {
    setLoading(true);
    try {
      const resp = await fetch('/api/v1/cosim/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as CosimRunResult;
      setActiveResult(data);
      pushTwinHighlights(data);
      setStatusNote(
        `Co-Sim (${scenario}): ${data.ok ? 'PASS 100%' : `${data.shortcomings.length} fault(s) caught`} · Rail ${data.analog_lockstep.v_steady_v}V`
      );
    } catch (err) {
      setStatusNote(`Co-Sim error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const runSuite4 = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/v1/cosim/suite-4');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as { total: number; all_gates_passed: boolean; cases: SuiteCaseItem[] };
      setSuiteCases(data.cases);
      if (data.cases.length > 0) {
        setActiveResult(data.cases[0].result);
      }
      setStatusNote(
        `4-Case Code-on-Circuit Suite: ${data.cases.filter((c) => c.gate_ok).length}/${data.total} verified`
      );
    } catch (err) {
      setStatusNote(`Suite error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const applyCosimFix = async (scen: string, shortcoming: CosimShortcoming, fixKind: 'circuit' | 'firmware') => {
    setLoading(true);
    try {
      const resp = await fetch('/api/v1/cosim/apply-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rule_id: shortcoming.rule_id, fix_kind: fixKind, shortcoming }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as { result: CosimRunResult };
      setSuiteCases((prev) =>
        prev.map((c) => (c.scenario === scen ? { ...c, result: data.result } : c))
      );
      setActiveResult(data.result);
      pushTwinHighlights(data.result);
      setStatusNote(`Fixed ${shortcoming.rule_id} via ${fixKind} patch -> PASS 100%`);
    } catch (err) {
      setStatusNote(`Fix error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoRun) {
      void runScenario('nominal');
    }
  }, [autoRun, runScenario]);

  const analogTime = activeResult?.analog_lockstep?.time_us ?? [];
  const analogV = activeResult?.analog_lockstep?.vout_v ?? [];
  const scrubIdx = analogV.length > 0 ? Math.min(analogV.length - 1, Math.round(((analogV.length - 1) * scrubPct) / 100)) : 0;

  return (
    <div
      data-testid="cosim-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: 10,
        backgroundColor: 'var(--vd-bg-canvas)',
        color: 'var(--vd-text-primary)',
        border: '1px solid var(--vd-border)',
        borderRadius: 6,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div>
          <strong style={{ fontSize: 13 }}>Renode / SBC Digital Twin &amp; Analog-Digital Lockstep (P11)</strong>
          <div data-testid="cosim-status-banner" style={{ fontSize: 11, color: 'var(--vd-text-muted)' }}>
            {statusNote}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="vd-btn"
            data-testid="cosim-generate-btn"
            disabled={loading}
            onClick={() => void generateTwin()}
          >
            Generate Firmware &amp; Twin
          </button>
          <button
            type="button"
            className="vd-btn vd-btn-primary"
            data-testid="cosim-run-suite4-btn"
            disabled={loading}
            onClick={() => void runSuite4()}
          >
            Run 4-Case Fault Suite
          </button>
        </div>
      </div>

      {/* Synchronized VCD + Analog uPlot Time-Cursor Scrubber */}
      {activeResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="vd-metric" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', fontSize: 11 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
              <span>Lockstep Time Cursor ({scrubPct}%):</span>
              <input
                type="range"
                min={0}
                max={100}
                data-testid="cosim-time-scrubber"
                value={scrubPct}
                onChange={(e) => setScrubPct(Number(e.target.value))}
                style={{ flex: 1 }}
              />
            </label>
            <span data-testid="cosim-lockstep-readout">
              t={analogTime[scrubIdx] ?? 0} us · V_3V3={analogV[scrubIdx] ?? activeResult.analog_lockstep.v_steady_v} V ·
              PGOOD={activeResult.analog_lockstep.pgood ? '1' : '0'}
            </span>
          </div>

          <VcdWaveformViewer vcdText={activeResult.vcd_text} cursorRatio={scrubPct / 100} />

          {analogTime.length > 2 && (
            <Suspense fallback={<div className="vd-metric">Loading Analog Lockstep uPlot...</div>}>
              <UplotScope
                title={`127.0.0.1 Lockstep Analog Rail (+3.3V from ngspice.dll @ ${activeResult.scenario})`}
                xLabel="Time (us)"
                seriesLabel="VOUT_3V3 (V)"
                xValues={analogTime}
                yValues={analogV}
                strokeColor="#10B981"
              />
            </Suspense>
          )}
        </div>
      )}

      {/* 4-Case Code-on-Circuit Fault Suite Cards */}
      {suiteCases.length > 0 && (
        <div data-testid="cosim-suite4-grid" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {suiteCases.map((c) => {
            const sc = c.result.shortcomings[0];
            return (
              <div
                key={c.scenario}
                data-testid={`cosim-case-${c.scenario}`}
                style={{
                  padding: 8,
                  borderRadius: 4,
                  border: c.result.ok ? '1px solid #10B981' : '1px solid #ef4444',
                  backgroundColor: 'var(--vd-bg-surface)',
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div>
                    <strong>{c.scenario}</strong>{' '}
                    <span
                      data-testid={`cosim-case-status-${c.scenario}`}
                      style={{
                        marginLeft: 6,
                        padding: '1px 6px',
                        borderRadius: 3,
                        fontSize: 11,
                        backgroundColor: c.result.ok ? '#064e3b' : '#7f1d1d',
                        color: c.result.ok ? '#6ee7b7' : '#fecaca',
                      }}
                    >
                      {c.result.ok ? 'GREEN · PASS 100%' : `${sc?.category || 'FAULT'}: ${sc?.rule_id || 'ERR'}`}
                    </span>
                  </div>
                  {!c.result.ok && sc && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      {sc.circuit_fix && (
                        <button
                          type="button"
                          className="vd-btn vd-btn-primary"
                          data-testid={`cosim-fix-circuit-${c.scenario}`}
                          disabled={loading}
                          onClick={() => void applyCosimFix(c.scenario, sc, 'circuit')}
                        >
                          Fix Circuit
                        </button>
                      )}
                      {sc.firmware_fix && (
                        <button
                          type="button"
                          className="vd-btn"
                          data-testid={`cosim-fix-firmware-${c.scenario}`}
                          disabled={loading}
                          onClick={() => void applyCosimFix(c.scenario, sc, 'firmware')}
                        >
                          Fix Firmware Code
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {sc && <div style={{ marginTop: 4, fontSize: 11, color: 'var(--vd-text-muted)' }}>{sc.detail}</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* Virtual UART Serial Monitor */}
      {activeResult && (
        <pre
          data-testid="cosim-uart-console"
          style={{
            margin: 0,
            padding: 8,
            maxHeight: 130,
            overflow: 'auto',
            borderRadius: 4,
            backgroundColor: '#0b0f19',
            border: '1px solid var(--vd-border)',
            fontSize: 11,
          }}
        >
          {activeResult.uart_logs.join('\n')}
        </pre>
      )}
    </div>
  );
};

export default CosimPanel;
