/**
 * Orbit — the field app.
 *
 * The phone-side of Orbit 2, for the operations team on site at ports and marine
 * installations (Polaris Orbit specification, section 4). Five things, in order:
 *
 *   1. Only my jobs      — the signed-in person's active assignments, nothing else
 *   2. Open a job        — the detail the office configured on the web portal
 *   3. Attend            — status becomes "Working On It", and the Team Comments
 *                          log records "<name>: Attended"
 *   4. Log progress      — comments and photos, any time before completion
 *   5. Done              — status becomes "Complete - Team"; the database stamps Work
 *                          Completion with its own clock, not the phone's
 *
 * With signal, every tap is written straight to the same orbit2_projects /
 * orbit2_notes / orbit2_files rows the office is looking at. With no signal the
 * app keeps working (src/lib/orbit-offline): jobs come from what was last loaded
 * on the phone, and each tap waits in an outbox that is sent, in order and with
 * the time it was tapped, as soon as signal returns. A half-typed comment is
 * also kept locally so a suspended tab does not lose it.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/error-message";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft, Camera, CheckCircle2, ChevronRight, Loader2, LogOut, MapPin,
  RefreshCw, Send, Ship, UserRound, ClipboardCheck, LayoutGrid,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { compressImageToMaxKB } from "@/lib/image-compress";
import { guardUploadFile, uploadContentType } from "@/lib/upload-guard";
import { storageRef } from "@/lib/signed-url";
import { SignedImage } from "@/components/ui/signed-file";
import { ORBIT2_TEAM, FIELD_STATUSES, ORBIT_FIELD_PATH, statusColor, kindToBoatJobCategory } from "./orbit2-constants";
import {
  ORBIT2_BUCKET, fmtSchedule, bucketOf,
  type Orbit2Project, type Orbit2Note, type Orbit2File, type Orbit2BoatTask, type Orbit2Boat,
} from "./orbit2-data";
import { BoatJobDetail } from "./orbit2-field-boat";
import { useAttendance, CrewAttendance } from "./orbit2-attendance";
import { FieldAdmin } from "./orbit2-field-admin";
import { useOrbit2Identity } from "./orbit2-identity";
import { stamp } from "./orbit2-fields";
import { InstallBanner, InstallButton, InstallSheet } from "./orbit2-install";
import { OfflineBar, useOrbitOffline } from "./orbit2-offline-bar";
import { ORBIT_SYNCED_EVENT, installOrbitOffline, prefetchFieldJobs } from "@/lib/orbit-offline";

const sb = supabase as any;
const VIEW_AS_KEY = "orbit2.field.viewAs";
const TAB_KEY = "orbit2.field.tab";
const draftKey = (taskId: string) => `orbit2.field.draft.${taskId}`;

/** localStorage can throw (private mode, blocked storage) — never let it break the app. */
const store = {
  get(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

/** The roster name for a Polaris display name — "Alex Smith" → "Alex". */
function rosterNameFor(displayName: string): string | null {
  const first = displayName.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return ORBIT2_TEAM.find((t) => t.toLowerCase() === first) ?? null;
}

export function Orbit2FieldApp() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const identity = useOrbit2Identity();
  // Arriving here from elsewhere in Polaris (not a full page load) installs it too.
  useEffect(() => { installOrbitOffline(); }, []);
  const net = useOrbitOffline();

  // The route's beforeLoad only covers in-app navigation: on a full page load it
  // runs during SSR, where the browser-held session is invisible, so a signed-out
  // phone would otherwise sit on an empty header. Same belt-and-braces AppLayout uses.
  // With no signal the sign-in page can't load, so the screen below explains instead.
  useEffect(() => {
    if (!authLoading && !user && !net.offline) navigate({ to: "/auth", search: { next: ORBIT_FIELD_PATH } as any });
  }, [authLoading, user, navigate, net.offline]);

  // Who the job list is for. A field team member is matched to the roster by name.
  // An admin who is not on the roster (the office, or IT) can pick someone to see
  // their list — for covering a colleague or checking what the crew sees.
  const ownName = identity.name ? rosterNameFor(identity.name) : null;
  const [viewAs, setViewAs] = useState<string | null>(() => store.get(VIEW_AS_KEY));
  const teamName = ownName ?? (identity.isAdmin ? viewAs : null);

  const [tasks, setTasks] = useState<Orbit2Project[]>([]);
  /** Managed Boats jobs assigned to this person — Maintenance, Repair and Inventory. */
  const [boatJobs, setBoatJobs] = useState<BoatJob[]>([]);
  const [loading, setLoading] = useState(true);
  /** No signal, and the job list has never been loaded on this phone. */
  const [notLoaded, setNotLoaded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [howToInstall, setHowToInstall] = useState(false);
  // Admins get two tabs — My Job (the crew view, also for covering a colleague)
  // and Admin Management (the office's work, phone-shaped). Crew see only My Job.
  const [tab, setTab] = useState<"my" | "admin">(() => (store.get(TAB_KEY) === "admin" ? "admin" : "my"));
  const showTabs = identity.isAdmin;
  const pickTab = (t: "my" | "admin") => { store.set(TAB_KEY, t); setTab(t); setOpenId(null); };

  const load = useCallback(async () => {
    if (!teamName) { setTasks([]); setLoading(false); return; }
    setLoading(true);
    // Active work assigned to this person only — the spec's Task Assignment
    // Filtering. "Active" means work the crew can do (FIELD_STATUSES): a job
    // leaves the list the moment it completes or is cancelled, and does not
    // appear until the office has scheduled it.
    const [projects, boatTasks] = await Promise.all([
      sb.from("orbit2_projects")
        .select("*")
        .contains("assigned_team", [teamName])
        .in("status", FIELD_STATUSES as string[])
        .order("schedule_date", { ascending: true, nullsFirst: false })
        .order("schedule_time", { ascending: true, nullsFirst: false }),
      // Managed Boats jobs use the boat register's own statuses: Pending and
      // Ongoing are the crew's; Complete leaves the list.
      sb.from("orbit2_boat_tasks")
        .select("*")
        .contains("assigned_team", [teamName])
        .in("status", ["Pending", "Ongoing"])
        .order("schedule_date", { ascending: true, nullsFirst: false }),
    ]);
    // "OFFLINE" = no signal and nothing saved yet: the list says so, no toast.
    const gap = projects.error?.code === "OFFLINE" || boatTasks.error?.code === "OFFLINE";
    setNotLoaded(gap);
    if (projects.error && !gap) toast.error(projects.error.message);
    if (boatTasks.error && !gap) toast.error(boatTasks.error.message);
    setTasks((projects.data ?? []) as Orbit2Project[]);

    const bt = (boatTasks.data ?? []) as Orbit2BoatTask[];
    const boatIds = [...new Set(bt.map((t) => t.boat_id))];
    const boats = boatIds.length
      ? ((await sb.from("orbit2_boats").select("*").in("id", boatIds)).data ?? []) as Orbit2Boat[]
      : [];
    setBoatJobs(bt.flatMap((t) => { const b = boats.find((x) => x.id === t.boat_id); return b ? [{ task: t, boat: b }] : []; }));
    setLoading(false);
    // With signal, load every job's details now, so each one also works with none later.
    if (!projects.error && !boatTasks.error) {
      void prefetchFieldJobs({
        projectIds: ((projects.data ?? []) as Orbit2Project[]).map((t) => t.id),
        boatTaskIds: bt.map((t) => t.id),
        boatIds,
      });
    }
  }, [teamName]);

  useEffect(() => { void load(); }, [load]);

  // Signal came back and the outbox went out — show the office's latest too.
  useEffect(() => {
    const onSynced = () => { toast.success("Back online — your changes have been sent."); void load(); };
    window.addEventListener(ORBIT_SYNCED_EVENT, onSynced);
    return () => window.removeEventListener(ORBIT_SYNCED_EVENT, onSynced);
  }, [load]);

  // The crew minimise the app between jobs. Coming back to it must show what the
  // office has changed in the meantime, not what was on screen when they left.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const open = tasks.find((t) => t.id === openId) ?? null;
  const openBoat = boatJobs.find((j) => j.task.id === openId) ?? null;

  async function signOut() {
    if (net.pending > 0 && !window.confirm(
      `${net.pending} change${net.pending === 1 ? " hasn't" : "s haven't"} been sent yet. Sign out anyway? ` +
      "They stay on this phone and are sent the next time you sign in here.",
    )) return;
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { next: ORBIT_FIELD_PATH } as any });
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col">
        {/* ── Header ── */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border/70 bg-card/95 px-4 py-3 backdrop-blur">
          <div>
            <div className="text-[14px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Field</div>
            <div className="font-display text-[22px] font-bold leading-tight text-primary">Orbit</div>
          </div>
          <div className="flex items-center gap-2">
            {teamName && (
              <span className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-[14px] font-medium">
                <UserRound className="h-4 w-4 text-muted-foreground" /> {teamName}
              </span>
            )}
            <InstallButton onHowTo={() => setHowToInstall(true)} />
            <button onClick={() => void signOut()} title="Sign out" aria-label="Sign out"
              className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        <OfflineBar status={net} />

        <InstallSheet open={howToInstall} onClose={() => setHowToInstall(false)} />

        {/* ── Who am I ── */}
        {!authLoading && !user && net.offline ? (
          <Centered>
            <p className="text-[16px] font-semibold">Sign in needs signal</p>
            <p className="mt-2 max-w-xs text-[15px] text-muted-foreground">
              Open Orbit once with signal and sign in. After that it works with no signal.
            </p>
          </Centered>
        ) : !identity.name ? (
          <Centered><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></Centered>
        ) : showTabs && tab === "admin" ? (
          <div className="flex flex-1 flex-col pb-20">
            <FieldAdmin authorName={identity.name} userId={user?.id ?? null} />
          </div>
        ) : !teamName ? (
          identity.isAdmin ? (
            <ViewAsPicker onPick={(n) => { store.set(VIEW_AS_KEY, n); setViewAs(n); }} />
          ) : (
            <Centered>
              <p className="text-[16px] font-semibold">You're not on the Orbit field team</p>
              <p className="mt-2 max-w-xs text-[15px] text-muted-foreground">
                The field app shows jobs assigned to {ORBIT2_TEAM.join(", ")}. Your account
                ({identity.name}) doesn't match any of those names — ask the office to check it.
              </p>
            </Centered>
          )
        ) : openBoat ? (
          <BoatJobDetail
            key={openBoat.task.id}
            task={openBoat.task}
            boat={openBoat.boat}
            authorName={identity.name}
            person={teamName ?? identity.name}
            userId={user?.id ?? null}
            onBack={() => setOpenId(null)}
            onChanged={load}
            onClosed={() => { setOpenId(null); void load(); }}
          />
        ) : open ? (
          <TaskDetail
            key={open.id}
            task={open}
            authorName={identity.name}
            person={teamName ?? identity.name}
            userId={user?.id ?? null}
            onBack={() => setOpenId(null)}
            onChanged={load}
            onClosed={() => { setOpenId(null); void load(); }}
          />
        ) : (
          <TaskList
            tasks={tasks}
            boatJobs={boatJobs}
            loading={loading}
            teamName={teamName}
            viewingAs={!ownName}
            onOpen={setOpenId}
            onRefresh={() => void load()}
            notLoaded={notLoaded}
            onChangePerson={!ownName ? () => { store.del(VIEW_AS_KEY); setViewAs(null); } : undefined}
            banner={<InstallBanner onHowTo={() => setHowToInstall(true)} />}
          />
        )}

        {/* ── Tabs (admins only). Hidden while a job is open — its Attend / Done bar owns the bottom edge. ── */}
        {showTabs && identity.name && !openId && (
          <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border/70 bg-card/95 backdrop-blur"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
            <div className="mx-auto grid max-w-md grid-cols-2">
              {([["my", "My Job", ClipboardCheck], ["admin", "Admin Management", LayoutGrid]] as const).map(([k, label, Icon]) => (
                <button key={k} onClick={() => pickTab(k)}
                  className={cn("flex h-14 flex-col items-center justify-center gap-0.5 text-[13px] font-semibold",
                    tab === k ? "text-primary" : "text-muted-foreground")}>
                  <Icon className="h-5 w-5" /> {label}
                </button>
              ))}
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}

// ── 1. Only my jobs ─────────────────────────────────────────────────────────

/** A Managed Boats job with the boat it belongs to. */
export type BoatJob = { task: Orbit2BoatTask; boat: Orbit2Boat };

export function TaskList({
  tasks, boatJobs = [], loading, teamName, viewingAs, onOpen, onRefresh, onChangePerson, banner, notLoaded = false,
}: {
  tasks: Orbit2Project[];
  boatJobs?: BoatJob[];
  loading: boolean;
  teamName: string;
  viewingAs: boolean;
  onOpen: (id: string) => void;
  onRefresh: () => void;
  onChangePerson?: () => void;
  /** Shown above the list — the Add to Home Screen prompt. */
  banner?: React.ReactNode;
  /** No signal, and this list has never been loaded on this phone. */
  notLoaded?: boolean;
}) {
  return (
    <main className="flex-1 space-y-3 px-4 py-4 pb-24">
      {banner}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-[16px] font-semibold">
          {viewingAs ? `${teamName}'s jobs` : "My jobs"}
          {!loading && <span className="font-normal text-muted-foreground"> · {tasks.length + boatJobs.length}</span>}
        </h1>
        <div className="flex items-center gap-1">
          {onChangePerson && (
            <button onClick={onChangePerson}
              className="rounded-md px-2 py-1.5 text-[14px] font-medium text-primary hover:bg-primary/10">
              Change person
            </button>
          )}
          <button onClick={onRefresh} title="Refresh" aria-label="Refresh"
            className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground">
            <RefreshCw className={cn("h-5 w-5", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {loading && tasks.length === 0 && boatJobs.length === 0 ? (
        <Centered><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></Centered>
      ) : notLoaded && tasks.length === 0 && boatJobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <p className="text-[16px] font-semibold">Your jobs aren't on this phone yet</p>
          <p className="mt-1 text-[15px] text-muted-foreground">
            Open Orbit once with signal. Your jobs are then kept on the phone and work with no signal.
          </p>
        </div>
      ) : tasks.length === 0 && boatJobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-9 w-9 text-muted-foreground/50" />
          <p className="text-[16px] font-semibold">No active jobs</p>
          <p className="mt-1 text-[15px] text-muted-foreground">
            Jobs appear here when the office assigns them to {viewingAs ? teamName : "you"}.
          </p>
        </div>
      ) : (
        <>
        {boatJobs.map(({ task: t, boat }) => (
          <button key={t.id} onClick={() => onOpen(t.id)}
            className="block w-full rounded-xl border border-border bg-card p-4 text-left shadow-sm transition active:scale-[0.99] hover:border-primary/50">
            <div className="flex items-start justify-between gap-3 text-[14px] text-muted-foreground">
              <span>{fmtSchedule(t.schedule_date, t.schedule_time)}</span>
              <span className="flex shrink-0 items-center gap-1"><Ship className="h-3.5 w-3.5" /> Managed boat</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-[18px] font-semibold">{boat.name}</span>
              <span className="shrink-0 text-[15px] font-medium text-primary">{kindToBoatJobCategory(t.kind)}</span>
            </div>
            <div className="mt-1 truncate text-[15px] text-muted-foreground">{t.job_no ? `${t.job_no} · ` : ""}{t.title}</div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <StatusChip status={t.status} />
              <span className="flex items-center gap-0.5 text-[14px] font-semibold uppercase tracking-wide text-emerald-500">
                Tap to open <ChevronRight className="h-4 w-4" />
              </span>
            </div>
          </button>
        ))}
        {tasks.map((t) => (
          <button key={t.id} onClick={() => onOpen(t.id)}
            className="block w-full rounded-xl border border-border bg-card p-4 text-left shadow-sm transition active:scale-[0.99] hover:border-primary/50">
            <div className="flex items-start justify-between gap-3 text-[14px] text-muted-foreground">
              <span>{fmtSchedule(t.schedule_date, t.schedule_time)}</span>
              {t.location && (
                <span className="flex min-w-0 items-center gap-1 truncate">
                  <MapPin className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{t.location}</span>
                </span>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-[18px] font-semibold">{t.client_name ?? t.task_id}</span>
              <span className="shrink-0 text-[15px] font-medium text-primary">{bucketOf(t)}</span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <StatusChip status={t.status} />
              <span className="flex items-center gap-0.5 text-[14px] font-semibold uppercase tracking-wide text-emerald-500">
                Tap to open <ChevronRight className="h-4 w-4" />
              </span>
            </div>
          </button>
        ))}
        </>
      )}
    </main>
  );
}

// ── 2–5. One job ────────────────────────────────────────────────────────────

export function TaskDetail({
  task, authorName, person, userId, onBack, onChanged, onClosed,
}: {
  task: Orbit2Project;
  authorName: string;
  /** Roster name — the one in assigned_team — for per-crew attendance. */
  person: string;
  userId: string | null;
  onBack: () => void;
  onChanged: () => Promise<void> | void;
  onClosed: () => void;
}) {
  const working = task.status === "Working On It";
  const onHold = task.status === "On Hold";
  const att = useAttendance({ project_id: task.id }, task.assigned_team ?? [], person);
  // I have pressed Done but a companion has not — the job stays open for them.
  const waitingCompanion = working && !!att.mine?.done_at;
  // The job is under way (a companion attended first) but I have not yet arrived.
  const needsMyAttend = working && att.loaded && !att.mine;
  const [notes, setNotes] = useState<Orbit2Note[]>([]);
  const [images, setImages] = useState<Orbit2File[]>([]);
  const [busy, setBusy] = useState<null | "attend" | "done" | "comment" | "photo">(null);
  const [draft, setDraft] = useState(() => store.get(draftKey(task.id)) ?? "");
  const [confirmDone, setConfirmDone] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);

  const loadActivity = useCallback(async () => {
    const [n, f] = await Promise.all([
      sb.from("orbit2_notes").select("*").eq("project_id", task.id).eq("kind", "team_comment").order("created_at"),
      sb.from("orbit2_files").select("*").eq("project_id", task.id).eq("slot", "image").order("created_at"),
    ]);
    setNotes((n.data ?? []) as Orbit2Note[]);
    setImages((f.data ?? []) as Orbit2File[]);
  }, [task.id]);

  useEffect(() => { void loadActivity(); }, [loadActivity]);

  // A half-typed comment survives the tab being suspended or killed.
  useEffect(() => {
    if (draft) store.set(draftKey(task.id), draft); else store.del(draftKey(task.id));
  }, [draft, task.id]);

  /** Append to the Team Comments log — the same log the office reads on the web. */
  async function logComment(body: string) {
    const { error } = await sb.from("orbit2_notes").insert({
      project_id: task.id, kind: "team_comment", author: authorName, body, created_by: userId,
    });
    if (error) throw new Error(error.message);
  }

  // 3. Attend
  async function attend() {
    setBusy("attend");
    try {
      // Guarded on the job still being open to the crew, so a job the office
      // cancelled or put on hold while the crew were driving to it cannot be
      // re-opened by tapping Attend on a screen that was loaded before the change.
      // "Working On It" is included because a companion may have attended first.
      const { data, error } = await sb
        .from("orbit2_projects")
        .update({ status: "Working On It" })
        .eq("id", task.id)
        .in("status", ["Scheduled/Assigned", "Re-assigned", "Working On It"])
        .select("id");
      if (error) throw new Error(error.message);
      if (!data?.length) {
        toast.error("The office has changed this job — refreshed.");
        onClosed();
        return;
      }
      await att.markAttended(userId);
      await logComment("Attended").catch(() => { /* the status change is what matters */ });
      toast.success("Attended — the office can see you're on site.");
      await Promise.all([onChanged(), loadActivity()]);
    } catch (e) {
      toast.error(errorMessage(e, "Could not mark as attended"));
    } finally {
      setBusy(null);
    }
  }

  // 4. Progress — a comment
  async function addComment() {
    const body = draft.trim();
    if (!body) return;
    setBusy("comment");
    try {
      await logComment(body);
      setDraft("");
      await loadActivity();
    } catch (e) {
      toast.error(errorMessage(e, "Could not save the comment"));
    } finally {
      setBusy(null);
    }
  }

  // 4. Progress — a photo
  async function capture(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("That isn't a photo."); return; }
    setBusy("photo");
    try {
      // Phone photos are several MB each, often on mobile data at a berth —
      // re-encoded before upload so a job's photos do not take minutes to send.
      const { file: small } = await compressImageToMaxKB(file, 1500);
      if (!guardUploadFile(small)) return;
      const path = `orbit2/field/${crypto.randomUUID()}-${small.name.replace(/[^\w.-]+/g, "_")}`;
      const { error: upErr } = await supabase.storage
        .from(ORBIT2_BUCKET)
        .upload(path, small, { contentType: uploadContentType(small), upsert: false });
      if (upErr) throw new Error(upErr.message);
      const { error } = await sb.from("orbit2_files").insert({
        project_id: task.id, slot: "image", file_name: small.name,
        storage_ref: storageRef(ORBIT2_BUCKET, path), uploaded_by: userId,
      });
      if (error) {
        await supabase.storage.from(ORBIT2_BUCKET).remove([path]).catch(() => {});
        throw new Error(error.message);
      }
      toast.success("Photo added to the job");
      await loadActivity();
    } catch (e) {
      toast.error(errorMessage(e, "Could not upload the photo"));
    } finally {
      setBusy(null);
      if (cameraRef.current) cameraRef.current.value = "";
    }
  }

  // 5. Done
  async function done() {
    setConfirmDone(false);
    setBusy("done");
    try {
      // Anything still typed goes in first, so it is not lost when the job closes.
      if (draft.trim()) { await logComment(draft.trim()); setDraft(""); }
      // My part is finished, whatever the companions are doing.
      const list = await att.markDone(userId);
      await logComment("Done").catch(() => {});
      store.del(draftKey(task.id));
      if (!att.allDone(list)) {
        // Someone assigned has not pressed Done yet — the job stays Working On It
        // and this phone shows "Waiting Companion" until they do.
        const waiting = att.crew.filter((p) => !list.some((r) => r.person === p && r.done_at));
        toast.success(`Your part is done — waiting for ${waiting.join(", ")}.`);
        await Promise.all([onChanged(), loadActivity()]);
        return;
      }
      // Work Completion Date & Time is NOT sent: the orbit2_projects trigger stamps
      // it from the database clock when status becomes Complete, so a phone with
      // the wrong time cannot misreport when the job finished.
      const { data, error } = await sb
        .from("orbit2_projects")
        .update({ status: "Complete - Team" })
        .eq("id", task.id)
        .eq("status", "Working On It")
        .select("id");
      if (error) throw new Error(error.message);
      if (!data?.length) {
        toast.error("The office changed this job's status — refreshed.");
        await onChanged();
        return;
      }
      toast.success(`${task.task_id} complete`);
      onClosed();
    } catch (e) {
      toast.error(errorMessage(e, "Could not mark as done"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="flex flex-1 flex-col">
      <div className="flex-1 space-y-4 px-4 py-4 pb-28">
        <button onClick={onBack}
          className="-ml-1 flex items-center gap-1.5 rounded-md px-1 py-1 text-[15px] font-medium text-primary">
          <ArrowLeft className="h-5 w-5" /> My jobs
        </button>

        {/* The job, as the office configured it */}
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[14px] text-muted-foreground">Task ID</div>
              <div className="font-display text-[22px] font-bold leading-tight">{task.task_id}</div>
            </div>
            <StatusChip status={task.status} />
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
            <Item label="Boat / Client" value={task.client_name} />
            <Item label="Service Category" value={bucketOf(task)} />
            <Item label="Requestor" value={task.requestor_name} />
            <Item label="Location" value={task.location} />
            <Item className="col-span-2"
              label={task.record_type === "bunkering" ? "Supply date & time" : "Work schedule date & time"}
              value={fmtSchedule(task.schedule_date, task.schedule_time)} />
            {task.record_type === "bunkering" && (
              <>
                <Item label="Product grade" value={task.product_grade} />
                <Item label="Quantity"
                  value={task.quantity != null ? `${task.quantity} ${task.quantity_unit ?? ""}`.trim() : null} />
              </>
            )}
          </dl>

          {task.record_type !== "bunkering" && (
            <div className="mt-3">
              <div className="mb-1 text-[14px] text-muted-foreground">Specific task</div>
              <div className="whitespace-pre-wrap rounded-lg border border-border bg-background px-3 py-2.5 text-[16px] leading-relaxed">
                {task.specific_task || <span className="text-muted-foreground">No description given.</span>}
              </div>
            </div>
          )}
        </section>

        {/* 4. Progress — only once attended, as in the specification */}
        <CrewAttendance crew={att.crew} rows={att.rows} me={person} />

        {working && (
          <section className="space-y-4 rounded-xl border border-border bg-card p-4">
            <div>
              <label htmlFor="team-comment" className="mb-1.5 block text-[15px] font-semibold">Team comment</label>
              <textarea id="team-comment" value={draft} onChange={(e) => setDraft(e.target.value)} rows={3}
                placeholder="What you found, what you did…"
                className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-[16px] outline-none focus:border-primary" />
              <button onClick={() => void addComment()} disabled={!draft.trim() || busy !== null}
                className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-primary/50 bg-primary/10 text-[16px] font-semibold text-primary disabled:opacity-40">
                {busy === "comment" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                Add comment
              </button>
            </div>

            <div>
              <div className="mb-1.5 text-[15px] font-semibold">Images</div>
              {/* capture="environment" opens the rear camera straight away on a phone. */}
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => void capture(e.target.files?.[0])} />
              <button onClick={() => cameraRef.current?.click()} disabled={busy !== null}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-border bg-background text-[16px] font-semibold disabled:opacity-40">
                {busy === "photo" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                {busy === "photo" ? "Uploading…" : "Capture image"}
              </button>
              {images.length > 0 && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {images.map((img) => (
                    <div key={img.id} className="aspect-square overflow-hidden rounded-md border border-border bg-muted/20">
                      <SignedImage stored={img.storage_ref} alt={img.file_name} className="h-full w-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* The log so far — the crew see exactly what the office sees */}
        {notes.length > 0 && (
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 text-[15px] font-semibold">Team comments</div>
            <ul className="space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="text-[15px] leading-relaxed">
                  <span className="font-semibold">{n.author}</span>
                  <span className="text-muted-foreground"> [{stamp(n.created_at)}]: </span>
                  <span className="whitespace-pre-wrap">{n.body}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* ── The one big button, pinned where a thumb reaches it ── */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border/70 bg-card/95 px-4 py-3 backdrop-blur"
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto max-w-md">
          {confirmDone ? (
            <div className="space-y-2">
              <p className="text-center text-[15px]">
                {att.crew.length > 1 && att.waitingOn.filter((p) => p !== person).length > 0
                  ? <>Mark your part of <span className="font-semibold">{task.task_id}</span> done? The job completes once everyone assigned has pressed Done.</>
                  : <>Mark <span className="font-semibold">{task.task_id}</span> complete? The office sees it immediately.</>}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setConfirmDone(false)}
                  className="h-12 rounded-lg border border-border text-[16px] font-semibold">Not yet</button>
                <button onClick={() => void done()}
                  className="h-12 rounded-lg bg-destructive text-[16px] font-bold text-destructive-foreground">Yes, done</button>
              </div>
            </div>
          ) : waitingCompanion ? (
            <div className="space-y-1">
              <button disabled
                className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-muted text-[18px] font-bold text-muted-foreground shadow-lg">
                Waiting Companion
              </button>
              <p className="text-center text-[14px] text-muted-foreground">
                Your part is done — waiting for {att.waitingOn.join(", ")} to press Done.
              </p>
            </div>
          ) : working && !needsMyAttend ? (
            <button onClick={() => setConfirmDone(true)} disabled={busy !== null}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-destructive text-[18px] font-bold text-destructive-foreground shadow-lg disabled:opacity-50">
              {busy === "done" && <Loader2 className="h-5 w-5 animate-spin" />} Done
            </button>
          ) : onHold ? (
            <p className="py-3 text-center text-[15px] text-muted-foreground">
              This job is on hold — the office will release it when it can go ahead.
            </p>
          ) : (
            <button onClick={() => void attend()} disabled={busy !== null}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-emerald-500 text-[18px] font-bold text-white shadow-lg disabled:opacity-50">
              {busy === "attend" && <Loader2 className="h-5 w-5 animate-spin" />} Attend
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

// ── Admin: whose list to show ───────────────────────────────────────────────

function ViewAsPicker({ onPick }: { onPick: (name: string) => void }) {
  return (
    <main className="flex-1 px-4 py-6">
      <p className="text-[16px] font-semibold">Whose jobs?</p>
      <p className="mt-1 text-[15px] text-muted-foreground">
        You're not on the field roster, so pick a team member to see their list. Anything
        you log is recorded under your own name.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {ORBIT2_TEAM.map((n) => (
          <button key={n} onClick={() => onPick(n)}
            className="h-12 rounded-lg border border-border bg-card text-[16px] font-semibold hover:border-primary/60">
            {n}
          </button>
        ))}
      </div>
    </main>
  );
}

// ── Small pieces ────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: string }) {
  const c = statusColor(status);
  return (
    <span className="shrink-0 rounded-full border px-2.5 py-0.5 text-[14px] font-semibold"
      style={{ borderColor: `${c}66`, background: `${c}1A`, color: c }}>
      {status}
    </span>
  );
}

function Item({ label, value, className }: { label: string; value: string | null | undefined; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[14px] text-muted-foreground">{label}</dt>
      <dd className="truncate text-[16px] font-medium">{value || "—"}</dd>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">{children}</div>;
}
