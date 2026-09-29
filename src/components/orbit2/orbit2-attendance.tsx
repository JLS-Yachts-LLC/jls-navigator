/**
 * Per-crew attendance on a job — who has attended, who has finished.
 *
 * A job assigned to several crew is attended and finished by each of them on
 * their own phone. The job's status moves once, on the first Attend (→ working)
 * and once more when the LAST assigned person presses Done (→ complete). In
 * between, someone who has finished sees "Waiting Companion" rather than Done.
 *
 * Shared by project jobs and Managed Boats jobs — only the parent column and
 * the status names differ, and the caller supplies those.
 */
import { useCallback, useEffect, useState } from "react";
import { Check, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { stamp } from "./orbit2-fields";

const sb = supabase as any;

export type AttendanceRow = {
  id: string;
  project_id: string | null;
  boat_task_id: string | null;
  person: string;
  attended_at: string;
  done_at: string | null;
};

export type AttendanceScope = { project_id: string } | { boat_task_id: string };

export function useAttendance(scope: AttendanceScope, team: string[], me: string) {
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [col, id] = "project_id" in scope ? ["project_id", scope.project_id] : ["boat_task_id", scope.boat_task_id];

  const load = useCallback(async () => {
    const { data } = await sb.from("orbit2_attendance").select("*").eq(col, id).order("attended_at");
    const list = (data ?? []) as AttendanceRow[];
    setRows(list);
    setLoaded(true);
    return list;
  }, [col, id]);
  useEffect(() => { void load(); }, [load]);

  const mine = rows.find((r) => r.person === me) ?? null;
  // Everyone currently assigned must have pressed Done. Someone the office has
  // since removed from the job does not hold it open; someone added later does.
  const crew = team.length ? team : [me];
  const allDone = (list: AttendanceRow[] = rows) => crew.every((p) => list.some((r) => r.person === p && r.done_at));
  const waitingOn = crew.filter((p) => !rows.some((r) => r.person === p && r.done_at));

  /** Record that I am on site. A second tap changes nothing. */
  async function markAttended(userId: string | null) {
    const current = await load();
    if (current.some((r) => r.person === me)) return current;
    const { error } = await sb.from("orbit2_attendance").insert({ [col]: id, person: me, user_id: userId });
    // 23505 = someone (another tab, a retry) already inserted my row — that is fine.
    if (error && error.code !== "23505") throw new Error(error.message);
    return load();
  }

  /** Record that I have finished. Returns the fresh list so the caller can decide whether the job is complete. */
  async function markDone(userId: string | null) {
    const now = new Date().toISOString();
    const current = await load();
    const row = current.find((r) => r.person === me);
    const { error } = row
      ? await sb.from("orbit2_attendance").update({ done_at: now }).eq("id", row.id)
      : await sb.from("orbit2_attendance").insert({ [col]: id, person: me, user_id: userId, done_at: now });
    if (error) throw new Error(error.message);
    return load();
  }

  return { rows, loaded, mine, crew, allDone, waitingOn, markAttended, markDone, reload: load };
}

/** The crew list on the job screen: each assigned person and where they are with it. */
export function CrewAttendance({ crew, rows, me }: { crew: string[]; rows: AttendanceRow[]; me: string }) {
  if (crew.length < 2) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 text-[15px] font-semibold">Crew on this job</div>
      <ul className="space-y-1.5">
        {crew.map((p) => {
          const r = rows.find((x) => x.person === p);
          const state = r?.done_at ? "done" : r ? "attended" : "pending";
          return (
            <li key={p} className="flex items-center justify-between gap-3 text-[15px]">
              <span className="flex items-center gap-2">
                <span className={cn("flex h-6 w-6 items-center justify-center rounded-full border-2",
                  state === "done" ? "border-sky-500 bg-sky-500 text-white"
                    : state === "attended" ? "border-emerald-500 bg-emerald-500 text-white" : "border-border text-transparent")}>
                  {state === "pending" ? <Clock className="h-3.5 w-3.5 text-muted-foreground" /> : <Check className="h-4 w-4" />}
                </span>
                <span className="font-medium">{p}{p === me ? " (you)" : ""}</span>
              </span>
              <span className={cn("text-[14px]", state === "done" ? "text-sky-500" : state === "attended" ? "text-emerald-600" : "text-muted-foreground")}>
                {state === "done" ? `Done · ${stamp(r!.done_at!)}` : state === "attended" ? `Attended · ${stamp(r!.attended_at)}` : "Not yet attended"}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
