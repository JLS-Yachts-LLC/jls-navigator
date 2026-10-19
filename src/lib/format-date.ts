/**
 * The DD/MMM/YYYY date format (e.g. 19/Oct/2026), asked for across Orbit 2 and
 * the boat owner's client portal (client request, 19 Oct 2026).
 *
 *   fmtDMY("2026-10-19")                     → "19/Oct/2026"
 *   fmtDMY("2026-10-19T08:30:00Z", { time }) → "19/Oct/2026 12:30"  (viewer's clock)
 *   fmtDMY(null)                             → "—"
 *
 * A bare date ("YYYY-MM-DD") is a calendar day, never shifted by time zone. A
 * timestamp shows in the viewer's own time zone unless `timeZone` is given
 * (server code passes "Asia/Dubai").
 */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function fmtDMY(
  value: string | number | Date | null | undefined,
  opts: { time?: boolean; timeZone?: string; empty?: string } = {},
): string {
  const empty = opts.empty ?? "—";
  if (value == null || value === "") return empty;

  if (typeof value === "string") {
    const m = DATE_ONLY.exec(value);
    if (m) return `${m[3]}/${MONTHS[Number(m[2]) - 1]}/${m[1]}`;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return empty;

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      day: "2-digit", month: "2-digit", year: "numeric",
      ...(opts.time ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const } : {}),
      ...(opts.timeZone ? { timeZone: opts.timeZone } : {}),
    }).formatToParts(d).map((p) => [p.type, p.value]),
  );
  const date = `${parts.day}/${MONTHS[Number(parts.month) - 1]}/${parts.year}`;
  return opts.time ? `${date} ${parts.hour}:${parts.minute}` : date;
}
