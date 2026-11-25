import React, { useMemo } from 'react';
import { parseVcd } from '../engines/vcdParser';

const DEFAULT_SAMPLE_VCD = `$timescale 1ns $end
$scope module mcu $end
$var wire 1 ! sw_clk $end
$var wire 1 " pgood $end
$var wire 4 # state $end
$upscope $end
$enddefinitions $end
#0
0!
0"
b0000 #
#10
1!
b0001 #
#20
0!
1"
b0011 #
#30
1!
b0111 #
#40
0!
1"
b1001 #`;

export const VcdWaveformViewer: React.FC<{ vcdText?: string }> = ({ vcdText }) => {
  const parsed = useMemo(() => parseVcd(vcdText || DEFAULT_SAMPLE_VCD), [vcdText]);

  return (
    <div
      data-testid="mit-vcd-viewer"
      style={{
        border: '1px solid var(--vd-border-subtle)',
        borderRadius: 6,
        backgroundColor: 'var(--vd-bg-canvas)',
        padding: 10,
      }}
    >
      <div className="vd-metric" style={{ fontSize: 11, marginBottom: 8, color: 'var(--vd-text-secondary)' }}>
        Pure-MIT Digital VCD Waveform Track (Zero EUPL · timescale={parsed.timescaleNs} ns · end={parsed.endTimeNs} ns)
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {parsed.signals.map((sig) => (
          <div key={sig.symbol} style={{ display: 'grid', gridTemplateColumns: '110px 1fr', alignItems: 'center', gap: 8 }}>
            <span className="vd-metric" style={{ fontSize: 11 }}>
              {sig.name}[{sig.width}]
            </span>
            <svg viewBox="0 0 240 24" style={{ width: '100%', height: 22, backgroundColor: 'var(--vd-bg-panel)', borderRadius: 3 }}>
              {sig.values.map((val, idx) => {
                const segW = 240 / Math.max(1, sig.values.length);
                const x = idx * segW;
                const y = sig.width === 1 ? (val === 1 ? 5 : 18) : 11;
                return (
                  <g key={`${sig.symbol}-${idx}`}>
                    <line
                      x1={x}
                      y1={y}
                      x2={x + segW}
                      y2={y}
                      stroke={sig.width === 1 ? (val === 1 ? 'var(--vd-pass)' : 'var(--vd-accent)') : '#38BDF8'}
                      strokeWidth="2"
                    />
                    {sig.width > 1 && (
                      <text x={x + 4} y={15} fontSize="8" fill="var(--vd-text-primary)" fontFamily="var(--vd-font-mono)">
                        {sig.rawStates[idx]}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        ))}
      </div>
    </div>
  );
};
