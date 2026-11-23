import React, { useState } from 'react';

/**
 * SchematicApp (ui://vajradhir/schematic)
 * 5-Stage semantic schematic diagram viewer (+V up, GND down, signal flow L-to-R).
 */
export interface SchematicAppProps {
  sheetName?: string;
}

export const SchematicApp: React.FC<SchematicAppProps> = ({ sheetName = "Root" }) => {
  const [zoom, setZoom] = useState<number>(1.0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0e1015', color: '#e2e8f0' }}>
      <header style={{ padding: '8px 16px', background: '#161820', borderBottom: '1px solid #282c37', display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <span style={{ fontWeight: 600, color: '#a855f7' }}>Semantic Schematic Viewer</span> | Sheet: {sheetName}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} style={{ background: '#222632', border: 'none', color: '#fff', padding: '4px 8px', borderRadius: 3 }}>-</button>
          <span>{(zoom * 100).toFixed(0)}%</span>
          <button onClick={() => setZoom(z => Math.min(3.0, z + 0.1))} style={{ background: '#222632', border: 'none', color: '#fff', padding: '4px 8px', borderRadius: 3 }}>+</button>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <svg width="800" height="500" style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}>
          {/* Power rail (+V up) */}
          <line x1="100" y1="50" x2="700" y2="50" stroke="#ef4444" strokeWidth="3" />
          <text x="710" y="55" fill="#ef4444" fontSize="12" fontFamily="monospace">+12V VBUS</text>

          {/* Ground rail (GND down) */}
          <line x1="100" y1="450" x2="700" y2="450" stroke="#3b82f6" strokeWidth="3" />
          <text x="710" y="455" fill="#3b82f6" fontSize="12" fontFamily="monospace">GND</text>

          {/* U1 IC Block */}
          <rect x="300" y="180" width="160" height="120" fill="#1b1f29" stroke="#a855f7" strokeWidth="2" rx="4" />
          <text x="380" y="245" fill="#f8fafc" fontSize="14" fontWeight="bold" textAnchor="middle" fontFamily="monospace">U1 TPS54302</text>
        </svg>
      </div>
    </div>
  );
};
