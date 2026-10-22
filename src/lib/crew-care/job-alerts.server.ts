/**
 * Crew Care job cards — the email and Microsoft Teams half of the alerts.
 *
 * The database rings the in-app bell for the Crew Care team the moment a job
 * card is raised (crew_care_job_bell, migration 20261019200000) — from the
 * Client Portal or from Crew Care → Job Cards. Email and Teams are optional and
 * switched on in crew_care_settings (the Notifications panel on Job Cards):
 *
 *   email  the Crew Care team (crew_care_recipients()) plus any extra
 *          addresses, e.g. a shared crew care mailbox. Staff only.
 *   teams  one card posted to a channel through a Teams webhook URL.
 *
 * Runs on the worker's 5-minute tick, and straight after staff raise a job
 * (POST /api/crew-care/alerts). Each job is claimed (alert_claimed_at) before
 * anything is sent, so it goes once however many times this runs.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { sendEmail } from '@/lib/ses.server'
import { outboundEmailEnabled, isInternalAddress } from '@/lib/mail-guard.server'
import { appBaseUrl } from '@/lib/app-url.server'

const db = () => supabaseAdmin as any

/** Jobs older than this when first seen are stamped, not sent — no backlog flood after a switch-on. */
const STALE_MS = 24 * 60 * 60_000

export const JOB_TYPE_LABEL: Record<string, string> = {
  transfer: 'Transfer', driver: 'Driver needed', airport: 'Airport run', crew_logistics: 'Crew logistics', other: 'Other',
}

/** Microsoft hosts only — mirrors the check constraint on crew_care_settings.teams_webhook_url. */
export function isTeamsWebhookUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && /\.(logic\.azure\.com|powerplatform\.com|webhook\.office\.com|office\.com)$/i.test(u.hostname)
  } catch {
    return false
  }
}

export type CrewCareSettings = {
  recipient_user_ids: string[]
  email_enabled: boolean
  email_extra: string[]
  teams_enabled: boolean
  teams_webhook_url: string | null
}

type Job = {
  id: string; reference: string; source: string; title: string; details: string | null; job_type: string
  pickup: string | null; dropoff: string | null; needed_at: string | null; passengers: number | null
  requested_by_name: string | null; priority: string; created_at: string; yacht_id: string | null
  yacht?: { vessel_name: string | null } | null
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

/** Dubai time, the way the team reads it: "21 Oct 2026, 06:30". */
function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const jobLink = (id: string) => `${appBaseUrl()}/crew-cab/jobs?job=${id}`

/** The facts that matter on a job, in the order the team reads them. Empty ones are left out. */
export function jobFacts(j: Job): Array<[string, string]> {
  const facts: Array<[string, string]> = [
    ['Type', JOB_TYPE_LABEL[j.job_type] ?? j.job_type],
    ['Vessel', j.yacht?.vessel_name ?? ''],
    ['Requested by', `${j.requested_by_name ?? ''}${j.source === 'portal' ? ' (Client Portal)' : ''}`.trim()],
    ['When', fmtWhen(j.needed_at)],
    ['Pick-up', j.pickup ?? ''],
    ['Drop-off', j.dropoff ?? ''],
    ['Passengers', j.passengers != null ? String(j.passengers) : ''],
    ['Priority', j.priority === 'normal' ? '' : j.priority.replace(/^\w/, (c) => c.toUpperCase())],
  ]
  return facts.filter(([, v]) => v)
}

export function buildJobEmail(j: Job) {
  const urgent = j.priority === 'high' || j.priority === 'urgent'
  const subject = `${urgent ? '⚠️ ' : ''}Crew Care job ${j.reference}: ${j.title}`
  const rows = jobFacts(j).map(([k, v]) => `<tr>
      <td style="padding:6px 12px 6px 0;font-size:12px;color:#64748b;white-space:nowrap;vertical-align:top">${esc(k)}</td>
      <td style="padding:6px 0;font-size:14px;color:#0f172a">${esc(v)}</td></tr>`).join('')
  const html = `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#0a1838;color:#e9cc72;padding:14px 20px;border-radius:12px 12px 0 0;font-size:12px;letter-spacing:.16em;text-transform:uppercase;font-weight:600">
      Crew Care · New job card
    </div>
    <div style="background:#ffffff;padding:20px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:0">
      <h1 style="margin:0 0 12px;font-size:18px;line-height:1.35">${esc(j.reference)} — ${esc(j.title)}</h1>
      <table cellpadding="0" cellspacing="0">${rows}</table>
      ${j.details ? `<div style="margin-top:12px;white-space:pre-line;font-size:14px;line-height:1.55;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px">${esc(j.details)}</div>` : ''}
      <p style="margin:18px 0 0"><a href="${jobLink(j.id)}" style="display:inline-block;background:#c9a227;color:#0a1838;text-decoration:none;font-weight:600;font-size:14px;padding:10px 16px;border-radius:8px">Open the job card</a></p>
    </div>
    <p style="margin:12px 4px 0;color:#94a3b8;font-size:11px">You get these because you're on the Crew Care team (Crew Care → Job Cards → Notifications). Internal only.</p>
  </div></body></html>`
  const text = [
    subject, '',
    ...jobFacts(j).map(([k, v]) => `${k}: ${v}`),
    ...(j.details ? ['', j.details] : []),
    '', `Open: ${jobLink(j.id)}`,
  ].join('\n')
  return { subject, html, text }
}

/** An Adaptive Card in the envelope both Teams Workflows and classic incoming webhooks accept. */
export function buildTeamsPayload(j: Job) {
  const urgent = j.priority === 'high' || j.priority === 'urgent'
  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      contentUrl: null,
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        body: [
          { type: 'TextBlock', text: 'CREW CARE · NEW JOB CARD', size: 'Small', weight: 'Bolder', color: urgent ? 'Attention' : 'Accent' },
          { type: 'TextBlock', text: `${j.reference} — ${j.title}`, size: 'Medium', weight: 'Bolder', wrap: true },
          { type: 'FactSet', facts: jobFacts(j).map(([title, value]) => ({ title, value })) },
          ...(j.details ? [{ type: 'TextBlock', text: j.details.slice(0, 1500), wrap: true, isSubtle: true }] : []),
        ],
        actions: [{ type: 'Action.OpenUrl', title: 'Open the job card', url: jobLink(j.id) }],
      },
    }],
  }
}

