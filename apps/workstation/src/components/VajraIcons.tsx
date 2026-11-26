import React from 'react';

export type VajraIconName =
  // Legacy aliases preserved for backward compatibility
  | 'home'
  | 'search'
  | 'settings'
  | 'bell'
  | 'plugin'
  | 'lock'
  | 'folder'
  | 'shield'
  | 'activity'
  | 'close'
  // Workspaces & Panes (GUI-REDESIGN.md §3)
  | 'planBlocks'
  | 'schematicGate'
  | 'pcbBoard'
  | 'cube3D'
  | 'codeBraces'
  | 'oscilloscope'
  | 'waveDigital'
  | 'gerberLayers'
  | 'fabPackage'
  | 'dossierDoc'
  | 'outlinerTree'
  | 'folderTree'
  | 'inspectorSliders'
  | 'agentNode'
  | 'terminalPrompt'
  | 'historyClock'
  | 'libraryGrid'
  | 'diagnosticsShield'
  // CAD / 2D / 3D Tools
  | 'selectCursor'
  | 'boxSelect'
  | 'moveAxes'
  | 'rotateArc'
  | 'flipLayer'
  | 'wireNet'
  | 'route45'
  | 'diffPair'
  | 'lengthTune'
  | 'autoRoute'
  | 'viaRing'
  | 'copperPour'
  | 'boardOutline'
  | 'cutoutHole'
  | 'mountHole'
  | 'rulerMeasure'
  | 'probeNeedle'
  | 'datasheetPin'
  | 'crossSection'
  | 'cameraOrtho'
  | 'splitView'
  | 'popOut'
  // Controls & States
  | 'lockClosed'
  | 'lockOpen'
  | 'eyeOpen'
  | 'eyeClosed'
  | 'snapMagnet'
  | 'gridDots'
  | 'layersStack'
  | 'overlays'
  | 'shadingSphere'
  | 'play'
  | 'stop'
  | 'undo'
  | 'redo'
  | 'filter'
  | 'chevronRight'
  | 'chevronDown'
  | 'checkCircle'
  | 'warningTriangle'
  | 'errorOctagon'
  | 'airgapShield'
  | 'cpuChip'
  | 'sbcBoard'
  | 'cableHarness'
  | 'thermalHeat'
  | 'powerDrop'
  | 'clashIntersect'
  | 'wrenchTools';

export const ALL_VAJRA_ICON_NAMES: readonly VajraIconName[] = [
  'home', 'search', 'settings', 'bell', 'plugin', 'lock', 'folder', 'shield', 'activity', 'close',
  'planBlocks', 'schematicGate', 'pcbBoard', 'cube3D', 'codeBraces', 'oscilloscope', 'waveDigital',
  'gerberLayers', 'fabPackage', 'dossierDoc', 'outlinerTree', 'folderTree', 'inspectorSliders',
  'agentNode', 'terminalPrompt', 'historyClock', 'libraryGrid', 'diagnosticsShield',
  'selectCursor', 'boxSelect', 'moveAxes', 'rotateArc', 'flipLayer', 'wireNet', 'route45',
  'diffPair', 'lengthTune', 'autoRoute', 'viaRing', 'copperPour', 'boardOutline', 'cutoutHole',
  'mountHole', 'rulerMeasure', 'probeNeedle', 'datasheetPin', 'crossSection', 'cameraOrtho',
  'splitView', 'popOut',
  'lockClosed', 'lockOpen', 'eyeOpen', 'eyeClosed', 'snapMagnet', 'gridDots', 'layersStack',
  'overlays', 'shadingSphere', 'play', 'stop', 'undo', 'redo', 'filter', 'chevronRight',
  'chevronDown', 'checkCircle', 'warningTriangle', 'errorOctagon', 'airgapShield', 'cpuChip',
  'sbcBoard', 'cableHarness', 'thermalHeat', 'powerDrop', 'clashIntersect', 'wrenchTools',
];

