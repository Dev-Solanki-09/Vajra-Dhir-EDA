import React, { useEffect, useMemo, useState } from 'react';
import { globalCrossProbeBus } from '@vajradhir/crossprobe-bus';
import { globalIdeWorkspaceStore } from '../ideFileStore';
import { useDesignStore } from '../store/useDesignStore';
import { globalSpiceOverlayStore } from '../spiceSimStore';
import { VajraIcon, VajraIconName } from './VajraIcons';

export type StudioRailTab = 'parts' | 'blocks' | 'modules' | 'outliner' | 'files' | 'plugins';

interface StarterPartItem {
  mpn: string;
  category?: string;
  package?: string;
  value?: string;
  price_usd?: number;
  price_inr?: number;
  feeder_type?: string;
  description?: string;
}

interface CuboBlockItem {
  id: string;
  name: string;
  category?: string;
  summary?: string;
  specs?: string;
  ato_snippet?: string;
  member_refdes?: string[];
  rails?: string[];
}

interface SbcModuleItem {
  id: string;
  name: string;
  family?: string;
  board_mm?: number[];
  header_pins?: number;
  summary?: string;
}

interface PluginEntry {
  id: string;
  name?: string;
  version: string;
  runtime: string;
  ui_uri?: string;
  granted_capabilities?: string[];
}

export interface StudioOutlinerItem {
  refdes: string;
  detail: string;
  locked: boolean;
  hidden?: boolean;
  net: string;
}

