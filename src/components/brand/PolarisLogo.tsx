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
 *  - Brand colours (official): #07435E Teal Blue | #4590BA Dodger Blue | #96CBC7 Jamaica Bay
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from "react";
import { PolarisMarkShapes, useMarkGradientId } from "./PolarisMark";
import { POLARIS_STAR } from "./polaris-star";

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
   *  'light'  Teal Blue wordmark (#07435E) for white/light backgrounds  ← default
   *  'dark'   White wordmark (#FFFFFF) for navy/dark backgrounds
   *
   * The star mark is identical in both themes: it carries its own Teal Blue
   * tile, so it reads on any background.
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

/**
 * Brand colours — OFFICIAL Polaris palette (Brand Guidelines v1.0): Teal Blue /
 * Dodger Blue / Jamaica Bay. The star mark's own colours live with its geometry
 * in ./polaris-star.ts.
 */
const BRAND = {
  navy: "#07435E", // Teal Blue — wordmark on light backgrounds
  white: "#FFFFFF",
} as const;

/**
 * Star mark placement inside the full logo's 420 × 100 viewBox: the 64-unit
 * tile scaled to 60 units and centred on the logo's mid-line (y = 50), so it
 * stands a little taller than the wordmark's capitals.
 *
 * The mark changed in October 2026 from the original eight thin, overlapping,
 * semi-transparent points to the tiled faceted star the favicon uses, so the
 * login screen, the app chrome and the browser tab all show one star. The old
 * points blurred at small sizes and half of them disappeared on dark backgrounds.
 */
const MARK_SCALE = 60 / POLARIS_STAR.size;
const MARK_X = 6;
const MARK_Y = 50 - 30;

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
  const gradientId = useMarkGradientId();

  // ── Mark-only variant (collapsed sidebar, favicon context) ────────────────
  if (variant === "mark-only") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${POLARIS_STAR.size} ${POLARIS_STAR.size}`}
        width={height} // Square — use height as both dims
        height={height}
        role="img"
        aria-label="Polaris"
        className={className}
      >
        <PolarisMarkShapes gradientId={gradientId} />
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
      {/* Star mark sits in the left-hand ~70 units of the 420-unit viewBox */}
      <g transform={`translate(${MARK_X} ${MARK_Y}) scale(${MARK_SCALE})`}>
        <PolarisMarkShapes gradientId={gradientId} />
      </g>

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
