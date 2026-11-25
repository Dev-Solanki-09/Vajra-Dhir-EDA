import React, { useEffect, useState } from 'react';
import { globalCrossProbeBus } from '@vajradhir/crossprobe-bus';
import { globalIdeWorkspaceStore } from '../ideFileStore';
import { globalKiCadSyncStore } from '../kicadSyncClient';
import { UplotScope } from './UplotScope';

export interface KgPartItem {
  lcsc_id: string;
  mpn: string;
  manufacturer: string;
  category: string;
  package: string;
  description: string;
  feeder_type: string;
  stock_qty: number;
  price_usd: number;
  v_max: number;
  i_max_a: number;
  c_nom_uf?: number | null;
  l_nom_uh?: number | null;
  c_eff_uf_at_vbias?: number | null;
  derating_pct_at_vbias?: number | null;
  footprint_ref: string;
  step_model_ref: string;
  is_module: boolean;
}

export interface KgPartDetails extends KgPartItem {
  mlcc_dcbias_curve: Array<{ v_dc: number; c_eff_uf: number; c_nom_uf: number; derating_pct: number }>;
  inductor_isat_curve: Array<{ i_dc_a: number; l_eff_uh: number; l_nom_uh: number; temp_rise_c: number }>;
  mosfet_curve: Array<{ v_gs_v: number; rds_on_mohm: number; id_max_a: number }>;
  effective_at_v_bias?: { v_dc: number; c_eff_uf: number; c_nom_uf: number; derating_pct: number } | null;
}

export interface ComponentLibraryPanelProps {
  onPartPlaced?: (info: { refdes: string; mpn: string; lcsc_id: string }) => void;
}

