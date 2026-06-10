/**
 * Polaris — Daily Visa Compliance Monitor
 * Run server-side (Cloudflare Worker cron, every 24h).
 * Writes results to compliance_alerts table.
 */
import { addMonths, addDays, subDays } from 'date-fns'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url || !key) throw new Error('Supabase admin credentials not configured')
  return createClient(url, key, { auth: { persistSession: false } })
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000)
}

async function upsertAlert(
  sb: ReturnType<typeof getAdmin>,
  alert: {
    crew_id?:        string | null
    passport_id?:    string | null
    application_id?: string | null
    alert_type:      string
    severity:        'info' | 'warn' | 'critical'
    message:         string
    due_date?:       string | null
  },
) {
  // De-duplicate: one open alert per (crew_id, alert_type, due_date)
  const existing = await (sb as any)
    .from('compliance_alerts')
    .select('id')
    .eq('crew_id',    alert.crew_id    ?? null)
    .eq('alert_type', alert.alert_type)
    .eq('due_date',   alert.due_date   ?? null)
    .eq('resolved',   false)
    .limit(1)

  if (existing.data?.length) {
    // Update severity if escalated
    await (sb as any)
      .from('compliance_alerts')
      .update({ severity: alert.severity, message: alert.message })
      .eq('id', existing.data[0].id)
  } else {
    await (sb as any).from('compliance_alerts').insert(alert)
  }
}

export async function runDailyComplianceChecks(): Promise<{
  passports: number
  visas:     number
  staleDocs: number
}> {
  const sb            = getAdmin()
  const today         = new Date()
  const sixMonthsOut  = addMonths(today, 6)
  const thirtyDaysOut = addDays(today, 30)
  const todayStr      = today.toISOString().split('T')[0]

  let passports = 0, visas = 0, staleDocs = 0

  // ── 1. Passport expiry within 6 months ────────────────────
  const { data: expiringPassports } = await (sb as any)
    .from('crew_passports')
    .select('*, crew_members(full_name, first_name, last_name)')
    .lte('expiry_date', sixMonthsOut.toISOString().split('T')[0])
    .gte('expiry_date', todayStr)

  for (const p of expiringPassports ?? []) {
    const name    = p.crew_members?.full_name
      ?? `${p.crew_members?.first_name ?? ''} ${p.crew_members?.last_name ?? ''}`.trim()
    const days    = daysUntil(p.expiry_date)
    const sev     = days <= 30 ? 'critical' : 'warn'
    await upsertAlert(sb, {
      crew_id:    p.crew_id,
      passport_id:p.id,
      alert_type: 'passport_expiry',
      severity:   sev as 'warn' | 'critical',
      message:    `Passport ${p.passport_number} for ${name} expires ${p.expiry_date} (${days} days)`,
      due_date:   p.expiry_date,
    })
    passports++
  }

  // ── 2. Visa expiry within 30 days ─────────────────────────
  const { data: expiringVisas } = await (sb as any)
    .from('visa_applications')
    .select('*, crew_members(full_name, first_name, last_name)')
    .eq('status', 'approved')
    .lte('visa_expiry', thirtyDaysOut.toISOString().split('T')[0])
    .gte('visa_expiry', todayStr)

  for (const v of expiringVisas ?? []) {
    const name = v.crew_members?.full_name
      ?? `${v.crew_members?.first_name ?? ''} ${v.crew_members?.last_name ?? ''}`.trim()
    const days = daysUntil(v.visa_expiry)
    const sev  = days <= 7 ? 'critical' : 'warn'
    await upsertAlert(sb, {
      crew_id:        v.crew_member_id ?? v.crew_id,
      application_id: v.id,
      alert_type:     'visa_expiry',
      severity:       sev as 'warn' | 'critical',
      message:        `${v.country_code ?? ''} visa for ${name} expires ${v.visa_expiry} (${days} days)`,
      due_date:       v.visa_expiry,
    })
    visas++
  }

  // ── 3. Stale pending_docs (> 3 days) ──────────────────────
  const { data: stale } = await (sb as any)
    .from('visa_applications')
    .select('*, crew_members(full_name, first_name, last_name)')
    .eq('status', 'pending_docs')
    .lte('updated_at', subDays(today, 3).toISOString())

  for (const a of stale ?? []) {
    const name = a.crew_members?.full_name
      ?? `${a.crew_members?.first_name ?? ''} ${a.crew_members?.last_name ?? ''}`.trim()
    await upsertAlert(sb, {
      crew_id:        a.crew_member_id ?? a.crew_id,
      application_id: a.id,
      alert_type:     'missing_document',
      severity:       'warn',
      message:        `Documents pending for ${name} (${a.country_code ?? a.destination_country ?? 'Unknown'} visa) — stale for 3+ days`,
      due_date:       null,
    })
    staleDocs++
  }

  return { passports, visas, staleDocs }
}
