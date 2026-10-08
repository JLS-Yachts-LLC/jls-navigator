/**
 * Integrations panel: link each vessel to its QuickBooks customer.
 * Loads vessels (Supabase) + the QBO customer directory (/api/qb/customers),
 * fuzzy-suggests a match per vessel, and lets you accept it or override with a
 * searchable picker. Writes yachts.qbo_customer_id via the authenticated client.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Building2, CheckCircle2, Loader2, Link2, Link2Off, Search, Sparkles, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Yacht = { id: string; vessel_name: string; qbo_customer_id: string | null };
type Customer = { id: string; displayName: string; trn: string | null };

// ── Fuzzy matching (bigram Dice on normalized names) ─────────────────────────
export function norm(s: string): string {
  return s.toLowerCase().replace(/\b(m\/?y|s\/?y|m\/?v|yacht|the)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
function bigrams(s: string): string[] {
  const r: string[] = [];
  for (let i = 0; i < s.length - 1; i++) r.push(s.slice(i, i + 2));
  return r;
}
export function similarity(a: string, b: string): number {
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const A = bigrams(na), B = bigrams(nb);
  if (!A.length || !B.length) return 0;
  const m = new Map<string, number>();
  A.forEach((g) => m.set(g, (m.get(g) ?? 0) + 1));
  let inter = 0;
  B.forEach((g) => { const c = m.get(g) ?? 0; if (c > 0) { inter++; m.set(g, c - 1); } });
  return (2 * inter) / (A.length + B.length);
}

export function QboCustomersPanel() {
  const [yachts, setYachts] = useState<Yacht[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [onlyUnlinked, setOnlyUnlinked] = useState(false);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true); setError(null);
    try {
      const { data: ys, error: yErr } = await (supabase as any)
        .from("yachts").select("id, vessel_name, qbo_customer_id").eq("archive", false).order("vessel_name");
      if (yErr) throw yErr;
      setYachts((ys ?? []) as Yacht[]);

      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch("/api/qb/customers", { headers: { Authorization: `Bearer ${session?.access_token ?? ""}` } });
      const j = await r.json();
      if (!j.ok) { setError(j.code === "not_configured" ? "QuickBooks isn’t connected yet." : (j.error ?? "Could not load QuickBooks customers.")); }
      else setCustomers(j.customers ?? []);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally { setLoading(false); }
  }

  const custById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);

  // Best fuzzy suggestion per yacht.
  const suggestions = useMemo(() => {
    const map = new Map<string, { customer: Customer; score: number } | null>();
    for (const y of yachts) {
      let best: { customer: Customer; score: number } | null = null;
      for (const c of customers) {
        const score = similarity(y.vessel_name, c.displayName);
        if (!best || score > best.score) best = { customer: c, score };
      }
      map.set(y.id, best && best.score >= 0.34 ? best : null);
    }
    return map;
  }, [yachts, customers]);

  async function link(yachtId: string, customerId: string | null, name?: string) {
    setSavingId(yachtId);
    const { error: e } = await (supabase as any).from("yachts").update({ qbo_customer_id: customerId }).eq("id", yachtId);
    if (e) toast.error(e.message);
    else {
      setYachts((prev) => prev.map((y) => (y.id === yachtId ? { ...y, qbo_customer_id: customerId } : y)));
      toast.success(customerId ? `Linked to ${name}` : "Unlinked");
    }
    setSavingId(null); setEditingId(null); setSearch("");
  }

  const linkedCount = yachts.filter((y) => y.qbo_customer_id).length;
  const shown = onlyUnlinked ? yachts.filter((y) => !y.qbo_customer_id) : yachts;

  const pickerMatches = (q: string) => {
    const s = q.trim().toLowerCase();
    const list = s ? customers.filter((c) => c.displayName.toLowerCase().includes(s)) : customers;
    return list.slice(0, 12);
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.4)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <h2 className="font-display text-sm font-semibold">QuickBooks — Vessel ↔ Customer links</h2>
          {!loading && !error && (
            <span className="text-[11px] text-muted-foreground">{linkedCount}/{yachts.length} linked · {customers.length} QBO customers</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <input type="checkbox" checked={onlyUnlinked} onChange={(e) => setOnlyUnlinked(e.target.checked)} /> Unlinked only
          </label>
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Refresh
          </Button>
        </div>
      </div>

      <p className="mb-3 text-[12px] text-muted-foreground">
        Invoices are created against the linked customer, so the match must be correct. Suggestions are fuzzy-matched
        by name — accept the suggestion, or override it with the exact QuickBooks customer.
      </p>

      {loading ? (
        <div className="py-6 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5" /> {error}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10.5px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-semibold">Vessel</th>
                <th className="px-3 py-2 font-semibold">QuickBooks customer</th>
                <th className="px-3 py-2 font-semibold w-[42%]">Match / action</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((y) => {
                const linked = y.qbo_customer_id ? custById.get(y.qbo_customer_id) : null;
                const sug = suggestions.get(y.id) ?? null;
                const isEditing = editingId === y.id;
                const saving = savingId === y.id;
                return (
                  <tr key={y.id} className="border-b border-border/40 align-top">
                    <td className="py-2.5 pr-3 font-medium">{y.vessel_name}</td>
                    <td className="px-3 py-2.5">
                      {y.qbo_customer_id ? (
                        <span className="inline-flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                          <span>{linked?.displayName ?? <span className="text-amber-400">Unknown id {y.qbo_customer_id}</span>}</span>
                          {linked?.trn && <span className="text-[10.5px] text-muted-foreground">TRN {linked.trn}</span>}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Not linked</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : isEditing ? (
                        <div className="space-y-1.5">
                          <input
                            autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search QuickBooks customers…"
                            className="h-7 w-full rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                          <div className="max-h-44 overflow-auto rounded border border-border/60">
                            {pickerMatches(search).map((c) => (
                              <button key={c.id} onClick={() => link(y.id, c.id, c.displayName)}
                                className="flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-xs hover:bg-accent/40">
                                <span className="truncate">{c.displayName}</span>
                                {c.trn && <span className="shrink-0 text-[10px] text-muted-foreground">TRN {c.trn}</span>}
                              </button>
                            ))}
                            {pickerMatches(search).length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No matches</div>}
                          </div>
                          <button onClick={() => { setEditingId(null); setSearch(""); }} className="text-[11px] text-muted-foreground hover:text-foreground">Cancel</button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          {!y.qbo_customer_id && sug && (
                            <button onClick={() => link(y.id, sug.customer.id, sug.customer.displayName)}
                              className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition",
                                sug.score >= 0.7 ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                                  : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/50")}>
                              <Sparkles className="h-3 w-3" /> {sug.customer.displayName}
                              <span className="opacity-70">{Math.round(sug.score * 100)}%</span>
                            </button>
                          )}
                          {!y.qbo_customer_id && !sug && <span className="text-[11px] text-muted-foreground/70">No suggestion</span>}
                          <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[11px]" onClick={() => { setEditingId(y.id); setSearch(""); }}>
                            <Link2 className="h-3 w-3" /> {y.qbo_customer_id ? "Change" : "Choose…"}
                          </Button>
                          {y.qbo_customer_id && (
                            <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-red-400" onClick={() => link(y.id, null)}>
                              <Link2Off className="h-3 w-3" /> Unlink
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr><td colSpan={3} className="py-6 text-center text-sm text-muted-foreground">{onlyUnlinked ? "All vessels are linked 🎉" : "No vessels."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
