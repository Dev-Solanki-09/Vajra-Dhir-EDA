export type IconKey =
  | 'schematic'
  | 'pcb_layout'
  | 'mcad_3d'
  | 'sim_lab'
  | 'library_bom'
  | 'firmware_pinmux'
  | 'mfg_diff'
  | 'lock'
  | 'agent'
  | 'help'
  | 'template';

export function WorkbenchIcon({ name, size = 18 }: { name: IconKey; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (name) {
    case 'schematic':
      return (
        <svg {...common}>
          <path d="M4 7h5l3 10h4l4-10" />
          <circle cx="4" cy="7" r="1.5" />
          <circle cx="20" cy="7" r="1.5" />
        </svg>
      );
    case 'pcb_layout':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M8 8h4l2 4h4" />
          <circle cx="8" cy="16" r="1.5" />
        </svg>
      );
    case 'mcad_3d':
      return (
        <svg {...common}>
          <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
          <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
        </svg>
      );
    case 'sim_lab':
      return (
        <svg {...common}>
          <path d="M3 12h4l2-6 4 12 2-6h6" />
        </svg>
      );
    case 'library_bom':
      return (
        <svg {...common}>
          <path d="M5 5h6v14H5zM13 5h6v14h-6z" />
        </svg>
      );
    case 'firmware_pinmux':
      return (
        <svg {...common}>
          <rect x="7" y="7" width="10" height="10" rx="1" />
          <path d="M9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4" />
        </svg>
      );
    case 'mfg_diff':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="8" height="16" rx="1" />
          <rect x="13" y="4" width="8" height="16" rx="1" />
        </svg>
      );
    case 'lock':
      return (
        <svg {...common}>
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      );
    case 'agent':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7" />
          <path d="M12 8v4l3 2" />
        </svg>
      );
    case 'help':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5" />
          <circle cx="12" cy="17" r="0.7" />
        </svg>
      );
    case 'template':
      return (
        <svg {...common}>
          <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
          <path d="M14 3v6h6" />
        </svg>
      );
  }
}
