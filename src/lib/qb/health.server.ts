/**
 * QuickBooks pipeline health — reconciliation + monitoring.
 *
 * RECONCILER (5-min cron): the durable last line of defence for branded document
 * generation. Compares OUR OWN database — every synced JLS invoice / pro-forma /
 * quotation — against the doc-gen state tables, and runs doc-gen for anything the
 * webhook, its sweeper AND the sync backstop all missed. Because it works from
 * persisted rows there is no time window to fall out of: a missed document stays
 * a candidate until its PDF is confirmed.
 *
 * HEALTH MONITOR (hourly cron): detects the failure modes that used to be silent
 * and raises them in the Automations run log + an email alert:
 *   - a QuickBooks company token that failed to refresh / is close to expiry
 *   - sync errors recorded in qbo_sync_state
 *   - webhook events stuck at max retry attempts
 *   - webhook silence (no hits) while documents are clearly changing
 */
import { createClient } from '@supabase/supabase-js'
import { qboConfigured } from './qbo.server'
import { JLS_REALM } from './sync.server'
import { logAutomationRun } from '@/lib/automations.server'

function admin() {
  return createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { auth: { persistSession: false } })
}

const ALERT_TO = () => (process.env.QB_HEALTH_ALERT_TO ?? 'mattpeeters@newhorizon-it.co.uk').split(/[,;\s]+/).filter(Boolean)

// ── Reconciler ─────────────────────────────────────────────────────────────────

/** Docs synced in the last 48 h whose doc-gen state is older than the doc row.
 *  Runs up to `cap` doc-gens per tick; after each attempt the state row is
 *  stamped so a candidate is retried only when it actually changes again. */
export async function docgenReconcile(cap = 5): Promise<string[]> {
  try {
    return await docgenReconcileInner(cap)
  } catch (e: any) {
    // A crash here must be VISIBLE — this is the last line of defence.
    await logAutomationRun({
      key: 'qb-docgen-reconcile', name: 'QB Doc-Gen Reconciler (safety net)', source: 'worker', trigger_type: 'schedule', category: 'Finance',
      status: 'error', detail: `reconciler crashed: ${String(e?.message ?? e).slice(0, 500)}`,
    }).catch(() => { /* even the log is best-effort */ })
    return [`ERR ${String(e?.message ?? e).slice(0, 200)}`]
  }
}

