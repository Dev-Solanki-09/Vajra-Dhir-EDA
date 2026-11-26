import React, { useEffect, useState } from 'react';
import { FabPresetInfo, usePolishStore } from '../store/usePolishStore';

interface ToolEntry {
  id: string;
  name: string;
  status: string;
  version: string;
  install_hint: string;
}

export const PolishToolsModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const activeFabPresetId = usePolishStore((s) => s.activeFabPresetId);
  const activeFabPreset = usePolishStore((s) => s.activeFabPreset);
  const selectFabPreset = usePolishStore((s) => s.selectFabPreset);

  const [tools, setTools] = useState<ToolEntry[]>([]);
  const [presets, setPresets] = useState<FabPresetInfo[]>([]);
  const [spiceBlocks, setSpiceBlocks] = useState<Array<{ refdes: string; fidelity_badge: string; model: string }>>([]);

  useEffect(() => {
    if (!open) return;
    fetch('/api/v1/polish/tools')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.tools) setTools(d.tools);
      })
      .catch(() => {});
    fetch('/api/v1/polish/fab-presets')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.presets) setPresets(d.presets);
      })
      .catch(() => {});
    fetch('/api/v1/polish/spice-fallback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.blocks) setSpiceBlocks(d.blocks);
      })
      .catch(() => {});
  }, [open]);

  if (!open) return null;

  const imp = activeFabPreset?.impedance_targets;

  return (
    <div className="vd-modal-backdrop" role="dialog" aria-modal="true" aria-label="Tool Manager & Fab Presets">
      <div className="vd-modal-panel" data-testid="polish-tools-modal" style={{ maxWidth: 680, width: '92vw', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <strong>Production Polish: Tool Manager, Fab Stackups & SPICE Fidelity</strong>
          <button type="button" className="vd-btn" onClick={onClose}>Close</button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div className="vd-metric" style={{ fontSize: 12, marginBottom: 6, fontWeight: 600 }}>
            India + Global Fab & Controlled Impedance Presets
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                data-testid={`fab-preset-${p.id}`}
                className={`vd-btn ${activeFabPresetId === p.id ? 'vd-btn-primary' : ''}`}
                style={{ fontSize: 11 }}
                onClick={() => void selectFabPreset(p.id)}
              >
                {p.name}
              </button>
            ))}
          </div>
          {activeFabPreset && imp && (
            <div data-testid="fab-preset-readout" className="vd-metric" style={{ padding: 8, backgroundColor: 'var(--vd-bg-canvas)', borderRadius: 4, fontSize: 11 }}>
              DRC Min Trace/Space: {activeFabPreset.min_trace_mm} mm | Min Drill: {activeFabPreset.min_drill_mm} mm |
              Impedance 50Ω SE: {imp['50_ohm_se_mm']} mm | 90Ω USB Diff: {imp['90_ohm_usb_diff_mm']} mm | 100Ω Diff: {imp['100_ohm_diff_mm']} mm
            </div>
          )}
        </div>

        <div style={{ marginBottom: 14 }}>
          <div className="vd-metric" style={{ fontSize: 12, marginBottom: 6, fontWeight: 600 }}>
            Zero-Terminal Toolchain Status (Offline Safe)
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <tbody>
              {tools.map((t) => (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--vd-border-subtle)' }}>
                  <td style={{ padding: '4px 6px' }}>{t.name}</td>
                  <td className="vd-metric" style={{ padding: '4px 6px', color: t.status === 'Ready' ? '#6ee7b7' : '#FBBF24' }}>{t.status}</td>
                  <td className="vd-metric" style={{ padding: '4px 6px', color: 'var(--vd-text-secondary)' }}>{t.version}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <div className="vd-metric" style={{ fontSize: 12, marginBottom: 6, fontWeight: 600 }}>
            3-Tier SPICE Behavioral Fallback Fidelity
          </div>
          {spiceBlocks.slice(0, 6).map((b) => (
            <div key={b.refdes} className="vd-metric" style={{ fontSize: 11, padding: '3px 0', color: 'var(--vd-text-secondary)' }}>
              <span style={{ color: '#93C5FD' }}>{b.refdes}</span> [{b.fidelity_badge}] — {b.model}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
