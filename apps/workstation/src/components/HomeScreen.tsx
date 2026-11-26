import React, { useEffect, useState } from 'react';
import { useSettingsStore } from '../store/useSettingsStore';
import { VajraIcon } from './VajraIcons';

export interface HomeScreenProps {
  open: boolean;
  activeProjectName?: string;
  onClose: () => void;
  onSelectProject: (templateId: string, name: string) => void;
  onOpenFileBrowser: (mode?: 'folder' | 'file', ext?: string, onPicked?: (p: string) => void) => void;
  onOpenSettings: () => void;
}

type HomeNavTab = 'home' | 'new_project' | 'import' | 'environment' | 'settings';

const STARTER_BOARDS = [
  { id: 'buck_pd', name: 'Buck PD Controller (golden-buck-mcu)', spec: 'TPS54302 12V->3.3V 3A + CH224K USB-PD + 4L Stackup' },
  { id: 'stm32_can', name: 'STM32G474 Motor & CAN-FD Control', spec: 'LQFP-64 + Isolated CAN + Hardware Safety Locks' },
  { id: 'esp32_sensor', name: 'ESP32-S3 Edge Sensor Carrier', spec: 'Wi-Fi/BLE + I2C Pullups + LiFePO4 PMIC' },
  { id: 'rpi_hat', name: 'Raspberry Pi 40-Pin Instrumentation HAT', spec: 'SBC Harness Co-Sim + 24-Bit ADC + EEPROM' },
];

