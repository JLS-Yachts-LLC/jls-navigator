import { useState, useEffect, useMemo, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Search, Pencil, Trash2, Loader2, Download, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type FieldType = "text" | "textarea" | "date" | "number" | "email" | "select" | "yacht" | "org";

export interface FieldDef {
  key: string;
  label: string;
  type?: FieldType;
  options?: string[];
  required?: boolean;
  table?: boolean;       // show as a table column
  badge?: boolean;       // render as a status pill (uses statusColors)
  mono?: boolean;
  placeholder?: string;
  full?: boolean;        // full-width in the dialog grid
}

export interface ResourceConfig {
  table: string;
  title: string;
  breadcrumb: string;
  singular: string;      // e.g. "Ticket"
  icon: ReactNode;
  fields: FieldDef[];
  statusKey?: string;
  statusColors?: Record<string, string>;
  statusLabels?: Record<string, string>;
  orderBy?: { col: string; asc?: boolean };
  emptyHint?: string;
  /** Optional header button that POSTs to an authenticated endpoint then reloads. */
  syncAction?: { label: string; path: string };
}

type Row = Record<string, any>;
type Yacht = { id: string; vessel_name: string };
type Org = { org_id: string; name: string };

export function ResourcePage({ config }: { config: ResourceConfig }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [yachts, setYachts] = useState<Yacht[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [fieldFilters, setFieldFilters] = useState<Record<string, string>>({});
  const [sortCol, setSortCol] = useState<string>(config.orderBy?.col ?? config.fields.find((f) => f.table)?.key ?? "name");
  const [sortAsc, setSortAsc] = useState<boolean>(config.orderBy?.asc ?? true);

  // Select-type columns (other than the status field) become quick filters.
  const filterFields = config.fields.filter(
    (f) => f.type === "select" && f.table && f.key !== config.statusKey && (f.options?.length ?? 0) > 0,
  );
  const sortableCols = config.fields.filter((f) => f.table);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Row>({});
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);

  async function runSyncAction() {
    if (!config.syncAction) return;
    setSyncing(true);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 120_000);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(config.syncAction.path, {
        method: "POST",
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        signal: ctrl.signal,
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? `Failed (${r.status})`);
      toast.success(j.note ? j.note : `Synced ${j.upserted ?? 0} of ${j.fetched ?? 0}`);
      await load();
    } catch (e: any) {
      toast.error(e?.name === "AbortError" ? "Sync timed out — try again" : (e?.message ?? "Sync failed"));
    } finally {
      clearTimeout(timer);
      setSyncing(false);
    }
  }

  const hasYacht = config.fields.some((f) => f.type === "yacht") || config.fields.some((f) => f.key === "yacht_id");
  const hasOrg = config.fields.some((f) => f.type === "org") || config.fields.some((f) => f.key === "org_id");

  useEffect(() => { void load(); if (hasYacht) void loadYachts(); if (hasOrg) void loadOrganisations(); }, [config.table]);

  async function load() {
    setLoading(true);
    let query = (supabase as any).from(config.table).select("*");
    if (config.orderBy) query = query.order(config.orderBy.col, { ascending: config.orderBy.asc ?? false, nullsFirst: false });
    const { data, error } = await query;
    if (error) toast.error(error.message);
    else setRows(data ?? []);
    setLoading(false);
  }
  async function loadYachts() {
    const { data } = await fetchAllRows(() => supabase.from("yachts").select("id, vessel_name").order("vessel_name"));
    setYachts((data ?? []) as Yacht[]);
  }
  async function loadOrganisations() {
    const { data } = await fetchAllRows(() => (supabase as any).from("organisations").select("org_id, name").order("name"));
    setOrgs((data ?? []) as Org[]);
  }

  function openNew() {
    const blank: Row = {};
    config.fields.forEach((f) => {
      if (f.type === "select" && f.key === config.statusKey && f.options?.length) blank[f.key] = f.options[0];
    });
    setEditing(null); setForm(blank); setOpen(true);
  }
  function openEdit(r: Row) { setEditing(r); setForm({ ...r }); setOpen(true); }

  async function save() {
    const missing = config.fields.find((f) => f.required && !String(form[f.key] ?? "").trim());
    if (missing) { toast.error(`${missing.label} is required`); return; }
    setBusy(true);
    try {
      const payload: Row = { updated_at: new Date().toISOString() };
      config.fields.forEach((f) => {
        let v = form[f.key];
        if (v === "" || v === undefined) v = null;
        if (f.type === "number" && v != null) v = Number(v);
        payload[f.key] = v;
      });
      const db = supabase as any;
      if (editing) {
        const { error } = await db.from(config.table).update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success(`${config.singular} updated`);
      } else {
        const { error } = await db.from(config.table).insert([{ ...payload, created_by: user?.id }]);
        if (error) throw error;
        toast.success(`${config.singular} added`);
      }
      setOpen(false); void load();
    } catch (e: any) { toast.error(e.message ?? "Save failed"); }
    finally { setBusy(false); }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { error } = await (supabase as any).from(config.table).delete().eq("id", deleteTarget.id);
    if (error) toast.error(error.message);
    else { toast.success(`${config.singular} removed`); void load(); }
    setDeleteTarget(null);
  }

  const yachtName = (id: string | null) => yachts.find((y) => y.id === id)?.vessel_name ?? "—";
  const orgName = (id: string | null) => orgs.find((o) => o.org_id === id)?.name ?? "—";
  const fmtDate = (d: string | null) => d ? new Date(d + "T00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

  function display(r: Row, f: FieldDef): ReactNode {
    const v = r[f.key];
    if (f.type === "yacht" || f.key === "yacht_id") return yachtName(v);
    if (f.type === "org" || f.key === "org_id") return orgName(v);
    if (f.type === "date") return fmtDate(v);
    if (f.badge) {
      const label = config.statusLabels?.[v] ?? v ?? "—";
      return <span className={cn("rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold", config.statusColors?.[v] ?? "bg-muted text-muted-foreground")}>{label}</span>;
    }
    if (v == null || v === "") return <span className="text-muted-foreground/40">—</span>;
    return <span className={f.mono ? "font-mono text-xs" : ""}>{String(v)}</span>;
  }

  const tableCols = config.fields.filter((f) => f.table);

  const filtered = useMemo(() => {
    const out = rows.filter((r) => {
      if (filterStatus !== "all" && config.statusKey && r[config.statusKey] !== filterStatus) return false;
      for (const [key, val] of Object.entries(fieldFilters)) {
        if (val && val !== "all" && String(r[key] ?? "") !== val) return false;
      }
      if (q.trim()) {
        const s = q.toLowerCase();
        const hay = config.fields.map((f) => f.type === "yacht" ? yachtName(r[f.key]) : f.type === "org" ? orgName(r[f.key]) : r[f.key]).join(" ").toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
    const field = config.fields.find((f) => f.key === sortCol);
    out.sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol];
      if (field?.type === "yacht") { av = yachtName(av); bv = yachtName(bv); }
      else if (field?.type === "org") { av = orgName(av); bv = orgName(bv); }
      if (field?.type === "number") { av = Number(av) || 0; bv = Number(bv) || 0; return sortAsc ? av - bv : bv - av; }
      const cmp = String(av ?? "").localeCompare(String(bv ?? ""), undefined, { numeric: true, sensitivity: "base" });
      return sortAsc ? cmp : -cmp;
    });
    return out;
  }, [rows, q, filterStatus, fieldFilters, sortCol, sortAsc, yachts, orgs]);

  function exportCSV() {
    const cols = config.fields;
    const headers = cols.map((c) => c.label);
    const esc = (v: any) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [headers.join(",")];
    filtered.forEach((r) => lines.push(cols.map((c) => esc(c.type === "yacht" ? yachtName(r[c.key]) : c.type === "org" ? orgName(r[c.key]) : r[c.key])).join(",")));
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${config.table}-${new Date().toISOString().slice(0,10)}.csv` });
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">{config.breadcrumb}</div>
          <h1 className="mt-0.5 flex items-center gap-2 font-display text-[1.25rem] font-semibold tracking-tight">{config.icon}{config.title}</h1>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-9 w-56 pl-8 text-sm" />
          </div>
          {config.statusKey && config.statusLabels && (
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-9 w-40 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {Object.entries(config.statusLabels).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {filterFields.map((f) => (
            <Select key={f.key} value={fieldFilters[f.key] ?? "all"} onValueChange={(v) => setFieldFilters((p) => ({ ...p, [f.key]: v }))}>
              <SelectTrigger className="h-9 w-40 text-xs"><SelectValue placeholder={`All ${f.label}`} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All {f.label}</SelectItem>
                {f.options!.map((o) => <SelectItem key={o} value={o} className="capitalize">{o}</SelectItem>)}
              </SelectContent>
            </Select>
          ))}
          <div className="flex items-center">
            <Select value={sortCol} onValueChange={setSortCol}>
              <SelectTrigger className="h-9 w-36 rounded-r-none border-r-0 text-xs"><span className="flex items-center gap-1.5"><ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/60" /><SelectValue /></span></SelectTrigger>
              <SelectContent>
                {sortableCols.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => setSortAsc((a) => !a)} title={sortAsc ? "Ascending" : "Descending"} className="h-9 rounded-l-none px-2.5 text-xs">
              {sortAsc ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
            </Button>
          </div>
          {config.syncAction && (
            <Button size="sm" variant="outline" onClick={runSyncAction} disabled={syncing} className="h-9 gap-1.5 text-xs">
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} {config.syncAction.label}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={exportCSV} disabled={!filtered.length} className="h-9 gap-1.5 text-xs"><Download className="h-3.5 w-3.5" /> Export</Button>
          <Button size="sm" onClick={openNew} className="h-9 gap-1.5 px-3.5 font-medium shadow-sm"><Plus className="h-3.5 w-3.5" /> Add {config.singular}</Button>
        </div>
      </header>

      {config.statusKey && config.statusLabels && (
        <div className="flex items-center gap-4 border-b border-border/40 bg-muted/10 px-6 py-2 text-xs">
          {Object.entries(config.statusLabels).map(([v, l]) => (
            <button key={v} onClick={() => setFilterStatus(filterStatus === v ? "all" : v)}
              className={cn("flex items-center gap-1.5 transition", filterStatus === v ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground")}>
              <span className={cn("h-1.5 w-1.5 rounded-full", (config.statusColors?.[v] ?? "").replace(/text-.*/, "").replace("bg-", "bg-").split(" ")[0] || "bg-muted-foreground")} />
              {rows.filter((r) => r[config.statusKey!] === v).length} {l}
            </button>
          ))}
          <span className="ml-auto text-muted-foreground">{filtered.length} of {rows.length}</span>
        </div>
      )}

      <div className="pds-scroll flex-1 overflow-auto px-6 py-5">
        {loading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border text-center">
            <div className="mb-3 text-muted-foreground/40">{config.icon}</div>
            <p className="font-display text-base font-semibold">{q || filterStatus !== "all" ? "No records match" : `No ${config.title.toLowerCase()} yet`}</p>
            {config.emptyHint && <p className="text-sm text-muted-foreground mt-1">{config.emptyHint}</p>}
            {!q && filterStatus === "all" && <Button onClick={openNew} className="mt-4 gap-1.5"><Plus className="h-4 w-4" /> Add {config.singular}</Button>}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-[0_2px_12px_-4px_rgba(0,0,0,0.4)]">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/30">
                {tableCols.map((c) => <th key={c.key} className="px-4 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">{c.label}</th>)}
                <th className="px-4 py-2.5 w-20"></th>
              </tr></thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
                    {tableCols.map((c, i) => (
                      <td key={c.key} className={cn("px-4 py-3", i === 0 && "font-medium")}>{display(r, c)}</td>
                    ))}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground/60 hover:text-destructive" onClick={() => setDeleteTarget(r)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? `Edit ${config.singular}` : `Add ${config.singular}`}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            {config.fields.map((f) => (
              <div key={f.key} className={cn("space-y-1.5", (f.full || f.type === "textarea") && "col-span-2")}>
                <Label className="text-xs">{f.label}{f.required && <span className="text-destructive"> *</span>}</Label>
                {f.type === "textarea" ? (
                  <Textarea value={form[f.key] ?? ""} onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))} rows={2} className="resize-none text-sm" placeholder={f.placeholder} />
                ) : f.type === "select" ? (
                  <Select value={form[f.key] ?? "__none"} onValueChange={(v) => setForm((s) => ({ ...s, [f.key]: v === "__none" ? "" : v }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="— Select —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">— Select —</SelectItem>
                      {(f.options ?? []).map((o) => <SelectItem key={o} value={o}>{config.statusLabels?.[o] ?? o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : f.type === "yacht" ? (
                  <Select value={form[f.key] ?? "__none"} onValueChange={(v) => setForm((s) => ({ ...s, [f.key]: v === "__none" ? "" : v }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="— None —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">— None —</SelectItem>
                      {yachts.map((y) => <SelectItem key={y.id} value={y.id}>{y.vessel_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : f.type === "org" ? (
                  <Select value={form[f.key] ?? "__none"} onValueChange={(v) => setForm((s) => ({ ...s, [f.key]: v === "__none" ? "" : v }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="— None —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">— None —</SelectItem>
                      {orgs.map((o) => <SelectItem key={o.org_id} value={o.org_id}>{o.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input type={f.type === "date" ? "date" : f.type === "number" ? "number" : f.type === "email" ? "email" : "text"}
                    value={form[f.key] ?? ""} onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                    className={cn("h-8", f.mono && "font-mono")} placeholder={f.placeholder} />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy} className="gap-1.5">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{editing ? "Save Changes" : `Add ${config.singular}`}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {config.singular.toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription>This record will be permanently removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
