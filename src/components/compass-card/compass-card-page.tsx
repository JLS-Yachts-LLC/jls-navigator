/**
 * Compass Card — what's happening on compasscard.online that needs a person:
 * crew sign-ups (for Crew Care to approve), vendor requests, and offers to
 * approve, plus the admin decisions on vendors and offers.
 *
 * Compass Card sends each event to /api/compass-card/event (migration
 * 20261020100000). The bell rings for the right team straight away; email is
 * optional — the Notifications button. Approving still happens in the Compass
 * Card admin portal, which every event links to.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useAccess } from "@/lib/auth/useAccess";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  BellRing, CreditCard, ExternalLink, Loader2, Mail, Plus, RefreshCw, Search, Send, Store, Tag, UserPlus, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const db = supabase as any;

type EventType = "user_signup" | "vendor_signup" | "vendor_status" | "offer_submitted" | "offer_status";
type Ev = {
  id: string; event_type: EventType; team: "signups" | "partners"; occurred_at: string; received_at: string;
  title: string; summary: string | null; status: string | null; person_name: string | null; person_email: string | null;
  admin_url: string | null; data: Record<string, unknown>; alert_result: string | null;
};
type Staff = { user_id: string; display_name: string | null; email: string | null; department: string | null };
type View = "all" | "signups" | "vendors" | "offers";

const TYPE_LABEL: Record<EventType, string> = {
  user_signup: "App sign-up", vendor_signup: "Vendor request", vendor_status: "Vendor decision",
  offer_submitted: "Offer to approve", offer_status: "Offer decision",
};
const TYPE_ICON: Record<EventType, typeof UserPlus> = {
  user_signup: UserPlus, vendor_signup: Store, vendor_status: Store, offer_submitted: Tag, offer_status: Tag,
};
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  approved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  rejected: "bg-red-500/15 text-red-400 border-red-500/25",
  inactive: "bg-muted/60 text-muted-foreground border-border",
};
const IN_VIEW: Record<View, (t: EventType) => boolean> = {
  all: () => true,
  signups: (t) => t === "user_signup",
  vendors: (t) => t === "vendor_signup" || t === "vendor_status",
  offers: (t) => t === "offer_submitted" || t === "offer_status",
};
const FIELD_LABEL: Record<string, string> = {
  name: "Name", email: "Email", country_code: "Country code", mobile: "Mobile", method: "Signed up with",
  brand_name: "Business", contact_person: "Contact", phone: "Phone", country: "Country", categories: "Categories",
  title: "Offer", vendor_name: "Vendor", discount: "Discount %", start_date: "Starts", end_date: "Ends",
  resubmitted: "Re-submitted", status: "Status", reason: "Reason", decided_by: "Decided by",
};

const staffName = (s: Staff | undefined) => s?.display_name || s?.email || "Unknown";
const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  // Older items (the imported backlog) show their year.
  const year = d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" as const } : {};
  return d.toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short", ...year, hour: "2-digit", minute: "2-digit" });
};

export function CompassCardPage({ initialEventId }: { initialEventId?: string }) {
  const { session } = useAuth();
  const { canAccessModule } = useAccess();
  const canManage = canAccessModule("compass_card", "edit");
  const [events, setEvents] = useState<Ev[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(initialEventId ?? null);
  const [showSettings, setShowSettings] = useState(false);

  const load = useCallback(async () => {
    const [e, s] = await Promise.all([
      db.from("compass_card_events").select("id, event_type, team, occurred_at, received_at, title, summary, status, person_name, person_email, admin_url, data, alert_result")
        .order("occurred_at", { ascending: false }).limit(1000),
      // Not filtered on user_profiles.active: it is false for many staff in daily use.
      db.from("user_profiles").select("user_id, display_name, email, department").order("display_name"),
    ]);
    if (e.error) toast.error(e.error.message);
    setEvents(e.data ?? []);
    setStaff(s.data ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (initialEventId) setOpenId(initialEventId); }, [initialEventId]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return events.filter((e) => IN_VIEW[view](e.event_type) &&
      (!term || [e.title, e.summary, e.person_name, e.person_email].some((v) => (v ?? "").toLowerCase().includes(term))));
  }, [events, view, q]);

  const week = useMemo(() => {
    const since = Date.now() - 7 * 86_400_000;
    const recent = events.filter((e) => Date.parse(e.occurred_at) >= since);
    return {
      signups: recent.filter((e) => e.event_type === "user_signup").length,
      vendors: recent.filter((e) => e.event_type === "vendor_signup").length,
      offers: recent.filter((e) => e.event_type === "offer_submitted").length,
    };
  }, [events]);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="flex items-center gap-2 text-xl font-semibold"><CreditCard className="h-5 w-5 text-primary" /> Compass Card</h1>
          <p className="text-sm text-muted-foreground">
            Sign-ups, vendor requests and offers from compasscard.online. Approve them in the Compass Card admin portal; each one links there.
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={() => { setLoading(true); void load(); }} aria-label="Refresh"><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /></Button>
        {canManage && <Button variant="outline" onClick={() => setShowSettings(true)}><BellRing className="mr-1.5 h-4 w-4" /> Notifications</Button>}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {([["App sign-ups", week.signups, UserPlus], ["Vendor requests", week.vendors, Store], ["Offers submitted", week.offers, Tag]] as const).map(([label, n, Icon]) => (
          <div key={label} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
            <Icon className="h-5 w-5 text-primary" />
            <div><div className="text-2xl font-semibold leading-none">{n}</div><div className="mt-1 text-xs text-muted-foreground">{label}, last 7 days</div></div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "signups", "vendors", "offers"] as View[]).map((v) => (
          <Button key={v} size="sm" variant={view === v ? "default" : "outline"} onClick={() => setView(v)}>
            {{ all: "All", signups: "Sign-ups", vendors: "Vendors", offers: "Offers" }[v]}
          </Button>
        ))}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search name, email, offer…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        {loading ? (
          <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : shown.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            {events.length === 0 ? "Nothing yet. Events appear here as soon as Compass Card sends them." : "Nothing matches."}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((e) => {
              const Icon = TYPE_ICON[e.event_type];
              const open = openId === e.id;
              return (
                <li key={e.id} className={cn(open && "bg-primary/5")}>
                  <button type="button" onClick={() => setOpenId(open ? null : e.id)} className="flex w-full items-start gap-3 p-3 text-left hover:bg-muted/30">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{e.title}</span>
                        {e.status && <span className={cn("rounded-full border px-2 py-0.5 text-[11px] capitalize", STATUS_COLOR[e.status] ?? STATUS_COLOR.inactive)}>{e.status}</span>}
                      </div>
                      {e.summary && <div className="truncate text-xs text-muted-foreground">{e.summary}</div>}
                    </div>
                    <div className="shrink-0 text-right text-xs text-muted-foreground">
                      <div>{fmtWhen(e.occurred_at)}</div>
                      <div>{TYPE_LABEL[e.event_type]}</div>
                    </div>
                  </button>
                  {open && <EventDetail e={e} />}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {showSettings && <NotificationsDialog staff={staff} token={session?.access_token} onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function EventDetail({ e }: { e: Ev }) {
  const rows = Object.entries(e.data ?? {})
    .filter(([k, v]) => FIELD_LABEL[k] && v !== null && v !== "" && v !== false && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => [FIELD_LABEL[k], Array.isArray(v) ? v.join(", ") : v === true ? "Yes" : String(v)] as const);
  return (
    <div className="grid gap-3 px-10 pb-4 text-sm">
      {rows.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          {rows.map(([k, v]) => <Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd className="break-words">{v}</dd></Fragment>)}
        </dl>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {e.admin_url && (
          <Button asChild size="sm"><a href={e.admin_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open in Compass Card admin</a></Button>
        )}
        <span className="text-xs text-muted-foreground">Received {fmtWhen(e.received_at)}{e.alert_result ? ` · ${e.alert_result}` : ""}</span>
      </div>
    </div>
  );
}

// ─── Notifications ───────────────────────────────────────────────────────────

type Settings = { signup_recipient_ids: string[]; partner_recipient_ids: string[]; email_enabled: boolean; email_extra: string[] };
type TeamKey = "signup_recipient_ids" | "partner_recipient_ids";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function NotificationsDialog({ staff, token, onClose }: { staff: Staff[]; token: string | undefined; onClose: () => void }) {
  const { user } = useAuth();
  const [s, setS] = useState<Settings | null>(null);
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void db.from("compass_card_settings").select("signup_recipient_ids, partner_recipient_ids, email_enabled, email_extra").eq("id", 1).maybeSingle()
      .then(({ data, error }: any) => {
        if (error) toast.error(error.message);
        const v: Settings = data ?? { signup_recipient_ids: [], partner_recipient_ids: [], email_enabled: false, email_extra: [] };
        setS(v);
        setExtra((v.email_extra ?? []).join(", "));
      });
  }, []);

  const save = async () => {
    if (!s) return;
    const extras = extra.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean);
    const bad = extras.find((e) => !EMAIL.test(e));
    if (bad) { toast.error(`"${bad}" isn't an email address`); return; }
    setBusy("save");
    const { error } = await db.from("compass_card_settings").update({
      signup_recipient_ids: s.signup_recipient_ids, partner_recipient_ids: s.partner_recipient_ids,
      email_enabled: s.email_enabled, email_extra: extras, updated_by: user?.id ?? null, updated_at: new Date().toISOString(),
    }).eq("id", 1);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Compass Card notifications saved");
    onClose();
  };

  const test = async () => {
    if (!token) return;
    setBusy("email");
    const res = await fetch("/api/compass-card/alerts", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "test" }),
    }).catch(() => null);
    const body = await res?.json().catch(() => ({})) ?? {};
    setBusy(null);
    if (!res?.ok || !body.ok) { toast.error(body.error ?? "The test didn't go through"); return; }
    toast.success(`Test email sent to ${body.to}`);
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><BellRing className="h-5 w-5 text-primary" /> Compass Card notifications</DialogTitle></DialogHeader>
        {!s ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /> : (
          <div className="grid gap-5">
            <TeamPicker title="App sign-ups" hint="A crew member registers in the Compass Card app." field="signup_recipient_ids" s={s} setS={setS} staff={staff} />
            <TeamPicker title="Vendors and offers" hint="A vendor asks to join, an offer is submitted, and admin decisions on both." field="partner_recipient_ids" s={s} setS={setS} staff={staff} />

            <section className="grid gap-2 rounded-xl border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><Mail className="h-4 w-4" /> Email as well</h3>
                <Switch checked={s.email_enabled} onCheckedChange={(v) => setS({ ...s, email_enabled: v })} aria-label="Email alerts" />
              </div>
              <p className="text-xs text-muted-foreground">Emails the people above too, each about their own events. Add a shared mailbox if you like (company addresses only; it gets every event).</p>
              <Input placeholder="Extra addresses, e.g. crewcare@jlsyachts.com" value={extra} onChange={(e) => setExtra(e.target.value)} />
              <Button size="sm" variant="ghost" className="justify-self-start" onClick={() => void test()} disabled={!!busy}>
                {busy === "email" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />} Send me a test email
              </Button>
            </section>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={() => void save()} disabled={busy === "save"}>{busy === "save" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TeamPicker({ title, hint, field, s, setS, staff }: {
  title: string; hint: string; field: TeamKey; s: Settings; setS: (v: Settings) => void; staff: Staff[];
}) {
  const [adding, setAdding] = useState("");
  const byId = useMemo(() => new Map(staff.map((x) => [x.user_id, x])), [staff]);
  // While nobody is picked, the team is the Crew Care department.
  const deptTeam = staff.filter((x) => (x.department ?? "").toLowerCase().replace(/ /g, "_") === "crew_care");
  const picked = s[field] ?? [];
  const team = picked.length ? picked.map((id) => byId.get(id)).filter(Boolean) as Staff[] : deptTeam;

  const add = () => {
    if (!adding) return;
    // Starting a hand-picked list from the department default keeps those people on it.
    const base = picked.length ? picked : deptTeam.map((x) => x.user_id);
    setS({ ...s, [field]: [...new Set([...base, adding])] });
    setAdding("");
  };
  const remove = (id: string) => {
    const base = picked.length ? picked : deptTeam.map((x) => x.user_id);
    setS({ ...s, [field]: base.filter((x) => x !== id) });
  };

  return (
    <section className="grid gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4" /> {title}</h3>
      <p className="text-xs text-muted-foreground">
        {hint} These people get an in-app alert (always on){!picked.length && ". Until you pick people, that's everyone in the Crew Care department"}.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {team.length === 0 && <span className="text-xs text-amber-400">Nobody yet — add someone below.</span>}
        {team.map((p) => (
          <span key={p.user_id} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/30 py-0.5 pl-2.5 pr-1 text-xs">
            {staffName(p)}
            <button type="button" aria-label={`Remove ${staffName(p)}`} onClick={() => remove(p.user_id)}
                    className="flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-red-400"><X className="h-3 w-3" /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Select value={adding || "__none"} onValueChange={(v) => setAdding(v === "__none" ? "" : v)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Add a person…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">Add a person…</SelectItem>
            {staff.filter((x) => !team.some((t) => t.user_id === x.user_id)).map((x) => <SelectItem key={x.user_id} value={x.user_id}>{staffName(x)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={add} disabled={!adding}><Plus className="mr-1 h-3.5 w-3.5" /> Add</Button>
      </div>
    </section>
  );
}
