/**
 * Vajra-Dhīr EDA — Silicon Darkroom Design System Palette
 */

export const THEME = {
  colors: {
    bg: '#090A0F',             // Deep space obsidian base
    surface: '#12151F',        // Panels and dock headers
    surfaceHover: '#1A1E2E',   // Hovered tabs and list items
    border: '#1F2438',         // Subtle container borders
    borderActive: '#2D3550',   // Active pane outline

    text: '#E2E8F0',           // Primary text
    textMuted: '#94A3B8',      // Secondary / metadata
    textDim: '#64748B',        // Inactive / comments

    cyan: '#00F0FF',           // Primary trace highlight / selected
    magenta: '#FF0055',        // DRC violation marker
    emerald: '#10B981',        // Verified gate / DRC clean
    purple: '#8B5CF6',         // AI Agent proposal / synthesis
    amber: '#F59E0B',          // Warning / human confirmation required

    layers: {
      f_cu: '#E05D44',         // Unified Top copper (F.Cu)
      b_cu: '#3B82F6',         // Unified Bottom copper (B.Cu)
      in1_cu: '#D0A020',       // Inner 1 plane (gold)
      in2_cu: '#10B981',       // Inner 2 plane (green)
      silkscreen: '#F8FAFC',   // Silkscreen (white)
      courtyard: '#A855F7',    // Physical courtyard (purple)
    },
  },
  typography: {
    fontMono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
} as const;
