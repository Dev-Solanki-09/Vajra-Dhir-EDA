import React from 'react';

export type VajraIconName =
  | 'home'
  | 'search'
  | 'settings'
  | 'bell'
  | 'plugin'
  | 'lock'
  | 'folder'
  | 'shield'
  | 'activity'
  | 'close';

export const VajraIcon: React.FC<{ name: VajraIconName; size?: number; color?: string }> = ({
  name,
  size = 14,
  color = 'currentColor',
}) => {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: color,
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  };

  switch (name) {
    case 'home':
      return <svg {...common}><path d="M2 7.5 8 2.5l6 5v6H9.8V9.5H6.2v4H2z" /></svg>;
    case 'search':
      return <svg {...common}><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" /></svg>;
    case 'settings':
      return <svg {...common}><circle cx="8" cy="8" r="2.2" /><path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.5 3.5l1.1 1.1M11.4 11.4l1.1 1.1M12.5 3.5l-1.1 1.1M4.6 11.4l-1.1 1.1" /></svg>;
    case 'bell':
      return <svg {...common}><path d="M4 6.5a4 4 0 1 1 8 0c0 3 1.2 4.2 1.5 4.8H2.5c.3-.6 1.5-1.8 1.5-4.8Z" /><path d="M6.5 13a1.5 1.5 0 0 0 3 0" /></svg>;
    case 'plugin':
      return <svg {...common}><path d="M6 2.5v3M10 2.5v3M4.5 5.5h7v3.2a3.5 3.5 0 0 1-7 0V5.5Z" /><path d="M8 12.2V14.5" /></svg>;
    case 'lock':
      return <svg {...common}><rect x="3.5" y="7" width="9" height="6.5" rx="1.2" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></svg>;
    case 'folder':
      return <svg {...common}><path d="M2 3.5h4.2l1.4 1.5H14v8H2z" /></svg>;
    case 'shield':
      return <svg {...common}><path d="M8 2 13 4v4c0 3-2.1 5.1-5 6-2.9-.9-5-3-5-6V4z" /></svg>;
    case 'activity':
      return <svg {...common}><path d="M1.5 8h3l1.7-4 3.4 8 1.9-4h3" /></svg>;
    case 'close':
      return <svg {...common}><path d="M3.5 3.5 12.5 12.5M12.5 3.5 3.5 12.5" /></svg>;
  }
};
