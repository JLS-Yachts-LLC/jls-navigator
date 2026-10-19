import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Download, Loader2, Plus, RotateCcw, Tablet, UserCheck, XCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { loadCalendarEvents, loadCourses, loadStudents, type TrainingCalendarEvent, type TrainingStudent } from "@/lib/training/data";
import { addDays, courseKeys, dubaiToday, isSessionEvent, type AttendanceRow } from "@/lib/training-kiosk";

// Training Institute → Attendance: who signed in to which session, from the
// training room tablet (or added here by staff). Each sign-in is linked to the
// student's record when the tablet's mobile / full name matched one; anything
// unmatched can be linked by hand. Cancel a mistaken sign-in rather than delete it.

const NO_STUDENT = "__none__";
const fmtDay = (ymd: string) =>
  new Date(`${ymd}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit" });

function csv(rows: AttendanceRow[]) {
  const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ["Date", "Session", "Category", "Time", "Name typed", "Mobile", "Student record", "Matched by", "Signed in", "Source", "Cancelled"];
  const body = rows.map((r) => [
    r.session_date, r.session_title, r.session_category, r.session_time, r.full_name, r.mobile, r.student_name, r.match_method,
    fmtTime(r.signed_in_at), r.source === "kiosk" ? r.display_name ?? "Tablet" : "Staff", r.voided_at ? `Yes${r.void_reason ? ` — ${r.void_reason}` : ""}` : "",
  ].map(esc).join(","));
  return [head.join(","), ...body].join("\n");
}

export function AttendanceTab() {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const today = dubaiToday();
  const [from, setFrom] = useState(addDays(today, -13));
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<AttendanceRow[] | null>(null);
  const [students, setStudents] = useState<TrainingStudent[]>([]);
  const [events, setEvents] = useState<TrainingCalendarEvent[]>([]);
  const [courseNames, setCourseNames] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);

  const api = async (method: string, body?: unknown, query = "") => {
    const res = await fetch(`/api/training-kiosk/attendance${query}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
    return data;
  };

  const reload = async () => {
    try { setRows((await api("GET", undefined, `?from=${from}&to=${to}`)).rows); }
    catch (e) { toast.error((e as Error).message); setRows([]); }
  };
  useEffect(() => { if (token) void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token, from, to]);
  useEffect(() => {
    void loadStudents().then(setStudents).catch(() => {});
    void loadCalendarEvents().then(setEvents).catch(() => {});
    void loadCourses().then((c) => setCourseNames(c.map((x) => x.name))).catch(() => {});
  }, []);

  const liveStudents = useMemo(
    () => students.filter((s) => (s.enrollment_status ?? "").toLowerCase() !== "cancelled").sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [students],
  );
  const sessions = useMemo(() => {
    const keys = courseKeys(courseNames);
    return events.filter((e) => e.event_date >= addDays(today, -30) && e.event_date <= addDays(today, 7) && isSessionEvent(e, keys))
      .sort((a, b) => b.event_date.localeCompare(a.event_date));
  }, [events, courseNames, today]);

  // Grouped: day → session → sign-ins.
  const groups = useMemo(() => {
    const out = new Map<string, Map<string, AttendanceRow[]>>();
    for (const r of rows ?? []) {
      const day = out.get(r.session_date) ?? new Map<string, AttendanceRow[]>();
      const key = `${r.calendar_event_id ?? r.session_title}|${r.session_title}`;
      day.set(key, [...(day.get(key) ?? []), r]);
      out.set(r.session_date, day);
    }
    return [...out.entries()];
  }, [rows]);

  const patch = async (id: string, body: Record<string, unknown>, ok: string) => {
    try { await api("PATCH", { id, ...body }); toast.success(ok); await reload(); }
    catch (e) { toast.error((e as Error).message); }
  };

  const download = () => {
    if (!rows?.length) return;
    const blob = new Blob([csv(rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `training-attendance-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const live = (rows ?? []).filter((r) => !r.voided_at);
  const unmatched = live.filter((r) => !r.student_id).length;

  return (
    <div className="h-full overflow-auto px-6 py-5">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1"><Label className="text-[12px]">From</Label><Input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className="h-9 w-[160px]" /></div>
          <div className="space-y-1"><Label className="text-[12px]">To</Label><Input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className="h-9 w-[160px]" /></div>
          <div className="flex-1 text-[13px] text-muted-foreground">
            {rows && <>{live.length} sign-in{live.length === 1 ? "" : "s"}{unmatched ? <> · <span className="text-amber-500">{unmatched} not linked to a student</span></> : null}</>}
          </div>
          <Button variant="outline" size="sm" onClick={download} disabled={!rows?.length}><Download className="mr-1.5 h-3.5 w-3.5" /> CSV</Button>
          <Button size="sm" onClick={() => setAdding(true)}><Plus className="mr-1.5 h-3.5 w-3.5" /> Add sign-in</Button>
        </div>

        {!rows && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        {rows?.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-[13px] text-muted-foreground">
            No sign-ins in these dates. Students sign in on the training room tablet (pair it under the Tablet tab) to the Class and Exam entries on the Calendar.
          </div>
        )}

        {groups.map(([day, bySession]) => (
          <div key={day} className="space-y-2">
            <div className="text-[13px] font-semibold text-muted-foreground">{fmtDay(day)}</div>
            {[...bySession.entries()].map(([key, list]) => (
              <div key={key} className="rounded-xl border border-border bg-card">
                <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
                  <span className="font-medium">{list[0].session_title}</span>
                  {list[0].session_category && <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">{list[0].session_category}</span>}
                  {list[0].session_time && <span className="text-[12px] text-muted-foreground">{list[0].session_time}</span>}
                  <span className="ml-auto text-[12px] text-muted-foreground">{list.filter((r) => !r.voided_at).length} signed in</span>
                </div>
                <div className="divide-y divide-border/50">
                  {list.map((r) => (
                    <div key={r.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-2 text-[13px]", r.voided_at && "opacity-50")}>
                      <div className="min-w-[180px] flex-1">
                        <div className={cn("font-medium", r.voided_at && "line-through")}>{r.full_name}</div>
                        <div className="text-[12px] text-muted-foreground">
                          {r.mobile || "no mobile"} · {fmtTime(r.signed_in_at)} · {r.source === "kiosk" ? <><Tablet className="inline h-3 w-3" /> {r.display_name ?? "Tablet"}</> : "added by staff"}
                          {r.voided_at && <> · cancelled{r.void_reason ? ` (${r.void_reason})` : ""}</>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {r.student_id
                          ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          : <XCircle className="h-3.5 w-3.5 text-amber-500" />}
                        <Select
                          value={r.student_id ?? NO_STUDENT}
                          onValueChange={(v) => patch(r.id, { studentId: v === NO_STUDENT ? null : v }, v === NO_STUDENT ? "Unlinked" : "Linked to the student")}
                        >
                          <SelectTrigger className="h-8 w-[230px] text-[12.5px]">
                            <SelectValue placeholder="Not linked" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_STUDENT}>Not linked to a student</SelectItem>
                            {r.student_id && !liveStudents.some((s) => s.id === r.student_id) && (
                              <SelectItem value={r.student_id}>{r.student_name ?? "Student record"}</SelectItem>
                            )}
                            {liveStudents.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {r.match_method && r.match_method !== "staff" && (
                          <span className="text-[11px] text-muted-foreground" title="How the tablet sign-in was matched to the student">by {r.match_method}</span>
                        )}
                      </div>
                      {r.voided_at
                        ? <Button variant="ghost" size="sm" onClick={() => patch(r.id, { voided: false }, "Restored")}><RotateCcw className="mr-1 h-3.5 w-3.5" /> Restore</Button>
                        : <Button variant="ghost" size="sm" onClick={() => {
                            const reason = window.prompt(`Cancel ${r.full_name}'s sign-in? Optional reason:`, "");
                            if (reason !== null) void patch(r.id, { voided: true, reason }, "Sign-in cancelled");
                          }}>Cancel</Button>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {adding && <AddDialog sessions={sessions} students={liveStudents} onClose={() => setAdding(false)}
        onAdd={async (body) => { await api("POST", body); toast.success("Sign-in added"); setAdding(false); await reload(); }} />}
    </div>
  );
}

