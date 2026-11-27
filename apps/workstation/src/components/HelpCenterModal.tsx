import React, { useEffect, useState } from 'react';
import { VajraIcon } from './VajraIcons';

type HelpTab = 'tour' | 'guides' | 'glossary' | 'faq' | 'doctor';

const GLOSSARY_ITEMS = [
  { term: 'DRC (Design Rule Check)', plain: 'Verifies physical PCB trace clearance, courtyard spacing, and board boundary margins before fabrication.' },
  { term: 'ERC (Electrical Rules Check)', plain: 'Verifies connected pins, floating nets, power domain compatibility, and open-drain I2C pull-ups.' },
  { term: 'MLCC DC-Bias Derating', plain: 'High-K ceramics (X5R/X7R) lose 40%–70% capacitance under DC voltage. Always check effective uF at rail bias.' },
  { term: 'Bode Phase Margin (PM)', plain: 'Measures regulator stability headroom (>= 45° avoids ringing or oscillation during load transients).' },
  { term: 'IPC-2152 Copper Ampacity', plain: 'Calculates safe trace width for a given current and copper thickness so temperature rise stays bounded.' },
  { term: 'Human Lock (L)', plain: 'Marks critical parts/traces as immutable so automated tools render proposals as violet ghosts instead of overwriting.' },
];

const QUICK_TOUR_STEPS = [
  { step: 1, title: 'Create or Open a Project', detail: 'Start cleanly from Home -> New Project (Blank 2L/4L or Starter). Your folder stays cleanly organized under elec/, layout/, schematics/, and sim/.' },
  { step: 2, title: 'Capture Schematic & Smart Blocks', detail: 'Drag directly from pin to pin to draw orthogonal nets, move symbols with rubber-band wires, or drop verified Smart Blocks.' },
  { step: 3, title: 'Lay Out & Route PCB', detail: 'Press G to grab/align parts, L to lock critical placements, X for 45° copper traces, V mid-route for a layer via, and B for copper pour.' },
  { step: 4, title: 'Verify & Run SPICE Lab', detail: 'Press F5 (Verify) or Ctrl+` (Diagnostics) to inspect live ERC/DRC/Physics findings, click rows to zoom, or toggle Schematic X-Ray in SPICE Lab.' },
  { step: 5, title: 'Generate Manufacturing & Bring-Up Bundle', detail: 'Export Gerbers & IPC-2581 in Make, sign off Human Gate-8, and verify rail test points in the Bring-Up Companion.' },
];

