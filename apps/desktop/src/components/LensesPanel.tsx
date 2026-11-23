import React, { useState } from 'react';
import { THEME } from '../theme.js';

export type KnowledgeLens =
  | 'system_architecture'
  | 'physical_cad'
  | 'physics_signal_power'
  | 'manufacturing_assembly'
  | 'governance_audit';

interface LensInfo {
  id: KnowledgeLens;
  name: string;
  badge: string;
  description: string;
}

const LENSES: LensInfo[] = [
  {
    id: 'system_architecture',
    name: '1. System & Architecture',
    badge: 'ARCH',
    description: 'Power trees, bus topologies, block hierarchy, Open-CUBO modules',
  },
  {
    id: 'physical_cad',
    name: '2. Physical CAD',
    badge: 'CAD',
    description: 'Stackup, footprint courtyards, STEP MCAD keepouts, rooms',
  },
  {
    id: 'physics_signal_power',
    name: '3. Signal & Power Physics',
    badge: 'PHYS',
    description: 'Diff pairs, skew, PDN impedance curves, thermal dissipation',
  },
  {
    id: 'manufacturing_assembly',
    name: '4. Manufacturing & EMS',
    badge: 'FAB',
    description: 'Multi-region fab rules (India EMS, JLCPCB, PCBWay), DFM checks',
  },
  {
    id: 'governance_audit',
    name: '5. Governance & Audit',
    badge: 'SLSA',
    description: 'Gates G0..G8, datasheet citations, DRC waivers, human locks',
  },
];

export const LensesPanel: React.FC = () => {
  const [activeLens, setActiveLens] = useState<KnowledgeLens>('physical_cad');

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: THEME.colors.surface,
        borderRight: `1px solid ${THEME.colors.border}`,
        fontSize: 12,
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          fontWeight: 600,
          color: THEME.colors.textMuted,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          borderBottom: `1px solid ${THEME.colors.border}`,
        }}
      >
        Knowledge Lenses
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', padding: 4, gap: 2 }}>
        {LENSES.map((lens) => {
          const isActive = activeLens === lens.id;
          return (
            <div
              key={lens.id}
              onClick={() => setActiveLens(lens.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '6px 8px',
                borderRadius: 4,
                cursor: 'pointer',
                backgroundColor: isActive ? THEME.colors.surfaceHover : 'transparent',
                borderLeft: isActive ? `3px solid ${THEME.colors.cyan}` : '3px solid transparent',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span
                  style={{
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? THEME.colors.cyan : THEME.colors.text,
                  }}
                >
                  {lens.name}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    padding: '1px 4px',
                    borderRadius: 2,
                    backgroundColor: isActive ? THEME.colors.borderActive : '#1E2333',
                    color: THEME.colors.textDim,
                    fontFamily: THEME.typography.fontMono,
                  }}
                >
                  {lens.badge}
                </span>
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: THEME.colors.textDim,
                  marginTop: 2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {lens.description}
              </div>
            </div>
          );
        })}
      </div>

      {/* Lens active detail summary */}
      <div
        style={{
          marginTop: 'auto',
          padding: 10,
          backgroundColor: '#0D0F17',
          borderTop: `1px solid ${THEME.colors.border}`,
          fontSize: 11,
          fontFamily: THEME.typography.fontMono,
        }}
      >
        <div style={{ color: THEME.colors.emerald, marginBottom: 4 }}>
          ● Gate G2: Semantic Signoff PASS
        </div>
        <div style={{ color: THEME.colors.textDim }}>Target: jlcpcb_4l_7628</div>
        <div style={{ color: THEME.colors.textDim }}>Mode: L3_GATE_COPILOT</div>
      </div>
    </div>
  );
};
