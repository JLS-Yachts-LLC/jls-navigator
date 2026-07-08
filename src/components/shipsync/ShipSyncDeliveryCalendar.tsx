import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { CalendarDays, Plus, X, Loader2 } from "lucide-react";
import { addScheduleEntry, removeScheduleEntry } from "@/lib/shipsync/data";
import { WEEKDAYS, todayWeekday, type ShipSyncDeliverySchedule } from "@/lib/shipsync/model";
import type { ShipSyncData } from "@/components/shipsync-page";

// Chip colour palette — picked deterministically by boat name so a boat keeps
// the same colour across days.
const PALETTE = [
  "border-sky-500/40 bg-sky-500/15 text-sky-600 dark:text-sky-300",
  "border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  "border-pink-500/40 bg-pink-500/15 text-pink-600 dark:text-pink-300",
  "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-300",
  "border-violet-500/40 bg-violet-500/15 text-violet-600 dark:text-violet-300",
  "border-orange-500/40 bg-orange-500/15 text-orange-600 dark:text-orange-300",
  "border-teal-500/40 bg-teal-500/15 text-teal-600 dark:text-teal-300",
];
function boatColor(boat: string) {
  let h = 0;
  for (let i = 0; i < boat.length; i++) h = (h * 31 + boat.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function ShipSyncDeliveryCalendar({ data, reload }: { data: ShipSyncData; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const today = todayWeekday();

  // Schedule entries grouped by weekday.
  const byDay = useMemo(() => {
    const m = new Map<number, ShipSyncDeliverySchedule[]>();
    for (const s of data.schedule) {
      if (!m.has(s.weekday)) m.set(s.weekday, []);
      m.get(s.weekday)!.push(s);
    }
    for (const list of m.values()) list.sort((a, b) => a.boat_name.localeCompare(b.boat_name));
    return m;
  }, [data.schedule]);

  // Full boat roster (destinations + any boat seen on a package), sorted.
  const boats = useMemo(
    () => Array.from(new Set([
      ...data.destinations.map((d) => d.boat_name),
      ...(data.packages.map((p) => p.boat_name).filter(Boolean) as string[]),
    ])).sort(),
    [data.destinations, data.packages],
  );

  async function add(boat: string, weekday: number) {
    setBusy(`add-${weekday}`);
    try { await addScheduleEntry(boat, weekday); await reload(); }
    catch (e: any) { toast.error(e?.message ?? "Couldn't add to the calendar"); }
    finally { setBusy(null); }
  }
  async function remove(entry: ShipSyncDeliverySchedule) {
    setBusy(`del-${entry.id}`);
    try { await removeScheduleEntry(entry.id); await reload(); }
    catch (e: any) { toast.error(e?.message ?? "Couldn't remove"); }
    finally { setBusy(null); }
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-primary" />
        <h2 className="font-display text-base font-semibold">Delivery calendar</h2>
        <span className="text-[11px] text-muted-foreground">Weekly recurring boat deliveries</span>
      </div>

      <div className="flex flex-col gap-2">
        {WEEKDAYS.map((label, wd) => {
          const entries = byDay.get(wd) ?? [];
          const onDay = new Set(entries.map((e) => e.boat_name));
          const available = boats.filter((b) => !onDay.has(b));
          const isToday = wd === today;
          return (
            <div key={wd} className={`rounded-xl border px-4 py-3 ${isToday ? "border-primary/50 bg-primary/5" : "border-border bg-card"}`}>
              <div className="flex items-start gap-3">
                <div className="flex w-14 shrink-0 flex-col pt-1">
                  <span className="font-display text-sm font-bold">{label}</span>
                  {isToday && <span className="text-[9px] font-semibold uppercase tracking-wide text-primary">Today</span>}
                </div>

                {/* Boats stack vertically */}
                <div className="flex flex-1 flex-col items-start gap-1.5">
                  {entries.length === 0 && <span className="py-0.5 text-[12px] italic text-muted-foreground/60">No deliveries</span>}

                  {entries.map((e) => (
                    <span key={e.id} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold ${boatColor(e.boat_name)}`}>
                      {e.boat_name}
                      <button onClick={() => remove(e)} disabled={busy === `del-${e.id}`} className="opacity-60 hover:opacity-100" title="Remove from this day">
                        {busy === `del-${e.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                      </button>
                    </span>
                  ))}
                </div>

                {/* Add boat — at the end (right) of the row */}
                {available.length > 0 && (
                  <Select value="" onValueChange={(b) => add(b, wd)} disabled={busy === `add-${wd}`}>
                    <SelectTrigger
                      title="Add boat"
                      className="ml-auto h-7 w-7 shrink-0 justify-center rounded-full border-dashed p-0 text-muted-foreground hover:text-foreground [&>svg:last-of-type]:hidden"
                    >
                      {busy === `add-${wd}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    </SelectTrigger>
                    <SelectContent>
                      {available.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
