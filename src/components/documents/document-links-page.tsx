/**
 * Document Links — every secure link sent to a client, and what happened to it.
 *
 * The delivery side has been live since 3 Sept but there was no way to see what
 * had gone out, whether anyone opened it, or to cut one off. Sending a client a
 * document you cannot then withdraw is the gap this closes.
 *
 * Reads document_shares / document_share_access directly (staff have SELECT
 * under RLS); revoking goes through /api/documents/revoke, since staff cannot
 * write to the table.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Link2, Search, Loader2, ShieldOff, RotateCcw, Eye, Download,
  ChevronDown, ChevronRight, Copy,
} from "lucide-react";
import { toast } from "sonner";

const db = supabase as any;

type Share = {
  id: string;
  token: string;
  title: string;
  reference: string | null;
  vessel_name: string | null;
  recipient_email: string | null;
  filename: string | null;
  source_table: string | null;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  access_count: number;
  first_accessed_at: string | null;
  last_accessed_at: string | null;
};

type Access = {
  id: string; share_id: string; action: "viewed" | "downloaded";
  accessed_at: string; ip_address: string | null; user_agent: string | null;
};

type State = "active" | "opened" | "expired" | "revoked";

function stateOf(s: Share): State {
  if (s.revoked_at) return "revoked";
  if (new Date(s.expires_at) < new Date()) return "expired";
  return s.access_count > 0 ? "opened" : "active";
}

const STATE_META: Record<State, { label: string; cls: string }> = {
  active:  { label: "Not opened", cls: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  opened:  { label: "Opened",     cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  expired: { label: "Expired",    cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  revoked: { label: "Revoked",    cls: "bg-destructive/10 text-destructive border-destructive/30" },
};

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }) : "—";
const fmtDay = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

export function DocumentLinksPage() {
  const [rows, setRows] = useState<Share[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | State>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [trail, setTrail] = useState<Record<string, Access[]>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await db
      .from("document_shares").select("*").order("created_at", { ascending: false }).limit(500);
    if (error) toast.error(error.message);
    setRows((data ?? []) as Share[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  /** The access trail is only fetched for a row that gets opened. */
  async function openRow(id: string) {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    if (trail[id]) return;
    const { data } = await db
      .from("document_share_access").select("*").eq("share_id", id)
      .order("accessed_at", { ascending: false });
    setTrail((t) => ({ ...t, [id]: (data ?? []) as Access[] }));
  }

  async function setRevoked(s: Share, revoke: boolean) {
    if (revoke && !confirm(
      `Revoke the link for "${s.title}"?\n\n` +
      `${s.recipient_email ?? "The recipient"} will not be able to open it again. ` +
      `Send them a new one if they still need the document.`,
    )) return;
    setBusyId(s.id);
    try {
      const { data: { session } } = await db.auth.getSession();
      const res = await fetch("/api/documents/revoke", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ id: s.id, revoke }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? `Failed (${res.status})`);
      toast.success(revoke ? "Link revoked" : "Link restored");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change that link");
    } finally {
      setBusyId(null);
    }
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && stateOf(r) !== filter) return false;
      if (!s) return true;
      return [r.title, r.reference, r.vessel_name, r.recipient_email, r.filename]
        .some((v) => String(v ?? "").toLowerCase().includes(s));
    });
  }, [rows, q, filter]);

  const counts = useMemo(() => {
    const c = { all: rows.length, active: 0, opened: 0, expired: 0, revoked: 0 };
    for (const r of rows) c[stateOf(r)]++;
    return c;
  }, [rows]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">
            Documents
          </div>
          <h1 className="mt-0.5 font-display text-[1.25rem] font-semibold tracking-tight">Document Links</h1>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search document, vessel or recipient…"
              className="h-9 w-72 pl-8 text-sm"
            />
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
            <SelectTrigger className="h-9 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ({counts.all})</SelectItem>
              <SelectItem value="active">Not opened ({counts.active})</SelectItem>
              <SelectItem value="opened">Opened ({counts.opened})</SelectItem>
              <SelectItem value="expired">Expired ({counts.expired})</SelectItem>
              <SelectItem value="revoked">Revoked ({counts.revoked})</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        {loading ? (
          <div className="grid place-items-center py-20 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center">
            <Link2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <div className="text-sm font-semibold">
              {rows.length === 0 ? "No documents have been sent yet" : "Nothing matches that"}
            </div>
            {rows.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Every permit or visa emailed to a client appears here, with a record of who opened it.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="w-8" />
                  <th className="px-4 py-2.5 text-left font-medium">Document</th>
                  <th className="px-4 py-2.5 text-left font-medium">Vessel</th>
                  <th className="px-4 py-2.5 text-left font-medium">Sent to</th>
                  <th className="px-4 py-2.5 text-left font-medium">Sent</th>
                  <th className="px-4 py-2.5 text-left font-medium">Expires</th>
                  <th className="px-4 py-2.5 text-left font-medium">Opens</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((s) => {
                  const st = stateOf(s);
                  const expanded = openId === s.id;
                  return (
                    <Fragment key={s.id}>
                      <tr className="transition-colors hover:bg-muted/20">
                        <td className="pl-3">
                          <button
                            onClick={() => void openRow(s.id)}
                            title={expanded ? "Hide the access record" : "Show who opened it"}
                            className="text-muted-foreground transition hover:text-foreground"
                          >
                            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{s.title}</div>
                          {s.reference && (
                            <div className="font-mono text-[11px] text-muted-foreground">{s.reference}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{s.vessel_name ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{s.recipient_email ?? "—"}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{fmtDay(s.created_at)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{fmtDay(s.expires_at)}</td>
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">{s.access_count}</td>
                        <td className="px-4 py-3">
                          <span className={cn("rounded border px-1.5 py-0.5 text-[10.5px]", STATE_META[st].cls)}>
                            {STATE_META[st].label}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <button
                            onClick={() => {
                              void navigator.clipboard.writeText(`${window.location.origin}/d/${s.token}`);
                              toast.success("Link copied");
                            }}
                            title="Copy the link that was sent"
                            className="mr-1 inline-flex items-center gap-1 rounded px-2 py-1 text-[11.5px] text-muted-foreground transition hover:text-foreground"
                          >
                            <Copy className="h-3 w-3" /> Copy
                          </button>
                          {st === "revoked" ? (
                            <Button
                              size="sm" variant="ghost" disabled={busyId === s.id}
                              onClick={() => void setRevoked(s, false)}
                              className="h-7 gap-1 text-[11.5px]"
                            >
                              {busyId === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                              Restore
                            </Button>
                          ) : (
                            <Button
                              size="sm" variant="ghost" disabled={busyId === s.id}
                              onClick={() => void setRevoked(s, true)}
                              className="h-7 gap-1 text-[11.5px] text-destructive hover:text-destructive"
                            >
                              {busyId === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldOff className="h-3 w-3" />}
                              Revoke
                            </Button>
                          )}
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="bg-muted/10">
                          <td />
                          <td colSpan={8} className="px-4 py-3">
                            <AccessTrail rows={trail[s.id]} filename={s.filename} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AccessTrail({ rows, filename }: { rows?: Access[]; filename: string | null }) {
  if (!rows) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading the access record…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        Never opened.{filename ? ` The file is ${filename}.` : ""}
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Access record{filename ? ` — ${filename}` : ""}
      </div>
      {rows.map((a) => (
        <div key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          {a.action === "downloaded"
            ? <Download className="h-3 w-3 shrink-0 text-emerald-400" />
            : <Eye className="h-3 w-3 shrink-0 text-sky-400" />}
          <span className="font-medium capitalize">{a.action}</span>
          <span className="text-muted-foreground">{fmt(a.accessed_at)}</span>
          {a.ip_address && <span className="font-mono text-[11px] text-muted-foreground/70">{a.ip_address}</span>}
        </div>
      ))}
    </div>
  );
}

export default DocumentLinksPage;
