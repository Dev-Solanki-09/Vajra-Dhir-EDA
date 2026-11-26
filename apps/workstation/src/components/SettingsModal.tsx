import React, { useState } from 'react';
import { VajraIcon } from './VajraIcons';

const CATEGORIES = [
  'General',
  'Keybindings',
  'PCB & Units',
  'Schematic',
  '3D & WebGL',
  'Simulation',
  'Fab & Compliance',
  'Agent & DLP',
  'Plugins & MCP',
] as const;

type CategoryId = (typeof CATEGORIES)[number];

export const SettingsModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [cat, setCat] = useState<CategoryId>('General');
  const [autosaveSec, setAutosaveSec] = useState(5);
  const [snapGridMm, setSnapGridMm] = useState(0.5);
  const [dlpMode, setDlpMode] = useState('NDA_AIRGAPPED');

  if (!open) return null;

  return (
    <div
      className="vd-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Workstation Settings"
      data-testid="settings-modal"
    >
      <div
        className="vd-modal-panel"
        style={{ maxWidth: 720, width: '92vw', height: 420, display: 'grid', gridTemplateColumns: '190px 1fr', padding: 0, overflow: 'hidden' }}
      >
        <nav style={{ backgroundColor: '#141416', borderRight: '1px solid #2A2A2F', padding: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 600, padding: '4px 8px', color: '#F4F4F5', display: 'flex', alignItems: 'center', gap: 6 }}>
            <VajraIcon name="settings" size={14} /> Settings
          </div>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              data-testid={`settings-cat-${c.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
              className={`vd-btn ${cat === c ? 'vd-btn-primary' : ''}`}
              style={{ justifyContent: 'flex-start', minHeight: 26, fontSize: 11, padding: '2px 8px' }}
              onClick={() => setCat(c)}
            >
              {c}
            </button>
          ))}
        </nav>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', backgroundColor: '#1C1C1F' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <strong style={{ fontSize: 14 }}>{cat}</strong>
              <button type="button" data-testid="settings-close-btn" className="vd-btn" onClick={onClose}>Close</button>
            </div>

            {cat === 'General' && (
              <div style={{ display: 'grid', gap: 10, fontSize: 12 }}>
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Autosave Journal Interval (s)</span>
                  <input type="number" value={autosaveSec} onChange={(e) => setAutosaveSec(Number(e.target.value))} className="vd-metric" style={{ width: 64 }} />
                </label>
                <div className="vd-metric" style={{ fontSize: 11, color: '#A1A1AA' }}>Theme: Matte Industrial Precision (#141416 / #1C1C1F · Zero Gradients)</div>
              </div>
            )}

            {cat === 'PCB & Units' && (
              <div style={{ display: 'grid', gap: 10, fontSize: 12 }}>
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Magnetic Grid Snap (mm)</span>
                  <input type="number" step={0.1} value={snapGridMm} onChange={(e) => setSnapGridMm(Number(e.target.value))} className="vd-metric" style={{ width: 64 }} />
                </label>
                <div className="vd-metric" style={{ fontSize: 11, color: '#A1A1AA' }}>Internal Storage: Signed i64 nanometers + i32 millidegrees</div>
              </div>
            )}

            {cat === 'Agent & DLP' && (
              <div style={{ display: 'grid', gap: 10, fontSize: 12 }}>
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>hw-dlp Airgap Profile</span>
                  <select value={dlpMode} onChange={(e) => setDlpMode(e.target.value)} className="vd-metric" style={{ backgroundColor: '#141416', color: '#F4F4F5', padding: 4 }}>
                    <option value="NDA_AIRGAPPED">NDA_AIRGAPPED (Loopback Only)</option>
                    <option value="PRIVATE_CLOUD_OK">PRIVATE_CLOUD_OK</option>
                    <option value="PUBLIC_OPEN">PUBLIC_OPEN</option>
                  </select>
                </label>
                <div className="vd-metric" style={{ fontSize: 11, color: '#06B6D4' }}>Gate 8 Human Cryptographic Signoff: Always Fail-Closed</div>
              </div>
            )}

            {cat !== 'General' && cat !== 'PCB & Units' && cat !== 'Agent & DLP' && (
              <div className="vd-metric" style={{ fontSize: 12, color: '#A1A1AA' }}>
                Configured deterministically for {cat} under Ring-1 offline sandbox discipline.
              </div>
            )}
          </div>

          <div className="vd-metric" style={{ fontSize: 11, color: '#71717A' }}>
            Preferences persisted deterministically for current studio session.
          </div>
        </div>
      </div>
    </div>
  );
};
