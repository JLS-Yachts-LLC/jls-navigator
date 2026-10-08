/**
 * Hours of rest (On board) — a week at a time, one row per crew member, the
 * hours of rest each had per day. Anything under the MLC minimums (10 h in a
 * day, 77 h over 7 days) is flagged. Reads go through RLS; each cell saves
 * through /api/portal/onboard (kind=rest_hours, action=set) when it's left.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { AlertTriangle, ChevronLeft, ChevronRight, Clock, Loader2 } from "lucide-react";
import { REST_MIN_24H, REST_MIN_7D, parseRest, restOver7Days, restSplitIssue } from "@/lib/portal/onboard";
import { SectionCard, SectionEmpty, SectionHeader, SectionLoading, onboardRequest } from "./section-ui";
import { awayLabel, awayOn } from "@/lib/portal/crew-rota";

const db = supabase as any;

type Crew = { id: string; full_name: string | null; first_name: string | null; last_name: string | null; rank: string | null };
type RestRow = { crew_member_id: string; day: string; rest_hours: number; rest_split: string | null };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
/** The Monday (UTC) of the week holding `d`. */
function mondayOf(d: Date) {
  const u = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  return addDays(u, -((u.getUTCDay() + 6) % 7));
}
const nameOf = (c: Crew) => c.full_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "Crew";
const fmtHours = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));

