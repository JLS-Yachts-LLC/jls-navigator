import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { COLORS } from "@/lib/tokens";

/**
 * Leo floating action bubble — bottom-right of every app screen.
 * Colours: leoAmber (#E8A020) for the Leo identity.
 * Background: void/abyss dark.
 */
export function LeoBubble() {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {/* Tooltip */}
      <div
        className={cn(
          "mb-1 rounded-lg px-3 py-1.5 shadow-lg backdrop-blur-sm transition-all duration-200",
          hovered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1 pointer-events-none",
        )}
        style={{
          background: "rgba(13,21,32,0.96)",
          border: `1px solid rgba(232,160,32,0.25)`,
        }}
      >
        <p
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.12em",
            color: COLORS.leoAmber,
            margin: 0,
          }}
        >
          LEO AI AGENT
        </p>
        <p
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 10,
            color: COLORS.muted,
            margin: "2px 0 0",
          }}
        >
          Powered by Polaris
        </p>
      </div>

      {/* Bubble button */}
      <button
        onClick={() => navigate({ to: "/ai-assistant" })}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="group relative flex h-14 w-14 items-center justify-center rounded-full transition-all duration-200 hover:scale-110"
        aria-label="Open Leo AI Agent"
        style={{
          background: `radial-gradient(circle at 35% 35%, ${COLORS.abyss}, ${COLORS.void})`,
          border: `1.5px solid rgba(232,160,32,0.55)`,
          boxShadow: hovered
            ? `0 6px 32px rgba(232,160,32,0.45)`
            : `0 4px 24px rgba(232,160,32,0.25)`,
        }}
      >
        {/* Rotating outer ring */}
        <svg
          className="absolute inset-0 h-full w-full animate-[spin_14s_linear_infinite] opacity-35"
          viewBox="0 0 56 56"
        >
          <circle
            cx="28" cy="28" r="26"
            stroke={COLORS.leoAmber}
            strokeWidth="0.8"
            strokeDasharray="4 6"
            fill="none"
          />
        </svg>

        {/* Leo lion icon */}
        <svg viewBox="0 0 32 32" className="h-8 w-8 drop-shadow-sm" fill="none">
          {/* Mane — outer halo dots */}
          {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => {
            const r = (deg * Math.PI) / 180;
            const x = 16 + Math.cos(r) * 10.5;
            const y = 16 + Math.sin(r) * 10.5;
            return (
              <circle
                key={deg}
                cx={x.toFixed(1)}
                cy={y.toFixed(1)}
                r="1.6"
                fill={COLORS.leoAmber}
                opacity="0.65"
              />
            );
          })}

          {/* Face base */}
          <circle cx="16" cy="16" r="7.5" fill={COLORS.leoAmber} opacity="0.10" />
          <circle cx="16" cy="16" r="7.5" stroke={COLORS.leoAmber} strokeWidth="1" fill="none" />

          {/* Eyes */}
          <circle cx="13.5" cy="15" r="1.2" fill={COLORS.leoAmber} />
          <circle cx="18.5" cy="15" r="1.2" fill={COLORS.leoAmber} />
          <circle cx="13.8" cy="14.7" r="0.45" fill={COLORS.void} />
          <circle cx="18.8" cy="14.7" r="0.45" fill={COLORS.void} />

          {/* Nose */}
          <path d="M15.2 17.5 L16 18.5 L16.8 17.5 Z" fill={COLORS.leoAmber} opacity="0.8" />

          {/* Mouth */}
          <path
            d="M14.2 18.8 Q16 20 17.8 18.8"
            stroke={COLORS.leoAmber}
            strokeWidth="0.7"
            fill="none"
            strokeLinecap="round"
            opacity="0.65"
          />

          {/* Ears */}
          <path d="M10.5 10.5 L12 13.5 L14 11.5 Z" fill={COLORS.leoAmber} opacity="0.55" />
          <path d="M21.5 10.5 L20 13.5 L18 11.5 Z" fill={COLORS.leoAmber} opacity="0.55" />

          {/* Circuit lines — tech detail */}
          <line x1="7"  y1="16" x2="9"  y2="16" stroke={COLORS.leoAmber} strokeWidth="0.5" opacity="0.45" />
          <line x1="23" y1="16" x2="25" y2="16" stroke={COLORS.leoAmber} strokeWidth="0.5" opacity="0.45" />
          <line x1="7"  y1="16" x2="7"  y2="19" stroke={COLORS.leoAmber} strokeWidth="0.5" opacity="0.45" />
          <line x1="25" y1="16" x2="25" y2="19" stroke={COLORS.leoAmber} strokeWidth="0.5" opacity="0.45" />
        </svg>

        {/* Pulse ring */}
        <span
          className="absolute inset-0 rounded-full animate-ping opacity-15"
          style={{ background: `rgba(232,160,32,0.3)` }}
        />
      </button>
    </div>
  );
}
