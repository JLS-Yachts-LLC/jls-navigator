/**
 * Compass Card events — the email half of the alerts.
 *
 * The database rings the in-app bell for the right team the moment an event
 * arrives (compass_card_event_bell, migration 20261020100000). Email is optional
 * and off by default (compass_card_settings.email_enabled, the Notifications
 * button on Compass Card): it goes to that team plus any extra company addresses.
 *
 * Runs on the worker's 5-minute tick and straight after an event is received.
 * Each event is claimed (alert_claimed_at) before anything is sent, so it goes
 * once however many times this runs.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { sendEmail } from '@/lib/ses.server'
import { outboundEmailEnabled, isInternalAddress } from '@/lib/mail-guard.server'
import { appBaseUrl } from '@/lib/app-url.server'

const db = () => supabaseAdmin as any

/** Events older than this when first seen are stamped, not sent — no backlog flood after a switch-on. */
const STALE_MS = 24 * 60 * 60_000

export const EVENT_LABEL: Record<string, string> = {
  user_signup: 'New app sign-up',
  vendor_signup: 'New vendor request',
  vendor_status: 'Vendor decision',
  offer_submitted: 'Offer to approve',
  offer_status: 'Offer decision',
}

export type CompassCardSettings = {
  signup_recipient_ids: string[]
  partner_recipient_ids: string[]
  email_enabled: boolean
  email_extra: string[]
}

