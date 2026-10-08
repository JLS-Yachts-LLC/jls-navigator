/**
 * Vessel ↔ Waypoint Trading LLC customer links (chandlery, provisioning…).
 *
 * A vessel can be billed by JLS (yachts.qbo_customer_id) and by Waypoint, from
 * a separate QuickBooks company whose customer ids overlap JLS's. The Waypoint
 * link lives in yacht_qbo_accounts and is written through /api/qb/vessel-accounts.
 *
 *   - WaypointAccountsPanel — Sync hub: every vessel with its suggested Waypoint
 *     customer (matched by name), to approve one by one.
 *   - VesselWaypointLink — a vessel's Finance tab: link / change / unlink.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Link2, Link2Off, Loader2, Search, Sparkles, AlertTriangle, ShoppingBasket } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { norm, similarity } from "@/components/dev/qbo-customers-panel";
import { WAYPOINT_QBO_REALM, WAYPOINT_COMPANY } from "@/lib/qb/realms";

type Customer = { id: string; displayName: string; balance: number };
type Link = { yacht_id: string; customer_id: string; customer_name: string | null };

const money = (n: number) => `AED ${Number(n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${session?.access_token ?? ""}` };
}

// The Waypoint directory is a few thousand rows — fetched once per page view.
let customersPromise: Promise<Customer[]> | null = null;
function loadCustomers(force = false): Promise<Customer[]> {
  if (!customersPromise || force) {
    customersPromise = (async () => {
      const r = await fetch("/api/qb/vessel-accounts", { headers: await authHeader() });
      const j = await r.json().catch(() => null);
      if (!j?.ok) throw new Error(j?.error ?? "Could not load Waypoint's QuickBooks customers.");
      return j.customers as Customer[];
    })();
    customersPromise.catch(() => { customersPromise = null; });
  }
  return customersPromise;
}

async function saveLink(yachtId: string, customerId: string | null): Promise<boolean> {
  const r = await fetch("/api/qb/vessel-accounts", {
    method: "POST",
    headers: { ...(await authHeader()), "Content-Type": "application/json" },
    body: JSON.stringify({ yachtId, customerId }),
  });
  const j = await r.json().catch(() => null);
  if (!j?.ok) { toast.error(j?.error ?? "Couldn't save the link."); return false; }
  return true;
}

/**
 * How well a Waypoint customer name fits a vessel. Waypoint names its customers
 * like "SY Aquila- Captain Mike", so the vessel's name appearing as whole words
 * counts as a strong match even where the rest of the name drags the plain
 * similarity down.
 */
export function waypointScore(vessel: string, customer: string): number {
  const v = norm(vessel), c = norm(customer);
  if (!v || !c) return 0;
  const base = similarity(vessel, customer);
  if (v.length >= 3 && ` ${c} `.includes(` ${v} `)) return Math.max(base, v.length >= 5 ? 0.92 : 0.8);
  return base;
}

