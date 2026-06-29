/**
 * Polaris Redesign — primitive components (#195).
 * StatusBadge · PolarisButton · SectionLabel · Skeleton · EmptyState · TIcon.
 * All read --pds-* tokens (see tokens.css); render inside a `.pds` root.
 */
import type { CSSProperties, ReactNode } from "react";

/** Tabler outline icon. Never filled, never emoji (spec). */
export function TIcon({
  name,
  size = 16,
  color,
  style,
}: {
  name: string;
  size?: number;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <i
      className={`ti ti-${name}`}
      aria-hidden="true"
      style={{ fontSize: size, color, lineHeight: 1, ...style }}
    />
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
export type BadgeVariant =
  | "active"
  | "expiring"
  | "expired"
  | "neutral"
  | "grey";

const BADGE_STYLES: Record<BadgeVariant, { bg: string; color: string }> = {
  active: { bg: "var(--pds-active-bg)", color: "var(--pds-active-text)" },
  expiring: { bg: "var(--pds-expiring-bg)", color: "var(--pds-expiring-text)" },
  expired: { bg: "var(--pds-expired-bg)", color: "var(--pds-expired-text)" },
  neutral: { bg: "var(--pds-gold-muted)", color: "var(--pds-gold-light)" },
  grey: { bg: "var(--pds-surface-3)", color: "var(--pds-text-secondary)" },
};

export function StatusBadge({
  variant,
  label,
}: {
  variant: BadgeVariant;
  label: string;
}) {
  const s = BADGE_STYLES[variant];
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "var(--pds-fs-badge)",
        fontWeight: 500,
        padding: "3px 10px",
        borderRadius: "var(--pds-radius-full)",
        background: s.bg,
        color: s.color,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

// ── Button ──────────────────────────────────────────────────────────────────
export type ButtonVariant = "primary" | "ghost";

export function PolarisButton({
  variant = "ghost",
  icon,
  label,
  onClick,
  disabled,
  title,
}: {
  variant?: ButtonVariant;
  icon?: string;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  const base: CSSProperties = {
    borderRadius: "var(--pds-radius-md)",
    padding: "10px 16px",
    minHeight: 44, // ≥44px tap target (spec rule #6)
    fontSize: "var(--pds-fs-body)",
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    whiteSpace: "nowrap",
    opacity: disabled ? 0.4 : 1,
    transition: "opacity 0.15s, background 0.15s",
  };
  const variantStyle: CSSProperties =
    variant === "primary"
      ? {
          background: "var(--pds-gold)",
          color: "var(--pds-navy)",
          border: "none",
        }
      : {
          background: "var(--pds-surface-3)",
          color: "var(--pds-text-secondary)",
          border: "1px solid var(--pds-border)",
        };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{ ...base, ...variantStyle }}
    >
      {icon && <TIcon name={icon} size={16} />}
      {label}
    </button>
  );
}

// ── Section label (uppercase chart-label treatment) ─────────────────────────
export function SectionLabel({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        fontSize: "var(--pds-fs-section)",
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "rgba(69,144,186,0.70)",
        marginBottom: 8,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
export function Skeleton({
  width,
  height = 14,
  radius = 4,
  style,
}: {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      className="pds-skeleton"
      style={{ width: width ?? "100%", height, borderRadius: radius, ...style }}
    />
  );
}

// ── Empty state (always has a CTA option) ─────────────────────────────────────
export function EmptyState({
  icon,
  message,
  action,
}: {
  icon: string;
  message: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div style={{ textAlign: "center", padding: "32px 16px" }}>
      <TIcon
        name={icon}
        size={40}
        color="rgba(69,144,186,0.35)"
        style={{ display: "block", margin: "0 auto 12px" }}
      />
      <p
        style={{
          fontSize: "var(--pds-fs-body)",
          color: "var(--pds-text-secondary)",
          margin: action ? "0 0 16px" : 0,
        }}
      >
        {message}
      </p>
      {action && (
        <PolarisButton
          variant="primary"
          label={action.label}
          onClick={action.onClick}
        />
      )}
    </div>
  );
}
