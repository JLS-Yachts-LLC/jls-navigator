export function PolarisLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 220 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Polaris Management Platform"
    >
      {/* Compass rose mark */}
      <g transform="translate(28,28)">
        {/* Outer thin spokes — 8 directions */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <line
            key={deg}
            x1="0" y1="0"
            x2={Math.cos((deg - 90) * Math.PI / 180) * 20}
            y2={Math.sin((deg - 90) * Math.PI / 180) * 20}
            stroke="#C9A84C"
            strokeWidth="0.8"
            strokeOpacity="0.5"
          />
        ))}
        {/* Cardinal points — 4 elongated diamond blades */}
        {[0, 90, 180, 270].map((deg) => {
          const rad = (deg - 90) * Math.PI / 180;
          const tip = 22;
          const side = 3;
          const perp = (deg - 90 + 90) * Math.PI / 180;
          return (
            <polygon
              key={deg}
              points={[
                [Math.cos(rad) * tip, Math.sin(rad) * tip],
                [Math.cos(perp) * side, Math.sin(perp) * side],
                [0, 0],
                [-Math.cos(perp) * side, -Math.sin(perp) * side],
              ].map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ")}
              fill="#C9A84C"
            />
          );
        })}
        {/* Intercardinal points — 4 smaller diamond blades */}
        {[45, 135, 225, 315].map((deg) => {
          const rad = (deg - 90) * Math.PI / 180;
          const tip = 14;
          const side = 2.2;
          const perp = (deg - 90 + 90) * Math.PI / 180;
          return (
            <polygon
              key={deg}
              points={[
                [Math.cos(rad) * tip, Math.sin(rad) * tip],
                [Math.cos(perp) * side, Math.sin(perp) * side],
                [0, 0],
                [-Math.cos(perp) * side, -Math.sin(perp) * side],
              ].map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ")}
              fill="#C9A84C"
              fillOpacity="0.75"
            />
          );
        })}
        {/* Centre ring */}
        <circle r="4" fill="#C9A84C" />
        <circle r="2.2" fill="#1a2744" />
        {/* North star dot */}
        <circle r="1.2" fill="#C9A84C" />
      </g>

      {/* Wordmark */}
      <text
        x="62"
        y="24"
        fontFamily="'Georgia', 'Times New Roman', serif"
        fontSize="20"
        letterSpacing="3"
        fill="#C9A84C"
        fontWeight="700"
      >
        POLARIS
      </text>
      <text
        x="63"
        y="38"
        fontFamily="'Arial', sans-serif"
        fontSize="7"
        letterSpacing="2.5"
        fill="#8fa3c0"
        fontWeight="400"
      >
        MANAGEMENT PLATFORM
      </text>
      {/* Thin rule under wordmark */}
      <line x1="62" y1="43" x2="218" y2="43" stroke="#C9A84C" strokeWidth="0.5" strokeOpacity="0.35" />
    </svg>
  );
}
