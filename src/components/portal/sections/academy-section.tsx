/**
 * Crew Academy (Client Portal) — the vessel managers' side of crew training.
 *
 *   Crew     who's signed up, invite crew (once — their login opens only their
 *            training at /academy), groups, resend, remove / restore, share a
 *            crew member's results with JLS
 *   Groups   departments on board (Bridge, Deck, Engineering, Interior, Galley
 *            to start); a course enrolled to a group reaches everyone who joins it
 *   Courses  the vessel's own courses (written with the same creator JLS uses,
 *            optionally shared with JLS for review) and every course it can use;
 *            enrol groups or people, with a due date
 *   Reports  who has done what, what's overdue, and a CSV download
 *
 * Everything goes through /api/portal/academy; private to the vessel. Positions
 * that can't run it (canManageAcademy) and the admin preview see it read-only.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2, ChevronDown, Circle, Clock, Copy, Download, Eye, GraduationCap, Loader2, Mail, Pencil, Plus, RotateCcw,
  Share2, Trash2, UserMinus, UserPlus, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { portalFetch } from "@/lib/portal/portal-fetch";
import { CourseEditor, type CourseBackend } from "@/components/academy/course-library";
import { SectionCard, SectionEmpty, SectionHeader, SectionLoading, StatusBadge, fmtDate } from "./section-ui";

type Learner = {
  id: string; email: string; name: string | null; crewMemberId: string | null; active: boolean;
  hasSignedIn: boolean; lastSeenAt: string | null; inviteSentAt: string | null; inviteError: string | null; leftAt: string | null;
};
type Course = {
  id: string; title: string; summary: string | null; category: string | null; minutes: number | null; passMark: number;
  refreshMonths: number | null; from: string; own: boolean;
};
type OwnCourse = { id: string; title: string; summary: string | null; status: string; versions: number; published: boolean; updatedAt: string };
type Enrolment = {
  id: string; learnerId: string; courseId: string; ruleId: string | null; status: string; mandatory: boolean;
  dueDate: string | null; startedAt: string | null; completedAt: string | null; score: number | null; expiresAt: string | null;
};
type Group = { id: string; name: string; description: string | null; memberIds: string[] };
type GroupRule = { id: string; courseId: string; groupId: string; mandatory: boolean; dueDate: string | null; dueDays: number | null; createdAt: string; createdBy: string | null };
type Share = { id: string; type: "course" | "learner" | "enrolment"; resourceId: string; byKind: string; by: string | null; note: string | null; at: string };
type Crew = { id: string; name: string | null; rank: string | null; email: string | null };
type Overview = {
  canManage: boolean; vessel: string; learners: Learner[]; courses: Course[]; ownCourses: OwnCourse[]; enrolments: Enrolment[];
  groups: Group[]; groupRules: GroupRule[]; shares: Share[]; crew: Crew[];
};
type TabKey = "crew" | "groups" | "courses" | "reports";

const inputCls = "w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary/60";
const today = () => new Date().toISOString().slice(0, 10);
const isOverdue = (e: Enrolment) => !!e.dueDate && e.dueDate < today() && e.status !== "completed";
const learnerName = (l: Learner) => l.name || l.email;

async function getJson(query = ""): Promise<any> {
  const res = await portalFetch(`/api/portal/academy${query ? `?${query}` : ""}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body?.error ?? `Request failed (${res.status})`), { body });
  return body;
}
async function call(body: unknown): Promise<any> {
  const res = await portalFetch("/api/portal/academy", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error ?? `Request failed (${res.status})`), { body: data });
  return data;
}

export function AcademySection() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("crew");
  const [inviting, setInviting] = useState(false);
  const [enrolling, setEnrolling] = useState<Course | null>(null);
  const [editingCourse, setEditingCourse] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setData(await getJson()); setError(null); } catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const backend = useMemo<CourseBackend>(() => ({
    get: getJson, post: call, canOffer: false, owner: data?.vessel || "Your vessel", backLabel: "Crew Academy",
  }), [data?.vessel]);

  if (error) return <SectionEmpty icon={GraduationCap} message={error} />;
  if (!data) return <SectionLoading />;
  if (editingCourse) {
    return <CourseEditor id={editingCourse} backend={backend} onBack={() => { setEditingCourse(null); void load(); }} />;
  }

  const active = data.learners.filter((l) => l.active);
  const overdue = data.enrolments.filter((e) => isOverdue(e) && active.some((l) => l.id === e.learnerId)).length;
  const tabs: { key: TabKey; label: string }[] = [
    { key: "crew", label: `Crew (${active.length})` },
    { key: "groups", label: "Groups" },
    { key: "courses", label: `Courses (${data.courses.length})` },
    { key: "reports", label: overdue ? `Reports · ${overdue} overdue` : "Reports" },
  ];
  return (
    <div className="space-y-4">
      <SectionHeader title="Crew Academy"
        subtitle="Training for your crew. Each crew member gets their own login that opens only their training."
        action={data.canManage && tab === "crew" && (
          <button onClick={() => setInviting(true)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:brightness-110">
            <UserPlus className="h-4 w-4" /> Invite crew
          </button>
        )} />

      <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-card/60 p-1 text-sm sm:grid-cols-4">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn("rounded-lg px-3 py-1.5 font-medium transition", tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "crew" && <CrewTab data={data} onChanged={load} />}
      {tab === "groups" && <GroupsTab data={data} onChanged={load} />}
      {tab === "courses" && <CoursesTab data={data} onEnrol={setEnrolling} onEdit={setEditingCourse} onChanged={load} />}
      {tab === "reports" && <ReportsTab data={data} />}

      {inviting && <InviteModal data={data} onClose={() => setInviting(false)} onDone={() => { void load(); }} />}
      {enrolling && <EnrolModal course={enrolling} data={data} onClose={() => setEnrolling(null)} onDone={() => { setEnrolling(null); void load(); }} />}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
         onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-border bg-card p-5 sm:rounded-3xl sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function SmallButton({ onClick, disabled, children, danger, title }: {
  onClick: () => void; disabled?: boolean; children: React.ReactNode; danger?: boolean; title?: string;
}) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className={cn("inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs transition disabled:opacity-50",
        danger ? "text-muted-foreground hover:text-red-300" : "hover:bg-card")}>
      {children}
    </button>
  );
}

function GroupChips({ ids, groups, value, onChange }: { ids?: string[]; groups: Group[]; value: Set<string>; onChange: (v: Set<string>) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {groups.filter((g) => !ids || ids.includes(g.id)).map((g) => {
        const on = value.has(g.id);
        return (
          <button key={g.id} type="button" onClick={() => { const n = new Set(value); on ? n.delete(g.id) : n.add(g.id); onChange(n); }}
            className={cn("rounded-full border px-3 py-1 text-xs transition", on ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
            {g.name}
          </button>
        );
      })}
    </div>
  );
}

// ── Crew ─────────────────────────────────────────────────────────────────────
function CrewTab({ data, onChanged }: { data: Overview; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [showRemoved, setShowRemoved] = useState(false);
  const active = data.learners.filter((l) => l.active);
  const removed = data.learners.filter((l) => !l.active);
  const signedUpCrew = new Set(active.map((l) => l.crewMemberId).filter(Boolean));
  const notYet = data.crew.filter((c) => !signedUpCrew.has(c.id)).length;
  const sharedLearner = new Map(data.shares.filter((s) => s.type === "learner").map((s) => [s.resourceId, s]));

  const act = async (id: string, body: any, done: string) => {
    setBusy(id);
    try {
      const r = await call(body);
      if (r.link) {
        await navigator.clipboard?.writeText(r.link).catch(() => undefined);
        toast.success("The email wasn't sent — the invitation link is copied, send it to them another way.");
      } else toast.success(done);
      onChanged();
    } catch (e: any) { toast.error(e.message); }
    setBusy(null);
  };

  if (active.length === 0 && removed.length === 0) {
    return <SectionEmpty icon={Users} message={data.canManage
      ? "Nobody is signed up yet. Use “Invite crew” to give your crew their training logins."
      : "Nobody is signed up yet."} />;
  }

  const row = (l: Learner) => {
    const mine = data.enrolments.filter((e) => e.learnerId === l.id);
    const done = mine.filter((e) => e.status === "completed").length;
    const overdue = mine.filter(isOverdue).length;
    const groups = data.groups.filter((g) => g.memberIds.includes(l.id));
    const share = sharedLearner.get(l.id);
    const state = !l.active ? { label: "Removed", tone: "slate" as const }
      : l.hasSignedIn ? { label: "Signed up", tone: "green" as const }
      : l.inviteError ? { label: "Invite not sent", tone: "amber" as const }
      : { label: "Invited", tone: "sky" as const };
    return (
      <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium">{learnerName(l)}</span>
            <StatusBadge label={state.label} tone={state.tone} />
            {share && <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase text-sky-300"><Share2 className="h-3 w-3" /> Shared with JLS</span>}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {groups.length ? `${groups.map((g) => g.name).join(", ")} · ` : ""}
            {mine.length ? `${done} of ${mine.length} course${mine.length === 1 ? "" : "s"} done` : "No courses yet"}
            {overdue ? <span className="text-red-300"> · {overdue} overdue</span> : null}
            {l.lastSeenAt ? ` · last in ${fmtDate(l.lastSeenAt)}` : ""}
          </div>
        </div>
        {data.canManage && (
          <div className="flex flex-wrap items-center gap-1.5">
            {l.active && !l.hasSignedIn && (
              <SmallButton disabled={busy === l.id} onClick={() => act(l.id, { op: "resend", learnerId: l.id }, "Invitation sent again")}>
                <Mail className="h-3.5 w-3.5" /> Resend
              </SmallButton>
            )}
            {l.active && (share
              ? <SmallButton disabled={busy === l.id} title="Stop sharing their training results with JLS"
                  onClick={() => act(l.id, { op: "unshare", shareId: share.id }, "No longer shared with JLS")}>
                  <Share2 className="h-3.5 w-3.5" /> Stop sharing
                </SmallButton>
              : <SmallButton disabled={busy === l.id} title="Let JLS see this crew member's training results"
                  onClick={() => { if (confirm(`Share ${learnerName(l)}'s training results with JLS Yachts? You can stop sharing at any time.`)) void act(l.id, { op: "share", type: "learner", id: l.id }, "Shared with JLS"); }}>
                  <Share2 className="h-3.5 w-3.5" /> Share with JLS
                </SmallButton>)}
            {l.active ? (
              <SmallButton danger disabled={busy === l.id} onClick={() => {
                if (confirm(`Take ${learnerName(l)} off Crew Academy? Their training record stays with the vessel.`)) void act(l.id, { op: "remove", learnerId: l.id }, "Removed");
              }}>
                <UserMinus className="h-3.5 w-3.5" /> Remove
              </SmallButton>
            ) : (
              <SmallButton disabled={busy === l.id} onClick={() => act(l.id, { op: "restore", learnerId: l.id }, "Back on Crew Academy")}>
                <RotateCcw className="h-3.5 w-3.5" /> Put back
              </SmallButton>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-3">
      {data.canManage && notYet > 0 && (
        <p className="text-xs text-muted-foreground">{notYet} crew member{notYet === 1 ? "" : "s"} on your crew list {notYet === 1 ? "isn't" : "aren't"} signed up yet.</p>
      )}
      <SectionCard><ul className="divide-y divide-border/60">{active.map(row)}</ul></SectionCard>
      {removed.length > 0 && (
        <div>
          <button onClick={() => setShowRemoved((s) => !s)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ChevronDown className={cn("h-3.5 w-3.5 transition", showRemoved && "rotate-180")} /> {removed.length} no longer on Crew Academy
          </button>
          {showRemoved && <SectionCard className="mt-2"><ul className="divide-y divide-border/60">{removed.map(row)}</ul></SectionCard>}
        </div>
      )}
    </div>
  );
}

type InviteRow = { key: string; crewMemberId: string | null; name: string; email: string; on: boolean };
type InviteOutcome = { name: string; email: string; ok: boolean; link?: string; error?: string; enrolled?: number };

function InviteModal({ data, onClose, onDone }: { data: Overview; onClose: () => void; onDone: () => void }) {
  const signedUp = new Set(data.learners.filter((l) => l.active).flatMap((l) => [l.crewMemberId, l.email.toLowerCase()]).filter(Boolean));
  const [rows, setRows] = useState<InviteRow[]>(() =>
    data.crew.filter((c) => !signedUp.has(c.id) && !(c.email && signedUp.has(c.email.toLowerCase())))
      .map((c) => ({ key: c.id, crewMemberId: c.id, name: c.name ?? "", email: c.email ?? "", on: false })));
  const [extra, setExtra] = useState({ name: "", email: "" });
  const [groups, setGroups] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<InviteOutcome[] | null>(null);

  const chosen = [
    ...rows.filter((r) => r.on),
    ...(extra.email.trim() ? [{ key: "extra", crewMemberId: null, name: extra.name.trim(), email: extra.email.trim(), on: true }] : []),
  ];
  const missingEmail = chosen.some((r) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email.trim()));

  const send = async () => {
    setBusy(true);
    const out: InviteOutcome[] = [];
    for (const r of chosen) {
      try {
        const res = await call({ op: "invite", crewMemberId: r.crewMemberId, name: r.name || null, email: r.email.trim(), groupIds: [...groups] });
        out.push({ name: r.name || r.email, email: r.email, ok: true, link: res.link, enrolled: res.enrolled });
      } catch (e: any) { out.push({ name: r.name || r.email, email: r.email, ok: false, error: e.message }); }
    }
    setResults(out); setBusy(false); onDone();
  };

  if (results) {
    return (
      <Modal title="Invitations" onClose={onClose}>
        <ul className="space-y-2">
          {results.map((r, i) => (
            <li key={i} className="rounded-xl border border-border bg-background/40 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium">
                {r.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <X className="h-4 w-4 text-red-400" />} {r.name}
              </div>
              {!r.ok && <div className="mt-1 text-xs text-red-300">{r.error}</div>}
              {r.ok && !r.link && <div className="mt-1 text-xs text-muted-foreground">Invitation emailed to {r.email}.{r.enrolled ? ` Enrolled on ${r.enrolled} course${r.enrolled === 1 ? "" : "s"} from their groups.` : ""}</div>}
              {r.link && (
                <div className="mt-1.5 space-y-1.5">
                  <div className="text-xs text-amber-300">The email wasn't sent — send them this link another way (WhatsApp, text).</div>
                  <button onClick={() => { void navigator.clipboard?.writeText(r.link!); toast.success("Link copied"); }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs hover:bg-card">
                    <Copy className="h-3.5 w-3.5" /> Copy invitation link
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <button onClick={onClose} className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground">Done</button>
      </Modal>
    );
  }

  return (
    <Modal title="Invite crew" onClose={onClose}>
      <p className="text-sm text-muted-foreground">
        Each person gets an email to set their password. Their login opens only their own training — nothing else of the vessel's.
      </p>
      {rows.length > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">From your crew list</div>
          <ul className="max-h-[36vh] space-y-1.5 overflow-y-auto pr-1">
            {rows.map((r, i) => (
              <li key={r.key} className={cn("rounded-xl border px-3 py-2", r.on ? "border-primary/50 bg-primary/5" : "border-border bg-background/30")}>
                <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                  <input type="checkbox" checked={r.on} className="h-4 w-4"
                    onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, on: e.target.checked } : x))} />
                  <span className="truncate font-medium">{r.name || "Crew member"}</span>
                </label>
                {r.on && (
                  <input className={cn(inputCls, "mt-2")} type="email" placeholder="Their email address" value={r.email}
                    onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, email: e.target.value } : x))} />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4">
        <div className="mb-1.5 text-xs font-medium text-muted-foreground">{rows.length ? "Someone not on the crew list" : "Invite someone"}</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input className={inputCls} placeholder="Name" value={extra.name} onChange={(e) => setExtra({ ...extra, name: e.target.value })} />
          <input className={inputCls} type="email" placeholder="Email" value={extra.email} onChange={(e) => setExtra({ ...extra, email: e.target.value })} />
        </div>
      </div>
      {data.groups.length > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">Groups (they'll get the courses enrolled to these groups)</div>
          <GroupChips groups={data.groups} value={groups} onChange={setGroups} />
        </div>
      )}
      <button disabled={busy || chosen.length === 0 || missingEmail} onClick={() => void send()}
        className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
        {chosen.length > 1 ? `Invite ${chosen.length} people` : "Send invitation"}
      </button>
      {missingEmail && chosen.length > 0 && <p className="mt-2 text-xs text-amber-300">Everyone ticked needs an email address.</p>}
    </Modal>
  );
}

// ── Groups ───────────────────────────────────────────────────────────────────
function GroupsTab({ data, onChanged }: { data: Overview; onChanged: () => void }) {
  const [editing, setEditing] = useState<Group | "new" | null>(null);
  const learners = new Map(data.learners.map((l) => [l.id, l]));
  const courses = new Map(data.courses.map((c) => [c.id, c]));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">A course enrolled to a group reaches everyone in it — including anyone added later.</p>
        {data.canManage && (
          <button onClick={() => setEditing("new")}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground">
            <Plus className="h-4 w-4" /> New group
          </button>
        )}
      </div>
      {data.groups.map((g) => {
        const members = g.memberIds.map((id) => learners.get(id)).filter((l): l is Learner => !!l && l.active);
        const rules = data.groupRules.filter((r) => r.groupId === g.id);
        return (
          <SectionCard key={g.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold">{g.name} <span className="text-xs font-normal text-muted-foreground">· {members.length} member{members.length === 1 ? "" : "s"}</span></div>
                {g.description && <p className="text-sm text-muted-foreground">{g.description}</p>}
              </div>
              {data.canManage && (
                <SmallButton onClick={() => setEditing(g)}><Pencil className="h-3.5 w-3.5" /> Edit</SmallButton>
              )}
            </div>
            <div className="mt-2 text-sm text-muted-foreground">{members.length ? members.map(learnerName).join(", ") : "Nobody in this group yet."}</div>
            {rules.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {rules.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background/40 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate">
                      <GraduationCap className="mr-1.5 inline h-3.5 w-3.5 text-primary" />
                      {courses.get(r.courseId)?.title ?? "Course no longer available"}
                      <span className="text-xs text-muted-foreground">
                        {r.dueDate ? ` · due ${fmtDate(r.dueDate)}` : r.dueDays ? ` · within ${r.dueDays} days of joining` : ""}{r.mandatory ? "" : " · optional"}
                      </span>
                    </span>
                    {data.canManage && (
                      <button title="Stop enrolling this group" className="text-muted-foreground hover:text-red-300" onClick={async () => {
                        if (!confirm("Stop enrolling this group on this course? Anyone who hasn't started it will have it taken off; started and finished courses stay.")) return;
                        try { const r2 = await call({ op: "rule-revoke", ruleId: r.id }); toast.success(r2.dropped ? `Taken off ${r2.dropped}` : "Done"); onChanged(); }
                        catch (e: any) { toast.error(e.message); }
                      }}><X className="h-4 w-4" /></button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        );
      })}
      {editing && <GroupModal group={editing === "new" ? null : editing} data={data} onClose={() => setEditing(null)} onDone={() => { setEditing(null); onChanged(); }} />}
    </div>
  );
}

function GroupModal({ group, data, onClose, onDone }: { group: Group | null; data: Overview; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [members, setMembers] = useState<Set<string>>(new Set(group?.memberIds ?? []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = data.learners.filter((l) => l.active);

  const save = async () => {
    setBusy(true); setError(null);
    try {
      const r = await call({ op: "group-save", id: group?.id, name, description });
      const res = await call({ op: "group-members", groupId: r.id, learnerIds: [...members].filter((id) => active.some((l) => l.id === id)) });
      const bits = [res.enrolled ? `${res.enrolled} enrolment${res.enrolled === 1 ? "" : "s"} added` : "", res.dropped ? `${res.dropped} taken off` : ""].filter(Boolean);
      toast.success(bits.length ? `Saved — ${bits.join(", ")}` : "Saved");
      onDone();
    } catch (e: any) { setError(e.message); setBusy(false); }
  };

  return (
    <Modal title={group ? `Edit ${group.name}` : "New group"} onClose={onClose}>
      <div className="space-y-3">
        <input className={inputCls} placeholder="Name, e.g. Deck" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        <input className={inputCls} placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
        <div>
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">Members</div>
          {active.length === 0 ? <p className="text-sm text-muted-foreground">Invite crew first.</p> : (
            <ul className="max-h-[40vh] space-y-1.5 overflow-y-auto pr-1">
              {active.map((l) => (
                <li key={l.id}>
                  <label className={cn("flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-sm", members.has(l.id) ? "border-primary/50 bg-primary/5" : "border-border bg-background/30")}>
                    <input type="checkbox" className="h-4 w-4" checked={members.has(l.id)} onChange={(e) => {
                      const n = new Set(members); e.target.checked ? n.add(l.id) : n.delete(l.id); setMembers(n);
                    }} />
                    <span className="truncate">{learnerName(l)}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1.5 text-[11px] text-muted-foreground">People added get this group's courses; people taken out lose the ones they haven't started.</p>
        </div>
        {error && <p className="text-sm text-red-300">{error}</p>}
        <div className="flex gap-2">
          {group && (
            <button disabled={busy} onClick={async () => {
              if (!confirm(`Delete the ${group.name} group? Courses enrolled through it that people haven't started will be taken off.`)) return;
              setBusy(true);
              try { await call({ op: "group-delete", id: group.id }); toast.success("Group deleted"); onDone(); } catch (e: any) { setError(e.message); setBusy(false); }
            }} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm text-muted-foreground hover:text-red-300 disabled:opacity-50">
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          )}
          <button disabled={busy || !name.trim()} onClick={() => void save()}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Courses ──────────────────────────────────────────────────────────────────
function CoursesTab({ data, onEnrol, onEdit, onChanged }: {
  data: Overview; onEnrol: (c: Course) => void; onEdit: (id: string) => void; onChanged: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const learners = useMemo(() => new Map(data.learners.map((l) => [l.id, l])), [data.learners]);
  const groups = useMemo(() => new Map(data.groups.map((g) => [g.id, g])), [data.groups]);
  const sharedCourse = new Map(data.shares.filter((s) => s.type === "course").map((s) => [s.resourceId, s]));

  const createCourse = async () => {
    const title = prompt("Course title");
    if (!title?.trim()) return;
    try { const r = await call({ op: "create", title }); onEdit(r.id); } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-6">
      {(data.canManage || data.ownCourses.length > 0) && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{data.vessel}'s own courses</h2>
            {data.canManage && (
              <button onClick={() => void createCourse()}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground">
                <Plus className="h-4 w-4" /> New course
              </button>
            )}
          </div>
          {data.ownCourses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Write your own courses — your procedures, your boat — with video, reading, PDFs, quizzes and sign-offs.</p>
          ) : (
            <SectionCard>
              <ul className="divide-y divide-border/60">
                {data.ownCourses.map((c) => {
                  const share = sharedCourse.get(c.id);
                  return (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{c.title}</span>
                          <StatusBadge label={c.status === "published" ? `Published v${c.versions}` : c.status === "archived" ? "Archived" : "Draft"}
                            tone={c.status === "published" ? "green" : c.status === "archived" ? "slate" : "amber"} />
                          {share && <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase text-sky-300"><Share2 className="h-3 w-3" /> Shared with JLS</span>}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">Updated {fmtDate(c.updatedAt)}</div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <SmallButton onClick={() => onEdit(c.id)}>{data.canManage ? <><Pencil className="h-3.5 w-3.5" /> Edit</> : <><Eye className="h-3.5 w-3.5" /> Open</>}</SmallButton>
                        {data.canManage && (share
                          ? <SmallButton onClick={async () => { try { await call({ op: "unshare", shareId: share.id }); onChanged(); } catch (e: any) { toast.error(e.message); } }}>
                              <Share2 className="h-3.5 w-3.5" /> Stop sharing
                            </SmallButton>
                          : <SmallButton title="Ask JLS Yachts to review this course" onClick={async () => {
                              const note = prompt("Share this course with JLS Yachts for review. Add a note for them (optional):", "");
                              if (note === null) return;
                              try { await call({ op: "share", type: "course", id: c.id, note }); toast.success("Shared with JLS"); onChanged(); } catch (e: any) { toast.error(e.message); }
                            }}>
                              <Share2 className="h-3.5 w-3.5" /> Share with JLS
                            </SmallButton>)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </SectionCard>
          )}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Ready to enrol</h2>
        {data.courses.length === 0 ? (
          <SectionEmpty icon={GraduationCap} message="No published courses yet. JLS Yachts adds courses to your Crew Academy, and your own appear here once published." />
        ) : data.courses.map((c) => {
          const list = data.enrolments.filter((e) => e.courseId === c.id);
          const done = list.filter((e) => e.status === "completed").length;
          const overdue = list.filter(isOverdue).length;
          const rules = data.groupRules.filter((r) => r.courseId === c.id);
          const isOpen = open === c.id;
          return (
            <SectionCard key={c.id}>
              <button onClick={() => setOpen(isOpen ? null : c.id)} className="flex w-full items-start justify-between gap-3 p-4 text-left">
                <div className="min-w-0">
                  <div className="font-semibold">{c.title}</div>
                  {c.summary && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{c.summary}</p>}
                  <div className="mt-1.5 text-xs text-muted-foreground">
                    From {c.from}{c.minutes ? ` · ${c.minutes} min` : ""} · pass mark {c.passMark}%
                    {c.refreshMonths ? ` · refresher every ${c.refreshMonths} month${c.refreshMonths === 1 ? "" : "s"}` : ""}
                    {rules.length ? ` · groups: ${rules.map((r) => groups.get(r.groupId)?.name).filter(Boolean).join(", ")}` : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs">
                  <div className="font-semibold">{done}/{list.length} done</div>
                  {overdue > 0 && <div className="text-red-300">{overdue} overdue</div>}
                </div>
              </button>
              {isOpen && (
                <div className="border-t border-border/60 px-4 pb-4 pt-3">
                  {data.canManage && (
                    <button onClick={() => onEnrol(c)}
                      className="mb-3 inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground">
                      <UserPlus className="h-4 w-4" /> Enrol
                    </button>
                  )}
                  {list.length === 0 ? <p className="text-sm text-muted-foreground">Nobody is enrolled yet.</p> : (
                    <ul className="divide-y divide-border/60 text-sm">
                      {list.map((e) => {
                        const l = learners.get(e.learnerId);
                        const tone = e.status === "completed" ? "green" : isOverdue(e) ? "red" : e.status === "in_progress" ? "sky" : "slate";
                        const label = e.status === "completed" ? `Passed${e.score != null ? ` ${e.score}%` : ""}`
                          : isOverdue(e) ? "Overdue" : e.status === "in_progress" ? "In progress" : e.status === "expired" ? "Refresher due" : "Not started";
                        const viaGroup = e.ruleId ? rules.find((r) => r.id === e.ruleId) : undefined;
                        return (
                          <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                            <div className="min-w-0">
                              <div className="truncate">{l ? learnerName(l) : "Former crew"}{e.mandatory ? "" : <span className="text-xs text-muted-foreground"> · optional</span>}</div>
                              <div className="text-xs text-muted-foreground">
                                {e.status === "completed" ? `Completed ${fmtDate(e.completedAt)}${e.expiresAt ? ` · valid until ${fmtDate(e.expiresAt)}` : ""}`
                                  : e.dueDate ? `Due ${fmtDate(e.dueDate)}` : "No due date"}
                                {viaGroup ? ` · via ${groups.get(viaGroup.groupId)?.name ?? "a group"}` : ""}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <StatusBadge label={label} tone={tone} />
                              {data.canManage && e.status !== "completed" && (
                                <button title="Take this course off them" onClick={async () => {
                                  if (!confirm("Take this course off them?")) return;
                                  try { await call({ op: "cancel", enrolmentId: e.id }); onChanged(); } catch (err: any) { toast.error(err.message); }
                                }} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-red-300">
                                  <X className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </SectionCard>
          );
        })}
      </section>
    </div>
  );
}

function EnrolModal({ course, data, onClose, onDone }: { course: Course; data: Overview; onClose: () => void; onDone: () => void }) {
  const enrolled = new Set(data.enrolments.filter((e) => e.courseId === course.id && e.status !== "expired").map((e) => e.learnerId));
  const ruledGroups = new Set(data.groupRules.filter((r) => r.courseId === course.id).map((r) => r.groupId));
  const groupChoices = data.groups.filter((g) => !ruledGroups.has(g.id));
  const candidates = data.learners.filter((l) => l.active && !enrolled.has(l.id));
  const [groups, setGroups] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [due, setDue] = useState<"none" | "date" | "days">("none");
  const [dueDate, setDueDate] = useState("");
  const [dueDays, setDueDays] = useState("30");
  const [mandatory, setMandatory] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal title={`Enrol on ${course.title}`} onClose={onClose}>
      {groupChoices.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">Groups — everyone in them now and anyone who joins later</div>
          <GroupChips groups={groupChoices} value={groups} onChange={setGroups} />
        </div>
      )}
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
          <span>People</span>
          {candidates.length > 0 && (
            <button onClick={() => setPicked(picked.size === candidates.length ? new Set() : new Set(candidates.map((l) => l.id)))}
              className="hover:text-foreground">{picked.size === candidates.length ? "Clear" : "Everyone"}</button>
          )}
        </div>
        {candidates.length === 0 ? <p className="text-sm text-muted-foreground">Everyone signed up is already enrolled.</p> : (
          <ul className="max-h-[30vh] space-y-1.5 overflow-y-auto pr-1">
            {candidates.map((l) => (
              <li key={l.id}>
                <label className={cn("flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-sm", picked.has(l.id) ? "border-primary/50 bg-primary/5" : "border-border bg-background/30")}>
                  <input type="checkbox" className="h-4 w-4" checked={picked.has(l.id)} onChange={(e) => {
                    const next = new Set(picked); e.target.checked ? next.add(l.id) : next.delete(l.id); setPicked(next);
                  }} />
                  <span className="truncate">{learnerName(l)}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-4 space-y-2">
        <div className="text-xs font-medium text-muted-foreground">Due</div>
        <div className="flex flex-wrap gap-1.5">
          {([["none", "No due date"], ["date", "By a date"], ["days", "Within days of joining"]] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setDue(k)}
              className={cn("rounded-full border px-3 py-1 text-xs", due === k ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground")}>{label}</button>
          ))}
        </div>
        {due === "date" && <input type="date" className={inputCls} value={dueDate} min={today()} onChange={(e) => setDueDate(e.target.value)} />}
        {due === "days" && (
          <div className="flex items-center gap-2 text-sm">
            <input type="number" min={1} max={365} className={cn(inputCls, "w-24")} value={dueDays} onChange={(e) => setDueDays(e.target.value)} />
            <span className="text-muted-foreground">days after they're enrolled</span>
          </div>
        )}
        <label className="flex items-center gap-2 pt-1 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} /> Required
        </label>
      </div>
      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      <button disabled={busy || (picked.size === 0 && groups.size === 0)} onClick={async () => {
        setBusy(true); setError(null);
        try {
          const r = await call({
            op: "enrol", courseId: course.id, learnerIds: [...picked], groupIds: [...groups], mandatory,
            dueDate: due === "date" ? dueDate || null : null, dueDays: due === "days" ? Number(dueDays) || null : null,
          });
          toast.success(r.added ? `${r.added} enrolled` : "Saved — nobody new to enrol right now");
          onDone();
        } catch (e: any) { setError(e.message); setBusy(false); }
      }} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Enrol
      </button>
    </Modal>
  );
}

// ── Reports ──────────────────────────────────────────────────────────────────
function ReportsTab({ data }: { data: Overview }) {
  const active = data.learners.filter((l) => l.active);
  const courseIds = [...new Set(data.enrolments.map((e) => e.courseId))];
  const courses = data.courses.filter((c) => courseIds.includes(c.id));
  const cell = new Map(data.enrolments.map((e) => [`${e.learnerId}:${e.courseId}`, e]));
  const overdue = data.enrolments.filter((e) => isOverdue(e) && active.some((l) => l.id === e.learnerId))
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  const learnerById = new Map(data.learners.map((l) => [l.id, l]));
  const courseById = new Map(data.courses.map((c) => [c.id, c]));
  const required = data.enrolments.filter((e) => e.mandatory && active.some((l) => l.id === e.learnerId));
  const pct = required.length ? Math.round((required.filter((e) => e.status === "completed").length / required.length) * 100) : null;

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [["Crew member", "Email", "Course", "Required", "Status", "Due", "Completed", "Score", "Valid until"].map(esc).join(",")];
    for (const e of data.enrolments) {
      const l = learnerById.get(e.learnerId);
      lines.push([l ? learnerName(l) : "", l?.email, courseById.get(e.courseId)?.title ?? "", e.mandatory ? "Yes" : "No",
        isOverdue(e) ? "Overdue" : e.status.replace("_", " "), e.dueDate, e.completedAt?.slice(0, 10), e.score, e.expiresAt?.slice(0, 10)].map(esc).join(","));
    }
    const blob = new Blob([lines.join("\r\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${data.vessel || "vessel"} crew training ${today()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!data.enrolments.length) return <SectionEmpty icon={GraduationCap} message="Nothing to report yet — enrol crew on a course first." />;

  const mark = (e: Enrolment | undefined) => {
    if (!e) return <span className="text-muted-foreground/30">—</span>;
    if (e.status === "completed") return <span className="inline-flex items-center gap-1 text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />{e.score != null ? `${e.score}%` : ""}</span>;
    if (isOverdue(e)) return <span className="font-semibold text-red-300">Overdue</span>;
    if (e.status === "in_progress") return <span className="inline-flex items-center gap-1 text-sky-300"><Clock className="h-3.5 w-3.5" /> Started</span>;
    if (e.status === "expired") return <span className="text-amber-300">Refresher</span>;
    return <span className="inline-flex items-center gap-1 text-muted-foreground"><Circle className="h-3.5 w-3.5" /></span>;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          {pct != null && <><span className="text-2xl font-bold">{pct}%</span> <span className="text-muted-foreground">of required training complete</span></>}
          {overdue.length > 0 && <span className="ml-3 font-semibold text-red-300">{overdue.length} overdue</span>}
        </div>
        <button onClick={exportCsv} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs hover:bg-card">
          <Download className="h-4 w-4" /> Download CSV
        </button>
      </div>

      {overdue.length > 0 && (
        <SectionCard className="p-4">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-red-300">Overdue</h3>
          <ul className="space-y-1 text-sm">
            {overdue.map((e) => (
              <li key={e.id} className="flex flex-wrap justify-between gap-2">
                <span>{learnerById.get(e.learnerId) ? learnerName(learnerById.get(e.learnerId)!) : ""} — {courseById.get(e.courseId)?.title ?? "Course"}</span>
                <span className="text-xs text-muted-foreground">due {fmtDate(e.dueDate)}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <SectionCard className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
              <th className="sticky left-0 bg-card px-4 py-2 font-medium">Crew member</th>
              {courses.map((c) => <th key={c.id} className="px-3 py-2 font-medium">{c.title}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {active.map((l) => (
              <tr key={l.id}>
                <td className="sticky left-0 bg-card px-4 py-2 font-medium">{learnerName(l)}</td>
                {courses.map((c) => <td key={c.id} className="px-3 py-2 text-xs">{mark(cell.get(`${l.id}:${c.id}`))}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </div>
  );
}
