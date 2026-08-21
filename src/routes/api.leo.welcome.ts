/**
 * Leo Welcome Signal API — dynamic, non-repeating greeting
 * POST /api/leo/welcome
 *
 * Powers the floating Ask-Leo chat's opening line (src/components/leo/LeoChat.tsx)
 * with a live operational signal instead of the same static greeting every time.
 * Reuses assembleLeoContext() — the same access-scoped data the briefing already
 * computes — rather than a second, parallel data-gathering path. Whatever it
 * picks is logged to leo_welcome_message_log (migration 093) so it won't repeat
 * to the same user within ROTATION_WINDOW_DAYS; falls back to a static rotating
 * tip when there's nothing live and unseen.
 */

import { createClient } from '@supabase/supabase-js'
import { assembleLeoContext } from './api.leo.briefing'

const ROTATION_WINDOW_DAYS = 7

type Signal = { message_key: string; module_name: string | null; severity: 'info' | 'warn' | 'critical'; message: string; action_url: string | null }

function getAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url || !key) throw new Error('Supabase admin credentials missing')
  return createClient(url, key, { auth: { persistSession: false } })
}

// Static tips shown when there's no live, unseen signal for this user.
// Kept short and generic on purpose — real signals below take priority.
const STATIC_TIPS: { key: string; message: string }[] = [
  { key: 'tip:cross_module_search', message: "Did you know you can ask me about overdue invoices, expiring permits, or a specific vessel's port call — I pull live data across every module you have access to." },
  { key: 'tip:port_call_status', message: 'Ask me "what\'s the status of [vessel]\'s port call" for an instant update, no need to open the dashboard.' },
  { key: 'tip:crew_certificates', message: 'I can flag crew visas and certificates expiring soon across your whole fleet — just ask.' },
  { key: 'tip:ask_anything', message: "Ask me anything about your fleet, crew, visas, permits, or day-to-day operations — I'll answer from what's in Polaris." },
]

// Derive candidate live signals from the same context the briefing computes.
function deriveSignals(context: any): Signal[] {
  const signals: Signal[] = []

  const criticalVisa = context?.visaCompliance?.criticalCount ?? 0
  if (criticalVisa > 0) {
    signals.push({
      message_key: 'compliance_alert_critical',
      module_name: 'crew_immigration',
      severity: 'critical',
      message: `${criticalVisa} visa compliance alert${criticalVisa === 1 ? '' : 's'} flagged critical — want the details?`,
      action_url: '/crew-immigration/visas',
    })
  }

  const criticalPermits = context?.permits?.critical ?? 0
  if (criticalPermits > 0) {
    signals.push({
      message_key: 'permits_critical',
      module_name: 'permits',
      severity: 'critical',
      message: `${criticalPermits} permit${criticalPermits === 1 ? ' is' : 's are'} expiring within 14 days — ask me which vessels.`,
      action_url: null,
    })
  }

  const overdueInvoices = context?.finance?.overdueCount ?? 0
  if (overdueInvoices > 0) {
    signals.push({
      message_key: 'overdue_invoices',
      module_name: 'finance',
      severity: 'warn',
      message: `${overdueInvoices} invoice${overdueInvoices === 1 ? ' is' : 's are'} overdue — ask me for the total or which customers.`,
      action_url: '/finance',
    })
  }

  const docsToday = context?.agency?.awaitingDocumentation?.length ?? 0
  if (docsToday > 0) {
    signals.push({
      message_key: 'port_calls_docs_pending',
      module_name: 'agency',
      severity: 'warn',
      message: `${docsToday} port call${docsToday === 1 ? ' is' : 's are'} still awaiting documentation — ask me which vessels.`,
      action_url: '/agency',
    })
  }

  const overdueTasks = (context?.tasks?.overdue ?? 0)
  if (overdueTasks > 0) {
    signals.push({
      message_key: 'tasks_overdue',
      module_name: 'orbit',
      severity: 'warn',
      message: `${overdueTasks} task${overdueTasks === 1 ? ' is' : 's are'} overdue — ask me what's outstanding.`,
      action_url: null,
    })
  }

  return signals
}

export async function leoWelcomeHandler(request: Request): Promise<Response> {
  let token: string
  try {
    const body = await request.json()
    token = body.token
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const admin = getAdmin()
  let userId = ''
  let userEmail = ''
  try {
    const { data: { user }, error } = await admin.auth.getUser(token)
    if (error || !user) throw new Error('Unauthorized')
    userId = user.id
    userEmail = user.email ?? ''
  } catch {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let signals: Signal[] = []
  try {
    const context = await assembleLeoContext(userId, userEmail)
    signals = deriveSignals(context)
  } catch (e) {
    console.error('Leo welcome context assembly failed:', e)
  }

  const since = new Date()
  since.setDate(since.getDate() - ROTATION_WINDOW_DAYS)

  const { data: recentLog, error: logErr } = await admin
    .from('leo_welcome_message_log')
    .select('message_key')
    .eq('user_id', userId)
    .gte('shown_at', since.toISOString())

  if (logErr) console.error('Leo welcome log lookup failed:', logErr)
  const recentlyShown = new Set((recentLog ?? []).map((r: any) => r.message_key))

  const severityRank: Record<string, number> = { critical: 3, warn: 2, info: 1 }
  // Critical signals stay unresolved regardless of whether the user has already
  // been told once — the 7-day rotation only applies to warn/info, so a critical
  // alert doesn't go quiet for a week while it's still outstanding.
  const eligibleSignals = signals
    .filter((s) => s.severity === 'critical' || !recentlyShown.has(s.message_key))
    .sort((a, b) => (severityRank[b.severity] ?? 0) - (severityRank[a.severity] ?? 0))

  let chosen: Signal
  if (eligibleSignals.length > 0) {
    chosen = eligibleSignals[0]
  } else {
    const unseenTips = STATIC_TIPS.filter((t) => !recentlyShown.has(t.key))
    const tipPool = unseenTips.length > 0 ? unseenTips : STATIC_TIPS
    const tip = tipPool[Math.floor(Math.random() * tipPool.length)]
    chosen = { message_key: tip.key, module_name: null, severity: 'info', message: tip.message, action_url: null }
  }

  const { error: insertErr } = await admin.from('leo_welcome_message_log').insert({
    user_id: userId,
    message_key: chosen.message_key,
    module_name: chosen.module_name,
  })
  if (insertErr) console.error('Failed to log Leo welcome message:', insertErr)

  return new Response(
    JSON.stringify({
      message: chosen.message,
      severity: chosen.severity,
      module: chosen.module_name,
      action_url: chosen.action_url,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  )
}
