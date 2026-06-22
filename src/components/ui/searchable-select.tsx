import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SSOption { value: string; label: string; sub?: string }

/**
 * Type-to-filter dropdown: a trigger that opens a searchable list. Drop-in for a
 * shadcn Select where the option list is long (e.g. the 180-yacht selector).
 */
export function SearchableSelect({
  value, onValueChange, options, placeholder = "Select…", className, triggerClassName, emptyText = "No matches",
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: SSOption[];
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const term = q.trim().toLowerCase();
  const filtered = term ? options.filter((o) => `${o.label} ${o.sub ?? ""}`.toLowerCase().includes(term)) : options;

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button type="button" onClick={() => { setOpen((o) => !o); setQ(""); }}
        className={cn("flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm", triggerClassName)}>
        <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected ? selected.label : placeholder}</span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[14rem] rounded-md border border-border bg-popover shadow-xl">
          <div className="relative border-b border-border p-1.5">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type to search…"
              className="h-8 w-full rounded bg-transparent pl-7 pr-2 text-sm outline-none" />
          </div>
          <div className="max-h-60 overflow-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">{emptyText}</div>
            ) : filtered.map((o) => (
              <button key={o.value} type="button"
                onClick={() => { onValueChange(o.value); setOpen(false); setQ(""); }}
                className={cn("flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent", o.value === value && "text-primary")}>
                <span className="min-w-0 flex-1 truncate">{o.label}{o.sub && <span className="ml-1.5 text-xs text-muted-foreground">{o.sub}</span>}</span>
                {o.value === value && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