async function docgenReconcileInner(cap: number): Promise<string[]> {
  if (!qboConfigured()) return []
  const sb = admin() as any
  const out: string[] = []

  // Respect the toggles — never generate documents that are switched off.
  const { data: autos } = await sb.from('automations').select('key, enabled')
    .in('key', ['qb-invoice-pdf', 'qb-estimate-doc', 'qb-proforma-doc'])
  const on = new Map<string, boolean>((autos ?? []).map((a: any) => [a.key, !!a.enabled]))

  const since = new Date(Date.now() - 48 * 3600_000).toISOString()
  const { data: docs } = await sb.from('qbo_invoices')
    .select('qbo_id, doc_type, doc_number, synced_at')
    .eq('realm_id', JLS_REALM).in('doc_type', ['invoice', 'proforma', 'estimate'])
    .gte('synced_at', since).order('synced_at', { ascending: false }).limit(300)
  if (!docs?.length) return []

  // Doc-gen state for those docs, in one query per table.
  const invIds = docs.filter((d: any) => d.doc_type === 'invoice').map((d: any) => d.qbo_id)
  const otherIds = docs.filter((d: any) => d.doc_type !== 'invoice').map((d: any) => d.qbo_id)
  const { data: pdfState } = invIds.length
    ? await sb.from('qbo_invoice_pdf_state').select('qbo_id, updated_at').in('qbo_id', invIds)
    : { data: [] }
  const { data: docLogs } = otherIds.length
    ? await sb.from('qbo_doc_logs').select('doc_id, doc_type, updated_at').in('doc_id', otherIds)
    : { data: [] }
  const stateAt = new Map<string, string>()
  for (const r of pdfState ?? []) stateAt.set(`invoice:${r.qbo_id}`, r.updated_at)
  for (const r of docLogs ?? []) stateAt.set(`${String(r.doc_type).toLowerCase() === 'estimate' ? 'estimate' : 'proforma'}:${r.doc_id}`, r.updated_at)

  // Candidates: doc row is newer than its doc-gen state (2-min tolerance for the
  // attach→sync race), or has no state at all.
  const TOL = 2 * 60_000
  const candidates = docs.filter((d: any) => {
    const key = `${d.doc_type}:${d.qbo_id}`
    const toggleKey = d.doc_type === 'invoice' ? 'qb-invoice-pdf' : d.doc_type === 'proforma' ? 'qb-proforma-doc' : 'qb-estimate-doc'
    if (!on.get(toggleKey)) return false
    const st = stateAt.get(key)
    return !st || new Date(d.synced_at).getTime() > new Date(st).getTime() + TOL
  }).slice(0, cap)

  for (const d of candidates) {
    const label = `${d.doc_type} ${d.doc_number ?? d.qbo_id}`
    try {
      let result = ''
      if (d.doc_type === 'invoice') {
        const { generateAndAttachInvoicePdf } = await import('./invoice-doc.server')
        const r = await generateAndAttachInvoicePdf(d.qbo_id)
        result = r.action
        // Stamp the state so an unchanged doc doesn't stay a candidate. (An attach
        // already re-stamped it inside the doc-gen itself.)
        if (r.action === 'skipped') {
          await sb.from('qbo_invoice_pdf_state').update({ updated_at: new Date().toISOString() }).eq('qbo_id', d.qbo_id)
        }
      } else {
        const runner = d.doc_type === 'proforma'
          ? (await import('./proforma-docgen.server')).runProformaDocgen
          : (await import('./estimate-docgen.server')).runEstimateDocgen
        result = await runner(d.qbo_id, `qbo.${d.doc_type}.update.reconcile`)
        if (result.startsWith('skip')) {
          await sb.from('qbo_doc_logs').update({ updated_at: new Date().toISOString() })
            .eq('doc_type', d.doc_type === 'estimate' ? 'Estimate' : 'Pro-Forma').eq('doc_id', d.qbo_id)
        }
      }
      if (!result.startsWith('skip') && result !== 'skipped' && !result.startsWith('docgen-disabled')) {
        out.push(`${label}: ${result}`)
      }
    } catch (e: any) {
      out.push(`${label}: ERR ${String(e?.message ?? e).slice(0, 180)}`)
    }
  }

  if (out.length) {
    await logAutomationRun({
      key: 'qb-docgen-reconcile', name: 'QB Doc-Gen Reconciler (safety net)', source: 'worker', trigger_type: 'schedule', category: 'Finance',
      status: out.some((s) => s.includes('ERR')) ? 'error' : 'success', detail: out.join('; ').slice(0, 1900),
    })
  }
  return out
}

// ── Health monitor ─────────────────────────────────────────────────────────────

