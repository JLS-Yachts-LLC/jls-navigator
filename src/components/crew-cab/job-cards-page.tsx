/**
 * Crew Care → Job Cards — requests for the Crew Care team to action: a
 * transfer, a driver, an airport run, an internal crew move.
 *
 * Raised two ways (migration 20261019200000):
 *   - by a captain in the Client Portal (New request → Crew Care). The job card
 *     is opened by a trigger and its status is mirrored back to the captain's
 *     request, so they see it move along;
 *   - by staff here (New job card), for anyone — Captain Steve on the phone,
 *     Mike needing a driver, an internal transfer.
 *
 * Every new job card rings the in-app bell for the Crew Care team straight
 * away. Email and Teams alerts are optional — the Notifications button.
 */
import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fmtDMY } from "@/lib/format-date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  BellRing, Car, ClipboardList, Loader2, Mail, MessageSquare, Plus, Route as RouteIcon, Search, Send, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const db = supabase as any;

// ─── Types & labels ───────────────────────────────────────────────────────────

type JobType = "transfer" | "driver" | "airport" | "crew_logistics" | "other";
type JobStatus = "new" | "acknowledged" | "in_progress" | "completed" | "cancelled";
type Priority = "low" | "normal" | "high" | "urgent";

type Job = {
  id: string; reference: string; source: "portal" | "internal"; captain_request_id: string | null;
  yacht_id: string | null; job_type: JobType; title: string; details: string | null;
  pickup: string | null; dropoff: string | null; needed_at: string | null; passengers: number | null;
  requested_by_name: string | null; priority: Priority; status: JobStatus;
  assigned_to: string | null; assigned_name: string | null; trip_id: string | null;
  created_at: string; completed_at: string | null; alert_result: string | null;
  yacht?: { vessel_name: string | null } | null;
  request?: { reference: string | null } | null;
};
type Staff = { user_id: string; display_name: string | null; email: string | null; department: string | null };
type Yacht = { id: string; vessel_name: string };

const TYPE_LABEL: Record<JobType, string> = {
  transfer: "Transfer", driver: "Driver needed", airport: "Airport run", crew_logistics: "Crew logistics", other: "Other",
};
const STATUS_LABEL: Record<JobStatus, string> = {
  new: "New", acknowledged: "Acknowledged", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled",
};
const STATUS_COLOR: Record<JobStatus, string> = {
  new: "bg-sky-500/15 text-sky-400 border-sky-500/25",
  acknowledged: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  in_progress: "bg-cyan-500/15 text-cyan-400 border-cyan-500/25",
  completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  cancelled: "bg-muted/60 text-muted-foreground border-border",
};
const PRIORITY_COLOR: Record<Priority, string> = {
  low: "text-muted-foreground", normal: "text-muted-foreground", high: "text-amber-400", urgent: "text-red-400",
};
const OPEN: JobStatus[] = ["new", "acknowledged", "in_progress"];
// Job type → the closest Trips type, for "Create trip".
const TRIP_TYPE: Record<JobType, string> = {
  transfer: "crew_pickup", driver: "inhouse", airport: "airport_transfer", crew_logistics: "crew_pickup", other: "inhouse",
};

const JOB_COLS = "*, yacht:yachts(vessel_name), request:captain_requests(reference)";
const staffName = (s: Staff | undefined) => s?.display_name || s?.email || "Unknown";