export const HomeScreen: React.FC<HomeScreenProps> = ({
  open,
  activeProjectName,
  onClose,
  onSelectProject,
  onOpenFileBrowser,
  onOpenSettings,
}) => {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const pushNotification = useSettingsStore((s) => s.pushNotification);
  const [nav, setNav] = useState<HomeNavTab>('home');
  const [search, setSearch] = useState('');
  const [newModeTab, setNewModeTab] = useState<'blank' | 'templates'>('blank');
  const [projName, setProjName] = useState('my-hardware-board');
  const [projLocation, setProjLocation] = useState(settings.general.defaultProjectsDir);
  const [starterKind, setStarterKind] = useState<'blank' | 'blank_2l' | 'blank_4l'>('blank');
  const [fabPreset, setFabPreset] = useState(settings.eda.fabProfile);
  const [dlpMode, setDlpMode] = useState(settings.agent.dlpMode);
  const [daemonHealth, setDaemonHealth] = useState<{ status: string; dlp?: string; ramMb?: number }>({ status: 'Checking' });
  const [toolsList, setToolsList] = useState<Array<{ id: string; name: string; status: string; version: string }>>([]);
  const [catalog, setCatalog] = useState<{
    boards: Array<{ name: string; kind: string; path: string }>;
    integrated_projects: Array<{ name: string; license: string; purpose: string; present: boolean; location: string }>;
    synced_count: number;
    total_manifest_count: number;
  } | null>(null);

  useEffect(() => {
    setProjLocation(settings.general.defaultProjectsDir);
  }, [settings.general.defaultProjectsDir]);

  useEffect(() => {
    if (!open) return;
    fetch('/api/v1/health')
      .then((r) => (r.ok ? r.json() : null))
      .then((h) => {
        if (h) setDaemonHealth({ status: 'Ready', dlp: h.dlp_class || 'NDA_AIRGAPPED', ramMb: 185 });
        else setDaemonHealth({ status: 'Offline' });
      })
      .catch(() => setDaemonHealth({ status: 'Offline' }));

    fetch('/api/v1/polish/tools')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (Array.isArray(d?.tools)) setToolsList(d.tools);
      })
      .catch(() => {});

    fetch('/api/v1/projects/catalog')
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (c && Array.isArray(c.boards)) setCatalog(c);
      })
      .catch(() => {});
  }, [open]);

  if (!open) return null;

  const openDiskProject = async (pathStr: string, kind: string, fallbackName: string) => {
    try {
      const res = await fetch('/api/v1/projects/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: pathStr, kind }),
      });
      if (res.ok) {
        const data = await res.json();
        pushNotification({ severity: 'pass', title: 'Opened Project', detail: `${data.name} (${data.path})` });
      }
    } catch {
      /* offline UI fallback */
    }
    onSelectProject(kind, fallbackName);
    onClose();
  };

  const recents = (settings.general.recentProjects || []).filter(
    (r) => !search.trim() || r.name.toLowerCase().includes(search.toLowerCase()) || r.path.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreateProject = async () => {
    try {
      const res = await fetch('/api/v1/project/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: projName,
          location: projLocation,
          starter: starterKind,
          fab_preset: fabPreset,
          dlp_class: dlpMode,
        }),
      });
      const data = res.ok ? await res.json() : null;
      if (data?.created) {
        pushNotification({ severity: 'pass', title: 'Project Created', detail: `${data.name} at ${data.path}` });
        onSelectProject(starterKind, data.name);
        onClose();
      }
    } catch {
      onSelectProject(starterKind, projName);
      onClose();
    }
  };

  return (
    <div
      className="vd-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Vajra-Dhir Home Launcher"
      data-testid="home-screen-modal"
      style={{ zIndex: 85 }}
    >
      <div
        data-testid="enterprise-home-hub"
        style={{
          width: '100vw',
          height: '100vh',
          display: 'grid',
          gridTemplateRows: '36px 1fr',
          backgroundColor: 'var(--vd-bg-panel)',
          color: 'var(--vd-text-primary)',
        }}
      >
        {/* Top 36px Enterprise Title Strip */}
        <header
          style={{
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 12px',
            backgroundColor: 'var(--vd-bg-elevated)',
            borderBottom: '1px solid var(--vd-border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <VajraIcon name="airgapShield" size={16} color="var(--vd-border-active)" />
            <strong style={{ fontSize: 12.5 }}>Vajra-Dhīr EDA</strong>
            <span className="vd-metric" style={{ fontSize: 10.5, color: 'var(--vd-text-muted)' }}>v0.0.2</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} className="vd-metric">
            <span className="vd-pill">{settings.agent.dlpMode === 'NDA_AIRGAPPED' ? 'AIRGAP' : 'LOCAL OFFLINE'}</span>
            <span className="vd-pill">Daemon: {daemonHealth.status}</span>
            <span className="vd-pill">MCP: :41900/mcp</span>
            <span className="vd-pill">RAM: {daemonHealth.ramMb ?? 185} MB</span>
            <button type="button" data-testid="home-close-btn" className="vd-btn vd-btn-primary" onClick={onClose}>
              Return to Workbench
            </button>
          </div>
        </header>

        {/* 2-Column Body */}
        <div style={{ display: 'grid', gridTemplateColumns: '210px 1fr', minHeight: 0 }}>
          {/* Left Navigation Rail (210px) */}
          <aside
            style={{
              backgroundColor: 'var(--vd-bg-workbench)',
              borderRight: '1px solid var(--vd-border-subtle)',
              padding: 8,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {[
                { id: 'home', label: 'Home', icon: 'home' },
                { id: 'new_project', label: 'New Project', icon: 'pcbBoard' },
                { id: 'import', label: 'Import', icon: 'folder' },
                { id: 'environment', label: 'Environment', icon: 'wrenchTools' },
                { id: 'settings', label: 'Settings', icon: 'settings' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`home-nav-${item.id}`}
                  className={`vd-btn ${nav === item.id ? 'vd-btn-primary' : ''}`}
                  style={{ justifyContent: 'flex-start', minHeight: 28, padding: '4px 10px' }}
                  onClick={() => {
                    if (item.id === 'settings') {
                      onOpenSettings();
                    } else {
                      setNav(item.id as HomeNavTab);
                    }
                  }}
                >
                  <VajraIcon name={item.icon as 'home'} size={14} /> {item.label}
                </button>
              ))}
            </nav>

            {activeProjectName && (
              <div style={{ padding: 8, backgroundColor: 'var(--vd-bg-canvas)', border: '1px solid var(--vd-border-subtle)', borderRadius: 2 }}>
                <div className="vd-section-title" style={{ marginBottom: 4 }}>Active Session</div>
                <div className="vd-metric" style={{ fontSize: 11, marginBottom: 6 }}>Resume: {activeProjectName}</div>
                <button type="button" className="vd-btn vd-btn-primary" style={{ width: '100%' }} onClick={onClose}>
                  Resume Workbench
                </button>
              </div>
            )}
          </aside>

          {/* Main Content Area */}
          <main style={{ padding: 16, overflowY: 'auto', backgroundColor: 'var(--vd-bg-panel)' }}>
            {nav === 'home' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 980 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <strong style={{ fontSize: 15 }}>Projects</strong>
                    <input
                      type="text"
                      className="vd-input"
                      placeholder="Filter recent projects..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      style={{ width: 240 }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      data-testid="home-browse-files-btn"
                      className="vd-btn"
                      onClick={() => onOpenFileBrowser('folder')}
                    >
                      <VajraIcon name="folder" size={13} /> Open Project...
                    </button>
                    <button type="button" className="vd-btn vd-btn-primary" onClick={() => setNav('new_project')}>
                      + New Project
                    </button>
                  </div>
                </div>

                {recents.length === 0 ? (
                  <div
                    data-testid="home-empty-projects"
                    style={{
                      border: '1px solid var(--vd-border-subtle)',
                      backgroundColor: 'var(--vd-bg-canvas)',
                      borderRadius: 3,
                      padding: 20,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <span style={{ color: 'var(--vd-text-secondary)', fontSize: 12 }}>
                      No projects yet. Create a blank project or open an existing KiCad / Vajra-Dhīr folder.
                    </span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="vd-btn vd-btn-primary" onClick={() => setNav('new_project')}>New Blank Project</button>
                      <button type="button" className="vd-btn" onClick={() => onOpenFileBrowser('folder')}>Open Existing Project</button>
                    </div>
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }} className="vd-metric">
                    <thead>
                      <tr style={{ textAlign: 'left', color: 'var(--vd-text-secondary)', borderBottom: '1px solid var(--vd-border-subtle)' }}>
                        <th style={{ padding: '6px 8px' }}>Name</th>
                        <th style={{ padding: '6px 8px' }}>Type</th>
                        <th style={{ padding: '6px 8px' }}>Location</th>
                        <th style={{ padding: '6px 8px' }}>Last Opened</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recents.map((rp) => (
                        <tr key={rp.path} style={{ borderBottom: '1px solid var(--vd-border-subtle)' }}>
                          <td style={{ padding: '6px 8px', color: 'var(--vd-text-primary)' }}>{rp.name}</td>
                          <td style={{ padding: '6px 8px', color: 'var(--vd-text-secondary)' }}>{rp.kind}</td>
                          <td style={{ padding: '6px 8px', color: 'var(--vd-text-muted)' }}>{rp.path}</td>
                          <td style={{ padding: '6px 8px', color: 'var(--vd-text-muted)' }}>{rp.lastOpenedUtc}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: 4 }}>
                              <button
                                type="button"
                                className="vd-btn vd-btn-primary"
                                onClick={() => void openDiskProject(rp.path, rp.kind, rp.name)}
                              >
                                Open
                              </button>
                              <button
                                type="button"
                                className="vd-btn"
                                onClick={() => {
                                  void updateSettings({
                                    general: {
                                      recentProjects: settings.general.recentProjects.filter((x) => x.path !== rp.path),
                                      recentSeeded: true,
                                    },
                                  });
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <div style={{ marginTop: 4 }}>
                  <div className="vd-section-title" style={{ marginBottom: 8 }}>Reference Starter Templates (Explicit Load Only)</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {STARTER_BOARDS.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        data-testid={`home-template-${b.id}`}
                        className="vd-btn"
                        style={{
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          padding: 10,
                          backgroundColor: 'var(--vd-bg-canvas)',
                          border: '1px solid var(--vd-border-subtle)',
                          textAlign: 'left',
                        }}
                        onClick={() => {
                          onSelectProject(b.id, b.name);
                          onClose();
                        }}
                      >
                        <strong style={{ fontSize: 12 }}>{b.name}</strong>
                        <span className="vd-metric" style={{ fontSize: 10.5, color: 'var(--vd-text-secondary)' }}>{b.spec}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {nav === 'new_project' && (
              <div style={{ maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <strong style={{ fontSize: 15 }}>New Project Wizard</strong>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button type="button" className={`vd-btn ${newModeTab === 'blank' ? 'vd-btn-primary' : ''}`} onClick={() => setNewModeTab('blank')}>Blank Hardware Project</button>
                  <button type="button" className={`vd-btn ${newModeTab === 'templates' ? 'vd-btn-primary' : ''}`} onClick={() => setNewModeTab('templates')}>Starter Reference Templates</button>
                </div>

                {newModeTab === 'blank' ? (
                  <div style={{ display: 'grid', gap: 10, backgroundColor: 'var(--vd-bg-canvas)', padding: 12, border: '1px solid var(--vd-border-subtle)' }}>
                    <label style={{ display: 'grid', gap: 4 }}>
                      <span>Project Name</span>
                      <input data-testid="new-proj-name-input" className="vd-input" value={projName} onChange={(e) => setProjName(e.target.value)} />
                    </label>
                    <label style={{ display: 'grid', gap: 4 }}>
                      <span>Location Path</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input className="vd-input vd-metric" style={{ flex: 1 }} value={projLocation} onChange={(e) => setProjLocation(e.target.value)} />
                        <button type="button" className="vd-btn" onClick={() => onOpenFileBrowser('folder', '', (p) => setProjLocation(p))}>Browse...</button>
                      </div>
                    </label>
                    <div style={{ display: 'grid', gap: 4 }}>
                      <span>Starting Point</span>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                        {[
                          { id: 'blank', label: 'Blank Project (Empty Canvas)' },
                          { id: 'blank_2l', label: 'Blank 2-Layer PCB' },
                          { id: 'blank_4l', label: 'Blank 4-Layer PCB' },
                        ].map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            className={`vd-btn ${starterKind === opt.id ? 'vd-btn-primary' : ''}`}
                            onClick={() => setStarterKind(opt.id as 'blank' | 'blank_2l' | 'blank_4l')}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <label style={{ display: 'grid', gap: 4 }}>
                        <span>Default Fab Rules</span>
                        <select className="vd-select" value={fabPreset} onChange={(e) => setFabPreset(e.target.value)}>
                          <option value="jlcpcb_2l">JLCPCB 2-Layer</option>
                          <option value="jlcpcb_4l">JLCPCB 4-Layer</option>
                          <option value="pcbway_4l">PCBWay 4-Layer</option>
                          <option value="pcb_power_india">PCB Power India</option>
                          <option value="lioncircuits">LionCircuits</option>
                          <option value="hand_solder">Hand-Solder Prototype</option>
                        </select>
                      </label>
                      <label style={{ display: 'grid', gap: 4 }}>
                        <span>Security / DLP Profile</span>
                        <select className="vd-select" value={dlpMode} onChange={(e) => setDlpMode(e.target.value as 'NDA_AIRGAPPED')}>
                          <option value="NDA_AIRGAPPED">NDA_AIRGAPPED (Local Only)</option>
                          <option value="PRIVATE_CLOUD_OK">PRIVATE_CLOUD_OK</option>
                          <option value="PUBLIC_OPEN">PUBLIC_OPEN</option>
                        </select>
                      </label>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                      <button type="button" data-testid="create-open-workbench-btn" className="vd-btn vd-btn-primary" onClick={() => void handleCreateProject()}>
                        Create &amp; Open Workbench
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {STARTER_BOARDS.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        className="vd-btn"
                        style={{ flexDirection: 'column', alignItems: 'flex-start', padding: 10, backgroundColor: 'var(--vd-bg-canvas)', textAlign: 'left' }}
                        onClick={() => {
                          onSelectProject(b.id, b.name);
                          onClose();
                        }}
                      >
                        <strong>{b.name}</strong>
                        <span className="vd-metric" style={{ fontSize: 10.5, color: 'var(--vd-text-secondary)' }}>{b.spec}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {nav === 'import' && (
              <div style={{ maxWidth: 640, display: 'grid', gap: 10 }}>
                <strong style={{ fontSize: 15 }}>Import Existing Hardware Artifacts</strong>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { label: 'KiCad Project / PCB / Schematic', ext: '.kicad_pro,.kicad_pcb,.kicad_sch' },
                    { label: 'atopile (.ato) Source', ext: '.ato' },
                    { label: 'Gerber RS-274X / Drill', ext: '.gbr,.gtl,.gbl,.drl' },
                    { label: '3D STEP Assembly', ext: '.step,.stp' },
                  ].map((imp) => (
                    <button
                      key={imp.label}
                      type="button"
                      className="vd-btn"
                      style={{ justifyContent: 'space-between', padding: 10, backgroundColor: 'var(--vd-bg-canvas)' }}
                      onClick={() => onOpenFileBrowser('file', imp.ext)}
                    >
                      <span>{imp.label}</span>
                      <span className="vd-metric" style={{ color: 'var(--vd-text-muted)' }}>Browse</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {nav === 'environment' && (
              <div style={{ maxWidth: 720, display: 'grid', gap: 10 }}>
                <strong style={{ fontSize: 15 }}>Live Host Environment &amp; Integrated Projects</strong>
                {catalog && (
                  <div className="vd-metric" style={{ padding: 8, backgroundColor: 'var(--vd-bg-canvas)', border: '1px solid var(--vd-border-subtle)', fontSize: 11 }}>
                    Integrated Upstream Manifest: {catalog.synced_count}/{catalog.total_manifest_count} present · Built-in Designs: {catalog.boards.length} · Run <code>pnpm setup:projects</code> to clone optional external source mirrors.
                  </div>
                )}
                <div style={{ display: 'grid', gap: 6 }}>
                  {toolsList.map((tool) => (
                    <div
                      key={tool.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '6px 10px',
                        backgroundColor: 'var(--vd-bg-canvas)',
                        border: '1px solid var(--vd-border-subtle)',
                      }}
                      className="vd-metric"
                    >
                      <span>{tool.name}</span>
                      <span style={{ color: tool.status === 'Ready' ? 'var(--vd-pass)' : tool.status === 'Optional' ? 'var(--vd-warn)' : 'var(--vd-text-muted)' }}>
                        {tool.status} ({tool.version})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};