function renderIconGeometry(name: VajraIconName): React.ReactNode {
  switch (name) {
    case 'home':
      return <path d="M2 7.5 8 2.5l6 5v6H9.8V9.5H6.2v4H2z" />;
    case 'search':
      return <><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" /></>;
    case 'settings':
    case 'wrenchTools':
      return name === 'settings'
        ? <><circle cx="8" cy="8" r="2.2" /><path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.5 3.5l1.1 1.1M11.4 11.4l1.1 1.1M12.5 3.5l-1.1 1.1M4.6 11.4l-1.1 1.1" /></>
        : <path d="M10.5 2.5a3 3 0 0 0-3.3 4.4L3 11.1 4.9 13l4.2-4.2a3 3 0 0 0 4.4-3.3l-1.9 1.9-1.9-1.9z" />;
    case 'bell':
      return <><path d="M4 6.5a4 4 0 1 1 8 0c0 3 1.2 4.2 1.5 4.8H2.5c.3-.6 1.5-1.8 1.5-4.8Z" /><path d="M6.5 13a1.5 1.5 0 0 0 3 0" /></>;
    case 'plugin':
      return <><path d="M6 2.5v3M10 2.5v3M4.5 5.5h7v3.2a3.5 3.5 0 0 1-7 0V5.5Z" /><path d="M8 12.2V14.5" /></>;
    case 'lock':
    case 'lockClosed':
      return <><rect x="3.5" y="7" width="9" height="6.5" rx="1" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></>;
    case 'lockOpen':
      return <><rect x="3.5" y="7" width="9" height="6.5" rx="1" /><path d="M5.5 7V5a2.5 2.5 0 0 1 4.8-.9" /></>;
    case 'folder':
      return <path d="M2 3.5h4.2l1.4 1.5H14v8H2z" />;
    case 'folderTree':
      return <><path d="M2 3h4l1 1.5h7v4H2z" /><path d="M4 8.5v4.5h3.5M4 11h3.5" /><rect x="7.5" y="9.8" width="6.5" height="3.4" /></>;
    case 'shield':
    case 'diagnosticsShield':
      return <><path d="M8 2 13 4v4c0 3-2.1 5.1-5 6-2.9-.9-5-3-5-6V4z" />{name === 'diagnosticsShield' ? <path d="M5.8 8.2 7.3 9.7 10.4 6.5" /> : null}</>;
    case 'airgapShield':
      return <><path d="M8 2 13 4v4c0 3-2.1 5.1-5 6-2.9-.9-5-3-5-6V4z" /><path d="M5.5 10.5 10.5 5.5" /></>;
    case 'activity':
    case 'oscilloscope':
      return <><rect x="2" y="2.5" width="12" height="11" /><path d="M3 8h2l1.5-3 3 6 1.5-3h2" /></>;
    case 'close':
      return <path d="M3.5 3.5 12.5 12.5M12.5 3.5 3.5 12.5" />;
    case 'planBlocks':
      return <><rect x="2" y="2.5" width="4.5" height="4.5" /><rect x="9.5" y="2.5" width="4.5" height="4.5" /><rect x="5.8" y="9.5" width="4.5" height="4" /><path d="M6.5 4.8h3M4.2 7v4.5h1.6M11.8 7v4.5h-1.5" /></>;
    case 'schematicGate':
      return <><path d="M2 5.5h3M2 10.5h3M11 8h3M5 3.5h3a4.5 4.5 0 0 1 0 9H5z" /></>;
    case 'pcbBoard':
      return <><rect x="2" y="2.5" width="12" height="11" /><circle cx="5" cy="5.5" r="1" /><circle cx="11" cy="10.5" r="1" /><path d="M6 5.5h2.5l2 2v2" /><path d="M4.5 10.5h4" /></>;
    case 'cube3D':
      return <><path d="M8 2 13.5 5v6L8 14 2.5 11V5z" /><path d="M2.5 5 8 8l5.5-3M8 8v6" /></>;
    case 'codeBraces':
      return <><path d="M5.5 3C4 3 4 4.5 4 6c0 1-1 2-1.5 2 .5 0 1.5 1 1.5 2 0 1.5 0 3 1.5 3" /><path d="M10.5 3C12 3 12 4.5 12 6c0 1 1 2 1.5 2-.5 0-1.5 1-1.5 2 0 1.5 0 3-1.5 3" /></>;
    case 'waveDigital':
      return <path d="M1.5 11h2.5V5h3v6h3V5h2.5v6H14.5" />;
    case 'gerberLayers':
      return <><path d="M8 2.5 14 5.5 8 8.5 2 5.5z" /><path d="M2 8.5 8 11.5l6-3M2 11.5 8 14l6-2.5" /></>;
    case 'fabPackage':
      return <><rect x="2.5" y="4.5" width="11" height="9" /><path d="M2.5 4.5 5 2h6l2.5 2.5M6 8h4" /></>;
    case 'dossierDoc':
      return <><path d="M3.5 2h6l3 3v9h-9z" /><path d="M9.5 2v3h3M5.5 8h5M5.5 10.8h5" /></>;
    case 'outlinerTree':
      return <><path d="M3 3h10M5.5 6.5v6h3M5.5 9.5h3" /><rect x="8.5" y="5.5" width="5" height="2.2" /><rect x="8.5" y="11" width="5" height="2.2" /></>;
    case 'inspectorSliders':
      return <><path d="M2.5 4h11M2.5 8h11M2.5 12h11" /><circle cx="5.5" cy="4" r="1.3" fill="var(--vd-bg-panel)" /><circle cx="10.5" cy="8" r="1.3" fill="var(--vd-bg-panel)" /><circle cx="6.5" cy="12" r="1.3" fill="var(--vd-bg-panel)" /></>;
    case 'agentNode':
      return <><circle cx="8" cy="8" r="2.2" /><circle cx="3" cy="4" r="1.2" /><circle cx="13" cy="4" r="1.2" /><circle cx="3" cy="12" r="1.2" /><circle cx="13" cy="12" r="1.2" /><path d="M4.1 4.9 6.3 6.6M11.9 4.9 9.7 6.6M4.1 11.1 6.3 9.4M11.9 11.1 9.7 9.4" /></>;
    case 'terminalPrompt':
      return <><rect x="2" y="2.5" width="12" height="11" /><path d="M4.5 6 7 8 4.5 10M8.5 10h3" /></>;
    case 'historyClock':
      return <><circle cx="8" cy="8" r="5.5" /><path d="M8 4.8V8l2.5 1.5" /></>;
    case 'libraryGrid':
      return <><rect x="2.5" y="2.5" width="4.5" height="4.5" /><rect x="9" y="2.5" width="4.5" height="4.5" /><rect x="2.5" y="9" width="4.5" height="4.5" /><rect x="9" y="9" width="4.5" height="4.5" /></>;
    case 'selectCursor':
      return <path d="M3.5 2.5v10l2.8-2.6 2 4 1.6-.8-2-4h3.6z" />;
    case 'boxSelect':
      return <><path d="M2.5 5V2.5H5M11 2.5h2.5V5M13.5 11v2.5H11M5 13.5H2.5V11" /><rect x="5.5" y="5.5" width="5" height="5" /></>;
    case 'moveAxes':
      return <><path d="M8 2v12M2 8h12M6.2 3.8 8 2l1.8 1.8M6.2 12.2 8 14l1.8-1.8M3.8 6.2 2 8l1.8 1.8M12.2 6.2 14 8l-1.8 1.8" /></>;
    case 'rotateArc':
      return <><path d="M12.8 6.5A5 5 0 1 0 11.5 12" /><path d="M10.5 6.5h3v-3" /></>;
    case 'flipLayer':
      return <><path d="M8 2.5v11" strokeDasharray="1.8 1.8" /><path d="M6 4.5 2.5 8 6 11.5zM10 4.5 13.5 8 10 11.5z" /></>;
    case 'wireNet':
      return <><circle cx="3" cy="12" r="1.2" /><circle cx="13" cy="4" r="1.2" /><path d="M4.2 12H8V4h3.8" /></>;
    case 'route45':
      return <><circle cx="3" cy="12.5" r="1.2" /><circle cx="13" cy="3.5" r="1.2" /><path d="M4 11.5 7 8.5h2.5l2.5-4" /></>;
    case 'diffPair':
      return <><path d="M2.5 11.5 6 8h4l3.5-3.5M2.5 14 7 9.5h4L14 6.5" /></>;
    case 'lengthTune':
      return <path d="M2 10h2.5V5h2.5v5h2.5V5H12v5h2" />;
    case 'autoRoute':
      return <><circle cx="3" cy="4" r="1.2" /><circle cx="13" cy="12" r="1.2" /><path d="M4.2 4H9v4H6.5v4H11.8" /></>;
    case 'viaRing':
      return <><circle cx="8" cy="8" r="5" /><circle cx="8" cy="8" r="2" /><path d="M2 8h1M13 8h1" /></>;
    case 'copperPour':
      return <><rect x="2.5" y="2.5" width="11" height="11" /><path d="M3 10 10 3M5.5 13.5 13.5 5.5" /></>;
    case 'boardOutline':
      return <path d="M3 3h10v7l-3 3H3z" />;
    case 'cutoutHole':
      return <><rect x="2.5" y="2.5" width="11" height="11" /><rect x="5.5" y="5.5" width="5" height="5" strokeDasharray="1.5 1.5" /></>;
    case 'mountHole':
      return <><circle cx="8" cy="8" r="4.8" /><circle cx="8" cy="8" r="2.1" /><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2" /></>;
    case 'rulerMeasure':
      return <><rect x="2" y="5.5" width="12" height="5" /><path d="M4.5 5.5v2M7 5.5v3M9.5 5.5v2M12 5.5v3" /></>;
    case 'probeNeedle':
      return <><path d="M13.5 2.5 6 10l-3 3.5M4.5 8.5l3 3" /></>;
    case 'datasheetPin':
      return <><rect x="4" y="2.5" width="8" height="11" /><path d="M2 5.5h2M2 8h2M2 10.5h2M12 5.5h2M12 8h2M12 10.5h2M6 6h4M6 9.5h4" /></>;
    case 'crossSection':
      return <><path d="M2 4.5h12M2 11.5h12" /><path d="M4 6.5h8v3H4z" /><path d="M8 1.5v13" strokeDasharray="1.5 1.5" /></>;
    case 'cameraOrtho':
      return <><rect x="2.5" y="4" width="8" height="8" /><path d="M10.5 6.8 14 5v6l-3.5-1.8" /></>;
    case 'splitView':
      return <><rect x="2" y="2.5" width="12" height="11" /><path d="M8 2.5v11" /></>;
    case 'popOut':
      return <><path d="M9 3h4v4M13 3 7.5 8.5M12 9.5v3.5H3V4h3.5" /></>;
    case 'eyeOpen':
      return <><path d="M2 8s2.4-4 6-4 6 4 6 4-2.4 4-6 4-6-4-6-4Z" /><circle cx="8" cy="8" r="1.6" /></>;
    case 'eyeClosed':
      return <><path d="M2 8s2.4-4 6-4 6 4 6 4-2.4 4-6 4-6-4-6-4Z" /><path d="M3 13 13 3" /></>;
    case 'snapMagnet':
      return <path d="M4.5 3v5a3.5 3.5 0 0 0 7 0V3M4.5 5.5h2M9.5 5.5h2" />;
    case 'gridDots':
      return <><circle cx="4" cy="4" r="0.8" fill="currentColor" /><circle cx="8" cy="4" r="0.8" fill="currentColor" /><circle cx="12" cy="4" r="0.8" fill="currentColor" /><circle cx="4" cy="8" r="0.8" fill="currentColor" /><circle cx="8" cy="8" r="0.8" fill="currentColor" /><circle cx="12" cy="8" r="0.8" fill="currentColor" /><circle cx="4" cy="12" r="0.8" fill="currentColor" /><circle cx="8" cy="12" r="0.8" fill="currentColor" /><circle cx="12" cy="12" r="0.8" fill="currentColor" /></>;
    case 'layersStack':
      return <><path d="M8 2.5 13.5 5.5 8 8.5 2.5 5.5z" /><path d="M2.5 8.5 8 11.5l5.5-3M2.5 11.5 8 14l5.5-2.5" /></>;
    case 'overlays':
      return <><rect x="2.5" y="2.5" width="7.5" height="7.5" /><rect x="6" y="6" width="7.5" height="7.5" /></>;
    case 'shadingSphere':
      return <><circle cx="8" cy="8" r="5.5" /><path d="M8 2.5a5.5 5.5 0 0 0 0 11z" fill="currentColor" opacity="0.35" /></>;
    case 'play':
      return <path d="M4.5 3 12.5 8l-8 5z" />;
    case 'stop':
      return <rect x="4" y="4" width="8" height="8" />;
    case 'undo':
      return <><path d="M4 6h5.5a3.5 3.5 0 1 1 0 7H7" /><path d="M6 3.5 3.5 6 6 8.5" /></>;
    case 'redo':
      return <><path d="M12 6H6.5a3.5 3.5 0 1 0 0 7H9" /><path d="M10 3.5 12.5 6 10 8.5" /></>;
    case 'filter':
      return <path d="M2.5 3.5h11L9.5 8.2v4.3l-3-1.5V8.2z" />;
    case 'chevronRight':
      return <path d="M6 4 10 8l-4 4" />;
    case 'chevronDown':
      return <path d="M4 6 8 10l4-4" />;
    case 'checkCircle':
      return <><circle cx="8" cy="8" r="5.5" /><path d="M5.5 8.2 7.2 9.9 10.6 6.4" /></>;
    case 'warningTriangle':
      return <><path d="M8 2.5 14 13H2z" /><path d="M8 6.5v3M8 11.2v.4" /></>;
    case 'errorOctagon':
      return <><path d="M5.5 2.5h5l3 3v5l-3 3h-5l-3-3v-5z" /><path d="M6 6 10 10M10 6 6 10" /></>;
    case 'cpuChip':
      return <><rect x="4.5" y="4.5" width="7" height="7" /><path d="M6 2v2.5M10 2v2.5M6 11.5V14M10 11.5V14M2 6h2.5M2 10h2.5M11.5 6H14M11.5 10H14" /></>;
    case 'sbcBoard':
      return <><rect x="2" y="3" width="12" height="10" /><path d="M4 5.5h5M4 7.5h5M10.5 6v4" /><rect x="4" y="9.5" width="3" height="2" /></>;
    case 'cableHarness':
      return <><rect x="2" y="5.5" width="2.5" height="5" /><rect x="11.5" y="5.5" width="2.5" height="5" /><path d="M4.5 7h7M4.5 9h7" /></>;
    case 'thermalHeat':
      return <path d="M5 12.5c-1.5-1.5 1.5-3 0-4.5-.8-.8-.8-2 0-3M8 12.5c-1.5-1.5 1.5-3 0-4.5-.8-.8-.8-2 0-3M11 12.5c-1.5-1.5 1.5-3 0-4.5-.8-.8-.8-2 0-3" />;
    case 'powerDrop':
      return <path d="M9 2 4.5 8.5H8l-1 5.5 4.5-6.5H8z" />;
    case 'clashIntersect':
      return <><rect x="2.5" y="2.5" width="7" height="7" /><rect x="6.5" y="6.5" width="7" height="7" /><path d="M6.5 6.5h3v3h-3z" fill="currentColor" opacity="0.4" /></>;
  }
}

export const VajraIcon: React.FC<{
  name: VajraIconName;
  size?: number;
  color?: string;
  className?: string;
  'data-testid'?: string;
}> = ({
  name,
  size = 14,
  color = 'currentColor',
  className,
  'data-testid': testId,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke={color}
    strokeWidth={1.4}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
    data-testid={testId}
    style={{ flexShrink: 0 }}
  >
    {renderIconGeometry(name)}
  </svg>
);