function bestMatches(vessel: string, customers: Customer[], taken: Set<string>, n = 1) {
  return customers
    .filter((c) => !taken.has(c.id))
    .map((c) => ({ customer: c, score: waypointScore(vessel, c.displayName) }))
    .filter((m) => m.score >= 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

function CustomerPicker({ vessel, customers, taken, onPick, onCancel }: {
  vessel: string; customers: Customer[]; taken: Set<string>;
  onPick: (c: Customer) => void; onCancel: () => void;
}) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return bestMatches(vessel, customers, taken, 12).map((m) => m.customer);
    return customers.filter((c) => !taken.has(c.id) && c.displayName.toLowerCase().includes(s)).slice(0, 12);
  }, [q, vessel, customers, taken]);
  return (
    <div className="space-y-1.5">
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${WAYPOINT_COMPANY} customers…`}
             className="h-7 w-full rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
      <div className="max-h-48 overflow-auto rounded border border-border/60">
        {list.map((c) => (
          <button key={c.id} type="button" onClick={() => onPick(c)}
                  className="flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-xs hover:bg-accent/40">
            <span className="truncate">{c.displayName}</span>
            {c.balance !== 0 && <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{money(c.balance)} open</span>}
          </button>
        ))}
        {list.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">{q ? "No matches" : "No close names — search above"}</div>}
      </div>
      <button type="button" onClick={onCancel} className="text-[11px] text-muted-foreground hover:text-foreground">Cancel</button>
    </div>
  );
}

// ── Sync hub: review every vessel ────────────────────────────────────────────

export function WaypointAccountsPanel() {
  const [yachts, setYachts] = useState<Array<{ id: string; vessel_name: string }>>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [show, setShow] = useState<"suggested" | "linked" | "all">("suggested");

  async function load(force = false) {
    setLoading(true); setError(null);
    try {
      const [{ data: ys }, { data: ls }, cs] = await Promise.all([
        (supabase as any).from("yachts").select("id, vessel_name").eq("archive", false).order("vessel_name"),
        (supabase as any).from("yacht_qbo_accounts").select("yacht_id, customer_id, customer_name").eq("realm_id", WAYPOINT_QBO_REALM),
        loadCustomers(force),
      ]);
      setYachts(ys ?? []); setLinks(ls ?? []); setCustomers(cs);
    } catch (e: any) { setError(String(e?.message ?? e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const linkOf = useMemo(() => new Map(links.map((l) => [l.yacht_id, l])), [links]);
  const taken = useMemo(() => new Set(links.map((l) => l.customer_id)), [links]);
  const custById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const suggestion = useMemo(() => {
    const m = new Map<string, { customer: Customer; score: number }>();
    for (const y of yachts) {
      if (linkOf.has(y.id)) continue;
      const best = bestMatches(y.vessel_name ?? "", customers, taken)[0];
      if (best && best.score >= 0.6) m.set(y.id, best);
    }
    return m;
  }, [yachts, customers, taken, linkOf]);

  async function link(yachtId: string, c: Customer | null) {
    setBusy(yachtId);
    if (await saveLink(yachtId, c?.id ?? null)) {
      setLinks((prev) => [...prev.filter((l) => l.yacht_id !== yachtId),
        ...(c ? [{ yacht_id: yachtId, customer_id: c.id, customer_name: c.displayName }] : [])]);
      toast.success(c ? `Linked to ${c.displayName}` : "Unlinked");
    }
    setBusy(null); setEditing(null);
  }

  const rows = yachts.filter((y) =>
    show === "all" ? true : show === "linked" ? linkOf.has(y.id) : suggestion.has(y.id) && !dismissed.has(y.id));

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.4)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShoppingBasket className="h-4 w-4 text-primary" />
          <h2 className="font-display text-sm font-semibold">{WAYPOINT_COMPANY} — Vessel ↔ Customer links</h2>
          {!loading && !error && (
            <span className="text-[11px] text-muted-foreground">{links.length} linked · {suggestion.size - [...dismissed].filter((d) => suggestion.has(d)).length} to review · {customers.length} Waypoint customers</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-border p-0.5 text-[11px]">
            {([["suggested", "To review"], ["linked", "Linked"], ["all", "All vessels"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setShow(k)}
                      className={cn("rounded px-2 py-0.5", show === k ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:text-foreground")}>{l}</button>
            ))}
          </div>
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => void load(true)} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Refresh
          </Button>
        </div>
      </div>

      <p className="mb-3 text-[12px] text-muted-foreground">
        For vessels Waypoint also bills (chandlery, provisioning…). A linked vessel's Waypoint invoices show on its Finance
        tab and in its Client Portal, next to the JLS ones. Suggestions are matched by name — approve each one, choose a
        different customer, or skip it. Nothing is linked until you approve it.
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
                <th className="px-3 py-2 font-semibold">Waypoint customer</th>
                <th className="w-[46%] px-3 py-2 font-semibold">Suggestion / action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((y) => {
                const l = linkOf.get(y.id);
                const sug = suggestion.get(y.id);
                const c = l ? custById.get(l.customer_id) : null;
                return (
                  <tr key={y.id} className="border-b border-border/40 align-top">
                    <td className="py-2.5 pr-3 font-medium">{y.vessel_name}</td>
                    <td className="px-3 py-2.5">
                      {l ? (
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                          <span>{c?.displayName ?? l.customer_name ?? `#${l.customer_id}`}</span>
                          {c && c.balance !== 0 && <span className="text-[10.5px] text-muted-foreground">{money(c.balance)} open</span>}
                        </span>
                      ) : <span className="text-muted-foreground">Not linked</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      {busy === y.id ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        : editing === y.id ? (
                          <CustomerPicker vessel={y.vessel_name} customers={customers} taken={taken}
                                          onPick={(c) => void link(y.id, c)} onCancel={() => setEditing(null)} />
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            {!l && sug && (
                              <>
                                <button type="button" onClick={() => void link(y.id, sug.customer)}
                                        className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition",
                                          sug.score >= 0.8 ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                                            : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/50")}
                                        title="Approve this match">
                                  <Sparkles className="h-3 w-3" /> {sug.customer.displayName}
                                  <span className="opacity-70">{Math.round(sug.score * 100)}%</span>
                                </button>
                                <button type="button" onClick={() => setDismissed((d) => new Set(d).add(y.id))}
                                        className="text-[11px] text-muted-foreground hover:text-foreground">Skip</button>
                              </>
                            )}
                            <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[11px]" onClick={() => setEditing(y.id)}>
                              <Link2 className="h-3 w-3" /> {l ? "Change" : "Choose…"}
                            </Button>
                            {l && (
                              <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-red-400" onClick={() => void link(y.id, null)}>
                                <Link2Off className="h-3 w-3" /> Unlink
                              </Button>
                            )}
                          </div>
                        )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                  {show === "suggested" ? "No suggestions left to review." : show === "linked" ? "No vessels linked yet." : "No vessels."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── A vessel's Finance tab ───────────────────────────────────────────────────

export function VesselWaypointLink({ yachtId, vesselName, onChanged }: { yachtId: string; vesselName: string; onChanged?: () => void }) {
  const [link, setLink] = useState<Link | null | undefined>(undefined);
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (supabase as any).from("yacht_qbo_accounts").select("yacht_id, customer_id, customer_name")
      .eq("realm_id", WAYPOINT_QBO_REALM).eq("yacht_id", yachtId).maybeSingle()
      .then(({ data }: any) => setLink(data ?? null));
  }, [yachtId]);

  async function startEdit() {
    setEditing(true); setError(null);
    try {
      const [cs, { data: ls }] = await Promise.all([
        loadCustomers(),
        (supabase as any).from("yacht_qbo_accounts").select("customer_id, yacht_id").eq("realm_id", WAYPOINT_QBO_REALM),
      ]);
      setCustomers(cs);
      setTaken(new Set((ls ?? []).filter((l: any) => l.yacht_id !== yachtId).map((l: any) => l.customer_id)));
    } catch (e: any) { setError(String(e?.message ?? e)); }
  }

  async function save(c: Customer | null) {
    setBusy(true);
    if (await saveLink(yachtId, c?.id ?? null)) {
      setLink(c ? { yacht_id: yachtId, customer_id: c.id, customer_name: c.displayName } : null);
      toast.success(c ? `Linked to ${c.displayName} (${WAYPOINT_COMPANY})` : "Waypoint account unlinked");
      onChanged?.();
    }
    setBusy(false); setEditing(false);
  }

  if (link === undefined) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <ShoppingBasket className="h-4 w-4 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{WAYPOINT_COMPANY} account</div>
          <div className="truncate text-sm">
            {link ? (link.customer_name ?? `Customer #${link.customer_id}`)
              : <span className="text-muted-foreground">Not linked — link it if Waypoint bills this vessel (chandlery, provisioning…)</span>}
          </div>
        </div>
        {busy ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : !editing && (
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={() => void startEdit()}>
              <Link2 className="h-3.5 w-3.5" /> {link ? "Change" : "Link…"}
            </Button>
            {link && (
              <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-red-400" onClick={() => void save(null)}>
                <Link2Off className="h-3.5 w-3.5" /> Unlink
              </Button>
            )}
          </div>
        )}
      </div>
      {editing && (
        <div className="mt-3">
          {error ? <div className="text-xs text-amber-300">{error}</div>
            : !customers ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            : <CustomerPicker vessel={vesselName} customers={customers} taken={taken} onPick={(c) => void save(c)} onCancel={() => setEditing(false)} />}
        </div>
      )}
    </div>
  );
}
