/**
 * Visa Expiry Flag Engine — Tickets #174 / #175
 *
 * Runs daily (wired into worker-entry.ts scheduled() at 03:00 UTC = 07:00 UAE).
 *
 * Reconciliation notes (spec written for a Supabase Edge Function + assumed schema):
 *   - This codebase has no Edge Functions; cron lives in the Cloudflare Worker's
 *     scheduled() handler. runVisaExpiryFlagJob() is invoked from there.
 *   - Live schema uses country_code 'AE' (not 'UAE'); visa_applications.crew_member_id
 *     is the crew FK; yacht_id -> yachts (not vessel_id -> vessels).
 *   - Crew_immigration recipients resolve via user_module_access JOIN modules.
 *   - Flag events are the durable audit trail in visa_expiry_flags; admin actions
 *     (status/amendment/renewal) are audited via logAuditEvent in their API routes.
 *
 * Thresholds: 30 calendar days, 10 working days, 5 working days.
 * Flags are suppressed (never deleted) when visa_renewed = true.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type FlagKey = '30_day' | '10_working' | '5_working'
type FlagType = '30_day' | '10_working_day' | '5_working_day'

interface ExpiringVisa {
  id: string
  crew_member_id: string
  yacht_id: string | null
  visa_expiry_date: string
  visa_renewed: boolean
  expiry_flags_sent: Record<string, string | null> | null
  crew_members: { full_name: string | null } | null
  yachts: { vessel_name: string | null } | null
}

function admin(): SupabaseClient {
  return createClient(
    process.env.SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    { auth: { persistSession: false } },
  )
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

export async function runVisaExpiryFlagJob(): Promise<{ processed: number; flagged: number }> {
  const sb = admin()
  const today = new Date().toISOString().split('T')[0]

  const { data, error } = await sb
    .from('visa_applications')
    .select(`
      id, crew_member_id, yacht_id, visa_expiry_date, visa_renewed, expiry_flags_sent,
      crew_members ( full_name ),
      yachts ( vessel_name )
    `)
    .eq('country_code', 'AE')
    .eq('status', 'approved')
    .eq('visa_renewed', false)
    .not('visa_expiry_date', 'is', null)
    .gte('visa_expiry_date', today)
    .lte('visa_expiry_date', addDays(today, 35))

  if (error) {
    console.error('[visaExpiryFlagJob] fetch error:', error.message)
    return { processed: 0, flagged: 0 }
  }

  const visas = (data ?? []) as unknown as ExpiringVisa[]
  let flagged = 0

  // Resolve crew_immigration recipients once per run.
  const recipients = await crewImmigrationUserIds(sb)

  for (const visa of visas) {
    flagged += await processVisa(sb, visa, recipients)
  }

  console.log(`[visaExpiryFlagJob] processed=${visas.length} flagged=${flagged}`)
  return { processed: visas.length, flagged }
}

async function processVisa(sb: SupabaseClient, visa: ExpiringVisa, recipients: string[]): Promise<number> {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const expiry = new Date(visa.visa_expiry_date)
  const calendarDays = Math.floor((expiry.getTime() - today.getTime()) / 86_400_000)

  const { data: wd } = await sb.rpc('working_days_until', { target_date: visa.visa_expiry_date })
  const workingDays: number = typeof wd === 'number' ? wd : calendarDays

  const sent = visa.expiry_flags_sent ?? {}
  let fired = 0

  if (calendarDays <= 30 && !sent['30_day']) {
    await fireFlag(sb, visa, '30_day', '30_day', calendarDays, workingDays, recipients); fired++
  }
  if (workingDays <= 10 && !sent['10_working']) {
    await fireFlag(sb, visa, '10_working_day', '10_working', calendarDays, workingDays, recipients); fired++
  }
  if (workingDays <= 5 && !sent['5_working']) {
    await fireFlag(sb, visa, '5_working_day', '5_working', calendarDays, workingDays, recipients); fired++
  }
  return fired
}

async function fireFlag(
  sb: SupabaseClient,
  visa: ExpiringVisa,
  flagType: FlagType,
  flagKey: FlagKey,
  calendarDays: number,
  workingDays: number,
  recipients: string[],
): Promise<void> {
  await sb.from('visa_expiry_flags').insert({
    visa_application_id: visa.id,
    crew_id: visa.crew_member_id,
    yacht_id: visa.yacht_id,
    flag_type: flagType,
    expiry_date: visa.visa_expiry_date,
    suppressed: false,
    notified_users: recipients,
  })

  await sb
    .from('visa_applications')
    .update({ expiry_flags_sent: { ...(visa.expiry_flags_sent ?? {}), [flagKey]: new Date().toISOString() } })
    .eq('id', visa.id)

  await notify(sb, visa, flagType, calendarDays, workingDays, recipients)
}

const LABELS: Record<FlagType, string> = {
  '30_day': '30 calendar days',
  '10_working_day': '10 working days',
  '5_working_day': '5 working days',
}
const URGENCY: Record<FlagType, 'info' | 'warning' | 'danger'> = {
  '30_day': 'info',
  '10_working_day': 'warning',
  '5_working_day': 'danger',
}

async function notify(
  sb: SupabaseClient,
  visa: ExpiringVisa,
  flagType: FlagType,
  calendarDays: number,
  workingDays: number,
  recipients: string[],
): Promise<void> {
  if (!recipients.length) return
  const crewName = visa.crew_members?.full_name ?? 'Crew member'
  const vesselName = visa.yachts?.vessel_name ?? 'their vessel'

  const rows = recipients.map((userId) => ({
    user_id: userId,
    type: 'visa_expiry',
    urgency: URGENCY[flagType],
    title: `UAE visa expiring — ${crewName}`,
    body: `Visa for ${crewName} aboard ${vesselName} expires in ${LABELS[flagType]} (${calendarDays} calendar days, ${workingDays} working days). Renew now to avoid disruption.`,
    action_url: `/crew-immigration/visas/${visa.id}`,
    metadata: { visa_application_id: visa.id, flag_type: flagType },
  }))

  await sb.from('notifications').insert(rows)
}

async function crewImmigrationUserIds(sb: SupabaseClient): Promise<string[]> {
  const { data } = await sb
    .from('user_module_access')
    .select('user_id, active, modules:module_id(name)')
    .eq('active', true)
  return ((data ?? []) as any[])
    .filter((r) => r.modules?.name === 'crew_immigration')
    .map((r) => r.user_id as string)
}
