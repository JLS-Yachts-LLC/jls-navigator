/**
 * Polaris wordmark + compass-rose mark.
 * Colours: signal cyan (#00C4CC) for all brand elements.
 * Typography: Space Grotesk (no serif — ever).
 */
export function PolarisLogo({ className }: { className?: string }) {
  const SIGNAL = "#00C4CC";
  const SIGNAL_DIM = "rgba(0,196,204,0.55)";
  const SIGNAL_FAINT = "rgba(0,196,204,0.25)";
  const BG_DOT = "#080D14";      /* void — matches page/sidebar background */

  return (
    <svg
      viewBox="0 0 220 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Polaris Management Platform"
    >
      {/* ── Compass-rose mark ─────────────────────────────────── */}
      <g transform="translate(28,28)">
        {/* Outer thin spokes — 8 directions */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <line
            key={deg}
            x1="0" y1="0"
            x2={Math.cos((deg - 90) * Math.PI / 180) * 20}
            y2={Math.sin((deg - 90) * Math.PI / 180) * 20}
            stroke={SIGNAL}
            strokeWidth="0.8"
            strokeOpacity="0.35"
          />
        ))}

        {/* Cardinal points — 4 elongated diamond blades */}
        {[0, 90, 180, 270].map((deg) => {
          const rad  = (deg - 90) * Math.PI / 180;
          const perp = (deg - 90 + 90) * Math.PI / 180;
          const tip  = 22;
          const side = 3;
          return (
            <polygon
              key={deg}
              points={[
                [Math.cos(rad) * tip,   Math.sin(rad) * tip],
                [Math.cos(perp) * side, Math.sin(perp) * side],
                [0, 0],
                [-Math.cos(perp) * side, -Math.sin(perp) * side],
              ].map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ")}
              fill={SIGNAL}
            />
          );
        })}

        {/* Intercardinal points — 4 smaller diamond blades */}
        {[45, 135, 225, 315].map((deg) => {
          const rad  = (deg - 90) * Math.PI / 180;
          const perp = (deg - 90 + 90) * Math.PI / 180;
          const tip  = 14;
          const side = 2.2;
          return (
            <polygon
              key={deg}
              points={[
                [Math.cos(rad) * tip,   Math.sin(rad) * tip],
                [Math.cos(perp) * side, Math.sin(perp) * side],
                [0, 0],
                [-Math.cos(perp) * side, -Math.sin(perp) * side],
              ].map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ")}
              fill={SIGNAL}
              fillOpacity="0.65"
            />
          );
        })}

        {/* Centre ring */}
        <circle r="4"   fill={SIGNAL} />
        <circle r="2.2" fill={BG_DOT} />
        {/* North star dot */}
        <circle r="1.2" fill={SIGNAL} />
      </g>

      {/* ── Wordmark ──────────────────────────────────────────── */}
      {/*
        Space Grotesk is loaded via Google Fonts in __root.tsx.
        No serif fallback — per brand rules.
      */}
      <text
        x="62"
        y="25"
        fontFamily="'Space Grotesk', 'Inter', sans-serif"
        fontSize="19"
        letterSpacing="3.5"
        fill={SIGNAL}
        fontWeight="700"
      >
        POLARIS
      </text>
      <text
        x="63"
        y="39"
        fontFamily="'Space Grotesk', 'Inter', sans-serif"
        fontSize="7"
        letterSpacing="2.8"
        fill={SIGNAL_DIM}
        fontWeight="500"
      >
        MANAGEMENT PLATFORM
      </text>

      {/* Thin rule under wordmark */}
      <line
        x1="62" y1="44"
        x2="218" y2="44"
        stroke={SIGNAL}
        strokeWidth="0.5"
        strokeOpacity="0.25"
      />
    </svg>
  );
}