function AddDialog({ sessions, students, onClose, onAdd }: {
  sessions: TrainingCalendarEvent[]; students: TrainingStudent[]; onClose: () => void;
  onAdd: (body: { eventId: string; name: string; mobile: string; studentId: string | null }) => Promise<void>;
}) {
  const [eventId, setEventId] = useState(sessions[0]?.id ?? "");
  const [studentId, setStudentId] = useState(NO_STUDENT);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [busy, setBusy] = useState(false);

  const pickStudent = (id: string) => {
    setStudentId(id);
    const s = students.find((x) => x.id === id);
    if (s) { setName(s.full_name); setMobile(s.mobile ?? ""); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><UserCheck className="h-4 w-4" /> Add a sign-in</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Session</Label>
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger><SelectValue placeholder="Choose a session" /></SelectTrigger>
              <SelectContent>
                {sessions.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{fmtDay(e.event_date)} — {e.title}{e.category ? ` (${e.category})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!sessions.length && <p className="text-[12px] text-muted-foreground">No Class or Exam entries on the Calendar in the last 30 days.</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Student record (optional)</Label>
            <Select value={studentId} onValueChange={pickStudent}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_STUDENT}>Not on the Students list</SelectItem>
                {students.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></div>
          <div className="space-y-1.5"><Label>Mobile</Label><Input value={mobile} onChange={(e) => setMobile(e.target.value)} maxLength={30} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !eventId || name.trim().length < 2} onClick={async () => {
            setBusy(true);
            try { await onAdd({ eventId, name, mobile, studentId: studentId === NO_STUDENT ? null : studentId }); }
            catch (e) { toast.error((e as Error).message); }
            finally { setBusy(false); }
          }}>{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
