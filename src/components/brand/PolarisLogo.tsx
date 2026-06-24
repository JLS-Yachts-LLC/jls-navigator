/**
 * PolarisLogo.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Canonical logo component for the Polaris platform.
 * Author : Captain Mike Fetton — JLS Yachts LLC / Superyacht Middle East
 * Dev    : Matt Tighe
 * Version: 1.0 — June 2026
 *
 * RULES (do not override without MD sign-off):
 *  - Always import this component. Never recreate the logo inline.
 *  - Never use an <img> tag pointing to a raster file for the logo.
 *  - Use size="lg" or size="xl" for all dashboard and auth screens.
 *  - Use theme="dark" on any navy, dark, or coloured background.
 *  - Minimum body text platform-wide: 16px. Minimum headings: 22px.
 *  - Brand colours: #1B2A4A (navy) | #5BB8B0 (teal) | #D4845A (amber)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type LogoSize = "sm" | "md" | "lg" | "xl";
type LogoTheme = "light" | "dark";
type LogoVariant = "full" | "mark-only";

interface PolarisLogoProps {
  /**
   * size — controls rendered dimensions.
   *
   *  'sm'  160 × 38px   Sidebar collapsed, mobile header
   *  'md'  240 × 57px   Default sidebar / nav bar          ← default
   *  'lg'  320 × 76px   Dashboard hero, page headers
   *  'xl'  420 × 100px  Login screen, splash, onboarding
   */
  size?: LogoSize;

  /**
   * theme — switches wordmark colour.
   *
   *  'light'  Navy wordmark (#1B2A4A) for white/light backgrounds  ← default
   *  'dark'   White wordmark (#FFFFFF) for navy/dark backgrounds
   *
   * The star mark (teal + amber) is identical in both themes.
   */
  theme?: LogoTheme;

  /**
   * variant — full logo or mark-only icon.
   *
   *  'full'       Star mark + POLARIS wordmark + tagline  ← default
   *  'mark-only'  Star mark only (square icon, for collapsed sidebar / favicon)
   */
  variant?: LogoVariant;

  /** Optional Tailwind / CSS class names passed to the <svg> element. */
  className?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SIZE_MAP: Record<LogoSize, { width: number; height: number }> = {
  sm: { width: 160, height: 38 },
  md: { width: 240, height: 57 },
  lg: { width: 320, height: 76 },
  xl: { width: 420, height: 100 },
};

/** Brand colours — never modify without MD sign-off */
const BRAND = {
  navy: "#1B2A4A",
  white: "#FFFFFF",
  teal: "#5BB8B0",
  tealMuted: "#8ECFCC",
  amber: "#D4845A",
  amberMuted: "#E0AA88",
} as const;

// ─── Sub-component: Star Mark ─────────────────────────────────────────────────
// Extracted so it can be reused in both 'full' and 'mark-only' variants.
// viewBox coordinates are relative to a 76 × 100 unit grid.

const StarMark: React.FC = () => (
  <>
    {/* Cardinal points */}
    <polygon points="38,10 42,48 38,50 34,48" fill={BRAND.teal} />
    <polygon points="38,90 42,52 38,50 34,52" fill={BRAND.amber} />
    <polygon points="10,50 46,46 48,50 46,54" fill={BRAND.teal} />
    <polygon points="66,50 30,46 28,50 30,54" fill={BRAND.amber} />

    {/* Diagonal half-points — muted colours, slightly transparent */}
    <polygon
      points="17,17 44,44 40,48 36,44"
      fill={BRAND.tealMuted}
      opacity="0.8"
    />
    <polygon
      points="59,17 32,44 36,48 40,44"
      fill={BRAND.amberMuted}
      opacity="0.8"
    />
    <polygon
      points="17,83 44,56 40,52 36,56"
      fill={BRAND.tealMuted}
      opacity="0.8"
    />
    <polygon
      points="59,83 32,56 36,52 40,56"
      fill={BRAND.amber}
      opacity="0.85"
    />
  </>
);

// ─── Component ────────────────────────────────────────────────────────────────

export const PolarisLogo: React.FC<PolarisLogoProps> = ({
  size = "md",
  theme = "light",
  variant = "full",
  className = "",
}) => {
  const { width, height } = SIZE_MAP[size];
  const textFill = theme === "dark" ? BRAND.white : BRAND.navy;
  const taglineOpacity = theme === "dark" ? "0.5" : "0.55";

  // ── Mark-only variant (collapsed sidebar, favicon context) ────────────────
  if (variant === "mark-only") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 76 100"
        width={height} // Square — use height as both dims
        height={height}
        role="img"
        aria-label="Polaris"
        className={className}
      >
        <StarMark />
      </svg>
    );
  }

  // ── Full logo ─────────────────────────────────────────────────────────────
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 420 100"
      width={width}
      height={height}
      role="img"
      aria-label="Polaris — Behind Yachting Operation"
      className={className}
    >
      {/* Star mark sits in the left-hand 76 units of the 420-unit viewBox */}
      <StarMark />

      {/* Primary wordmark */}
      <text
        x="82"
        y="70"
        fontFamily="'Playfair Display', 'Didot', 'Bodoni MT', Georgia, serif"
        fontSize="60"
        fontWeight="700"
        letterSpacing="2"
        fill={textFill}
      >
        POLARIS
      </text>

      {/* Tagline */}
      <text
        x="85"
        y="86"
        fontFamily="'Montserrat', 'Futura', 'Century Gothic', Arial, sans-serif"
        fontSize="9"
        fontWeight="400"
        letterSpacing="4.5"
        fill={textFill}
        opacity={taglineOpacity}
      >
        BEHIND YACHTING OPERATION
      </text>
    </svg>
  );
};

export default PolarisLogo;
