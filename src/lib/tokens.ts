/**
 * Polaris / Leo — Design Tokens
 * Single source of truth for all colours and fonts.
 * Use CSS variables in Tailwind classes; import these in inline-style components only.
 */

export const COLORS = {
  // Backgrounds
  void:      '#080D14',   // page background
  abyss:     '#0D1520',   // panel / card background
  deep:      '#0F2030',   // borders
  ocean:     '#1E4060',   // table headers, muted fills

  // Polaris accent
  signal:    '#00C4CC',   // primary interactive, Polaris highlights
  signalMid: '#00838A',   // secondary signal uses

  // Leo accent
  leoAmber:  '#E8A020',   // Leo UI, AI-origin content
  warn:      '#E87020',   // warnings, high priority

  // Text
  frost:     '#E8EDF5',   // primary text
  muted:     '#4A7090',   // body text
  steel:     '#3A5570',   // labels, secondary text
} as const;

export const FONTS = {
  display: 'Space Grotesk',   // all headings, brand, labels, UI
  body:    'Inter',            // body copy, briefing stream text only
  mono:    'Courier New',      // code references only
} as const;