export async function qbHealthCheck(): Promise<string[]> {
  if (!qboConfigured()) return []
  const sb = admin() as any
  const problems: string[] = []
  const now = Date.now()

  // 1. Company tokens: refresh failing (stale updated_at) or refresh token nearing expiry.
  const { data: tokens } = await sb.from('qbo_tokens').select('realm_id, updated_at, access_expires_at, refresh_expires_at')
  for (const t of tokens ?? []) {
    const who = t.realm_id === JLS_REALM ? 'JLS Yachts' : `company ${t.realm_id}`
    if (t.refresh_expires_at && new Date(t.refresh_expires_at).getTime() < now + 14 * 86400000) {
      problems.push(`${who}: QuickBooks connection expires ${new Date(t.refresh_expires_at).toLocaleDateString('en-GB')} — reconnect via /api/qb/connect before then`)
    }
    if (t.updated_at && now - new Date(t.updated_at).getTime() > 24 * 3600_000) {
      problems.push(`${who}: token not refreshed in >24h — the connection may be broken (check All Runs for invalid_grant errors)`)
    }
  }

  // 2. Sync errors.
  const { data: syncStates } = await sb.from('qbo_sync_state').select('realm_id, last_error, last_run_at')
  for (const s of syncStates ?? []) {
    if (s.last_error) problems.push(`Sync (${s.realm_id === JLS_REALM ? 'JLS' : 'Waypoint'}): ${String(s.last_error).slice(0, 200)}`)
    if (s.last_run_at && now - new Date(s.last_run_at).getTime() > 30 * 60_000) {
      problems.push(`Sync (${s.realm_id === JLS_REALM ? 'JLS' : 'Waypoint'}): hasn't run in >30 min — cron may be stalled`)
    }
  }

  // 3. Webhook events stuck at max attempts (sweeper gave up).
  const { data: stuck } = await sb.from('qb_webhook_events').select('id', { count: 'exact', head: false })
    .eq('forwarded', false).gte('attempts', 12).gte('received_at', new Date(now - 7 * 86400000).toISOString()).limit(1)
  const stuckCount = (stuck ?? []).length
  if (stuckCount) problems.push(`${stuckCount}+ webhook event(s) exhausted their retries — check the QuickBooks Webhook run log`)

  // 4. Webhook silence: documents changed recently but no webhook hit in 6+ hours —
  //    Intuit has probably suspended delivery (re-save the endpoint in the portal).
  //    Doc-gen still works via the sync backstop, but instant processing is degraded.
  const { data: lastHit } = await sb.from('automation_runs').select('started_at')
    .eq('automation_key', 'qb-webhook').order('started_at', { ascending: false }).limit(1)
  const { data: recentDocs } = await sb.from('qbo_invoices').select('qbo_id')
    .gte('synced_at', new Date(now - 3 * 3600_000).toISOString()).limit(1)
  const lastHitAt = lastHit?.[0]?.started_at ? new Date(lastHit[0].started_at).getTime() : 0
  if ((recentDocs ?? []).length && lastHitAt && now - lastHitAt > 6 * 3600_000) {
    problems.push(`No QuickBooks webhook activity for ${Math.round((now - lastHitAt) / 3600_000)}h while documents are changing — Intuit delivery looks suspended; re-save the webhook in the Intuit Developer portal (documents still attach via the 5-min backstop)`)
  }

  if (problems.length) {
    await logAutomationRun({
      key: 'qb-health', name: 'QuickBooks Health Monitor', source: 'worker', trigger_type: 'schedule', category: 'Finance',
      status: 'error', detail: problems.join(' | ').slice(0, 1900),
    })
    // Email alert, at most once per 6 hours (don't spam on a persistent condition).
    const { data: lastAlert } = await sb.from('automation_runs').select('started_at')
      .eq('automation_key', 'qb-health-alert').order('started_at', { ascending: false }).limit(1)
    const lastAlertAt = lastAlert?.[0]?.started_at ? new Date(lastAlert[0].started_at).getTime() : 0
    if (now - lastAlertAt > 6 * 3600_000) {
      try {
        const { sendGraphEmail } = await import('@/lib/graph-mail.server')
        await sendGraphEmail({
          to: ALERT_TO(),
          subject: `Polaris — QuickBooks pipeline needs attention (${problems.length} issue${problems.length > 1 ? 's' : ''})`,
          html: `<p>The hourly QuickBooks health check found:</p><ul>${problems.map((p) => `<li>${p}</li>`).join('')}</ul><p>Details: Polaris → Automations → All Runs.</p>`,
        })
        await logAutomationRun({ key: 'qb-health-alert', name: 'QuickBooks Health Alert (email)', source: 'worker', trigger_type: 'schedule', category: 'Finance', status: 'success', detail: `alerted ${ALERT_TO().join(', ')}: ${problems.length} issue(s)` })
      } catch { /* mail is best-effort; the run-log error above always lands */ }
    }
  } else {
    // A quiet heartbeat so "Last run" shows the monitor is alive (success, no detail spam).
    await logAutomationRun({ key: 'qb-health', name: 'QuickBooks Health Monitor', source: 'worker', trigger_type: 'schedule', category: 'Finance', status: 'success', detail: 'all checks passed' })
  }
  return problems
}
