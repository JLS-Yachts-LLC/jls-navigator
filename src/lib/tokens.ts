/**
 * Polaris / Leo — Design Tokens
 * Single source of truth for all colours and fonts.
 * Use CSS variables in Tailwind classes; import these in inline-style components only.
 */

// Backgrounds/text/border resolve to the app's theme CSS variables so inline-style
// components adapt to BOTH light and dark mode. The .dark values match the original
// dark-first palette, so dark mode looks unchanged. Brand accents stay fixed hex so
// existing `${COLORS.signal}33`-style alpha suffixes remain valid CSS.
export const COLORS = {
  // Backgrounds (theme-aware)
  void:      'var(--background)',  // page background
  abyss:     'var(--card)',        // panel / card background
  deep:      'var(--border)',      // borders
  ocean:     'var(--muted)',       // table headers, muted fills

  // Polaris accent (fixed brand colours — valid on both themes, alpha-suffixable)
  signal:    '#00C4CC',   // primary interactive, Polaris highlights
  signalMid: '#00838A',   // secondary signal uses

  // Leo accent
  leoAmber:  '#E8A020',   // Leo UI, AI-origin content
  warn:      '#E87020',   // warnings, high priority

  // Text (theme-aware)
  frost:     'var(--foreground)',        // primary text
  muted:     'var(--muted-foreground)',  // body text
  steel:     'var(--muted-foreground)',  // labels, secondary text
} as const;

export const FONTS = {
  display: 'Space Grotesk',   // all headings, brand, labels, UI
  body:    'Inter',            // body copy, briefing stream text only
  mono:    'Courier New',      // code references only
} as const;
