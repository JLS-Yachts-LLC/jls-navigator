import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDevAccess } from "@/lib/dev-access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ScrollText, ShieldOff, Loader2, RefreshCw, AlertTriangle, AlertCircle,
  ChevronRight, Trash2, CheckCircle2, Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type ClientLog = {
  id: string;
  level: "error" | "warn";
  message: string;
  source: string | null;
  stack: string | null;
  url: string | null;
  user_agent: string | null;
  breadcrumbs: { t: string; msg: string }[] | null;
  user_id: string | null;
  user_email: string | null;
  resolved: boolean;
  created_at: string;
};

type LevelFilter = "all" | "error" | "warn";

const fmt = (d: string) =>
  new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });

function useClientLogs(showResolved: boolean) {
  return useQuery({
    queryKey: ["client-logs", showResolved],
    refetchInterval: 30_000,
    queryFn: async () => {
      let q = (supabase as any)
        .from("client_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (!showResolved) q = q.eq("resolved", false);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as ClientLog[];
    },
  });
}

export function ErrorLogPage() {
  const devAccess = useDevAccess();
  if (!devAccess) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <ShieldOff className="h-10 w-10 text-muted-foreground/40" />
        <p className="font-display text-base font-semibold">Error Log is restricted</p>
        <p className="max-w-sm text-sm text-muted-foreground">You need the Dev role or admin access to view captured errors.</p>
      </div>
    );
  }
  return <ErrorLogContent />;
}

function ErrorLogContent() {
  const [showResolved, setShowResolved] = useState(false);
  const [level, setLevel] = useState<LevelFilter>("all");
  const [search, setSearch] = useState("");
  const [clearOpen, setClearOpen] = useState(false);
  const { data: logs = [], isLoading, isFetching, refetch } = useClientLogs(showResolved);
  const qc = useQueryClient();

  const resolve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("client_logs").update({ resolved: true }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-logs"] }),
    onError: (e: any) => toast.error(e.message ?? "Could not resolve"),
  });

  const clearResolved = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("client_logs").delete().eq("resolved", true);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Resolved logs cleared"); qc.invalidateQueries({ queryKey: ["client-logs"] }); },
    onError: (e: any) => toast.error(e.message ?? "Could not clear logs"),
  });

  const counts = useMemo(() => ({
    error: logs.filter((l) => l.level === "error").length,
    warn: logs.filter((l) => l.level === "warn").length,
  }), [logs]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (level !== "all" && l.level !== level) return false;
      if (term && !(`${l.message} ${l.source ?? ""} ${l.url ?? ""} ${l.user_email ?? ""}`.toLowerCase().includes(term))) return false;
      return true;
    });
  }, [logs, level, search]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">Polaris / Developer</div>
          <h1 className="mt-0.5 flex items-center gap-2 font-display text-[1.25rem] font-semibold tracking-tight">
            <ScrollText className="h-5 w-5 text-primary" /> Error &amp; Warning Log
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => refetch()}>
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} /> Refresh
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto px-6 py-5">
        <div className="mx-auto max-w-5xl space-y-4">
          <p className="text-sm text-muted-foreground">
            Errors and warnings captured automatically from every user&apos;s browser, so faults surface here before they have to be reported manually.
          </p>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border border-border bg-muted/30 p-0.5">
              {(["all", "error", "warn"] as LevelFilter[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLevel(l)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium capitalize transition",
                    level === l ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {l === "error" && <AlertCircle className="h-3.5 w-3.5 text-red-400" />}
                  {l === "warn" && <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />}
                  {l === "all" ? "All" : l}
                  {l === "error" && <span className="text-muted-foreground/70">({counts.error})</span>}
                  {l === "warn" && <span className="text-muted-foreground/70">({counts.warn})</span>}
                </button>
              ))}
            </div>

            <div className="relative min-w-[200px] flex-1">
              <Filter className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by message, page, user…" className="h-9 pl-8" />
            </div>

            <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5 text-[12px] text-muted-foreground">
              <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} className="accent-primary" />
              Show resolved
            </label>

            <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground hover:text-destructive" onClick={() => setClearOpen(true)}>
              <Trash2 className="h-3.5 w-3.5" /> Clear resolved
            </Button>
          </div>

          {/* List */}
          {isLoading ? (
            <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 text-emerald-400/60" />
              <p className="text-sm">{logs.length === 0 ? "No errors or warnings captured. " : "Nothing matches your filters."}</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filtered.map((l) => <LogRow key={l.id} log={l} onResolve={() => resolve.mutate(l.id)} />)}
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear resolved logs?</AlertDialogTitle>
            <AlertDialogDescription>All logs marked as resolved will be permanently deleted. Unresolved logs are kept.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => clearResolved.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Clear</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LogRow({ log, onResolve }: { log: ClientLog; onResolve: () => void }) {
  const [open, setOpen] = useState(false);
  const isError = log.level === "error";

  return (
    <div className={cn(
      "rounded-lg border bg-card transition",
      log.resolved ? "border-border/50 opacity-60" : isError ? "border-red-500/25" : "border-amber-500/25",
    )}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left">
        <ChevronRight className={cn("mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform", open && "rotate-90")} />
        <span className={cn(
          "mt-0.5 inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
          isError ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400",
        )}>
          {isError ? <AlertCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
          {log.level}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-[12.5px] text-foreground">{log.message}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10.5px] text-muted-foreground">
            <span>{fmt(log.created_at)}</span>
            {log.url && <span className="truncate">· {shortUrl(log.url)}</span>}
            {log.user_email && <span>· {log.user_email}</span>}
          </div>
        </div>
        {!log.resolved && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onResolve(); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onResolve(); } }}
            className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground/70 hover:bg-emerald-500/10 hover:text-emerald-400"
            title="Mark resolved"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
          </span>
        )}
      </button>

      {open && (
        <div className="space-y-3 border-t border-border/50 px-3 py-3 text-[12px]">
          {log.source && <Detail label="Source" value={log.source} mono />}
          {log.url && <Detail label="Page" value={log.url} mono />}
          {log.user_agent && <Detail label="Browser" value={log.user_agent} />}
          {log.stack && (
            <div>
              <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground/70">Stack trace</div>
              <pre className="max-h-64 overflow-auto rounded-md bg-muted/50 p-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground">{log.stack}</pre>
            </div>
          )}
          {log.breadcrumbs && log.breadcrumbs.length > 0 && (
            <div>
              <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground/70">Recent activity</div>
              <ol className="space-y-0.5 rounded-md bg-muted/40 p-2.5">
                {log.breadcrumbs.map((b, i) => (
                  <li key={i} className="flex gap-2 font-mono text-[11px] text-muted-foreground">
                    <span className="text-muted-foreground/50">{new Date(b.t).toLocaleTimeString("en-GB")}</span>
                    <span>{b.msg}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="w-16 shrink-0 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground/70">{label}</span>
      <span className={cn("min-w-0 flex-1 break-all text-muted-foreground", mono && "font-mono text-[11.5px]")}>{value}</span>
    </div>
  );
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}