export async function postToTeams(url: string, payload: unknown): Promise<void> {
  if (!isTeamsWebhookUrl(url)) throw new Error('Not a Microsoft Teams webhook address')
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  if (!res.ok) throw new Error(`Teams said ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
}

export async function loadSettings(): Promise<CrewCareSettings> {
  const { data } = await db().from('crew_care_settings').select('recipient_user_ids, email_enabled, email_extra, teams_enabled, teams_webhook_url').eq('id', 1).maybeSingle()
  return {
    recipient_user_ids: data?.recipient_user_ids ?? [],
    email_enabled: !!data?.email_enabled,
    email_extra: data?.email_extra ?? [],
    teams_enabled: !!data?.teams_enabled,
    teams_webhook_url: data?.teams_webhook_url ?? null,
  }
}

/** Team emails plus the extra addresses — internal addresses only, deduplicated. */
export async function teamEmails(s: CrewCareSettings): Promise<string[]> {
  const { data } = await db().rpc('crew_care_recipients')
  const seen = new Set<string>()
  const out: string[] = []
  for (const e of [...((data ?? []) as any[]).map((r) => r.email as string | null), ...s.email_extra]) {
    const t = (e ?? '').trim()
    if (!t || !isInternalAddress(t) || seen.has(t.toLowerCase())) continue
    seen.add(t.toLowerCase())
    out.push(t)
  }
  return out
}

const JOB_COLS = 'id, reference, source, title, details, job_type, pickup, dropoff, needed_at, passengers, requested_by_name, priority, created_at, yacht_id, yacht:yachts(vessel_name)'

/** Send email / Teams for every job card not yet alerted. Safe to run concurrently: jobs are claimed first. */
export async function sendCrewCareJobAlerts(): Promise<{ sent: number; failed: number; skipped?: string }> {
  const { data: pending } = await db().from('crew_care_jobs').select('id, created_at').is('alert_claimed_at', null).order('created_at').limit(40)
  if (!(pending ?? []).length) return { sent: 0, failed: 0 }

  const s = await loadSettings()
  const wantEmail = s.email_enabled && outboundEmailEnabled()
  const wantTeams = s.teams_enabled && !!s.teams_webhook_url
  const now = new Date().toISOString()

  if (!wantEmail && !wantTeams) {
    // The bell already rang; nothing else is switched on, so don't build a backlog.
    await db().from('crew_care_jobs').update({ alert_claimed_at: now, alert_result: 'In-app only' })
      .in('id', (pending as any[]).map((p) => p.id)).is('alert_claimed_at', null)
    return { sent: 0, failed: 0, skipped: 'email and Teams off' }
  }

  const fresh = (pending as any[]).filter((p) => Date.now() - Date.parse(p.created_at) < STALE_MS).map((p) => p.id)
  const stale = (pending as any[]).filter((p) => !fresh.includes(p.id)).map((p) => p.id)
  if (stale.length) {
    await db().from('crew_care_jobs').update({ alert_claimed_at: now, alert_result: 'Too old to alert' }).in('id', stale).is('alert_claimed_at', null)
  }
  if (!fresh.length) return { sent: 0, failed: 0 }

  const { data: claimed } = await db().from('crew_care_jobs').update({ alert_claimed_at: now })
    .in('id', fresh).is('alert_claimed_at', null).select(JOB_COLS)
  const jobs = (claimed ?? []) as Job[]
  const to = wantEmail ? await teamEmails(s) : []

  let sent = 0, failed = 0
  for (const j of jobs) {
    const parts: string[] = []
    let ok = true
    if (wantEmail) {
      if (!to.length) parts.push('Email: nobody on the team has an address')
      else {
        try {
          const m = buildJobEmail(j)
          await sendEmail({ to, subject: m.subject, html: m.html, text: m.text })
          parts.push(`Emailed ${to.length}`)
        } catch (e) {
          ok = false
          parts.push(`Email failed: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    }
    if (wantTeams) {
      try {
        await postToTeams(s.teams_webhook_url!, buildTeamsPayload(j))
        parts.push('Posted to Teams')
      } catch (e) {
        ok = false
        parts.push(`Teams failed: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (ok) sent++; else failed++
    await db().from('crew_care_jobs').update({ alert_result: parts.join(' · ').slice(0, 500) }).eq('id', j.id)
  }
  return { sent, failed }
}

// ─── Driver details → whoever raised the request ─────────────────────────────

type DriverJob = Job & {
  driver_name: string; driver_phone: string | null; vehicle: string | null; notify_emails: string[]
}

export function buildDriverEmail(j: DriverJob) {
  const subject = `Driver assigned — ${j.reference}: ${j.title}`
  const driver: Array<[string, string]> = ([
    ['Driver', j.driver_name],
    ['Phone', j.driver_phone ?? ''],
    ['Vehicle', j.vehicle ?? ''],
  ] as Array<[string, string]>).filter(([, v]) => v)
  const trip: Array<[string, string]> = ([
    ['When', fmtWhen(j.needed_at)],
    ['Pick-up', j.pickup ?? ''],
    ['Drop-off', j.dropoff ?? ''],
    ['For', j.requested_by_name ?? ''],
  ] as Array<[string, string]>).filter(([, v]) => v)
  const row = ([k, v]: [string, string], big = false) => `<tr>
      <td style="padding:6px 12px 6px 0;font-size:12px;color:#64748b;white-space:nowrap;vertical-align:top">${esc(k)}</td>
      <td style="padding:6px 0;font-size:${big ? 16 : 14}px;color:#0f172a;${big ? 'font-weight:600' : ''}">${
        k === 'Phone' ? `<a href="tel:${esc(v.replace(/[^\d+]/g, ''))}" style="color:#0f172a">${esc(v)}</a>` : esc(v)}</td></tr>`
  const html = `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#0a1838;color:#e9cc72;padding:14px 20px;border-radius:12px 12px 0 0;font-size:12px;letter-spacing:.16em;text-transform:uppercase;font-weight:600">
      Crew Care · Driver assigned
    </div>
    <div style="background:#ffffff;padding:20px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:0">
      <h1 style="margin:0 0 12px;font-size:18px;line-height:1.35">${esc(j.reference)} — ${esc(j.title)}</h1>
      <table cellpadding="0" cellspacing="0" style="margin-bottom:8px">${driver.map((d) => row(d, true)).join('')}</table>
      <table cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0;padding-top:6px">${trip.map((d) => row(d)).join('')}</table>
      <p style="margin:18px 0 0"><a href="${jobLink(j.id)}" style="display:inline-block;background:#c9a227;color:#0a1838;text-decoration:none;font-weight:600;font-size:14px;padding:10px 16px;border-radius:8px">Open the request</a></p>
    </div>
    <p style="margin:12px 4px 0;color:#94a3b8;font-size:11px">You get this because your address is on this Crew Care request under "Send driver details to". If the driver changes, you'll get the new details.</p>
  </div></body></html>`
  const text = [
    subject, '',
    ...driver.map(([k, v]) => `${k}: ${v}`), '',
    ...trip.map(([k, v]) => `${k}: ${v}`),
    '', `Open: ${jobLink(j.id)}`,
  ].join('\n')
  return { subject, html, text }
}

/**
 * Email the driver details to each job's notify_emails once a driver is
 * assigned (and again if the details change — the database clears the claim).
 * Internal addresses only. Assignments older than a day when first seen are
 * stamped, not sent.
 */
export async function sendDriverNotices(): Promise<{ sent: number; failed: number; skipped?: string }> {
  const { data: pending } = await db().from('crew_care_jobs').select('id, driver_assigned_at')
    .not('driver_assigned_at', 'is', null).is('driver_notice_claimed_at', null).order('driver_assigned_at').limit(40)
  if (!(pending ?? []).length) return { sent: 0, failed: 0 }
  const now = new Date().toISOString()

  if (!outboundEmailEnabled()) {
    await db().from('crew_care_jobs').update({ driver_notice_claimed_at: now, driver_notice_result: 'Email is switched off on the server' })
      .in('id', (pending as any[]).map((p) => p.id)).is('driver_notice_claimed_at', null)
    return { sent: 0, failed: 0, skipped: 'outbound email off' }
  }

  const fresh = (pending as any[]).filter((p) => Date.now() - Date.parse(p.driver_assigned_at) < STALE_MS).map((p) => p.id)
  const stale = (pending as any[]).filter((p) => !fresh.includes(p.id)).map((p) => p.id)
  if (stale.length) {
    await db().from('crew_care_jobs').update({ driver_notice_claimed_at: now, driver_notice_result: 'Too old to send' })
      .in('id', stale).is('driver_notice_claimed_at', null)
  }
  if (!fresh.length) return { sent: 0, failed: 0 }

  const { data: claimed } = await db().from('crew_care_jobs').update({ driver_notice_claimed_at: now })
    .in('id', fresh).is('driver_notice_claimed_at', null)
    .select(`${JOB_COLS}, driver_name, driver_phone, vehicle, notify_emails`)
  let sent = 0, failed = 0
  for (const j of (claimed ?? []) as DriverJob[]) {
    if (!j.driver_name) continue
    const seen = new Set<string>()
    const to = (j.notify_emails ?? []).map((e) => e.trim()).filter((e) => {
      const k = e.toLowerCase()
      if (!e || !isInternalAddress(e) || seen.has(k)) return false
      seen.add(k)
      return true
    })
    let result: string
    if (!to.length) result = 'Nobody to email'
    else {
      try {
        const m = buildDriverEmail(j)
        await sendEmail({ to, subject: m.subject, html: m.html, text: m.text })
        result = `Driver details emailed to ${to.join(', ')}`
        sent++
      } catch (e) {
        result = `Email failed: ${e instanceof Error ? e.message : String(e)}`
        failed++
      }
    }
    await db().from('crew_care_jobs').update({ driver_notice_result: result.slice(0, 500) }).eq('id', j.id)
  }
  return { sent, failed }
}

/** A sample job for the Notifications panel's "Send test" buttons. */
export function sampleJob(): Job {
  return {
    id: '00000000-0000-0000-0000-000000000000', reference: 'JC-TEST', source: 'internal', title: 'Test alert — please ignore',
    details: 'This is a test from Crew Care → Job Cards → Notifications. Nothing needs doing.', job_type: 'airport',
    pickup: 'Port Rashid berth 4', dropoff: 'DXB Terminal 3', needed_at: new Date(Date.now() + 86_400_000).toISOString(),
    passengers: 2, requested_by_name: 'Crew Care', priority: 'normal', created_at: new Date().toISOString(), yacht_id: null,
  }
}
