/**
 * PlacementSelect — themed dark dropdown for the new Crew Placement
 * screens (Candidates/Pipeline/Dashboard), per ticket #231's ask to swap
 * native inputs for a themed dropdown. Modeled on
 * src/components/port-calls/StatusSelect.tsx — same interaction pattern,
 * restyled with shadcn theme tokens (bg-card/border-border/text-foreground)
 * to match crew-placement-page.tsx's existing Tailwind conventions, rather
 * than the raw-hex pds palette Port Calls used.
 */
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PlacementSelectOption {
  value: string;
  label: string;
}

export function PlacementSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: PlacementSelectOption[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          "flex h-8 w-full items-center justify-between rounded border border-border bg-background px-2 text-xs",
          "focus:outline-none focus:ring-1 focus:ring-ring",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 opacity-60 transition", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-md border border-border bg-popover shadow-xl">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">No options</div>
          ) : (
            options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => { onChange(option.value); setOpen(false); }}
                  className={cn(
                    "flex w-full items-center px-3 py-1.5 text-left text-xs hover:bg-accent",
                    isSelected && "bg-accent/60 text-primary font-medium",
                  )}
                >
                  {option.label}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default PlacementSelect;
