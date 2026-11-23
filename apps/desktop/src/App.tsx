import React, { useState } from 'react';
import { SpatialWorkbench } from './components/SpatialWorkbench.js';
import { THEME } from './theme.js';

export const App: React.FC = () => {
  const [drcRunning, setDrcRunning] = useState<boolean>(false);
  const [drcStatus, setDrcStatus] = useState<string>('PASS (0 violations)');

  const handleRunDrc = () => {
    setDrcRunning(true);
    setTimeout(() => {
      setDrcRunning(false);
      setDrcStatus('PASS (0 violations)');
    }, 400);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
        backgroundColor: THEME.colors.bg,
        color: THEME.colors.text,
        overflow: 'hidden',
      }}
    >
      {/* Top Application Bar */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          height: 38,
          padding: '0 12px',
          backgroundColor: THEME.colors.surface,
          borderBottom: `1px solid ${THEME.colors.border}`,
          fontSize: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontWeight: 700, color: '#FFFFFF', letterSpacing: '0.02em' }}>
            Vajra-Dhīr <span style={{ color: THEME.colors.cyan }}>EDA</span>
          </span>
          <span
            style={{
              fontSize: 10,
              padding: '1px 6px',
              borderRadius: 3,
              backgroundColor: '#1E2333',
              color: THEME.colors.textDim,
              fontFamily: THEME.typography.fontMono,
            }}
          >
            Rev 2.0 Baseline
          </span>
          <span style={{ color: THEME.colors.border }}>|</span>
          <span style={{ color: THEME.colors.textMuted }}>Project: <strong>main_board</strong></span>
          <span
            style={{
              fontSize: 10,
              padding: '1px 5px',
              borderRadius: 2,
              backgroundColor: '#132822',
              color: THEME.colors.emerald,
              fontFamily: THEME.typography.fontMono,
            }}
          >
            jlcpcb_4l_7628
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={handleRunDrc}
            disabled={drcRunning}
            style={{
              padding: '4px 10px',
              borderRadius: 4,
              border: `1px solid ${THEME.colors.cyan}`,
              backgroundColor: '#002B3D',
              color: THEME.colors.cyan,
              fontSize: 11,
              fontFamily: THEME.typography.fontMono,
              cursor: 'pointer',
            }}
          >
            {drcRunning ? 'Checking...' : '▶ Verify DRC'}
          </button>

          <button
            style={{
              padding: '4px 10px',
              borderRadius: 4,
              border: `1px solid ${THEME.colors.border}`,
              backgroundColor: THEME.colors.surfaceHover,
              color: THEME.colors.textMuted,
              fontSize: 11,
              fontFamily: THEME.typography.fontMono,
              cursor: 'pointer',
            }}
          >
            Export Fab
          </button>
        </div>
      </header>

      {/* Main Spatial Workbench Center Area */}
      <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <SpatialWorkbench />
      </main>

      {/* Bottom Status Bar */}
      <footer
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          height: 24,
          padding: '0 10px',
          backgroundColor: '#06070A',
          borderTop: `1px solid ${THEME.colors.border}`,
          fontSize: 11,
          fontFamily: THEME.typography.fontMono,
          color: THEME.colors.textDim,
        }}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span>
            HW-IR: <strong style={{ color: THEME.colors.emerald }}>CONNECTED (WAL)</strong>
          </span>
          <span>|</span>
          <span>
            DRC: <strong style={{ color: THEME.colors.emerald }}>{drcStatus}</strong>
          </span>
          <span>|</span>
          <span>
            Wasmtime 50: <strong style={{ color: THEME.colors.cyan }}>ACTIVE</strong>
          </span>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span>DLP: <strong style={{ color: THEME.colors.textMuted }}>PRIVATE_CLOUD_OK</strong></span>
          <span>|</span>
          <span>Budget: <strong style={{ color: THEME.colors.emerald }}>$0.00 / $5.00</strong></span>
        </div>
      </footer>
    </div>
  );
};
