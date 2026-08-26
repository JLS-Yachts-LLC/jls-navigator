/**
 * The floating "LEO" toggle pill + chat panel, fixed bottom-right — the same
 * widget the Polaris redesign home screen uses. Click-to-open, not draggable;
 * replaces the older LeoBubble (drag-to-move, throw-to-bounce) so every route
 * gets the same Leo experience regardless of which layout renders it.
 */
import { useState } from "react";
import { LeoChat } from "./LeoChat";

export function LeoFloatingChat({ token, userName }: { token: string; userName: string }) {
  const [open, setOpen] = useState(false);
  if (!token) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        width: open ? 420 : "auto",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 0,
        filter: "drop-shadow(0 8px 32px rgba(0,0,0,0.55))",
      }}
    >
      {open && (
        <div style={{ width: "100%", height: "min(70vh, 520px)", marginBottom: 0 }}>
          <LeoChat token={token} userName={userName} onClose={() => setOpen(false)} />
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          marginTop: open ? 6 : 0,
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "#0D1520",
          border: "1px solid #1E4060",
          borderRadius: 20,
          padding: "6px 14px 6px 10px",
          cursor: "pointer",
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 12,
          fontWeight: 700,
          color: "#4590ba",
          letterSpacing: "0.12em",
          boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "#4590ba",
            display: "inline-block",
            animation: "pulse 2s ease-in-out infinite",
          }}
        />
        LEO
        <span style={{ fontSize: 10, color: "#3A5570", fontWeight: 400, marginLeft: 2 }}>
          {open ? "▾" : "▴"}
        </span>
      </button>
    </div>
  );
}
