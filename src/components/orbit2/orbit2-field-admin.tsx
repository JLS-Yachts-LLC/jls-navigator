/**
 * Orbit field app — "Admin Management" for Orbit admins on a phone.
 *
 * The desktop Orbit 2 hub does not fit a phone, so admins get the same work in
 * phone-shaped screens (client request, 30 Sep 2026):
 *   • Dashboard — the Calendar (one day at a time) and Team Management (who has
 *     what on that day, roster clashes first), nothing else from the desktop board.
 *   • Projects — every Project List / Bunkering record: search, status filters,
 *     open a record to change status, schedule, crew, remarks; create a new one.
 *   • Boats — Managed Boats: jobs (add / edit / status), the Inventory List and
 *     the inspection checklists.
 * Everything writes to the same tables as the desktop, so the office and the
 * phone are always looking at one record.
 */
import { useMemo, useState } from "react";
import {
  Anchor, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Loader2, Plus, Search, Ship, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/error-message";
import { SignedImage } from "@/components/ui/signed-file";
import {
  ORBIT2_STATUSES, ORBIT2_CATEGORIES, ORBIT2_TEAM, BOAT_JOB_CATEGORIES, BOAT_TASK_STATUSES,
  statusColor, colorFor, isComplete, boatJobCategoryToKind, kindToBoatJobCategory, boatInventoryConditionColor, checklistCategoryFor,
  type BoatJobCategory,
} from "./orbit2-constants";
import {
  useOrbit2, assignments, fmtSchedule, hhmmToMinutes, minutesToHhmm,
  type Orbit2Project, type Orbit2Boat, type Orbit2BoatTask, type Orbit2BoatInventoryItem, type Orbit2Note, type Orbit2ScheduleEntry, type Assignment,
} from "./orbit2-data";
import { stamp } from "./orbit2-fields";
import { InspectionsRequired, InspectionChecklist, INSPECTION_REGIMES, type InspectionRegime } from "./orbit2-boat-checklist";
import { useEffect } from "react";

const sb = supabase as any;

const today = () => new Date().toISOString().slice(0, 10);
const shiftDate = (iso: string, days: number) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
const fmtDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-[16px] outline-none focus:border-primary";

// ── Shell ────────────────────────────────────────────────────────────────────

type Section = "dashboard" | "projects" | "boats";

export function FieldAdmin({ authorName, userId }: { authorName: string; userId: string | null }) {
  const data = useOrbit2();
  const [section, setSection] = useState<Section>("dashboard");
  const [openProject, setOpenProject] = useState<Orbit2Project | "new" | null>(null);
  const [openBoat, setOpenBoat] = useState<Orbit2Boat | null>(null);

  const openAssignment = (a: Assignment) => {
    if (a.source === "boat") {
      const t = data.boatTasks.find((x) => x.id === a.id);
      const b = t && data.boats.find((x) => x.id === t.boat_id);
      if (b) setOpenBoat(b);
    } else {
      const p = data.projects.find((x) => x.id === a.id);
      if (p) setOpenProject(p);
    }
  };

  return (
    <main className="flex flex-1 flex-col">
      <div className="sticky top-[61px] z-10 border-b border-border/60 bg-background/95 px-4 py-2 backdrop-blur">
        <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-card p-1">
          {([["dashboard", "Dashboard", CalendarDays], ["projects", "Projects", ClipboardList], ["boats", "Boats", Ship]] as const).map(([k, label, Icon]) => (
            <button key={k} onClick={() => setSection(k)}
              className={cn("flex h-10 items-center justify-center gap-1.5 rounded-md text-[15px] font-semibold",
                section === k ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      {data.loading ? (
        <div className="flex flex-1 items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : section === "dashboard" ? (
        <AdminDashboard projects={data.projects} boatTasks={data.boatTasks} boats={data.boats} schedule={data.schedule} onOpen={openAssignment} />
      ) : section === "projects" ? (
        <AdminProjects projects={data.projects} onOpen={setOpenProject} onNew={() => setOpenProject("new")} />
      ) : (
        <AdminBoats boats={data.boats} boatTasks={data.boatTasks} onOpen={setOpenBoat} />
      )}

      {openProject && (
        <ProjectSheet project={openProject === "new" ? null : openProject} authorName={authorName} userId={userId}
          onClose={() => setOpenProject(null)} reload={data.reload} />
      )}
      {openBoat && (
        <BoatSheet boat={data.boats.find((b) => b.id === openBoat.id) ?? openBoat}
          tasks={data.boatTasks.filter((t) => t.boat_id === openBoat.id)}
          inventory={data.boatInventory.filter((i) => i.boat_id === openBoat.id)}
          authorName={authorName} userId={userId} onClose={() => setOpenBoat(null)} reload={data.reload} />
      )}
    </main>
  );
}

// ── Dashboard: Calendar + Team ───────────────────────────────────────────────

function AdminDashboard({ projects, boatTasks, boats, schedule, onOpen }: {
  projects: Orbit2Project[]; boatTasks: Orbit2BoatTask[]; boats: Orbit2Boat[]; schedule: Orbit2ScheduleEntry[]; onOpen: (a: Assignment) => void;
}) {
  const [view, setView] = useState<"calendar" | "team">("calendar");
  const [date, setDate] = useState(today());
  const all = useMemo(() => assignments(projects, boatTasks, boats), [projects, boatTasks, boats]);
  const onDay = useMemo(() => all.filter((a) => a.date === date).sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99")), [all, date]);
  // Seven days around the chosen one, with how much is on each — the strip under the date.
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => shiftDate(date, i - 3)).map((d) => ({ d, n: all.filter((a) => a.date === d).length })), [all, date]);

  return (
    <div className="flex-1 space-y-3 px-4 py-3">
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-card p-1">
        {([["calendar", "Calendar", CalendarDays], ["team", "Team Management", Users]] as const).map(([k, label, Icon]) => (
          <button key={k} onClick={() => setView(k)}
            className={cn("flex h-9 items-center justify-center gap-1.5 rounded-md text-[14px] font-semibold", view === k ? "bg-accent text-foreground" : "text-muted-foreground")}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {/* Date navigator */}
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex items-center justify-between">
          <button onClick={() => setDate(shiftDate(date, -1))} className="rounded-md p-2 hover:bg-accent" aria-label="Previous day"><ChevronLeft className="h-5 w-5" /></button>
          <button onClick={() => setDate(today())} className="text-center">
            <div className="text-[16px] font-semibold">{fmtDay(date)}</div>
            <div className="text-[13px] text-muted-foreground">{date === today() ? "Today" : "Tap for today"}</div>
          </button>
          <button onClick={() => setDate(shiftDate(date, 1))} className="rounded-md p-2 hover:bg-accent" aria-label="Next day"><ChevronRight className="h-5 w-5" /></button>
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1">
          {week.map(({ d, n }) => (
            <button key={d} onClick={() => setDate(d)}
              className={cn("flex flex-col items-center rounded-md py-1.5 text-[13px]", d === date ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}>
              <span>{new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short" })}</span>
              <span className="font-semibold">{d.slice(8)}</span>
              <span className={cn("mt-0.5 h-1.5 w-1.5 rounded-full", n ? (d === date ? "bg-primary-foreground" : "bg-primary") : "bg-transparent")} />
            </button>
          ))}
        </div>
      </div>

      {view === "calendar" ? (
        onDay.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border py-8 text-center text-[15px] text-muted-foreground">Nothing scheduled this day.</p>
        ) : (
          <ul className="space-y-2">
            {onDay.map((a) => (
              <li key={`${a.source}-${a.id}`}>
                <button onClick={() => onOpen(a)} className="block w-full rounded-xl border border-border bg-card p-3 text-left hover:border-primary/50">
                  <div className="flex items-center justify-between gap-2 text-[14px]">
                    <span className="font-semibold tabular-nums">{a.time ? a.time.slice(0, 5) : "—"}</span>
                    <span className="rounded-full px-2 py-0.5 text-[13px] font-medium text-black/80" style={{ background: colorFor(a.bucket) }}>{a.label}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[16px] font-semibold">{a.title}</span>
                    <Chip status={a.status} />
                  </div>
                  <div className="mt-1 text-[14px] text-muted-foreground">{a.ref}{a.team.length ? ` · ${a.team.join(", ")}` : " · nobody assigned"}</div>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <TeamDay date={date} items={onDay} schedule={schedule.filter((s) => s.entry_date === date)} onOpen={onOpen} />
      )}
    </div>
  );
}

/** Everyone on the roster for one day: their shift / off / leave, their jobs, and clashes first. */
function TeamDay({ date, items, schedule, onOpen }: { date: string; items: Assignment[]; schedule: Orbit2ScheduleEntry[]; onOpen: (a: Assignment) => void }) {
  const [openPerson, setOpenPerson] = useState<string | null>(null);
  const rows = ORBIT2_TEAM.map((person) => {
    const jobs = items.filter((a) => a.team.includes(person));
    const entry = schedule.find((s) => s.person === person) ?? null;
    const conflict = jobs.length > 0 && (entry?.kind === "leave" || entry?.kind === "off");
    return { person, jobs, entry, conflict };
  }).sort((a, b) => Number(b.conflict) - Number(a.conflict) || b.jobs.length - a.jobs.length || a.person.localeCompare(b.person));
  const unassigned = items.filter((a) => a.team.length === 0);

  return (
    <div className="space-y-2">
      {unassigned.length > 0 && (
        <div className="rounded-xl border border-warning/50 bg-warning/10 px-3 py-2 text-[14px]">
          <span className="font-semibold text-warning">{unassigned.length} job{unassigned.length === 1 ? "" : "s"} with nobody assigned</span> on {date.slice(8)}/{date.slice(5, 7)} — open them from the Calendar to assign crew.
        </div>
      )}
      <ul className="divide-y divide-border/40 rounded-xl border border-border bg-card">
        {rows.map(({ person, jobs, entry, conflict }) => (
          <li key={person}>
            <button onClick={() => setOpenPerson(openPerson === person ? null : person)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left">
              <div className="flex items-center gap-2">
                <span className={cn("h-2.5 w-2.5 rounded-full", conflict ? "bg-destructive" : jobs.length ? "bg-emerald-500" : entry?.kind === "leave" ? "bg-amber-500" : entry?.kind === "off" ? "bg-slate-400" : "bg-border")} />
                <span className="text-[16px] font-semibold">{person}</span>
              </div>
              <div className="flex items-center gap-2 text-[14px]">
                {entry && <span className={cn("rounded-full border px-2 py-0.5 capitalize", conflict ? "border-destructive text-destructive" : "border-border text-muted-foreground")}>{entry.kind}</span>}
                <span className="text-muted-foreground">{jobs.length} job{jobs.length === 1 ? "" : "s"}</span>
              </div>
            </button>
            {openPerson === person && (
              <div className="space-y-1.5 px-3 pb-3">
                {conflict && <p className="text-[14px] text-destructive">Assigned while {entry?.kind} — this job needs someone else.</p>}
                {entry?.note && <p className="text-[14px] text-muted-foreground">{entry.note}</p>}
                {jobs.length === 0 ? <p className="text-[14px] text-muted-foreground">No jobs this day.</p> : jobs.map((a) => (
                  <button key={`${a.source}-${a.id}`} onClick={() => onOpen(a)} className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left text-[14px]">
                    <span className="min-w-0 truncate"><span className="font-semibold tabular-nums">{a.time?.slice(0, 5) ?? "—"}</span> · {a.title}</span>
                    <Chip status={a.status} />
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Projects ─────────────────────────────────────────────────────────────────

const PROJECT_FILTERS = [
  ["active", "Active"], ["team", "Complete - Team"], ["invoice", "To be Invoiced"], ["invoiced", "Invoiced"], ["all", "All"],
] as const;
type ProjectFilter = (typeof PROJECT_FILTERS)[number][0];
const matchesFilter = (p: Orbit2Project, f: ProjectFilter) =>
  f === "all" ? true
  : f === "active" ? !isComplete(p.status) && p.status !== "Cancelled"
  : f === "team" ? p.status === "Complete - Team"
  : f === "invoice" ? p.status === "Complete - To be Invoiced"
  : p.status === "Complete - Invoiced";

function AdminProjects({ projects, onOpen, onNew }: { projects: Orbit2Project[]; onOpen: (p: Orbit2Project) => void; onNew: () => void }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<ProjectFilter>("active");
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return projects
      .filter((p) => matchesFilter(p, filter))
      .filter((p) => !s || [p.task_id, p.client_name, p.specific_task, p.location, p.requestor_name, ...(p.assigned_team ?? [])].some((v) => (v ?? "").toLowerCase().includes(s)))
      .sort((a, b) => (b.schedule_date ?? "").localeCompare(a.schedule_date ?? "") || b.created_at.localeCompare(a.created_at));
  }, [projects, q, filter]);

  return (
    <div className="flex-1 space-y-3 px-4 py-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search task, client, crew…" className={cn(inputCls, "pl-9")} />
        </div>
        <button onClick={onNew} className="flex h-11 items-center gap-1 rounded-lg bg-primary px-3 text-[15px] font-semibold text-primary-foreground"><Plus className="h-4 w-4" /> New</button>
      </div>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {PROJECT_FILTERS.map(([k, label]) => {
          const n = projects.filter((p) => matchesFilter(p, k)).length;
          return (
            <button key={k} onClick={() => setFilter(k)}
              className={cn("shrink-0 rounded-full border px-3 py-1 text-[14px] font-medium", filter === k ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground")}>
              {label} · {n}
            </button>
          );
        })}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-8 text-center text-[15px] text-muted-foreground">No records match.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((p) => (
            <li key={p.id}>
              <button onClick={() => onOpen(p)} className="block w-full rounded-xl border border-border bg-card p-3 text-left hover:border-primary/50">
                <div className="flex items-center justify-between gap-2 text-[14px] text-muted-foreground">
                  <span className="font-semibold text-primary">{p.task_id}</span>
                  <span>{fmtSchedule(p.schedule_date, p.schedule_time)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[16px] font-semibold">{p.client_name ?? "—"}</span>
                  <Chip status={p.status} />
                </div>
                <div className="mt-1 truncate text-[14px] text-muted-foreground">
                  {p.record_type === "bunkering" ? "Bunkering" : p.service_category}{p.specific_task ? ` · ${p.specific_task}` : ""}
                  {p.assigned_team?.length ? ` · ${p.assigned_team.join(", ")}` : ""}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One project record — the fields the office changes from a phone, plus remarks and the crew's comments. */
function ProjectSheet({ project, authorName, userId, onClose, reload }: {
  project: Orbit2Project | null; authorName: string; userId: string | null; onClose: () => void; reload: () => Promise<void> | void;
}) {
  const creating = !project;
  const [f, setF] = useState({
    client_name: project?.client_name ?? "", requestor_name: project?.requestor_name ?? "",
    service_category: project?.service_category ?? ORBIT2_CATEGORIES[0], specific_task: project?.specific_task ?? "",
    status: project?.status ?? "Not Yet Initiated", schedule_date: project?.schedule_date ?? "", schedule_time: project?.schedule_time?.slice(0, 5) ?? "",
    location: project?.location ?? "", team: project?.assigned_team ?? [] as string[], etc: minutesToHhmm(project?.etc_minutes ?? null),
  });
  const [notes, setNotes] = useState<Orbit2Note[]>([]);
  const [remark, setRemark] = useState("");
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const loadNotes = async () => {
    if (!project) return;
    const { data } = await sb.from("orbit2_notes").select("*").eq("project_id", project.id).order("created_at");
    setNotes((data ?? []) as Orbit2Note[]);
  };
  useEffect(() => { void loadNotes(); }, [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!f.client_name.trim()) { toast.error("Boat / Client Name is required."); return; }
    setSaving(true);
    try {
      const payload = {
        client_name: f.client_name.trim(), requestor_name: f.requestor_name.trim() || null,
        service_category: f.service_category, specific_task: f.specific_task.trim() || null, status: f.status,
        schedule_date: f.schedule_date || null, schedule_time: f.schedule_time || null, location: f.location.trim() || null,
        assigned_team: f.team, etc_minutes: f.etc.trim() ? hhmmToMinutes(f.etc.trim()) : null,
      };
      const { error } = creating
        ? await sb.from("orbit2_projects").insert({ ...payload, record_type: "project", created_by: userId })
        : await sb.from("orbit2_projects").update(payload).eq("id", project!.id);
      if (error) throw error;
      toast.success(creating ? "Project created" : `${project!.task_id} saved`);
      await reload();
      onClose();
    } catch (e) { toast.error(errorMessage(e, "Could not save")); }
    finally { setSaving(false); }
  }

  async function addRemark() {
    const body = remark.trim();
    if (!body || !project) return;
    const { error } = await sb.from("orbit2_notes").insert({ project_id: project.id, kind: "remark", author: authorName, body, created_by: userId });
    if (error) { toast.error(errorMessage(error, "Could not add the remark")); return; }
    setRemark(""); await loadNotes();
  }

  return (
    <Sheet title={creating ? "New project" : project!.task_id} subtitle={creating ? "Project List" : project!.client_name ?? undefined} onClose={onClose}
      footer={
        <button onClick={() => void save()} disabled={saving} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[16px] font-semibold text-primary-foreground disabled:opacity-50">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} {creating ? "Create project" : "Save changes"}
        </button>
      }>
      <L label="Status">
        <select className={inputCls} value={f.status} onChange={(e) => set("status", e.target.value)}>
          {ORBIT2_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </L>
      <L label="Boat / Client Name"><input className={inputCls} value={f.client_name} onChange={(e) => set("client_name", e.target.value)} /></L>
      <L label="Requestor"><input className={inputCls} value={f.requestor_name} onChange={(e) => set("requestor_name", e.target.value)} /></L>
      <L label="Service Category">
        <select className={inputCls} value={f.service_category} onChange={(e) => set("service_category", e.target.value)}>
          {ORBIT2_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </L>
      <L label="Specific task"><textarea className={cn(inputCls, "min-h-[80px]")} value={f.specific_task} onChange={(e) => set("specific_task", e.target.value)} /></L>
      <div className="grid grid-cols-2 gap-3">
        <L label="Date"><input type="date" className={inputCls} value={f.schedule_date} onChange={(e) => set("schedule_date", e.target.value)} /></L>
        <L label="Time"><input type="time" className={inputCls} value={f.schedule_time} onChange={(e) => set("schedule_time", e.target.value)} /></L>
        <L label="Location"><input className={inputCls} value={f.location} onChange={(e) => set("location", e.target.value)} /></L>
        <L label="ETC (hh:mm)"><input className={inputCls} placeholder="01:30" value={f.etc} onChange={(e) => set("etc", e.target.value)} /></L>
      </div>
      <L label="Assigned crew"><TeamChips value={f.team} onChange={(v) => set("team", v)} /></L>

      {project && (
        <>
          <section>
            <div className="mb-1.5 text-[15px] font-semibold">Remarks</div>
            <NoteList notes={notes.filter((n) => n.kind === "remark")} empty="No remarks yet." />
            <div className="mt-2 flex gap-2">
              <input className={inputCls} value={remark} placeholder="Add a remark…" onChange={(e) => setRemark(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void addRemark(); }} />
              <button onClick={() => void addRemark()} disabled={!remark.trim()} className="h-11 shrink-0 rounded-lg border border-primary/50 px-3 text-[15px] font-semibold text-primary disabled:opacity-40">Add</button>
            </div>
          </section>
          <section>
            <div className="mb-1.5 text-[15px] font-semibold">Team comments</div>
            <NoteList notes={notes.filter((n) => n.kind === "team_comment")} empty="Nothing from the crew yet." />
          </section>
        </>
      )}
    </Sheet>
  );
}

// ── Boats ────────────────────────────────────────────────────────────────────

function AdminBoats({ boats, boatTasks, onOpen }: { boats: Orbit2Boat[]; boatTasks: Orbit2BoatTask[]; onOpen: (b: Orbit2Boat) => void }) {
  return (
    <div className="flex-1 space-y-2 px-4 py-3">
      {boats.map((b) => {
        const open = boatTasks.filter((t) => t.boat_id === b.id && t.status !== "Complete");
        const byKind = (k: Orbit2BoatTask["kind"]) => open.filter((t) => t.kind === k).length;
        return (
          <button key={b.id} onClick={() => onOpen(b)} className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left hover:border-primary/50">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/30">
              {b.image_ref ? <SignedImage stored={b.image_ref} alt={b.name} className="h-full w-full object-cover" /> : <Anchor className="h-6 w-6 text-muted-foreground/50" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[16px] font-semibold">{b.name}</div>
              <div className="text-[14px] text-muted-foreground">{b.boat_type ?? "—"}{b.job_prefix ? ` · ${b.job_prefix}` : ""}</div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-[13px]">
                <span className={byKind("maintenance") ? "text-amber-500" : "text-muted-foreground"}>Maintenance {byKind("maintenance")}</span>
                <span className={byKind("defect") ? "text-orange-500" : "text-muted-foreground"}>Repairs {byKind("defect")}</span>
                <span className={byKind("inventory") ? "text-sky-500" : "text-muted-foreground"}>Inventory {byKind("inventory")}</span>
                <span className={byKind("booked") ? "text-sky-500" : "text-muted-foreground"}>Booked {byKind("booked")}</span>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </button>
        );
      })}
    </div>
  );
}

function BoatSheet({ boat, tasks, inventory, authorName, userId, onClose, reload }: {
  boat: Orbit2Boat; tasks: Orbit2BoatTask[]; inventory: Orbit2BoatInventoryItem[]; authorName: string; userId: string | null;
  onClose: () => void; reload: () => Promise<void> | void;
}) {
  const [tab, setTab] = useState<"jobs" | "inventory" | "inspections">("jobs");
  // An existing job, a blank new one, or a new one started from a checklist's Assign Team.
  const [job, setJob] = useState<Orbit2BoatTask | "new" | { category: BoatJobCategory } | null>(null);
  const [showDone, setShowDone] = useState(false);
  const jobs = tasks.filter((t) => showDone || t.status !== "Complete").sort((a, b) => (b.schedule_date ?? "").localeCompare(a.schedule_date ?? ""));

  async function patchBoat(patch: Record<string, unknown>) {
    const { error } = await sb.from("orbit2_boats").update(patch).eq("id", boat.id);
    if (error) { toast.error(errorMessage(error, "Could not save")); return false; }
    await reload();
    return true;
  }

  return (
    <Sheet title={boat.name} subtitle={boat.boat_type ?? undefined} onClose={onClose}>
      <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-card p-1">
        {(["jobs", "inventory", "inspections"] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={cn("h-9 rounded-md text-[14px] font-semibold capitalize", tab === k ? "bg-accent" : "text-muted-foreground")}>{k}</button>
        ))}
      </div>

      {tab === "jobs" && (
        <>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-[14px] text-muted-foreground"><input type="checkbox" className="h-4 w-4 accent-primary" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show completed</label>
            <button onClick={() => setJob("new")} className="flex h-10 items-center gap-1 rounded-lg bg-primary px-3 text-[15px] font-semibold text-primary-foreground"><Plus className="h-4 w-4" /> Add job</button>
          </div>
          {jobs.length === 0 ? <p className="rounded-xl border border-dashed border-border py-8 text-center text-[15px] text-muted-foreground">No jobs.</p> : (
            <ul className="space-y-2">
              {jobs.map((t) => (
                <li key={t.id}>
                  <button onClick={() => setJob(t)} className="block w-full rounded-xl border border-border bg-card p-3 text-left hover:border-primary/50">
                    <div className="flex items-center justify-between gap-2 text-[14px] text-muted-foreground">
                      <span className="font-semibold text-primary">{t.job_no ?? "—"}</span><span>{fmtSchedule(t.schedule_date, t.schedule_time)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-[16px] font-semibold">{t.title}</span>
                      <Chip status={t.status} />
                    </div>
                    <div className="mt-1 text-[14px] text-muted-foreground">{kindToBoatJobCategory(t.kind)}{t.assigned_team?.length ? ` · ${t.assigned_team.join(", ")}` : " · nobody assigned"}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {tab === "inventory" && (
        inventory.length === 0 ? <p className="rounded-xl border border-dashed border-border py-8 text-center text-[15px] text-muted-foreground">Nothing on the inventory list yet.</p> : (
          <ul className="divide-y divide-border/40 rounded-xl border border-border bg-card">
            {inventory.map((r, i) => (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                <span className="w-5 text-[13px] text-muted-foreground">{i + 1}</span>
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-border bg-muted/20">
                  {r.image_ref && <SignedImage stored={r.image_ref} alt={r.item} className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-medium">{r.item}</div>
                  <div className="text-[13px] text-muted-foreground">{r.qty ?? "—"} {r.unit ?? ""} · <span style={{ color: boatInventoryConditionColor(r.condition) }}>{r.condition ?? "—"}</span>{r.on_board ? "" : " · not on board"}</div>
                </div>
              </li>
            ))}
          </ul>
        )
      )}

      {tab === "inspections" && (
        <div className="space-y-3">
          <InspectionsRequired boat={boat} onSave={patchBoat} />
          {INSPECTION_REGIMES.filter((r) => (boat.inspections_required ?? INSPECTION_REGIMES).includes(r)).map((regime: InspectionRegime) => (
            <div key={regime} className="rounded-xl border border-border bg-card p-3">
              <div className="mb-2 text-[15px] font-semibold uppercase tracking-wide">{regime}{regime !== "rya" ? "" : ""} <span className="text-[13px] font-normal text-muted-foreground">last inspection {boat[`${regime}_last_inspection`] ? new Date(`${boat[`${regime}_last_inspection`]}T00:00:00`).toLocaleDateString("en-GB") : "—"}</span></div>
              <InspectionChecklist boat={boat} regime={regime} inventory={inventory} isAdmin authorName={authorName} onDocumentAdded={reload}
                onAssignTeam={() => setJob({ category: checklistCategoryFor(regime) })} />
            </div>
          ))}
        </div>
      )}

      {job && (
        <BoatJobSheet boat={boat} job={typeof job === "object" && "id" in job ? job : null}
          preset={typeof job === "object" && "category" in job ? job.category : undefined}
          userId={userId} onClose={() => setJob(null)} reload={reload} />
      )}
    </Sheet>
  );
}

function BoatJobSheet({ boat, job, preset, userId, onClose, reload }: {
  boat: Orbit2Boat; job: Orbit2BoatTask | null; preset?: BoatJobCategory; userId: string | null; onClose: () => void; reload: () => Promise<void> | void;
}) {
  const [f, setF] = useState({
    category: job ? kindToBoatJobCategory(job.kind) : (preset ?? BOAT_JOB_CATEGORIES[0]),
    title: job?.title ?? (preset ? `${preset.replace(" Checklist", "")} inspection checklist` : ""), status: job?.status ?? "Pending",
    schedule_date: job?.schedule_date ?? "", schedule_time: job?.schedule_time?.slice(0, 5) ?? "", est: minutesToHhmm(job?.est_minutes ?? null),
    team: job?.assigned_team ?? [] as string[], technician: job?.technician ?? "", remarks: job?.remarks ?? "",
  });
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    if (!f.title.trim()) { toast.error("Give the job a description."); return; }
    // An empty crew list saves fine but is invisible on every phone — the
    // field app's job query is `.contains("assigned_team", [name])`, which
    // never matches an empty array.
    if (f.team.length === 0) { toast.error("Assign at least one crew member."); return; }
    setSaving(true);
    try {
      const payload = {
        boat_id: boat.id, kind: boatJobCategoryToKind(f.category), title: f.title.trim(), status: f.status,
        schedule_date: f.schedule_date || null, schedule_time: f.schedule_time || null, est_minutes: f.est.trim() ? hhmmToMinutes(f.est.trim()) : null,
        assigned_team: f.team, technician: f.technician.trim() || null, remarks: f.remarks.trim() || null,
      };
      const { error } = job
        ? await sb.from("orbit2_boat_tasks").update(payload).eq("id", job.id)
        : await sb.from("orbit2_boat_tasks").insert({ ...payload, created_by: userId });
      if (error) throw error;
      toast.success(job ? `${job.job_no} saved` : "Job added");
      await reload();
      onClose();
    } catch (e) { toast.error(errorMessage(e, "Could not save")); }
    finally { setSaving(false); }
  }

  return (
    <Sheet title={job ? job.job_no ?? "Job" : "Add job"} subtitle={boat.name} onClose={onClose}
      footer={
        <button onClick={() => void save()} disabled={saving} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[16px] font-semibold text-primary-foreground disabled:opacity-50">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} {job ? "Save changes" : "Add job"}
        </button>
      }>
      <div className="grid grid-cols-2 gap-3">
        <L label="Category">
          <select className={inputCls} value={f.category} onChange={(e) => set("category", e.target.value as typeof f.category)}>
            {BOAT_JOB_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </L>
        <L label="Status">
          <select className={inputCls} value={f.status} onChange={(e) => set("status", e.target.value)}>
            {BOAT_TASK_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </L>
      </div>
      <L label="Description"><textarea className={cn(inputCls, "min-h-[80px]")} value={f.title} onChange={(e) => set("title", e.target.value)} /></L>
      <div className="grid grid-cols-2 gap-3">
        <L label="Date"><input type="date" className={inputCls} value={f.schedule_date} onChange={(e) => set("schedule_date", e.target.value)} /></L>
        <L label="Time"><input type="time" className={inputCls} value={f.schedule_time} onChange={(e) => set("schedule_time", e.target.value)} /></L>
        <L label="Est. time (hh:mm)"><input className={inputCls} placeholder="02:00" value={f.est} onChange={(e) => set("est", e.target.value)} /></L>
        <L label="Technician"><input className={inputCls} value={f.technician} onChange={(e) => set("technician", e.target.value)} /></L>
      </div>
      <L label="Assigned crew"><TeamChips value={f.team} onChange={(v) => set("team", v)} /></L>
      <L label="Remarks"><textarea className={cn(inputCls, "min-h-[60px]")} value={f.remarks} onChange={(e) => set("remarks", e.target.value)} /></L>
    </Sheet>
  );
}

// ── Shared bits ──────────────────────────────────────────────────────────────

/** A full-screen page that slides over the list — the phone's version of the desktop side panel. */
function Sheet({ title, subtitle, onClose, footer, children }: { title: string; subtitle?: string; onClose: () => void; footer?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border/70 bg-card/95 px-3 py-2.5 backdrop-blur">
        <button onClick={onClose} className="rounded-md p-2 hover:bg-accent" aria-label="Back"><ChevronLeft className="h-6 w-6" /></button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[20px] font-bold leading-tight">{title}</div>
          {subtitle && <div className="truncate text-[14px] text-muted-foreground">{subtitle}</div>}
        </div>
        <button onClick={onClose} className="rounded-md p-2 text-muted-foreground hover:bg-accent" aria-label="Close"><X className="h-5 w-5" /></button>
      </div>
      <div className="mx-auto w-full max-w-md flex-1 space-y-4 overflow-y-auto px-4 py-4" style={{ paddingBottom: footer ? 96 : 24 }}>{children}</div>
      {footer && (
        <div className="fixed inset-x-0 bottom-0 border-t border-border/70 bg-card/95 px-4 py-3 backdrop-blur" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
          <div className="mx-auto max-w-md">{footer}</div>
        </div>
      )}
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-[14px] font-medium text-muted-foreground">{label}</span>{children}</label>;
}

function TeamChips({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ORBIT2_TEAM.map((p) => {
        const on = value.includes(p);
        return (
          <button key={p} type="button" onClick={() => onChange(on ? value.filter((x) => x !== p) : [...value, p])}
            className={cn("rounded-full border px-3 py-1.5 text-[14px] font-medium", on ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground")}>
            {p}
          </button>
        );
      })}
    </div>
  );
}

function NoteList({ notes, empty }: { notes: Orbit2Note[]; empty: string }) {
  if (!notes.length) return <p className="text-[14px] text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-1.5">
      {notes.map((n) => (
        <li key={n.id} className="rounded-lg border border-border bg-card px-3 py-2 text-[14px] leading-relaxed">
          <span className="font-semibold">{n.author}</span> <span className="text-muted-foreground">[{stamp(n.created_at)}]</span>
          <div className="whitespace-pre-wrap">{n.body}</div>
        </li>
      ))}
    </ul>
  );
}

function Chip({ status }: { status: string }) {
  const c = statusColor(status);
  return <span className="shrink-0 rounded-full border px-2 py-0.5 text-[13px] font-semibold" style={{ borderColor: `${c}66`, background: `${c}1A`, color: c }}>{status}</span>;
}
