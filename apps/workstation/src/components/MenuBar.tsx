import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FocusedPresetId, FOCUSED_PRESETS } from '../store/usePolishStore';
import { DensityMode, useSettingsStore } from '../store/useSettingsStore';
import { clampCoordsToViewport } from './FloatingWindow';
import { VajraIcon } from './VajraIcons';

export interface TopMenuAction {
  id: string;
  label: string;
  shortcut?: string;
  checked?: boolean;
  separator?: boolean;
  children?: TopMenuAction[];
  onSelect?: () => void;
}

export interface TopMenuSpec {
  id: 'file' | 'edit' | 'view' | 'design' | 'verify' | 'simulate' | 'agent' | 'window' | 'help';
  label: string;
  items: TopMenuAction[];
}

export const MenuBar: React.FC<{
  menus: TopMenuSpec[];
  projectName: string;
  dirty: boolean;
  activePreset: FocusedPresetId;
  revId: number;
  customLayouts?: Array<{ name: string; workspaceId: string }>;
  onOpenHome: () => void;
  onSelectPreset: (id: FocusedPresetId) => void;
  onSelectCustomLayout?: (layout: { name: string; workspaceId: string }) => void;
  onSaveCustomLayout: () => void;
}> = ({
  menus,
  projectName,
  dirty,
  activePreset,
  revId,
  customLayouts = [],
  onOpenHome,
  onSelectPreset,
  onSelectCustomLayout,
  onSaveCustomLayout,
}) => {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [focusedIdx, setFocusedIdx] = useState<number>(0);
  const [openSubId, setOpenSubId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number }>({ left: 8, top: 28 });
  const [subPos, setSubPos] = useState<{ left: number; top: number }>({ left: 220, top: 28 });
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const hoverOpenedRef = useRef<string | null>(null);

  const activeMenu = menus.find((m) => m.id === openMenuId) || null;
  const selectableItems = activeMenu ? activeMenu.items.filter((i) => !i.separator) : [];

  const latestRef = useRef({ openMenuId, menus, selectableItems, focusedIdx });
  latestRef.current = { openMenuId, menus, selectableItems, focusedIdx };

  useLayoutEffect(() => {
    if (!openMenuId) return;
    const btn = triggerRefs.current[openMenuId];
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const dw = dropdownRef.current?.getBoundingClientRect().width || 250;
    const dh = dropdownRef.current?.getBoundingClientRect().height || 280;
    setMenuPos(clampCoordsToViewport(r.left, r.bottom + 1, dw, dh));
    setFocusedIdx(0);
    setOpenSubId(null);
  }, [openMenuId]);

  useEffect(() => {
    if (!openMenuId) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (dropdownRef.current?.contains(target)) return;
      if (Object.values(triggerRefs.current).some((b) => b?.contains(target))) return;
      setOpenMenuId(null);
      setOpenSubId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      const curState = latestRef.current;
      if (!curState.openMenuId) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpenMenuId(null);
        setOpenSubId(null);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const cur = curState.menus.findIndex((m) => m.id === curState.openMenuId);
        const next = curState.menus[(cur + 1) % curState.menus.length];
        setOpenMenuId(next.id);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const cur = curState.menus.findIndex((m) => m.id === curState.openMenuId);
        const prev = curState.menus[(cur - 1 + curState.menus.length) % curState.menus.length];
        setOpenMenuId(prev.id);
      } else if (e.key === 'ArrowDown' && curState.selectableItems.length > 0) {
        e.preventDefault();
        setFocusedIdx((i) => (i + 1) % curState.selectableItems.length);
      } else if (e.key === 'ArrowUp' && curState.selectableItems.length > 0) {
        e.preventDefault();
        setFocusedIdx((i) => (i - 1 + curState.selectableItems.length) % curState.selectableItems.length);
      } else if (e.key === 'Enter' && curState.selectableItems[curState.focusedIdx]) {
        e.preventDefault();
        const item = curState.selectableItems[curState.focusedIdx];
        if (item.children?.length) {
          setOpenSubId(item.id);
        } else {
          item.onSelect?.();
          setOpenMenuId(null);
        }
      }
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [Boolean(openMenuId)]);

  const tabMeta: Array<{ id: FocusedPresetId; label: string }> = [
    { id: 'plan', label: 'Plan' },
    { id: 'sch_code', label: 'Schematic' },
    { id: 'pcb_3d', label: 'PCB & 3D' },
    { id: 'virtual_lab', label: 'Virtual Lab' },
    { id: 'fab_release', label: 'Release' },
  ];

  return (
    <header className="vd-menubar" data-testid="zone1-menubar">
      {/* Left: Home + 9 Desktop Cascading Menus */}
      <div className="vd-menubar-left">
        <button
          type="button"
          data-testid="topbar-home-btn"
          className="vd-btn vd-btn-icon"
          style={{ minHeight: 22 }}
          onClick={onOpenHome}
          title="Enterprise Home Hub"
          aria-label="Home"
        >
          <VajraIcon name="home" size={13} />
        </button>

        <nav aria-label="Application Menu" style={{ display: 'flex', alignItems: 'center' }}>
          {menus.map((m) => (
            <button
              key={m.id}
              ref={(el) => {
                triggerRefs.current[m.id] = el;
              }}
              type="button"
              data-testid={`menu-trigger-${m.id}`}
              className="vd-menu-trigger"
              aria-expanded={openMenuId === m.id}
              onClick={() => {
                if (hoverOpenedRef.current === m.id) {
                  hoverOpenedRef.current = null;
                  setOpenMenuId(m.id);
                  return;
                }
                hoverOpenedRef.current = null;
                setOpenMenuId((cur) => (cur === m.id ? null : m.id));
              }}
              onMouseEnter={() => {
                if (openMenuId && openMenuId !== m.id) {
                  hoverOpenedRef.current = m.id;
                  setOpenMenuId(m.id);
                }
              }}
            >
              {m.label}
            </button>
          ))}
        </nav>

        <span className="vd-metric" data-testid="topbar-project-title" style={{ marginLeft: 6, fontSize: 11, color: 'var(--vd-text-secondary)' }}>
          {projectName}{dirty ? ' •' : ''}
        </span>
      </div>

      {/* Center-Right: Blender-Style Minimal Workspace Tabs */}
      <div className="vd-menubar-tabs" role="tablist" aria-label="Workspace Presets">
        {tabMeta.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activePreset === t.id}
            data-testid={`ws-tab-${t.id}`}
            data-active={activePreset === t.id}
            className="vd-ws-tab"
            onClick={() => onSelectPreset(t.id)}
          >
            {t.label}
          </button>
        ))}
        {customLayouts.map((cl) => (
          <button
            key={cl.name}
            type="button"
            role="tab"
            data-testid={`ws-tab-custom-${cl.name}`}
            className="vd-ws-tab"
            onClick={() => onSelectCustomLayout?.(cl)}
          >
            {cl.name}
          </button>
        ))}
        <button
          type="button"
          data-testid="ws-save-custom-btn"
          className="vd-ws-tab"
          title="Save Custom Workspace Layout"
          onClick={onSaveCustomLayout}
        >
          +
        </button>
      </div>

      {/* Far Right: Subtle System Pills */}
      <div className="vd-menubar-right">
        <span className="vd-pill vd-metric" data-testid="pill-dlp-mode">
          <VajraIcon name="airgapShield" size={11} color="var(--vd-dlp-airgap)" />
          {settings.agent.dlpMode === 'NDA_AIRGAPPED' ? 'AIRGAP' : 'LOCAL'}
        </span>
        <select
          aria-label="Agent Mode Quick Switch"
          data-testid="pill-agent-mode"
          className="vd-select vd-metric"
          style={{ height: 20, padding: '0 4px', fontSize: 10.5 }}
          value={settings.agent.agentMode}
          onChange={(e) => void updateSettings({ agent: { agentMode: e.target.value } })}
        >
          <option value="off">Agent: Off</option>
          <option value="copilot">Agent: Copilot</option>
          <option value="autonomous">Agent: Auto</option>
        </select>
        <span className="vd-pill vd-metric" data-testid="pill-rev-chip">
          <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--vd-pass)', display: 'inline-block' }} />
          rev #{revId}
        </span>
      </div>

      {/* Cascading Menu Dropdown */}
      {activeMenu && (
        <div
          ref={dropdownRef}
          className="vd-popover"
          role="menu"
          data-testid={`menu-dropdown-${activeMenu.id}`}
          style={{ left: menuPos.left, top: menuPos.top, minWidth: 250 }}
        >
          <div className="vd-menu-list">
            {activeMenu.items.map((item) => {
              if (item.separator) return <div key={item.id} className="vd-menu-sep" />;
              const selIdx = selectableItems.findIndex((s) => s.id === item.id);
              const isFocused = selIdx === focusedIdx;
              return (
                <div key={item.id} style={{ position: 'relative' }}>
                  <button
                    type="button"
                    role="menuitem"
                    data-testid={`menu-item-${item.id}`}
                    data-focused={isFocused}
                    className="vd-menu-item"
                    onMouseEnter={(e) => {
                      setFocusedIdx(selIdx);
                      if (item.children?.length) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setSubPos(clampCoordsToViewport(rect.right + 2, rect.top, 230, 220));
                        setOpenSubId(item.id);
                      } else {
                        setOpenSubId(null);
                      }
                    }}
                    onClick={() => {
                      if (item.children?.length) {
                        setOpenSubId((cur) => (cur === item.id ? null : item.id));
                      } else {
                        item.onSelect?.();
                        setOpenMenuId(null);
                        setOpenSubId(null);
                      }
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span className="vd-metric" style={{ width: 10 }}>{item.checked ? '✓' : ''}</span>
                      <span>{item.label}</span>
                    </span>
                    <span className="vd-metric" style={{ fontSize: 10, color: 'var(--vd-text-muted)' }}>
                      {item.children?.length ? '▸' : item.shortcut || ''}
                    </span>
                  </button>

                  {item.children && openSubId === item.id && (
                    <div
                      className="vd-popover"
                      role="menu"
                      data-testid={`submenu-${item.id}`}
                      style={{ left: subPos.left, top: subPos.top, minWidth: 225 }}
                    >
                      <div className="vd-menu-list">
                        {item.children.map((sub) => (
                          <button
                            key={sub.id}
                            type="button"
                            role="menuitem"
                            className="vd-menu-item"
                            onClick={() => {
                              sub.onSelect?.();
                              setOpenMenuId(null);
                              setOpenSubId(null);
                            }}
                          >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <span className="vd-metric" style={{ width: 10 }}>{sub.checked ? '✓' : ''}</span>
                              <span>{sub.label}</span>
                            </span>
                            {sub.shortcut && <span className="vd-metric" style={{ fontSize: 10, color: 'var(--vd-text-muted)' }}>{sub.shortcut}</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
};

export type { DensityMode, FOCUSED_PRESETS };
