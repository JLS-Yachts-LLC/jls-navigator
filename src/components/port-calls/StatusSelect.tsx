/**
 * StatusSelect — Agency Module (Port Calls).
 *
 * Generic themed dropdown, replacing native <select> per the platform rule
 * ("No native <select> popup anywhere - confirm fully themed dark UI",
 * POLARIS-PHONE-BETA-INTEGRATION.md). Modeled on the same interaction
 * pattern as src/components/visa/VisaOccupationSelect.tsx, restyled with
 * the official brand palette shared across both modules:
 *  Light gold   #E9CC72 (selected text, checkmark)
 *  Warm gold    #C9A227 (focus ring, border)
 *  Navy         #0A1838 (popup background)
 */
import { useEffect, useRef, useState } from "react";

export interface StatusOption {
  value: string;
  label: string;
}

export function StatusSelect({
  value,
  onChange,
  options,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: StatusOption[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", minWidth: 140 }}>
      <div
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
          if (e.key === "Escape") setOpen(false);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "6px 10px",
          borderRadius: 8,
          border: open
            ? "1px solid #C9A227"
            : "1px solid rgba(233,204,114,0.3)",
          background: "rgba(255,255,255,0.04)",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          boxShadow: open ? "0 0 0 3px rgba(201,162,39,0.20)" : "none",
        }}
      >
        <span
          style={{
            fontFamily: "'DINPro','Barlow',sans-serif",
            fontSize: 13,
            fontWeight: 500,
            color: "#FFFFFF",
          }}
        >
          {selected ? selected.label : "Select…"}
        </span>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>
          {open ? "▲" : "▼"}
        </span>
      </div>

      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 50,
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "#0A1838",
            boxShadow: "0 12px 28px rgba(0,0,0,0.35)",
            padding: 4,
          }}
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <div
                key={option.value}
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                  background: isSelected
                    ? "rgba(201,162,39,0.18)"
                    : "transparent",
                }}
              >
                <span
                  style={{
                    fontFamily: "'DINPro','Barlow',sans-serif",
                    fontSize: 13,
                    color: isSelected ? "#E9CC72" : "#FFFFFF",
                  }}
                >
                  {option.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default StatusSelect;
