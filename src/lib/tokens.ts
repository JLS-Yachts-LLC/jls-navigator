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

  // Polaris accent (fixed brand colours — valid on both themes, alpha-suffixable).
  // Aligned to the Polaris interactive blue (matches --primary in the pds-embed
  // theme) so inline COLORS.signal usages read on-brand instead of the old cyan.
  signal:    '#4590ba',   // primary interactive, Polaris highlights
  signalMid: '#2f6d92',   // secondary signal uses

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

/**
 * BRAND — canonical logo & brand palette (POLARIS_LOGO block, Captain Mike Fetton, MD sign-off).
 * Used by <PolarisLogo /> and brand surfaces. Do not introduce new accent colours
 * without MD sign-off.
 */
export const BRAND = {
  navy:       '#1B2A4A',   // Primary text, page backgrounds, sidebar
  teal:       '#5BB8B0',   // Star mark NW quadrant, active states, links
  tealLight:  '#8ECFCC',   // Star mark muted diagonals, hover fills
  amber:      '#D4845A',   // Star mark SE quadrant, warnings, CTAs
  amberLight: '#E0AA88',   // Star mark muted diagonals, soft highlights
  white:      '#FFFFFF',
  offWhite:   '#F4F6FA',   // Page / panel backgrounds
} as const;