type EventRow = {
  id: string; event_type: string; team: 'signups' | 'partners'; received_at: string; occurred_at: string
  title: string; summary: string | null; status: string | null; person_name: string | null
  person_email: string | null; admin_url: string | null; data: Record<string, unknown>
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const eventLink = (id: string) => `${appBaseUrl()}/compass-card?event=${id}`

/** The facts the team reads, in order. Empty ones are left out. */
export function eventFacts(e: EventRow): Array<[string, string]> {
  const d = e.data ?? {}
  const facts: Array<[string, string]> = [
    ['What', EVENT_LABEL[e.event_type] ?? e.event_type],
    ['Name', e.person_name ?? ''],
    ['Email', e.person_email ?? ''],
    ['Vendor', e.event_type.startsWith('offer') ? String(d.vendor_name ?? '') : ''],
    ['Offer', e.event_type.startsWith('offer') ? String(d.title ?? '') : ''],
    ['Status', e.status ? e.status.replace(/^\w/, (c) => c.toUpperCase()) : ''],
    ['Reason', String(d.reason ?? '')],
    ['When', fmtWhen(e.occurred_at)],
  ]
  return facts.filter(([, v]) => v)
}

export function buildEventEmail(e: EventRow) {
  const subject = `Compass Card: ${e.title}`
  const rows = eventFacts(e).map(([k, v]) => `<tr>
      <td style="padding:6px 12px 6px 0;font-size:12px;color:#64748b;white-space:nowrap;vertical-align:top">${esc(k)}</td>
      <td style="padding:6px 0;font-size:14px;color:#0f172a">${esc(v)}</td></tr>`).join('')
  const html = `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#272727;color:#f2c35a;padding:14px 20px;border-radius:12px 12px 0 0;font-size:12px;letter-spacing:.16em;text-transform:uppercase;font-weight:600">
      Compass Card · ${esc(EVENT_LABEL[e.event_type] ?? 'Update')}
    </div>
    <div style="background:#ffffff;padding:20px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:0">
      <h1 style="margin:0 0 12px;font-size:18px;line-height:1.35">${esc(e.title)}</h1>
      <table cellpadding="0" cellspacing="0">${rows}</table>
      <p style="margin:18px 0 0">
        ${e.admin_url ? `<a href="${esc(e.admin_url)}" style="display:inline-block;background:#f2c35a;color:#1c1c1c;text-decoration:none;font-weight:600;font-size:14px;padding:10px 16px;border-radius:8px;margin-right:8px">Open in Compass Card admin</a>` : ''}
        <a href="${eventLink(e.id)}" style="display:inline-block;color:#0f172a;font-size:14px;padding:10px 4px">View in Polaris</a>
      </p>
    </div>
    <p style="margin:12px 4px 0;color:#94a3b8;font-size:11px">You get these because you're on a Compass Card notification list in Polaris (Compass Card → Notifications). Internal only.</p>
  </div></body></html>`
  const text = [
    subject, '',
    ...eventFacts(e).map(([k, v]) => `${k}: ${v}`),
    '', ...(e.admin_url ? [`Compass Card admin: ${e.admin_url}`] : []), `Polaris: ${eventLink(e.id)}`,
  ].join('\n')
  return { subject, html, text }
}

export async function loadSettings(): Promise<CompassCardSettings> {
  const { data } = await db().from('compass_card_settings').select('signup_recipient_ids, partner_recipient_ids, email_enabled, email_extra').eq('id', 1).maybeSingle()
  return {
    signup_recipient_ids: data?.signup_recipient_ids ?? [],
    partner_recipient_ids: data?.partner_recipient_ids ?? [],
    email_enabled: !!data?.email_enabled,
    email_extra: data?.email_extra ?? [],
  }
}

/** A team's emails plus the extra addresses — company addresses only, deduplicated. */
export async function teamEmails(team: 'signups' | 'partners', s: CompassCardSettings): Promise<string[]> {
  const { data } = await db().rpc('compass_card_recipients', { p_team: team })
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

const COLS = 'id, event_type, team, received_at, occurred_at, title, summary, status, person_name, person_email, admin_url, data'

/** Email every event not yet alerted, when email is on. Safe to run concurrently: events are claimed first. */
export async function sendCompassCardAlerts(): Promise<{ sent: number; failed: number; skipped?: string }> {
  const { data: pending } = await db().from('compass_card_events').select('id, received_at').is('alert_claimed_at', null).order('received_at').limit(40)
  if (!(pending ?? []).length) return { sent: 0, failed: 0 }

  const s = await loadSettings()
  const now = new Date().toISOString()
  if (!s.email_enabled || !outboundEmailEnabled()) {
    // The bell already rang; email is off, so don't build a backlog.
    await db().from('compass_card_events').update({ alert_claimed_at: now, alert_result: 'In-app only' })
      .in('id', (pending as any[]).map((p) => p.id)).is('alert_claimed_at', null)
    return { sent: 0, failed: 0, skipped: 'email off' }
  }

  const fresh = (pending as any[]).filter((p) => Date.now() - Date.parse(p.received_at) < STALE_MS).map((p) => p.id)
  const stale = (pending as any[]).filter((p) => !fresh.includes(p.id)).map((p) => p.id)
  if (stale.length) {
    await db().from('compass_card_events').update({ alert_claimed_at: now, alert_result: 'Too old to alert' }).in('id', stale).is('alert_claimed_at', null)
  }
  if (!fresh.length) return { sent: 0, failed: 0 }

  const { data: claimed } = await db().from('compass_card_events').update({ alert_claimed_at: now })
    .in('id', fresh).is('alert_claimed_at', null).select(COLS)
  const events = (claimed ?? []) as EventRow[]
  const toByTeam = {
    signups: events.some((e) => e.team === 'signups') ? await teamEmails('signups', s) : [],
    partners: events.some((e) => e.team === 'partners') ? await teamEmails('partners', s) : [],
  }

  let sent = 0, failed = 0
  for (const e of events) {
    const to = toByTeam[e.team]
    let result: string
    if (!to.length) result = 'Email: nobody on the team has a company address'
    else {
      try {
        const m = buildEventEmail(e)
        await sendEmail({ to, subject: m.subject, html: m.html, text: m.text })
        result = `Emailed ${to.length}`
        sent++
      } catch (err) {
        result = `Email failed: ${err instanceof Error ? err.message : String(err)}`
        failed++
      }
    }
    await db().from('compass_card_events').update({ alert_result: result.slice(0, 500) }).eq('id', e.id)
  }
  return { sent, failed }
}

/** A sample event for the Notifications panel's "Send me a test email". */
export function sampleEvent(): EventRow {
  return {
    id: '00000000-0000-0000-0000-000000000000', event_type: 'vendor_signup', team: 'partners',
    received_at: new Date().toISOString(), occurred_at: new Date().toISOString(),
    title: 'New vendor request: Test Vendor (please ignore)', summary: 'This is a test from Compass Card → Notifications.',
    status: 'pending', person_name: 'Test Contact', person_email: 'vendor@example.com',
    admin_url: 'https://compasscard.online/Admin-portal/admin/vendors/pending', data: {},
  }
}
