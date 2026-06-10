import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { COLORS } from "@/lib/tokens";
import { LeoIcon } from "@/components/leo/LeoIcon";

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

        {/* Leo constellation mark */}
        <LeoIcon size={32} variant="leo" className="drop-shadow-sm" />

        {/* Pulse ring */}
        <span
          className="absolute inset-0 rounded-full animate-ping opacity-15"
          style={{ background: `rgba(232,160,32,0.3)` }}
        />
      </button>
    </div>
  );
}
