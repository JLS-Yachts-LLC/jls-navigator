import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { Loader2, BookOpen, ChevronRight } from "lucide-react";
import { DEPARTMENTS } from "./guide-meta";

export function GuidesOverview() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await fetchAllRows(() => (supabase as any).from("guides").select("department"));
    const c: Record<string, number> = {};
    for (const r of (data ?? []) as { department: string }[]) c[r.department] = (c[r.department] ?? 0) + 1;
    setCounts(c);
    setLoading(false);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">Knowledge Base</div>
        <h1 className="mt-0.5 flex items-center gap-2 font-display text-[1.25rem] font-semibold tracking-tight">
          <BookOpen className="h-4 w-4 text-primary/80" /> Guides
        </h1>
      </header>

      <div className="flex-1 overflow-auto px-6 py-6">
        {loading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <p className="mb-5 max-w-2xl text-sm text-muted-foreground">
              How-to guides and reference material organised by department. Select a department to browse its guides or add a new one.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {DEPARTMENTS.map(d => {
                const Icon = d.icon;
                const n = counts[d.label] ?? 0;
                return (
                  <Link
                    key={d.key}
                    to="/guides/$department"
                    params={{ department: d.key }}
                    className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/30 hover:shadow-sm"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium leading-tight">{d.label}</div>
                      <div className="text-xs text-muted-foreground">{n} {n === 1 ? "guide" : "guides"}</div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