async function runAlerts(token: string | undefined) {
  if (!token) return;
  // Email / Teams go out now rather than on the next 5-minute tick. Best-effort.
  await fetch("/api/crew-care/alerts", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: "run" }),
  }).catch(() => {});
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function JobCardsPage({ initialJobId }: { initialJobId?: string }) {
  const { session, user } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [yachts, setYachts] = useState<Yacht[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"open" | "done" | "all">("open");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(initialJobId ?? null);
  const [showSettings, setShowSettings] = useState(false);

  const load = useCallback(async () => {
    const [j, s, y] = await Promise.all([
      db.from("crew_care_jobs").select(JOB_COLS).order("created_at", { ascending: false }).limit(500),
      db.from("user_profiles").select("user_id, display_name, email, department, active").neq("active", false).order("display_name"),
      db.from("yachts").select("id, vessel_name").order("vessel_name"),
    ]);
    if (j.error) toast.error(j.error.message);
    setJobs(j.data ?? []);
    setStaff(s.data ?? []);
    setYachts(y.data ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (initialJobId) setOpenId(initialJobId); }, [initialJobId]);

  const staffById = useMemo(() => new Map(staff.map((s) => [s.user_id, s])), [staff]);
  const me = user?.id ? staffById.get(user.id) : undefined;

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return jobs.filter((j) =>
      (view === "all" || (view === "open" ? OPEN.includes(j.status) : !OPEN.includes(j.status))) &&
      (!term || [j.reference, j.title, j.details, j.pickup, j.dropoff, j.requested_by_name, j.yacht?.vessel_name, j.assigned_name]
        .some((v) => (v ?? "").toLowerCase().includes(term))));
  }, [jobs, view, q]);
  const counts = useMemo(() => ({
    new: jobs.filter((j) => j.status === "new").length,
    open: jobs.filter((j) => OPEN.includes(j.status)).length,
  }), [jobs]);
  const openJob = jobs.find((j) => j.id === openId) ?? null;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="flex items-center gap-2 text-xl font-semibold"><ClipboardList className="h-5 w-5 text-primary" /> Job Cards</h1>
          <p className="text-sm text-muted-foreground">
            Requests for Crew Care to action — from captains in the Client Portal and from the team.
            {counts.open > 0 && <> <span className="font-medium text-foreground">{counts.open} open</span>{counts.new > 0 && <>, <span className="font-medium text-sky-400">{counts.new} new</span></>}.</>}
          </p>
        </div>
        <Button variant="outline" onClick={() => setShowSettings(true)}><BellRing className="mr-1.5 h-4 w-4" /> Notifications</Button>
        <Button onClick={() => setCreating(true)}><Plus className="mr-1.5 h-4 w-4" /> New job card</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["open", "done", "all"] as const).map((v) => (
          <button key={v} type="button" onClick={() => setView(v)}
                  className={cn("rounded-full border px-3 py-1 text-xs font-medium transition",
                    view === v ? "border-primary/50 bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
            {v === "open" ? "Open" : v === "done" ? "Completed & cancelled" : "All"}
          </button>
        ))}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search job cards" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
          {jobs.length === 0 ? "No job cards yet. Raise one with New job card, or a captain can request Crew Care from the Client Portal." : "Nothing matches."}
        </div>
      ) : (
        <div className="grid gap-2">
          {shown.map((j) => (
            <button key={j.id} type="button" onClick={() => setOpenId(j.id)}
                    className="flex flex-col gap-2 rounded-xl border border-border bg-card/60 p-3 text-left transition hover:border-primary/40 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono font-semibold text-foreground">{j.reference}</span>
                  <span>{TYPE_LABEL[j.job_type]}</span>
                  {j.source === "portal" && <span className="rounded border border-primary/30 bg-primary/10 px-1.5 text-[10px] font-semibold uppercase text-primary">Client Portal</span>}
                  {(j.priority === "high" || j.priority === "urgent") && <span className={cn("font-semibold uppercase", PRIORITY_COLOR[j.priority])}>{j.priority}</span>}
                </div>
                <div className="mt-0.5 truncate font-medium">{j.title}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {j.yacht?.vessel_name && <span>{j.yacht.vessel_name}</span>}
                  {j.requested_by_name && <span>from {j.requested_by_name}</span>}
                  {j.needed_at && <span>{fmtDMY(j.needed_at, { time: true })}</span>}
                  {(j.pickup || j.dropoff) && <span className="truncate">{[j.pickup, j.dropoff].filter(Boolean).join(" → ")}</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {j.assigned_name && <span className="text-xs text-muted-foreground">{j.assigned_name}</span>}
                <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", STATUS_COLOR[j.status])}>{STATUS_LABEL[j.status]}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {creating && (
        <NewJobDialog yachts={yachts} defaultRequester={staffName(me) === "Unknown" ? "" : staffName(me)}
                      onClose={() => setCreating(false)}
                      onCreated={async (job) => {
                        setCreating(false);
                        setJobs((prev) => [job, ...prev]);
                        toast.success(`${job.reference} raised — the Crew Care team has been notified`);
                        await runAlerts(session?.access_token);
                      }} />
      )}
      {openJob && (
        <JobDialog job={openJob} staff={staff} staffById={staffById}
                   onClose={() => setOpenId(null)}
                   onChanged={(job) => setJobs((prev) => prev.map((x) => (x.id === job.id ? job : x)))} />
      )}
      {showSettings && <NotificationsDialog staff={staff} token={session?.access_token} onClose={() => setShowSettings(false)} />}
    </div>
  );
}

// ─── New job card ────────────────────────────────────────────────────────────

function NewJobDialog({ yachts, defaultRequester, onClose, onCreated }: {
  yachts: Yacht[]; defaultRequester: string; onClose: () => void; onCreated: (job: Job) => void;
}) {
  const { user } = useAuth();
  const [f, setF] = useState({
    job_type: "transfer" as JobType, title: "", details: "", yacht_id: "__none",
    requested_by_name: defaultRequester, pickup: "", dropoff: "", needed_at: "", passengers: "", priority: "normal" as Priority,
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.title.trim()) { toast.error("Give the job a short summary"); return; }
    setBusy(true);
    const { data, error } = await db.from("crew_care_jobs").insert({
      source: "internal", job_type: f.job_type, title: f.title.trim(), details: f.details.trim() || null,
      yacht_id: f.yacht_id === "__none" ? null : f.yacht_id,
      requested_by_name: f.requested_by_name.trim() || null,
      pickup: f.pickup.trim() || null, dropoff: f.dropoff.trim() || null,
      needed_at: f.needed_at ? new Date(f.needed_at).toISOString() : null,
      passengers: f.passengers === "" ? null : Number(f.passengers),
      priority: f.priority, created_by: user?.id ?? null,
    }).select(JOB_COLS).single();
    setBusy(false);
    if (error || !data) { toast.error(error?.message ?? "Could not raise the job card"); return; }
    onCreated(data);
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>New job card</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Type</Label>
              <Select value={f.job_type} onValueChange={(v) => set("job_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(TYPE_LABEL) as JobType[]).map((t) => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Priority</Label>
              <Select value={f.priority} onValueChange={(v) => set("priority", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem><SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Summary</Label>
            <Input maxLength={140} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Driver for 2 crew to DXB" autoFocus />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Requested by</Label>
              <Input value={f.requested_by_name} onChange={(e) => set("requested_by_name", e.target.value)} placeholder="e.g. Captain Steve" />
            </div>
            <div className="grid gap-1.5">
              <Label>Vessel <span className="text-muted-foreground">(optional)</span></Label>
              <Select value={f.yacht_id} onValueChange={(v) => set("yacht_id", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No vessel / internal</SelectItem>
                  {yachts.map((y) => <SelectItem key={y.id} value={y.id}>{y.vessel_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Pick-up</Label>
              <Input maxLength={300} value={f.pickup} onChange={(e) => set("pickup", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Drop-off</Label>
              <Input maxLength={300} value={f.dropoff} onChange={(e) => set("dropoff", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Date & time</Label>
              <Input type="datetime-local" value={f.needed_at} onChange={(e) => set("needed_at", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Passengers</Label>
              <Input type="number" min={0} max={500} value={f.passengers} onChange={(e) => set("passengers", e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Details</Label>
            <Textarea rows={3} value={f.details} onChange={(e) => set("details", e.target.value)} placeholder="Crew names, flight numbers, luggage, contact on the day…" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => void save()} disabled={busy || !f.title.trim()}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />} Raise job card
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── One job card ────────────────────────────────────────────────────────────

function JobDialog({ job, staff, staffById, onClose, onChanged }: {
  job: Job; staff: Staff[]; staffById: Map<string, Staff>; onClose: () => void; onChanged: (job: Job) => void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);

  const update = async (patch: Partial<Job>, what: string) => {
    setBusy(what);
    const { data, error } = await db.from("crew_care_jobs").update(patch).eq("id", job.id).select(JOB_COLS).single();
    setBusy(null);
    if (error || !data) { toast.error(error?.message ?? "Could not save"); return null; }
    onChanged(data);
    return data as Job;
  };

  const assign = (id: string) => {
    const s = id === "__none" ? undefined : staffById.get(id);
    void update({
      assigned_to: s?.user_id ?? null, assigned_name: s ? staffName(s) : null,
      // Picking someone up acknowledges a new job.
      ...(s && job.status === "new" ? { status: "acknowledged" as JobStatus } : {}),
    }, "assign");
  };

  const createTrip = async () => {
    setBusy("trip");
    const { data: trip, error } = await db.from("crew_trips").insert({
      trip_type: TRIP_TYPE[job.job_type], passenger_name: job.requested_by_name, yacht_id: job.yacht_id,
      pickup_address: job.pickup, dropoff_address: job.dropoff, pickup_datetime: job.needed_at,
      status: "pending", created_by: user?.id ?? null,
      notes: [`${job.reference} — ${job.title}`, job.passengers != null ? `${job.passengers} passenger(s)` : null, job.details].filter(Boolean).join("\n"),
    }).select("id").single();
    setBusy(null);
    if (error || !trip) { toast.error(error?.message ?? "Could not create the trip"); return; }
    const saved = await update({ trip_id: trip.id, ...(OPEN.includes(job.status) ? { status: "in_progress" as JobStatus } : {}) }, "trip");
    if (saved) toast.success("Trip created — assign a driver and vehicle in Trips");
  };

  const facts: Array<[string, ReactNode]> = ([
    ["Type", TYPE_LABEL[job.job_type]],
    ["Vessel", job.yacht?.vessel_name],
    ["Requested by", job.requested_by_name && `${job.requested_by_name}${job.source === "portal" ? ` (Client Portal${job.request?.reference ? ` · ${job.request.reference}` : ""})` : ""}`],
    ["When", job.needed_at && fmtDMY(job.needed_at, { time: true })],
    ["Pick-up", job.pickup],
    ["Drop-off", job.dropoff],
    ["Passengers", job.passengers != null ? String(job.passengers) : null],
    ["Priority", job.priority !== "normal" ? <span className={cn("font-semibold capitalize", PRIORITY_COLOR[job.priority])}>{job.priority}</span> : null],
    ["Raised", fmtDMY(job.created_at, { time: true })],
    ["Completed", job.completed_at && fmtDMY(job.completed_at, { time: true })],
  ] as Array<[string, ReactNode]>).filter(([, v]) => v);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">{job.reference}</span> {job.title}
          </DialogTitle>
        </DialogHeader>
        <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-sm">
          {facts.map(([k, v]) => (<Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></Fragment>))}
        </dl>
        {job.details && <div className="whitespace-pre-line rounded-lg border border-border bg-muted/30 p-3 text-sm">{job.details}</div>}
        {job.source === "portal" && (
          <p className="text-xs text-muted-foreground">The captain sees this status on their request in the Client Portal. Reply to them from Client Requests.</p>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Status</Label>
            <Select value={job.status} onValueChange={(v) => void update({ status: v as JobStatus }, "status")} disabled={!!busy}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(STATUS_LABEL) as JobStatus[]).map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Assigned to</Label>
            <Select value={job.assigned_to ?? "__none"} onValueChange={assign} disabled={!!busy}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Nobody yet</SelectItem>
                {staff.map((s) => <SelectItem key={s.user_id} value={s.user_id}>{staffName(s)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {job.trip_id ? (
            <Button variant="outline" asChild><Link to="/crew-cab/trips"><RouteIcon className="mr-1.5 h-4 w-4" /> Open in Trips</Link></Button>
          ) : (
            <Button variant="outline" onClick={() => void createTrip()} disabled={!!busy}>
              {busy === "trip" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Car className="mr-1.5 h-4 w-4" />} Create trip
            </Button>
          )}
          {OPEN.includes(job.status) && (
            <Button onClick={() => void update({ status: "completed" }, "done")} disabled={!!busy}>
              {busy === "done" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Mark completed
            </Button>
          )}
        </div>
        {job.alert_result && <p className="text-[11px] text-muted-foreground">Alerts: {job.alert_result}</p>}
      </DialogContent>
    </Dialog>
  );
}

// ─── Notifications ───────────────────────────────────────────────────────────

type Settings = {
  recipient_user_ids: string[]; email_enabled: boolean; email_extra: string[];
  teams_enabled: boolean; teams_webhook_url: string | null;
};
const TEAMS_URL = /^https:\/\/[A-Za-z0-9.-]+\.(logic\.azure\.com|powerplatform\.com|webhook\.office\.com|office\.com)(:443)?\//;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function NotificationsDialog({ staff, token, onClose }: { staff: Staff[]; token: string | undefined; onClose: () => void }) {
  const { user } = useAuth();
  const [s, setS] = useState<Settings | null>(null);
  const [extra, setExtra] = useState("");
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void db.from("crew_care_settings").select("recipient_user_ids, email_enabled, email_extra, teams_enabled, teams_webhook_url").eq("id", 1).maybeSingle()
      .then(({ data, error }: any) => {
        if (error) toast.error(error.message);
        const v: Settings = data ?? { recipient_user_ids: [], email_enabled: false, email_extra: [], teams_enabled: false, teams_webhook_url: null };
        setS(v);
        setExtra((v.email_extra ?? []).join(", "));
      });
  }, []);

  const byId = useMemo(() => new Map(staff.map((x) => [x.user_id, x])), [staff]);
  // While nobody is picked, the team is the Crew Care department.
  const deptTeam = staff.filter((x) => (x.department ?? "").toLowerCase().replace(/ /g, "_") === "crew_care");
  const picked = s?.recipient_user_ids ?? [];
  const team = picked.length ? picked.map((id) => byId.get(id)).filter(Boolean) as Staff[] : deptTeam;

  const save = async () => {
    if (!s) return;
    const extras = extra.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean);
    const bad = extras.find((e) => !EMAIL.test(e));
    if (bad) { toast.error(`"${bad}" isn't an email address`); return; }
    const url = (s.teams_webhook_url ?? "").trim();
    if (url && !TEAMS_URL.test(url)) { toast.error("The Teams address must be a Microsoft webhook URL (…logic.azure.com, …powerplatform.com or …webhook.office.com)"); return; }
    if (s.teams_enabled && !url) { toast.error("Paste the Teams webhook URL to switch Teams on"); return; }
    setBusy("save");
    const { error } = await db.from("crew_care_settings").update({
      recipient_user_ids: s.recipient_user_ids, email_enabled: s.email_enabled, email_extra: extras,
      teams_enabled: s.teams_enabled, teams_webhook_url: url || null, updated_by: user?.id ?? null, updated_at: new Date().toISOString(),
    }).eq("id", 1);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Crew Care notifications saved");
    onClose();
  };

  const test = async (channel: "email" | "teams") => {
    if (!token) return;
    setBusy(channel);
    const res = await fetch("/api/crew-care/alerts", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "test", channel, url: s?.teams_webhook_url ?? "" }),
    }).catch(() => null);
    const body = await res?.json().catch(() => ({})) ?? {};
    setBusy(null);
    if (!res?.ok || !body.ok) { toast.error(body.error ?? "The test didn't go through"); return; }
    toast.success(channel === "email" ? `Test email sent to ${body.to}` : "Test card posted to Teams");
  };

  const addPerson = () => {
    if (!adding || !s) return;
    // Starting a hand-picked list from the department default keeps those people on it.
    const base = picked.length ? picked : deptTeam.map((x) => x.user_id);
    setS({ ...s, recipient_user_ids: [...new Set([...base, adding])] });
    setAdding("");
  };
  const removePerson = (id: string) => {
    if (!s) return;
    const base = picked.length ? picked : deptTeam.map((x) => x.user_id);
    setS({ ...s, recipient_user_ids: base.filter((x) => x !== id) });
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><BellRing className="h-5 w-5 text-primary" /> Job card notifications</DialogTitle></DialogHeader>
        {!s ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /> : (
          <div className="grid gap-5">
            <section className="grid gap-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4" /> The Crew Care team</h3>
              <p className="text-xs text-muted-foreground">
                Everyone here gets an in-app alert the moment a job card is raised (always on){!picked.length && " — until you pick people, that's everyone in the Crew Care department"}.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {team.length === 0 && <span className="text-xs text-amber-400">Nobody yet — add someone below.</span>}
                {team.map((p) => (
                  <span key={p.user_id} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/30 py-0.5 pl-2.5 pr-1 text-xs">
                    {staffName(p)}
                    <button type="button" aria-label={`Remove ${staffName(p)}`} onClick={() => removePerson(p.user_id)}
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
                <Button size="sm" variant="outline" onClick={addPerson} disabled={!adding}><Plus className="mr-1 h-3.5 w-3.5" /> Add</Button>
              </div>
            </section>

            <section className="grid gap-2 rounded-xl border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><Mail className="h-4 w-4" /> Email</h3>
                <Switch checked={s.email_enabled} onCheckedChange={(v) => setS({ ...s, email_enabled: v })} aria-label="Email alerts" />
              </div>
              <p className="text-xs text-muted-foreground">Emails the team above. Add a shared mailbox too if you like (company addresses only).</p>
              <Input placeholder="Extra addresses, e.g. crewcare@jlsyachts.com" value={extra} onChange={(e) => setExtra(e.target.value)} />
              <Button size="sm" variant="ghost" className="justify-self-start" onClick={() => void test("email")} disabled={!!busy}>
                {busy === "email" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />} Send me a test email
              </Button>
            </section>

            <section className="grid gap-2 rounded-xl border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><MessageSquare className="h-4 w-4" /> Microsoft Teams</h3>
                <Switch checked={s.teams_enabled} onCheckedChange={(v) => setS({ ...s, teams_enabled: v })} aria-label="Teams alerts" />
              </div>
              <p className="text-xs text-muted-foreground">
                Posts each new job card to a Teams channel. In the channel: <b>…</b> → <b>Workflows</b> → “Post to a channel when a webhook request is received”, then paste the URL it gives you here.
              </p>
              <Input placeholder="https://….powerplatform.com/… or …logic.azure.com/…" value={s.teams_webhook_url ?? ""}
                     onChange={(e) => setS({ ...s, teams_webhook_url: e.target.value })} />
              <Button size="sm" variant="ghost" className="justify-self-start" onClick={() => void test("teams")} disabled={!!busy || !s.teams_webhook_url}>
                {busy === "teams" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />} Post a test card
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
