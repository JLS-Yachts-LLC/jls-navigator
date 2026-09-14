/**
 * Schedule + recipients for the emailing automations.
 *
 * Before this, "who gets the weekly immigration digest, and when" lived in two
 * places that nobody outside the code could see: the recipient list was "every
 * user with an admin role" (which is how the vendor's own support mailbox ended
 * up on it), and the day and hour were hardcoded in the worker's cron dispatch.
 * Changing either meant a deploy.
 *
 * Both now live on the automation's `config` in the registry, editable on
 * Developer → Automations:
 *
 *   {
 *     "recipients": ["ops@jlsyachts.com"],
 *     "schedule":   { "day": "mon", "time": "07:00", "tz": "Asia/Dubai" }
 *   }
 *
 * `day` is a three-letter day or "daily"; `time` is 24-hour local to `tz`, which
 * defaults to Asia/Dubai because that is the business's clock — staff asking for
 * "Monday at 7" mean 7am in Dubai, not UTC, and they should not have to do the
 * conversion themselves.
 */
import { createClient } from '@supabase/supabase-js'

export type ScheduleDay = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'daily'
export type AutomationSchedule = { day: ScheduleDay; time: string; tz?: string }

export const DEFAULT_TZ = 'Asia/Dubai'
const DAY_KEYS: ScheduleDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
}

/** Day + time in a given zone. hourCycle h23 so midnight is 00, never 24. */
export function localNow(now: Date, tz: string): { day: ScheduleDay; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0'
  return {
    day: get('weekday').toLowerCase().slice(0, 3) as ScheduleDay,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  }
}

export function parseSchedule(raw: unknown, fallback: AutomationSchedule): AutomationSchedule {
  const s = (raw ?? {}) as Partial<AutomationSchedule>
  const day = DAY_KEYS.includes(s.day as ScheduleDay) || s.day === 'daily' ? s.day as ScheduleDay : fallback.day
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s.time)) ? String(s.time) : fallback.time
  return { day, time, tz: typeof s.tz === 'string' && s.tz ? s.tz : (fallback.tz ?? DEFAULT_TZ) }
}

/**
 * Is `now` inside this schedule's firing window?
 *
 * The window exists because the worker's cron ticks are not guaranteed to land
 * exactly on the minute — it is matched by the idempotence check in
 * `runScheduledEmail`, which is what actually prevents a second send.
 */
export function isDueNow(sched: AutomationSchedule, now: Date, windowMinutes = 20): boolean {
  const { day, minutes } = localNow(now, sched.tz ?? DEFAULT_TZ)
  if (sched.day !== 'daily' && sched.day !== day) return false
  const [h, m] = sched.time.split(':').map(Number)
  const target = h * 60 + m
  return minutes >= target && minutes < target + windowMinutes
}

/** Human summary for logs and the UI, e.g. "Mondays at 07:00 Asia/Dubai". */
export function describeSchedule(s: AutomationSchedule): string {
  const names: Record<string, string> = {
    sun: 'Sundays', mon: 'Mondays', tue: 'Tuesdays', wed: 'Wednesdays',
    thu: 'Thursdays', fri: 'Fridays', sat: 'Saturdays', daily: 'Every day',
  }
  return `${names[s.day] ?? s.day} at ${s.time} ${s.tz ?? DEFAULT_TZ}`
}

export type ScheduledEmailResult = { ran: boolean; note?: string }

/**
 * Run a scheduled email automation if it is enabled, due, and has not already
 * gone out today.
 *
 * The last part matters more than it looks. The worker registers four cron
 * patterns, and this dispatch sits outside any single tick guard, so at the top
 * of an hour several invocations can pass the same time check. It has not
 * duplicated in practice, but that is luck rather than design — and the moment
 * the send time became editable, relying on it would be indefensible. A
 * successful run recorded in the last `dedupeHours` blocks another.
 */
export async function runScheduledEmail(
  key: string,
  fallback: AutomationSchedule,
  job: (recipients: string[]) => Promise<unknown>,
  opts: { dedupeHours?: number; now?: Date } = {},
): Promise<ScheduledEmailResult> {
  const sb = admin()
  const now = opts.now ?? new Date()

  const { data: auto } = await sb.from('automations')
    .select('enabled, config').eq('key', key).maybeSingle()
  if (!auto) return { ran: false, note: 'not registered' }
  if (!auto.enabled) return { ran: false, note: 'disabled' }

  const cfg = (auto.config ?? {}) as Record<string, unknown>
  const sched = parseSchedule(cfg.schedule, fallback)
  if (!isDueNow(sched, now)) return { ran: false, note: 'not due' }

  const since = new Date(now.getTime() - (opts.dedupeHours ?? 12) * 3_600_000).toISOString()
  const { data: recent } = await sb.from('automation_runs')
    .select('id').eq('automation_key', key).eq('status', 'success')
    .gte('started_at', since).limit(1)
  if (recent?.length) return { ran: false, note: 'already sent' }

  const recipients = (Array.isArray(cfg.recipients) ? cfg.recipients : [])
    .map((e) => String(e).trim())
    .filter((e) => /.+@.+\..+/.test(e))

  await job(recipients)
  return { ran: true }
}
