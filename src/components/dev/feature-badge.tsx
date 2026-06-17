import { Star, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FlagStage } from "@/lib/release-flags";

type Variant = "tag" | "pill";

/** Small "Beta" chip shown next to beta-stage features. */
export function BetaBadge({ variant = "tag", className }: { variant?: Variant; className?: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 border font-semibold uppercase tracking-wide",
      "border-sky-500/30 bg-sky-500/15 text-sky-400",
      variant === "pill" ? "rounded-full px-2 py-0.5 text-[10px]" : "rounded px-1.5 py-px text-[9px]",
      className,
    )}>
      <Star className="h-2.5 w-2.5 fill-current" /> Beta
    </span>
  );
}

/** Small amber "Dev" chip shown next to dev-stage features (dev viewers only). */
export function DevBadge({ variant = "tag", className }: { variant?: Variant; className?: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 border font-semibold uppercase tracking-wide",
      "border-amber-500/30 bg-amber-500/15 text-amber-400",
      variant === "pill" ? "rounded-full px-2 py-0.5 text-[10px]" : "rounded px-1.5 py-px text-[9px]",
      className,
    )}>
      <Wrench className="h-2.5 w-2.5" /> Dev
    </span>
  );
}

/** Renders the badge appropriate to a stage (nothing for "live"). */
export function StageBadge({ stage, variant }: { stage: FlagStage; variant?: Variant }) {
  if (stage === "beta") return <BetaBadge variant={variant} />;
  if (stage === "dev") return <DevBadge variant={variant} />;
  return null;
}