export const ComponentLibraryPanel: React.FC<ComponentLibraryPanelProps> = ({ onPartPlaced }) => {
  const [query, setQuery] = useState('22uF');
  const [category, setCategory] = useState('All');
  const [basicOnly, setBasicOnly] = useState(false);
  const [vBias, setVBias] = useState(12.0);
  const [results, setResults] = useState<KgPartItem[]>([]);
  const [selectedDetails, setSelectedDetails] = useState<KgPartDetails | null>(null);
  const [statusMsg, setStatusMsg] = useState('DuckDB Offline Catalog ready (500+ parts)');

  const runSearch = async (qStr = query, cat = category, bOnly = basicOnly, bias = vBias) => {
    try {
      const params = new URLSearchParams({
        q: qStr,
        category: cat,
        basic_only: bOnly ? '1' : '0',
        v_bias: String(bias),
        limit: '25',
      });
      const res = await fetch(`/api/v1/parts/search?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      const items = Array.isArray(data.results) ? (data.results as KgPartItem[]) : [];
      setResults(items);
      if (items.length > 0) {
        void loadDetails(items[0].lcsc_id, bias);
      }
    } catch {
      setStatusMsg('DuckDB Knowledge Graph offline (daemon unreachable)');
    }
  };

  const loadDetails = async (lcscOrMpn: string, bias = vBias) => {
    try {
      const res = await fetch(`/api/v1/parts/${encodeURIComponent(lcscOrMpn)}/details?v_bias=${bias}`);
      if (!res.ok) return;
      const det = (await res.json()) as KgPartDetails;
      setSelectedDetails(det);
    } catch {
      /* offline */
    }
  };

  useEffect(() => {
    void runSearch(query, category, basicOnly, vBias);
  }, [query, category, basicOnly, vBias]);

  const handleImportAndPlace = async (part: KgPartItem) => {
    setStatusMsg(`Importing ${part.lcsc_id} (${part.mpn}) -> sym/fp/STEP...`);
    try {
      const res = await fetch(`/api/v1/parts/${encodeURIComponent(part.lcsc_id)}/import-assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ place: true, v_bias: vBias }),
      });
      if (!res.ok) {
        setStatusMsg(`Import failed: HTTP ${res.status}`);
        return;
      }
      const data = await res.json();
      const refdes = String(data.placed_refdes || '');
      setStatusMsg(
        `Imported ${part.lcsc_id} (${part.mpn}) -> ${refdes} · ${data.footprint_path} & bound in main.ato`
      );
      if (refdes) {
        globalCrossProbeBus.select([refdes], 'schematic');
        onPartPlaced?.({ refdes, mpn: part.mpn, lcsc_id: part.lcsc_id });
      }
      await globalIdeWorkspaceStore.refreshTree();
      await globalIdeWorkspaceStore.openFile('elec/src/main.ato', true);
      await globalKiCadSyncStore.fetchFiles();
    } catch {
      setStatusMsg('Import failed (daemon offline)');
    }
  };

  const hasMlccCurve = (selectedDetails?.mlcc_dcbias_curve?.length ?? 0) > 1;
  const hasIndCurve = (selectedDetails?.inductor_isat_curve?.length ?? 0) > 1;

  return (
    <div
      data-testid="component-library-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 10,
        backgroundColor: '#0B0E14',
        border: '1px solid var(--vd-border-subtle)',
        borderRadius: 6,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <input
          type="text"
          data-testid="kg-search-input"
          aria-label="Search DuckDB component catalog"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search LCSC / MPN (22uF, TPS54302, SWPA, RPI)..."
          style={{
            flex: 1,
            minWidth: 200,
            padding: '5px 8px',
            backgroundColor: 'var(--vd-bg-panel)',
            color: 'var(--vd-text-primary)',
            border: '1px solid var(--vd-border-subtle)',
            borderRadius: 4,
            fontSize: 12,
          }}
        />
        <select
          aria-label="Part Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={{
            padding: '4px 6px',
            backgroundColor: 'var(--vd-bg-panel)',
            color: 'var(--vd-text-primary)',
            border: '1px solid var(--vd-border-subtle)',
            borderRadius: 4,
            fontSize: 11,
          }}
        >
          {['All', 'Capacitor', 'Inductor', 'Resistor', 'Regulator', 'MCU', 'Module', 'SBC_Header', 'MOSFET'].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label className="vd-metric" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
          <input
            type="checkbox"
            checked={basicOnly}
            onChange={(e) => setBasicOnly(e.target.checked)}
          />
          Basic Only ($0 feeder)
        </label>
        <label className="vd-metric" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
          DC Bias (V):
          <input
            type="number"
            step="0.5"
            aria-label="Operating DC Bias Voltage"
            value={vBias}
            onChange={(e) => setVBias(Math.max(0, Number(e.target.value) || 0))}
            style={{
              width: 54,
              padding: '3px 5px',
              backgroundColor: 'var(--vd-bg-panel)',
              color: 'var(--vd-text-primary)',
              border: '1px solid var(--vd-border-subtle)',
              borderRadius: 4,
              fontSize: 11,
            }}
          />
        </label>
      </div>

      <div data-testid="kg-status-banner" className="vd-metric" style={{ fontSize: 11, color: 'var(--vd-border-active)' }}>
        {statusMsg}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 10 }}>
        {/* Left: Parametric Results Table */}
        <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--vd-border-subtle)', borderRadius: 4 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }} className="vd-metric">
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--vd-text-secondary)', borderBottom: '1px solid var(--vd-border-subtle)' }}>
                <th style={{ padding: '5px 6px' }}>LCSC / MPN</th>
                <th style={{ padding: '5px 6px' }}>Pkg</th>
                <th style={{ padding: '5px 6px' }}>Tier / Stock</th>
                <th style={{ padding: '5px 6px' }}>Derating @ {vBias}V</th>
                <th style={{ padding: '5px 6px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {results.map((item) => {
                const isSel = selectedDetails?.lcsc_id === item.lcsc_id;
                return (
                  <tr
                    key={item.lcsc_id}
                    data-testid={`kg-row-${item.mpn}`}
                    onClick={() => void loadDetails(item.lcsc_id)}
                    style={{
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--vd-border-subtle)',
                      backgroundColor: isSel ? 'rgba(56, 189, 248, 0.12)' : undefined,
                    }}
                  >
                    <td style={{ padding: '5px 6px' }}>
                      <strong>{item.mpn}</strong>
                      <div style={{ fontSize: 10, color: 'var(--vd-text-secondary)' }}>{item.lcsc_id} · ${item.price_usd.toFixed(3)}</div>
                    </td>
                    <td style={{ padding: '5px 6px' }}>{item.package}</td>
                    <td style={{ padding: '5px 6px', color: item.feeder_type === 'Basic' ? 'var(--vd-pass)' : 'var(--vd-warn)' }}>
                      {item.feeder_type} ({item.stock_qty.toLocaleString()})
                    </td>
                    <td style={{ padding: '5px 6px' }}>
                      {typeof item.c_eff_uf_at_vbias === 'number'
                        ? `${item.c_eff_uf_at_vbias} uF (${item.derating_pct_at_vbias}%)`
                        : `${item.category} (${item.v_max}V)`}
                    </td>
                    <td style={{ padding: '5px 6px' }}>
                      <button
                        type="button"
                        data-testid={`kg-import-${item.mpn}`}
                        className="vd-btn vd-btn-primary"
                        style={{ minHeight: 20, padding: '2px 6px', fontSize: 10 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleImportAndPlace(item);
                        }}
                      >
                        Import + Place
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Right: Non-Linear Physics Curve (uPlot) + Import Selected Card */}
        <div
          data-testid="kg-details-card"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: 8,
            backgroundColor: 'var(--vd-bg-panel)',
            border: '1px solid var(--vd-border-subtle)',
            borderRadius: 4,
          }}
        >
          {selectedDetails ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="vd-metric">
                <strong>{selectedDetails.mpn} ({selectedDetails.lcsc_id})</strong>
                <button
                  type="button"
                  data-testid="kg-import-place-btn"
                  className="vd-btn vd-btn-primary"
                  style={{ minHeight: 22, padding: '2px 8px', fontSize: 10 }}
                  onClick={() => void handleImportAndPlace(selectedDetails)}
                >
                  Import Symbol + Footprint + STEP &amp; Place
                </button>
              </div>
              <div className="vd-metric" style={{ fontSize: 10, color: 'var(--vd-text-secondary)' }}>
                {selectedDetails.description} · {selectedDetails.footprint_ref}
              </div>
              {selectedDetails.effective_at_v_bias && (
                <div data-testid="kg-effective-derating" className="vd-metric" style={{ fontSize: 11, color: 'var(--vd-warn)' }}>
                  Nominal {selectedDetails.effective_at_v_bias.c_nom_uf} uF → Effective at {selectedDetails.effective_at_v_bias.v_dc}V:{' '}
                  <strong>{selectedDetails.effective_at_v_bias.c_eff_uf} uF</strong> ({selectedDetails.effective_at_v_bias.derating_pct}%)
                </div>
              )}
              {hasMlccCurve && (
                <UplotScope
                  title="MLCC Capacitance vs DC Bias (uF)"
                  xLabel="V_DC (V)"
                  seriesLabel="C_eff (uF)"
                  xValues={selectedDetails.mlcc_dcbias_curve.map((pt) => pt.v_dc)}
                  yValues={selectedDetails.mlcc_dcbias_curve.map((pt) => pt.c_eff_uf)}
                  strokeColor="#38BDF8"
                />
              )}
              {!hasMlccCurve && hasIndCurve && (
                <UplotScope
                  title="Inductor L_eff vs DC Current (uH)"
                  xLabel="I_DC (A)"
                  seriesLabel="L_eff (uH)"
                  xValues={selectedDetails.inductor_isat_curve.map((pt) => pt.i_dc_a)}
                  yValues={selectedDetails.inductor_isat_curve.map((pt) => pt.l_eff_uh)}
                  strokeColor="#F59E0B"
                />
              )}
            </>
          ) : (
            <div className="vd-metric" style={{ fontSize: 11 }}>Select a component row to inspect derating curve &amp; KiCad assets.</div>
          )}
        </div>
      </div>
    </div>
  );
};
