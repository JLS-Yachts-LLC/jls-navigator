/**
 * PolarisMark — the Polaris star on its Teal Blue tile, exactly as the favicon
 * draws it. Use this wherever the brand needs an icon (app chrome, menus);
 * PolarisLogo uses the same shapes for the full logo lockup.
 *
 * The geometry lives in ./polaris-star.ts, shared with the favicon build.
 */
import { useId } from "react";
import { POLARIS_STAR } from "./polaris-star";

/**
 * The tile and star as SVG children, on the 64-unit grid. Exported so the full
 * logo can place them inside its own <svg>. `gradientId` must be unique on the
 * page — two marks sharing an id would both take the first one's gradient.
 */
export function PolarisMarkShapes({ gradientId }: { gradientId: string }) {
  const { size, tileRadius, tileGradient, polygons } = POLARIS_STAR;
  return (
    <>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={tileGradient.top} />
          <stop offset="1" stopColor={tileGradient.bottom} />
        </linearGradient>
      </defs>
      <rect width={size} height={size} rx={tileRadius} fill={`url(#${gradientId})`} />
      {polygons.map((p) => (
        <polygon key={p.points} points={p.points} fill={p.fill} />
      ))}
    </>
  );
}

/** A gradient id safe to use in url(#…): React's useId contains ":" / "«»". */
export function useMarkGradientId(): string {
  return `polaris-tile-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

export function PolarisMark({
  size = 28,
  className,
  title = "Polaris",
}: {
  /** Rendered width and height in px. */
  size?: number;
  className?: string;
  /** Accessible name; pass "" when it sits next to the word POLARIS already. */
  title?: string;
}) {
  const gradientId = useMarkGradientId();
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${POLARIS_STAR.size} ${POLARIS_STAR.size}`}
      width={size}
      height={size}
      className={className}
      style={{ flexShrink: 0, display: "block" }}
      {...(title ? { role: "img", "aria-label": title } : { "aria-hidden": true })}
    >
      <PolarisMarkShapes gradientId={gradientId} />
    </svg>
  );
}

export default PolarisMark;