export const StudioDrawerRail: React.FC<{
  activeTab: StudioRailTab | null;
  onSelectTab: (tab: StudioRailTab | null) => void;
  selectedRefdes: string;
  boardComponents: StudioOutlinerItem[];
  onToggleLock: (refdes: string) => void;
  onToggleHidden: (refdes: string) => void;
  onOpenContextMenu: (e: React.MouseEvent, refdes: string) => void;
  onStatusMessage: (msg: string) => void;
  onOpenCodeFile?: (path: string) => void;
  onOpenPluginUi?: (pluginId: string, uri: string) => void;
}> = ({
  activeTab,
  onSelectTab,
  selectedRefdes,
  boardComponents,
  onToggleLock,
  onToggleHidden,
  onOpenContextMenu,
  onStatusMessage,
  onOpenCodeFile,
  onOpenPluginUi,
}) => {
  const [query, setQuery] = useState('');
  const [parts, setParts] = useState<StarterPartItem[]>([]);
  const [cubos, setCubos] = useState<CuboBlockItem[]>([]);
  const [sbcs, setSbcs] = useState<SbcModuleItem[]>([]);
  const [files, setFiles] = useState<Array<{ path: string; name: string; kind: string }>>([]);
  const [plugins, setPlugins] = useState<PluginEntry[]>([]);
  const [outlinerFilter, setOutlinerFilter] = useState<'all' | 'locked'>('all');

  useEffect(() => {
    if (!activeTab) return;
    if (activeTab === 'parts' && parts.length === 0) {
      fetch('/api/v1/libraries/starter-parts?limit=60')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (Array.isArray(d?.parts)) setParts(d.parts);
        })
        .catch(() => {});
    } else if (activeTab === 'blocks' && cubos.length === 0) {
      fetch('/api/v1/libraries/cubos')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (Array.isArray(d?.cubos)) setCubos(d.cubos);
        })
        .catch(() => {});
    } else if (activeTab === 'modules' && sbcs.length === 0) {
      fetch('/api/v1/libraries/sbc-modules')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (Array.isArray(d?.modules)) setSbcs(d.modules);
        })
        .catch(() => {});
    } else if (activeTab === 'files') {
      fetch('/api/v1/fs/tree')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          const list = Array.isArray(d?.entries) ? d.entries : Array.isArray(d?.files) ? d.files : [];
          setFiles(list.filter((e: { kind?: string }) => !e.kind || e.kind === 'file'));
        })
        .catch(() => {});
    } else if (activeTab === 'plugins') {
      fetch('/api/v1/plugins')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (Array.isArray(d?.plugins)) setPlugins(d.plugins);
        })
        .catch(() => {});
    }
  }, [activeTab, parts.length, cubos.length, sbcs.length]);

  const railButtons: Array<{ id: StudioRailTab; label: string; icon: VajraIconName }> = [
    { id: 'parts', label: 'Parts', icon: 'cpuChip' },
    { id: 'blocks', label: 'Blocks', icon: 'planBlocks' },
    { id: 'modules', label: 'SBCs', icon: 'sbcBoard' },
    { id: 'outliner', label: 'Tree', icon: 'outlinerTree' },
    { id: 'files', label: 'Files', icon: 'folderTree' },
    { id: 'plugins', label: 'Plugins', icon: 'plugin' },
  ];

  const q = query.trim().toLowerCase();

  const filteredParts = useMemo(
    () =>
      parts
        .filter((p) => !q || p.mpn.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q))
        .slice(0, 40),
    [parts, q]
  );

  const filteredCubos = useMemo(
    () => cubos.filter((c) => !q || c.name.toLowerCase().includes(q) || (c.category || '').toLowerCase().includes(q)),
    [cubos, q]
  );

  const filteredSbcs = useMemo(
    () => sbcs.filter((s) => !q || s.name.toLowerCase().includes(q) || (s.family || '').toLowerCase().includes(q)),
    [sbcs, q]
  );

  const filteredOutliner = useMemo(
    () =>
      boardComponents.filter((c) => {
        if (outlinerFilter === 'locked' && !c.locked) return false;
        if (!q) return true;
        return c.refdes.toLowerCase().includes(q) || c.detail.toLowerCase().includes(q) || c.net.toLowerCase().includes(q);
      }),
    [boardComponents, outlinerFilter, q]
  );

  const filteredFiles = useMemo(
    () => files.filter((f) => !q || f.path.toLowerCase().includes(q) || f.name.toLowerCase().includes(q)).slice(0, 80),
    [files, q]
  );

  const placePart = async (part: StarterPartItem) => {
    const idx = Object.keys(useDesignStore.getState().entitiesByRefdes).length + 1;
    const refdes = `${part.category?.toLowerCase().includes('cap') ? 'C' : part.category?.toLowerCase().includes('res') ? 'R' : 'U'}${idx + 10}`;
    await useDesignStore.getState().commitTx(
      'studio-parts',
      [
        {
          op: 'ADD_COMPONENT',
          refdes,
          mpn: part.mpn,
          value: part.value || part.mpn,
          package: part.package || '0603',
          x_nm: (24 + (idx % 5) * 8) * 1_000_000,
          y_nm: (22 + Math.floor(idx / 5) * 8) * 1_000_000,
          sync_now: true,
        },
      ],
      `Place ${refdes} (${part.mpn})`,
      'human'
    );
    globalCrossProbeBus.select([refdes], 'tree');
    onStatusMessage(`Placed ${refdes} (${part.mpn})`);
  };

  const materializeBlock = async (block: CuboBlockItem) => {
    await useDesignStore.getState().commitTx(
      'studio-blocks',
      [
        {
          op: 'SYNC_PLAN_BLOCKS',
          blocks: [
            {
              id: block.id,
              name: block.name,
              role: block.category || 'module',
              memberRefdes: block.member_refdes?.length ? block.member_refdes : [`U_${block.id.slice(0, 5).toUpperCase()}`],
              mountingFootprint: 'Module',
            },
          ],
          buses: (block.rails || []).map((r) => ({ name: r, protocol: 'power', railVoltageV: 3.3 })),
        },
      ],
      `Insert Smart Block ${block.name}`,
      'human'
    );
    onStatusMessage(`Added Smart Block: ${block.name}`);
  };

  const insertSbcCarrier = async (sbc: SbcModuleItem) => {
    const refdes = `MOD_${sbc.id.slice(0, 6).toUpperCase()}`;
    await useDesignStore.getState().commitTx(
      'studio-sbcs',
      [
        {
          op: 'ADD_COMPONENT',
          refdes,
          mpn: sbc.name,
          value: sbc.name,
          package: `${sbc.header_pins || 40}-Pin Carrier`,
          footprint: 'Connector_PinHeader_2.54mm:PinHeader_2x20_P2.54mm_Vertical',
          functional_group: 'sbc_carrier',
          x_nm: 36_000_000,
          y_nm: 26_000_000,
          sync_now: true,
        },
      ],
      `Insert SBC carrier ${sbc.name}`,
      'human'
    );
    globalCrossProbeBus.select([refdes], 'tree');
    onStatusMessage(`Inserted carrier: ${sbc.name}`);
  };

  return (
    <div style={{ display: 'flex', height: '100%', flexShrink: 0 }} data-testid="canva-studio-host">
      {/* 48px Vertical Studio Rail */}
      <nav className="vd-studio-rail" data-testid="canva-studio-rail" aria-label="Object Studio Rail">
        {railButtons.map((btn) => {
          const active = activeTab === btn.id;
          return (
            <button
              key={btn.id}
              type="button"
              data-testid={`studio-rail-${btn.id}`}
              data-active={active}
              className="vd-studio-rail-btn"
              onClick={() => onSelectTab(active ? null : btn.id)}
              title={`${btn.label} Drawer`}
            >
              <VajraIcon name={btn.icon} size={15} />
              <span>{btn.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Single Collapsible 272px Drawer */}
      {activeTab && (
        <aside className="vd-studio-drawer" data-testid="canva-studio-drawer" aria-label={`${activeTab} drawer`}>
          <div className="vd-studio-drawer-header">
            <strong style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {railButtons.find((r) => r.id === activeTab)?.label}
            </strong>
            <button
              type="button"
              data-testid="studio-drawer-close"
              className="vd-btn vd-btn-icon"
              style={{ minHeight: 18 }}
              onClick={() => onSelectTab(null)}
              aria-label="Collapse drawer"
            >
              <VajraIcon name="close" size={11} />
            </button>
          </div>

          <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--vd-border-subtle)' }}>
            <input
              type="text"
              data-testid="studio-drawer-search"
              className="vd-input"
              style={{ width: '100%' }}
              placeholder={`Search ${activeTab}...`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="vd-studio-drawer-body vd-scroll-slim" data-testid="studio-drawer-scroll">
            {activeTab === 'parts' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {filteredParts.length === 0 ? (
                  <span className="vd-metric" style={{ color: 'var(--vd-text-muted)', fontSize: 11 }}>
                    No matching catalog parts loaded.
                  </span>
                ) : (
                  filteredParts.map((part) => (
                    <div
                      key={part.mpn}
                      className="vd-studio-card"
                      data-testid={`drawer-part-${part.mpn}`}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                        <strong className="vd-metric" style={{ fontSize: 11 }}>{part.mpn}</strong>
                        <button
                          type="button"
                          className="vd-btn vd-btn-primary"
                          style={{ minHeight: 18, padding: '1px 6px', fontSize: 10 }}
                          onClick={() => void placePart(part)}
                        >
                          Place
                        </button>
                      </div>
                      <div className="vd-metric" style={{ fontSize: 10, color: 'var(--vd-text-secondary)', marginTop: 2 }}>
                        {part.package || 'SMD'} · {part.value || part.category || 'Component'} · {part.feeder_type || 'Basic'}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'blocks' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {filteredCubos.map((blk) => (
                  <div key={blk.id} className="vd-studio-card" data-testid={`drawer-block-${blk.id}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                      <strong style={{ fontSize: 11 }}>{blk.name}</strong>
                      <button
                        type="button"
                        className="vd-btn vd-btn-primary"
                        style={{ minHeight: 18, padding: '1px 6px', fontSize: 10 }}
                        onClick={() => void materializeBlock(blk)}
                      >
                        Drop
                      </button>
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--vd-text-secondary)', marginTop: 2 }}>
                      {blk.summary || blk.specs || blk.category}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'modules' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {filteredSbcs.map((sbc) => (
                  <div key={sbc.id} className="vd-studio-card" data-testid={`drawer-sbc-${sbc.id}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                      <strong style={{ fontSize: 11 }}>{sbc.name}</strong>
                      <button
                        type="button"
                        className="vd-btn vd-btn-primary"
                        style={{ minHeight: 18, padding: '1px 6px', fontSize: 10 }}
                        onClick={() => void insertSbcCarrier(sbc)}
                      >
                        Mount
                      </button>
                    </div>
                    <div className="vd-metric" style={{ fontSize: 10, color: 'var(--vd-text-secondary)', marginTop: 2 }}>
                      {sbc.family || 'SBC'} · {sbc.header_pins || 40} pins
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'outliner' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      type="button"
                      className={`vd-btn ${outlinerFilter === 'all' ? 'vd-btn-primary' : ''}`}
                      style={{ minHeight: 18, fontSize: 10 }}
                      onClick={() => setOutlinerFilter('all')}
                    >
                      All ({boardComponents.length})
                    </button>
                    <button
                      type="button"
                      className={`vd-btn ${outlinerFilter === 'locked' ? 'vd-btn-primary' : ''}`}
                      style={{ minHeight: 18, fontSize: 10 }}
                      onClick={() => setOutlinerFilter('locked')}
                    >
                      Locked ({boardComponents.filter((c) => c.locked).length})
                    </button>
                  </div>
                  <button
                    type="button"
                    className="vd-btn"
                    style={{ minHeight: 18, fontSize: 10 }}
                    onClick={() => globalSpiceOverlayStore.update({ xrayEnabled: !globalSpiceOverlayStore.getSnapshot().xrayEnabled })}
                    title="Toggle Voltage & Thermal X-Ray"
                  >
                    X-Ray
                  </button>
                </div>

                {filteredOutliner.map((item) => {
                  const selected = selectedRefdes === item.refdes;
                  return (
                    <div
                      key={item.refdes}
                      className="vd-tree-row"
                      data-testid={`outliner-row-${item.refdes}`}
                      data-selected={selected}
                      onContextMenu={(e) => onOpenContextMenu(e, item.refdes)}
                    >
                      <button
                        type="button"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: item.hidden ? 'var(--vd-text-muted)' : 'var(--vd-text-primary)',
                          textAlign: 'left',
                          padding: 0,
                          cursor: 'pointer',
                          fontFamily: 'var(--vd-font-mono)',
                          fontSize: 11,
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        onClick={() => {
                          globalCrossProbeBus.select([item.refdes], 'tree');
                          globalCrossProbeBus.highlightNet(item.net, 'tree');
                        }}
                      >
                        {item.refdes} ({item.detail})
                      </button>
                      <span className="vd-row-actions">
                        <button
                          type="button"
                          data-testid={`outliner-lock-${item.refdes}`}
                          className="vd-btn vd-btn-icon"
                          style={{
                            minHeight: 18,
                            borderColor: 'transparent',
                            backgroundColor: 'transparent',
                            color: item.locked ? 'var(--vd-human-lock)' : 'var(--vd-text-muted)',
                          }}
                          onClick={() => onToggleLock(item.refdes)}
                          title={item.locked ? 'Unlock' : 'Lock'}
                        >
                          <VajraIcon name={item.locked ? 'lockClosed' : 'lockOpen'} size={11} />
                        </button>
                        <button
                          type="button"
                          data-testid={`outliner-eye-${item.refdes}`}
                          className="vd-btn vd-btn-icon"
                          style={{
                            minHeight: 18,
                            borderColor: 'transparent',
                            backgroundColor: 'transparent',
                            color: item.hidden ? 'var(--vd-text-muted)' : 'var(--vd-text-secondary)',
                          }}
                          onClick={() => onToggleHidden(item.refdes)}
                          title={item.hidden ? 'Show' : 'Hide'}
                        >
                          <VajraIcon name={item.hidden ? 'eyeClosed' : 'eyeOpen'} size={11} />
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 'files' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {filteredFiles.map((f) => (
                  <button
                    key={f.path}
                    type="button"
                    className="vd-tree-row"
                    style={{
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--vd-text-primary)',
                      textAlign: 'left',
                    }}
                    onClick={() => {
                      void globalIdeWorkspaceStore.openFile(f.path, true);
                      onOpenCodeFile?.(f.path);
                      onStatusMessage(`Opened ${f.path}`);
                    }}
                  >
                    <span className="vd-metric" style={{ fontSize: 11 }}>{f.path}</span>
                  </button>
                ))}
              </div>
            )}

            {activeTab === 'plugins' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {plugins.map((p) => (
                  <div key={p.id} className="vd-studio-card" data-testid={`drawer-plugin-${p.id}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: 11 }}>{p.name || p.id}</strong>
                      <span className="vd-metric" style={{ fontSize: 10, color: 'var(--vd-pass)' }}>v{p.version}</span>
                    </div>
                    <div className="vd-metric" style={{ fontSize: 10, color: 'var(--vd-text-secondary)', marginTop: 2 }}>
                      Runtime: {p.runtime} · Caps: {(p.granted_capabilities || []).length}
                    </div>
                    {p.ui_uri && (
                      <button
                        type="button"
                        className="vd-btn"
                        style={{ marginTop: 4, minHeight: 18, fontSize: 10 }}
                        onClick={() => onOpenPluginUi?.(p.id, p.ui_uri!)}
                      >
                        Open Tool Panel
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
};
