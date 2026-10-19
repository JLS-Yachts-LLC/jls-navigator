/**
 * Crew Academy (Client Portal) — the vessel managers' side of crew training.
 *
 *   Crew     who's signed up, invite crew (once — they get their own login that
 *            opens only their training at /academy), resend, remove / restore
 *   Courses  the courses the vessel can use (JLS courses offered to it), enrol
 *            crew with an optional due date, and follow who has done what
 *
 * Everything goes through /api/portal/academy; private to the vessel. Positions
 * that can't run it (canManageAcademy) and the admin preview see it read-only.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2, ChevronDown, Copy, GraduationCap, Loader2, Mail, RotateCcw, UserMinus, UserPlus, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { portalFetch } from "@/lib/portal/portal-fetch";
import { SectionCard, SectionEmpty, SectionHeader, SectionLoading, StatusBadge, fmtDate } from "./section-ui";

type Learner = {
  id: string; email: string; name: string | null; crewMemberId: string | null; active: boolean;
  hasSignedIn: boolean; lastSeenAt: string | null; inviteSentAt: string | null; inviteError: string | null; leftAt: string | null;
};
type Course = { id: string; title: string; summary: string | null; category: string | null; minutes: number | null; passMark: number; refreshMonths: number | null; from: string };
type Enrolment = {
  id: string; learnerId: string; courseId: string; status: string; mandatory: boolean;
  dueDate: string | null; startedAt: string | null; completedAt: string | null; score: number | null; expiresAt: string | null;
};
type Crew = { id: string; name: string | null; rank: string | null; email: string | null };
type Overview = { canManage: boolean; vessel: string; learners: Learner[]; courses: Course[]; enrolments: Enrolment[]; crew: Crew[] };

const inputCls = "w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary/60";
const today = () => new Date().toISOString().slice(0, 10);
const isOverdue = (e: Enrolment) => !!e.dueDate && e.dueDate < today() && e.status !== "completed";
const learnerName = (l: Learner) => l.name || l.email;

async function call(body: unknown): Promise<any> {
  const res = await portalFetch("/api/portal/academy", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data;
}

export function AcademySection() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"crew" | "courses">("crew");
  const [inviting, setInviting] = useState(false);
  const [enrolling, setEnrolling] = useState<Course | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await portalFetch("/api/portal/academy");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Could not load Crew Academy");
      setData(body); setError(null);
    } catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (error) return <SectionEmpty icon={GraduationCap} message={error} />;
  if (!data) return <SectionLoading />;

  const active = data.learners.filter((l) => l.active);
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

      <div className="flex gap-1 rounded-xl border border-border bg-card/60 p-1 text-sm">
        {(["crew", "courses"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("flex-1 rounded-lg px-3 py-1.5 font-medium transition", tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
            {t === "crew" ? `Crew (${active.length})` : `Courses (${data.courses.length})`}
          </button>
        ))}
      </div>

      {tab === "crew"
        ? <CrewTab data={data} onChanged={load} />
        : <CoursesTab data={data} onEnrol={setEnrolling} onChanged={load} />}

      {inviting && <InviteModal data={data} onClose={() => setInviting(false)} onDone={() => { void load(); }} />}
      {enrolling && <EnrolModal course={enrolling} data={data} onClose={() => setEnrolling(null)} onDone={() => { setEnrolling(null); void load(); }} />}
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
    const state = !l.active ? { label: "Removed", tone: "slate" as const }
      : l.hasSignedIn ? { label: "Signed up", tone: "green" as const }
      : l.inviteError ? { label: "Invite not sent", tone: "amber" as const }
      : { label: "Invited", tone: "sky" as const };
    return (
      <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{learnerName(l)}</span>
            <StatusBadge label={state.label} tone={state.tone} />
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {l.name ? `${l.email} · ` : ""}
            {mine.length ? `${done} of ${mine.length} course${mine.length === 1 ? "" : "s"} done` : "No courses yet"}
            {overdue ? <span className="text-red-300"> · {overdue} overdue</span> : null}
            {l.lastSeenAt ? ` · last in ${fmtDate(l.lastSeenAt)}` : ""}
          </div>
        </div>
        {data.canManage && (
          <div className="flex items-center gap-1.5">
            {l.active && !l.hasSignedIn && (
              <button disabled={busy === l.id} onClick={() => act(l.id, { op: "resend", learnerId: l.id }, "Invitation sent again")}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs hover:bg-card disabled:opacity-50">
                <Mail className="h-3.5 w-3.5" /> Resend
              </button>
            )}
            {l.active ? (
              <button disabled={busy === l.id} onClick={() => {
                if (confirm(`Take ${learnerName(l)} off Crew Academy? Their training record stays with the vessel.`)) {
                  void act(l.id, { op: "remove", learnerId: l.id }, "Removed");
                }
              }} className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs text-muted-foreground hover:text-red-300 disabled:opacity-50">
                <UserMinus className="h-3.5 w-3.5" /> Remove
              </button>
            ) : (
              <button disabled={busy === l.id} onClick={() => act(l.id, { op: "restore", learnerId: l.id }, "Back on Crew Academy")}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs hover:bg-card disabled:opacity-50">
                <RotateCcw className="h-3.5 w-3.5" /> Put back
              </button>
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

type InviteRow = { key: string; crewMemberId: string | null; name: string; email: string; on: boolean };
type InviteOutcome = { name: string; email: string; ok: boolean; link?: string; error?: string };

function InviteModal({ data, onClose, onDone }: { data: Overview; onClose: () => void; onDone: () => void }) {
  const signedUp = new Set(data.learners.filter((l) => l.active).flatMap((l) => [l.crewMemberId, l.email.toLowerCase()]).filter(Boolean));
  const [rows, setRows] = useState<InviteRow[]>(() =>
    data.crew.filter((c) => !signedUp.has(c.id) && !(c.email && signedUp.has(c.email.toLowerCase())))
      .map((c) => ({ key: c.id, crewMemberId: c.id, name: c.name ?? "", email: c.email ?? "", on: false })));
  const [extra, setExtra] = useState({ name: "", email: "" });
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
        const res = await call({ op: "invite", crewMemberId: r.crewMemberId, name: r.name || null, email: r.email.trim() });
        out.push({ name: r.name || r.email, email: r.email, ok: true, link: res.link });
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
              {r.ok && !r.link && <div className="mt-1 text-xs text-muted-foreground">Invitation emailed to {r.email}.</div>}
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
          <ul className="max-h-[40vh] space-y-1.5 overflow-y-auto pr-1">
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
      <button disabled={busy || chosen.length === 0 || missingEmail} onClick={() => void send()}
        className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
        {chosen.length > 1 ? `Invite ${chosen.length} people` : "Send invitation"}
      </button>
      {missingEmail && chosen.length > 0 && <p className="mt-2 text-xs text-amber-300">Everyone ticked needs an email address.</p>}
    </Modal>
  );
}

// ── Courses ──────────────────────────────────────────────────────────────────
function CoursesTab({ data, onEnrol, onChanged }: { data: Overview; onEnrol: (c: Course) => void; onChanged: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const learners = useMemo(() => new Map(data.learners.map((l) => [l.id, l])), [data.learners]);

  if (data.courses.length === 0) {
    return <SectionEmpty icon={GraduationCap} message="No courses yet. JLS Yachts adds courses to your Crew Academy — ask your JLS contact which are available." />;
  }

  return (
    <div className="space-y-3">
      {data.courses.map((c) => {
        const list = data.enrolments.filter((e) => e.courseId === c.id);
        const done = list.filter((e) => e.status === "completed").length;
        const overdue = list.filter(isOverdue).length;
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
                    <UserPlus className="h-4 w-4" /> Enrol crew
                  </button>
                )}
                {list.length === 0 ? <p className="text-sm text-muted-foreground">Nobody is enrolled yet.</p> : (
                  <ul className="divide-y divide-border/60 text-sm">
                    {list.map((e) => {
                      const l = learners.get(e.learnerId);
                      const tone = e.status === "completed" ? "green" : isOverdue(e) ? "red" : e.status === "in_progress" ? "sky" : "slate";
                      const label = e.status === "completed" ? `Passed${e.score != null ? ` ${e.score}%` : ""}`
                        : isOverdue(e) ? "Overdue" : e.status === "in_progress" ? "In progress" : e.status === "expired" ? "Refresher due" : "Not started";
                      return (
                        <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                          <div className="min-w-0">
                            <div className="truncate">{l ? learnerName(l) : "Former crew"}{e.mandatory ? "" : <span className="text-xs text-muted-foreground"> · optional</span>}</div>
                            <div className="text-xs text-muted-foreground">
                              {e.status === "completed" ? `Completed ${fmtDate(e.completedAt)}${e.expiresAt ? ` · valid until ${fmtDate(e.expiresAt)}` : ""}`
                                : e.dueDate ? `Due ${fmtDate(e.dueDate)}` : "No due date"}
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
    </div>
  );
}

function EnrolModal({ course, data, onClose, onDone }: { course: Course; data: Overview; onClose: () => void; onDone: () => void }) {
  const enrolled = new Set(data.enrolments.filter((e) => e.courseId === course.id && e.status !== "expired").map((e) => e.learnerId));
  const candidates = data.learners.filter((l) => l.active && !enrolled.has(l.id));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [dueDate, setDueDate] = useState("");
  const [mandatory, setMandatory] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal title={`Enrol on ${course.title}`} onClose={onClose}>
      {candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">Everyone signed up is already enrolled. Invite more crew on the Crew tab first.</p>
      ) : (
        <>
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
            <span>Who</span>
            <button onClick={() => setPicked(picked.size === candidates.length ? new Set() : new Set(candidates.map((l) => l.id)))}
              className="hover:text-foreground">{picked.size === candidates.length ? "Clear" : "Everyone"}</button>
          </div>
          <ul className="max-h-[40vh] space-y-1.5 overflow-y-auto pr-1">
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
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Due by (optional)</label>
              <input type="date" className={inputCls} value={dueDate} min={today()} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} /> Required
            </label>
          </div>
          {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
          <button disabled={busy || picked.size === 0} onClick={async () => {
            setBusy(true); setError(null);
            try {
              const r = await call({ op: "enrol", courseId: course.id, learnerIds: [...picked], dueDate: dueDate || null, mandatory });
              toast.success(`${r.added} enrolled`);
              onDone();
            } catch (e: any) { setError(e.message); setBusy(false); }
          }} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Enrol {picked.size || ""}
          </button>
        </>
      )}
    </Modal>
  );
}
