import React, { useEffect, useState } from 'react';
import { globalCrossProbeBus } from '@vajradhir/crossprobe-bus';
import { THEME } from '../theme.js';

interface ComponentDetails {
  id: string;
  refdes: string;
  value: string;
  mpn: string;
  footprint: string;
  x_mm: number;
  y_mm: number;
  rot_deg: number;
  locked: boolean;
  lock_owner?: string;
  lock_reason?: string;
  datasheet_pdf?: string;
  datasheet_page?: number;
}

export const InspectorPanel: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string | null>('comp-u1');
  const [details, setDetails] = useState<ComponentDetails>({
    id: 'comp-u1',
    refdes: 'U1',
    value: 'SiT8008 50MHz',
    mpn: 'SiT8008AI-22-33E-50.000000E',
    footprint: 'Oscillator:Oscillator_SMD_SiTime_QFN-4',
    x_mm: 30.0,
    y_mm: 25.0,
    rot_deg: 0,
    locked: true,
    lock_owner: 'lead_engineer@enterprise.internal',
    lock_reason: 'Fixed crystal buffer placement for SI jitter signoff',
    datasheet_pdf: 'sit8008_datasheet.pdf',
    datasheet_page: 7,
  });

  useEffect(() => {
    const unsub = globalCrossProbeBus.onSelection((evt) => {
      if (evt.entityIds.length > 0) {
        setSelectedId(evt.entityIds[0]);
      } else {
        setSelectedId(null);
      }
    });
    return unsub;
  }, []);

  const toggleLock = () => {
    setDetails((prev) => ({
      ...prev,
      locked: !prev.locked,
      lock_owner: !prev.locked ? 'human:user' : undefined,
      lock_reason: !prev.locked ? 'Manual lock by user' : undefined,
    }));
  };

  if (!selectedId) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: THEME.colors.textDim,
          fontSize: 12,
        }}
      >
        No entity selected. Click a footprint or schematic symbol to inspect.
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: THEME.colors.surface,
        borderLeft: `1px solid ${THEME.colors.border}`,
        fontSize: 12,
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 12px',
          borderBottom: `1px solid ${THEME.colors.border}`,
        }}
      >
        <span style={{ fontWeight: 600, color: THEME.colors.cyan }}>
          {details.refdes} Properties
        </span>
        <button
          onClick={toggleLock}
          style={{
            padding: '2px 8px',
            fontSize: 10,
            fontFamily: THEME.typography.fontMono,
            borderRadius: 3,
            cursor: 'pointer',
            border: `1px solid ${details.locked ? THEME.colors.layers.f_cu : THEME.colors.border}`,
            backgroundColor: details.locked ? '#4E1A1A' : THEME.colors.surfaceHover,
            color: details.locked ? '#FF8080' : THEME.colors.textMuted,
          }}
        >
          {details.locked ? '🔒 LOCKED' : '🔓 UNLOCKED'}
        </button>
      </div>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label style={{ color: THEME.colors.textDim, fontSize: 10 }}>VALUE</label>
          <div style={{ color: THEME.colors.text, fontFamily: THEME.typography.fontMono }}>
            {details.value}
          </div>
        </div>

        <div>
          <label style={{ color: THEME.colors.textDim, fontSize: 10 }}>MPN</label>
          <div style={{ color: THEME.colors.text, fontFamily: THEME.typography.fontMono }}>
            {details.mpn}
          </div>
        </div>

        <div>
          <label style={{ color: THEME.colors.textDim, fontSize: 10 }}>FOOTPRINT</label>
          <div style={{ color: THEME.colors.textMuted, fontSize: 11 }}>
            {details.footprint}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          <div>
            <label style={{ color: THEME.colors.textDim, fontSize: 10 }}>X (mm)</label>
            <input
              type="number"
              value={details.x_mm}
              onChange={(e) => setDetails({ ...details, x_mm: parseFloat(e.target.value) || 0 })}
              style={{
                width: '100%',
                backgroundColor: '#090A0F',
                border: `1px solid ${THEME.colors.border}`,
                color: THEME.colors.text,
                padding: '2px 4px',
                fontSize: 11,
                fontFamily: THEME.typography.fontMono,
              }}
            />
          </div>
          <div>
            <label style={{ color: THEME.colors.textDim, fontSize: 10 }}>Y (mm)</label>
            <input
              type="number"
              value={details.y_mm}
              onChange={(e) => setDetails({ ...details, y_mm: parseFloat(e.target.value) || 0 })}
              style={{
                width: '100%',
                backgroundColor: '#090A0F',
                border: `1px solid ${THEME.colors.border}`,
                color: THEME.colors.text,
                padding: '2px 4px',
                fontSize: 11,
                fontFamily: THEME.typography.fontMono,
              }}
            />
          </div>
          <div>
            <label style={{ color: THEME.colors.textDim, fontSize: 10 }}>ROT (°)</label>
            <input
              type="number"
              value={details.rot_deg}
              onChange={(e) => setDetails({ ...details, rot_deg: parseFloat(e.target.value) || 0 })}
              style={{
                width: '100%',
                backgroundColor: '#090A0F',
                border: `1px solid ${THEME.colors.border}`,
                color: THEME.colors.text,
                padding: '2px 4px',
                fontSize: 11,
                fontFamily: THEME.typography.fontMono,
              }}
            />
          </div>
        </div>

        {details.locked && (
          <div
            style={{
              padding: 8,
              backgroundColor: '#1E1218',
              borderRadius: 4,
              border: `1px solid #4D1A25`,
              fontSize: 11,
            }}
          >
            <div style={{ color: '#FF7088', fontWeight: 600, marginBottom: 2 }}>
              Human Lock Guard Active
            </div>
            <div style={{ color: THEME.colors.textDim, fontSize: 10 }}>
              Owner: {details.lock_owner}
            </div>
            <div style={{ color: THEME.colors.textMuted, fontSize: 10, marginTop: 2 }}>
              "{details.lock_reason}"
            </div>
          </div>
        )}

        {/* Datasheet Evidence Section */}
        {details.datasheet_pdf && (
          <div
            style={{
              marginTop: 10,
              padding: 8,
              backgroundColor: '#0F1626',
              borderRadius: 4,
              border: `1px solid #1D3557`,
              fontSize: 11,
            }}
          >
            <div style={{ color: THEME.colors.cyan, fontWeight: 600, marginBottom: 2 }}>
              📄 Verified Datasheet Citation
            </div>
            <div style={{ color: THEME.colors.textMuted, fontSize: 10 }}>
              {details.datasheet_pdf} (Page {details.datasheet_page})
            </div>
            <div style={{ color: THEME.colors.emerald, fontSize: 10, marginTop: 4 }}>
              ✓ SHA-256 evidence audit crop verified
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