export const HelpCenterModal: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  const [tab, setTab] = useState<HelpTab>('tour');
  const [tourIdx, setTourIdx] = useState(0);
  const [doctor, setDoctor] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!open || tab !== 'doctor') return;
    void fetch('/api/doctor')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setDoctor(d);
      })
      .catch(() => setDoctor({ offline: true }));
  }, [open, tab]);

  if (!open) return null;

  return (
    <div className="vd-modal-backdrop" role="dialog" aria-modal="true" aria-label="Offline Help Center" data-testid="help-center-modal" style={{ zIndex: 95 }}>
      <div
        className="vd-modal"
        style={{
          width: 'min(760px, 92vw)',
          maxHeight: '84vh',
          display: 'grid',
          gridTemplateRows: '40px 36px 1fr',
          backgroundColor: 'var(--vd-bg-panel)',
          border: '1px solid var(--vd-border-strong)',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 12px', backgroundColor: 'var(--vd-bg-elevated)', borderBottom: '1px solid var(--vd-border-subtle)' }}>
          <strong style={{ fontSize: 12.5 }}>Help Center &amp; Offline Documentation (F1)</strong>
          <button type="button" className="vd-btn vd-btn-icon" onClick={onClose} title="Close (Escape)">
            <VajraIcon name="close" size={12} />
          </button>
        </header>

        <div style={{ display: 'flex', gap: 4, padding: '6px 12px', borderBottom: '1px solid var(--vd-border-subtle)', backgroundColor: 'var(--vd-bg-workbench)' }}>
          {([
            ['tour', 'Quick Tour (3 min)'],
            ['guides', 'Design Guides'],
            ['glossary', 'EE Glossary'],
            ['faq', 'FAQ & Keys'],
            ['doctor', 'System Doctor'],
          ] as Array<[HelpTab, string]>).map(([id, label]) => (
            <button key={id} type="button" data-testid={`help-tab-${id}`} className={`vd-btn ${tab === id ? 'vd-btn-primary' : ''}`} style={{ minHeight: 22, fontSize: 11 }} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ padding: 14, overflowY: 'auto', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tab === 'tour' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ padding: 12, backgroundColor: 'var(--vd-bg-canvas)', border: '1px solid var(--vd-border-subtle)', borderRadius: 4 }}>
                <div className="vd-metric" style={{ color: '#3D7EC7', marginBottom: 4 }}>
                  Step {QUICK_TOUR_STEPS[tourIdx].step} of {QUICK_TOUR_STEPS.length}
                </div>
                <strong style={{ fontSize: 13 }}>{QUICK_TOUR_STEPS[tourIdx].title}</strong>
                <p style={{ marginTop: 6, color: 'var(--vd-text-secondary)', lineHeight: 1.5 }}>{QUICK_TOUR_STEPS[tourIdx].detail}</p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button type="button" className="vd-btn" disabled={tourIdx === 0} onClick={() => setTourIdx((i) => Math.max(0, i - 1))}>
                  Previous
                </button>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="vd-btn" onClick={onClose}>Skip Tour</button>
                  {tourIdx < QUICK_TOUR_STEPS.length - 1 ? (
                    <button type="button" className="vd-btn vd-btn-primary" onClick={() => setTourIdx((i) => i + 1)}>Next Step</button>
                  ) : (
                    <button type="button" className="vd-btn vd-btn-primary" onClick={onClose}>Done</button>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'guides' && (
            <div style={{ display: 'grid', gap: 8 }}>
              {[
                ['01. First Board in 30 Minutes', 'docs/guides/01-first-board-30-minutes.md', 'Blank project setup, Smart Blocks, layout, SPICE verification, and fab release.'],
                ['02. Schematic & Hardware Code', 'docs/guides/02-schematic-and-atopile.md', 'Direct pin wiring, rubber-band drags, Alt measurements, and synchronized .ato modules.'],
                ['03. PCB Layout & Routing', 'docs/guides/03-pcb-layout-and-routing.md', '45° routing (X), vias (V), copper refill (B), alignment guides, and Human Locks (L).'],
                ['04. Verifier & SPICE Lab', 'docs/guides/04-verification-and-spice-lab.md', 'ERC, spatial DRC, DC-bias derating, Bode phase margin, Schematic X-Ray & PI Heatmap.'],
                ['05. Manufacturing & Bring-Up', 'docs/guides/05-manufacturing-and-bringup.md', 'Gerber staleness detection, IPC-2581 check, Human Gate-8, and WebSerial bring-up.'],
                ['06. AI Co-Designer (BYOK / Offline)', 'docs/guides/06-ai-agent-and-mcp.md', 'Keychain/Vault API keys, airgap rules, @context tags, and Git+DB checkpoints (/rollback).'],
              ].map(([title, path, desc]) => (
                <div key={path} style={{ padding: 10, backgroundColor: 'var(--vd-bg-canvas)', border: '1px solid var(--vd-border-subtle)', borderRadius: 4 }}>
                  <strong>{title}</strong>
                  <div className="vd-metric" style={{ fontSize: 10.5, color: '#3D7EC7', margin: '2px 0 4px' }}>{path}</div>
                  <div style={{ color: 'var(--vd-text-secondary)', fontSize: 11.5 }}>{desc}</div>
                </div>
              ))}
            </div>
          )}

          {tab === 'glossary' && (
            <div style={{ display: 'grid', gap: 8 }}>
              {GLOSSARY_ITEMS.map((g) => (
                <div key={g.term} style={{ padding: 10, backgroundColor: 'var(--vd-bg-canvas)', border: '1px solid var(--vd-border-subtle)', borderRadius: 4 }}>
                  <strong>{g.term}</strong>
                  <div style={{ color: 'var(--vd-text-secondary)', fontSize: 11.5, marginTop: 4 }}>{g.plain}</div>
                </div>
              ))}
            </div>
          )}

          {tab === 'faq' && (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ padding: 10, backgroundColor: 'var(--vd-bg-canvas)', border: '1px solid var(--vd-border-subtle)', borderRadius: 4 }}>
                <strong>Offline Documentation Files</strong>
                <div style={{ color: 'var(--vd-text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
                  Full reference guides are bundled offline in <code>docs/FAQ.md</code>, <code>docs/TROUBLESHOOTING.md</code>, <code>docs/KEYMAP.md</code>, and <code>docs/PACKS_AND_STORAGE.md</code>.
                </div>
              </div>
              <div style={{ padding: 10, backgroundColor: 'var(--vd-bg-canvas)', border: '1px solid var(--vd-border-subtle)', borderRadius: 4 }}>
                <strong>Core Canvas Controls</strong>
                <div className="vd-metric" style={{ color: 'var(--vd-text-secondary)', marginTop: 4 }}>
                  Wheel: Zoom at cursor · Space+Drag / Middle: Pan · F / Home: Fit · G: Move · R: Rotate · L: Lock · X: Route 45° · V: Via · B: Refill Pour · Alt+Hover: Redline Measure
                </div>
              </div>
            </div>
          )}

          {tab === 'doctor' && (
            <pre className="vd-metric" style={{ margin: 0, padding: 10, backgroundColor: 'var(--vd-bg-canvas)', border: '1px solid var(--vd-border-subtle)', borderRadius: 4, fontSize: 11, overflowX: 'auto' }}>
              {doctor ? JSON.stringify(doctor, null, 2) : 'Running System Doctor diagnostics...'}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};
