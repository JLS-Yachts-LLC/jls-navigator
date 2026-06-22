import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Unified, chronological crew timeline. Reads the append-only
 * `crew_timeline_events` table and merges in events derived from existing data
 * (sign-on/off movements + visa application dates) so it shows history straight
 * away and grows as movements/visas start writing real timeline rows.
 */

type TimelineEventType =
  | "VISA_APPLICATION_SUBMITTED" | "VISA_APPROVED" | "VISA_REJECTED"
  | "UAE_ENTRY" | "SIGN_ON" | "SIGN_OFF" | "UAE_EXIT"
  | "VISA_CANCELLATION" | "PERMIT_ISSUED" | "PERMIT_EXPIRED";

type TLItem = {
  key: string;
  type: TimelineEventType;
  datetime: string;        // ISO or date string
  vessel?: string;
  note?: string;
  derived: boolean;
};

const META: Record<TimelineEventType, { label: string; dot: string }> = {
  VISA_APPLICATION_SUBMITTED: { label: "Visa application submitted", dot: "bg-sky-500" },
  VISA_APPROVED:              { label: "Visa approved",              dot: "bg-emerald-500" },
  VISA_REJECTED:              { label: "Visa rejected",              dot: "bg-red-500" },
  UAE_ENTRY:                  { label: "Entry into UAE",             dot: "bg-amber-500" },
  SIGN_ON:                    { label: "Sign on",                    dot: "bg-emerald-500" },
  SIGN_OFF:                   { label: "Sign off",                   dot: "bg-slate-500" },
  UAE_EXIT:                   { label: "Exit from UAE",              dot: "bg-amber-500" },
  VISA_CANCELLATION:          { label: "Visa cancellation",          dot: "bg-red-500" },
  PERMIT_ISSUED:              { label: "Permit issued",              dot: "bg-violet-500" },
  PERMIT_EXPIRED:             { label: "Permit expired",             dot: "bg-red-500" },
};

function fmt(d?: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function dayKey(d?: string | null): string {
  if (!d) return "";
  return String(d).slice(0, 10);
}

export function CrewTimeline({ crewId, yachtMap }: { crewId: string; yachtMap?: Map<string, string> }) {
  const [loading, setLoading] = useState(true);
  const [tl, setTl] = useState<any[]>([]);
  const [signon, setSignon] = useState<any[]>([]);
  const [visas, setVisas] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const db = supabase as any;
      const [t, s, v] = await Promise.all([
        db.from("crew_timeline_events").select("*").eq("crew_member_id", crewId).order("event_datetime", { ascending: false }),
        db.from("crew_signon_events").select("event_type, event_date, port, yacht_id").eq("crew_member_id", crewId),
        db.from("visa_applications").select("status, sign_on_date, sign_off_date, destination_country, created_at, submitted_at, approved_at").eq("crew_member_id", crewId),
      ]);
      if (cancelled) return;
      setTl(t.data ?? []);
      setSignon(s.data ?? []);
      setVisas(v.data ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [crewId]);

  const events = useMemo<TLItem[]>(() => {
    const out: TLItem[] = [];
    const seen = new Set<string>();
    const push = (it: TLItem) => {
      const dedupe = `${it.type}:${dayKey(it.datetime)}`;
      if (seen.has(dedupe)) return;
      seen.add(dedupe);
      out.push(it);
    };

    // 1. Real timeline rows (authoritative — added first so they win dedupe).
    for (const r of tl) {
      push({
        key: r.id,
        type: r.event_type,
        datetime: r.event_datetime,
        vessel: r.yacht_id ? yachtMap?.get(r.yacht_id) : undefined,
        note: r.notes ?? undefined,
        derived: false,
      });
    }
    // 2. Derived from sign-on/off movements.
    for (const e of signon) {
      const type = e.event_type === "sign_off" ? "SIGN_OFF" : "SIGN_ON";
      push({
        key: `so-${type}-${e.event_date}`,
        type,
        datetime: e.event_date,
        vessel: e.yacht_id ? yachtMap?.get(e.yacht_id) : undefined,
        note: e.port ?? undefined,
        derived: false,
      });
    }
    // 3. Derived from visa applications.
    for (const v of visas) {
      const submitted = v.submitted_at ?? v.created_at;
      if (submitted)      push({ key: `v-sub-${submitted}`,      type: "VISA_APPLICATION_SUBMITTED", datetime: submitted, note: v.destination_country ?? undefined, derived: true });
      if (v.approved_at && v.status === "approved") push({ key: `v-app-${v.approved_at}`, type: "VISA_APPROVED", datetime: v.approved_at, note: v.destination_country ?? undefined, derived: true });
      if (v.sign_on_date)  push({ key: `v-on-${v.sign_on_date}`,  type: "SIGN_ON",  datetime: v.sign_on_date,  note: v.destination_country ?? undefined, derived: true });
      if (v.sign_off_date) push({ key: `v-off-${v.sign_off_date}`, type: "SIGN_OFF", datetime: v.sign_off_date, note: v.destination_country ?? undefined, derived: true });
    }

    return out.sort((a, b) => (b.datetime ?? "").localeCompare(a.datetime ?? ""));
  }, [tl, signon, visas, yachtMap]);

  if (loading) {
    return <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
  }
  if (events.length === 0) {
    return <p className="py-3 text-sm text-muted-foreground">No timeline events yet.</p>;
  }

  return (
    <ol className="relative ml-1 border-l border-border">
      {events.map((e) => {
        const m = META[e.type] ?? { label: e.type, dot: "bg-muted-foreground" };
        return (
          <li key={e.key} className="ml-4 py-2.5">
            <span className={cn("absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-background", m.dot)} />
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium text-foreground">{m.label}</span>
              <span className="text-xs text-muted-foreground">{fmt(e.datetime)}</span>
              {e.derived && <span className="rounded bg-muted px-1 py-px text-[9px] text-muted-foreground" title="Derived from visa data — not a confirmed movement">est.</span>}
            </div>
            {(e.vessel || e.note) && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">{[e.vessel, e.note].filter(Boolean).join(" · ")}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