export function HoursSection({ yachtId, canEdit }: { yachtId: string; canEdit: boolean }) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [crew, setCrew] = useState<Crew[]>([]);
  const [rows, setRows] = useState<RestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [away, setAway] = useState<Array<{ crew_member_id: string; kind: string; start_date: string; end_date: string }>>([]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const today = iso(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    // Six days before the week too, so each day's 7-day total can be worked out.
    const from = iso(addDays(weekStart, -6));
    const to = iso(addDays(weekStart, 6));
    const [c, r, a]: any[] = await Promise.all([
      db.from("crew_members").select("id, full_name, first_name, last_name, rank, status").eq("yacht_id", yachtId).order("last_name"),
      db.from("onboard_rest_hours").select("crew_member_id, day, rest_hours, rest_split").eq("yacht_id", yachtId).gte("day", from).lte("day", to),
      // Time away from the crew rota, so a day off the vessel reads "Leave", not a gap.
      db.from("onboard_crew_rotation").select("crew_member_id, kind, start_date, end_date").eq("yacht_id", yachtId).lte("start_date", to).gte("end_date", from),
    ]);
    setAway(a?.data ?? []);
    setCrew((c.data ?? []).filter((x: any) => !x.status || ["active", "on_leave"].includes(x.status)));
    setRows((r.data ?? []).map((x: any) => ({ ...x, rest_hours: Number(x.rest_hours) })));
    setLoading(false);
  }, [yachtId, weekStart]);
  useEffect(() => { void load(); }, [load]);

  const byCrew = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const r of rows) {
      if (!m.has(r.crew_member_id)) m.set(r.crew_member_id, new Map());
      m.get(r.crew_member_id)!.set(r.day, r.rest_hours);
    }
    return m;
  }, [rows]);
  const splitOf = (crewId: string, day: string) => rows.find((r) => r.crew_member_id === crewId && r.day === day)?.rest_split ?? null;

  const save = async (crewId: string, day: string, value: string) => {
    const current = byCrew.get(crewId)?.get(day);
    const shown = splitOf(crewId, day) ?? (current != null ? String(current) : "");
    if (value.replace(/\s+/g, "") === shown) return;
    let next: string | null = null;
    if (value.trim() !== "") {
      const parsed = parseRest(value);
      if ("error" in parsed) { setError(parsed.error); return; }
      next = value.trim();
    }
    const key = `${crewId}:${day}`;
    setSaving(key); setError(null);
    try {
      const res = await onboardRequest("rest_hours", {
        method: "POST", action: "set", body: JSON.stringify({ crew_member_id: crewId, day, rest_hours: next }),
      });
      setRows((prev) => {
        const rest = prev.filter((r) => !(r.crew_member_id === crewId && r.day === day));
        return res.rest_hours == null ? rest : [...rest, { crew_member_id: crewId, day, rest_hours: Number(res.rest_hours), rest_split: res.rest_split ?? null }];
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(null);
    }
  };

  if (loading && !crew.length) return <SectionLoading />;

  const weekDays = days.map(iso);
  let shortDays = 0;
  let shortWeeks = 0;
  let badSplits = 0;
  for (const c of crew) {
    const m = byCrew.get(c.id) ?? new Map();
    for (const d of weekDays) {
      if (m.has(d) && m.get(d)! < REST_MIN_24H) shortDays++;
      if (restSplitIssue(splitOf(c.id, d))) badSplits++;
    }
    const wk = restOver7Days(m, weekDays[6]);
    if (wk != null && wk < REST_MIN_7D) shortWeeks++;
  }
  const isThisWeek = iso(weekStart) === iso(mondayOf(new Date()));

  return (
    <div className="space-y-4">
      <SectionHeader title="Hours of rest"
                     subtitle={`Each crew member's hours of rest per day. Flagged under ${REST_MIN_24H} h in a day or ${REST_MIN_7D} h over 7 days (MLC 2006).`} />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setWeekStart((w) => addDays(w, -7))} aria-label="Previous week"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="min-w-[200px] text-center text-sm font-semibold">
          {days[0].toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })} – {days[6].toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
        </div>
        <button type="button" onClick={() => setWeekStart((w) => addDays(w, 7))} aria-label="Next week" disabled={isThisWeek}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-30">
          <ChevronRight className="h-4 w-4" />
        </button>
        {!isThisWeek && (
          <button type="button" onClick={() => setWeekStart(mondayOf(new Date()))} className="text-xs font-medium text-primary hover:underline">This week</button>
        )}
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {(shortDays > 0 || shortWeeks > 0 || badSplits > 0) && (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            {shortDays > 0 && `${shortDays} day${shortDays === 1 ? "" : "s"} under ${REST_MIN_24H} h`}
            {shortDays > 0 && shortWeeks > 0 && " · "}
            {shortWeeks > 0 && `${shortWeeks} under ${REST_MIN_7D} h for the week`}
            {(shortDays > 0 || shortWeeks > 0) && badSplits > 0 && " · "}
            {badSplits > 0 && `${badSplits} split${badSplits === 1 ? "" : "s"} outside the MLC rule`}
          </span>
        )}
      </div>

      {crew.length === 0 ? (
        <SectionEmpty icon={Clock} message="No crew on the vessel yet — add your crew under Crew & immigration first." />
      ) : (
        <SectionCard className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="sticky left-0 z-10 bg-card px-4 py-2.5 text-left font-medium">Crew</th>
                {days.map((d) => (
                  <th key={iso(d)} className={cn("px-1 py-2.5 text-center font-medium", iso(d) === today && "text-primary")}>
                    {d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}
                    <div className="text-[10px] font-normal normal-case tracking-normal">{d.getUTCDate()}</div>
                  </th>
                ))}
                <th className="px-3 py-2.5 text-right font-medium">7 days</th>
              </tr>
            </thead>
            <tbody>
              {crew.map((c) => {
                const m = byCrew.get(c.id) ?? new Map<string, number>();
                const wk = restOver7Days(m, weekDays[6]);
                const weekSum = weekDays.reduce((s, d) => s + (m.get(d) ?? 0), 0);
                return (
                  <tr key={c.id} className="border-b border-border/40 last:border-0">
                    <td className="sticky left-0 z-10 bg-card px-4 py-2">
                      <div className="font-medium">{nameOf(c)}</div>
                      {c.rank && <div className="text-[11px] text-muted-foreground">{c.rank}</div>}
                    </td>
                    {weekDays.map((d) => {
                      const v = m.get(d);
                      const split = splitOf(c.id, d);
                      const splitIssue = restSplitIssue(split);
                      const short = (v != null && v < REST_MIN_24H) || !!splitIssue;
                      const future = d > today;
                      const key = `${c.id}:${d}`;
                      const off = v == null ? awayOn(away, c.id, d) : null;
                      return (
                        <td key={d} className="px-1 py-1.5 text-center">
                          {off ? (
                            <span title="Away from the vessel (Crew rota)"
                                  className="inline-flex h-10 w-16 items-center justify-center rounded-lg border border-dashed border-border text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              {awayLabel(off.kind)}
                            </span>
                          ) : canEdit && !future ? (
                            <input
                              key={`${key}:${split ?? v ?? ""}`}
                              aria-label={`Hours of rest for ${nameOf(c)} on ${d}`}
                              title={splitIssue ?? (split ? `Rest taken as ${split.replace(/\+/g, " + ")} hours` : undefined)}
                              type="text" inputMode="decimal" pattern="[0-9.+ ]*"
                              defaultValue={split ?? v ?? ""}
                              onBlur={(e) => void save(c.id, d, e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                              className={cn(
                                "h-10 w-16 rounded-lg border bg-background/40 text-center text-sm tabular-nums outline-none transition focus:border-primary/60",
                                short ? "border-red-500/50 text-red-300" : "border-border",
                                saving === key && "opacity-50",
                              )}
                            />
                          ) : (
                            <span title={splitIssue ?? undefined} className={cn("tabular-nums", short ? "text-red-300" : v == null ? "text-muted-foreground/40" : "")}>
                              {v == null ? "—" : split ?? fmtHours(v)}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className={cn("px-3 py-2 text-right tabular-nums",
                      wk != null && wk < REST_MIN_7D ? "font-semibold text-red-300" : wk != null ? "text-foreground" : "text-muted-foreground")}>
                      {wk != null ? `${fmtHours(wk)} h` : weekSum ? <span title="Some days aren't recorded yet">{fmtHours(weekSum)} h…</span> : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </SectionCard>
      )}
      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">{error}</div>}
      <p className="text-xs text-muted-foreground">
        Enter the hours of rest each person had in the 24 hours of that day — or the periods, like 6+4, when rest was split. Rest may be split
        into no more than two periods, one of them at least 6 hours; a split outside that is flagged. The 7-day total is for the 7 days ending
        on the week's last day, and shows once all seven are filled in.
      </p>
    </div>
  );
}
