/**
 * Weekly Fleet Finance email — outstanding QuickBooks balances per yacht.
 *
 * Runs Monday mornings from the worker cron, gated by the `weekly-fleet-finance`
 * row in the automations registry: the toggle (enabled) and the recipient list
 * (config.recipients) are both editable on the Developer → Automations page.
 * Also runnable on demand via /sp-hook?run=fleet-finance for testing.
 */
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/ses.server'

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
}

const fmt = (n: number) => n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export async function runWeeklyFleetFinance(opts: { force?: boolean } = {}): Promise<{ sent: number; yachts: number; outstanding: number; note?: string }> {
  const sb = admin()

  // Gate on the automation toggle + recipients (both set on the Automations page).
  const { data: auto } = await sb.from('automations').select('enabled, config').eq('key', 'weekly-fleet-finance').maybeSingle()
  if (!opts.force && !auto?.enabled) return { sent: 0, yachts: 0, outstanding: 0, note: 'disabled — enable it on the Automations page' }
  const recipients: string[] = (((auto?.config as any)?.recipients ?? []) as string[]).filter((e) => /.+@.+\..+/.test(String(e)))
  if (!recipients.length) return { sent: 0, yachts: 0, outstanding: 0, note: 'no recipients configured on the Automations page' }

  // Yachts + customer mapping.
  const { data: yachts } = await sb.from('yachts').select('id, vessel_name, qbo_customer_id').eq('archive', false)
  const custToYacht = new Map<string, string>()
  const nameOf = new Map<string, string>()
  for (const y of (yachts ?? []) as any[]) {
    nameOf.set(y.id, y.vessel_name ?? 'Unnamed')
    if (y.qbo_customer_id) custToYacht.set(String(y.qbo_customer_id), y.id)
  }

  // Unpaid invoice balances (paged past the 1000-row cap).
  type Agg = { total: number; count: number; oldestDue: string | null }
  const agg = new Map<string, Agg>()
  for (let from = 0; ; from += 1000) {
    const { data: inv } = await sb.from('qbo_invoices')
      .select('yacht_id, customer_ref, balance, due_date')
      .eq('doc_type', 'invoice').gt('balance', 0)
      .range(from, from + 999)
    for (const d of (inv ?? []) as any[]) {
      const yid = d.yacht_id ?? (d.customer_ref ? custToYacht.get(String(d.customer_ref)) : undefined)
      if (!yid || !nameOf.has(yid)) continue
      const a = agg.get(yid) ?? { total: 0, count: 0, oldestDue: null }
      a.total += Number(d.balance ?? 0)
      a.count++
      if (d.due_date && (!a.oldestDue || d.due_date < a.oldestDue)) a.oldestDue = d.due_date
      agg.set(yid, a)
    }
    if (!inv || inv.length < 1000) break
  }

  const rows = [...agg.entries()]
    .map(([yid, a]) => ({ name: nameOf.get(yid)!, ...a }))
    .sort((a, b) => b.total - a.total)
  const fleetTotal = rows.reduce((s, r) => s + r.total, 0)
  const fleetCount = rows.reduce((s, r) => s + r.count, 0)

  const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const trs = rows.map((r, i) => `
    <tr style="background:${i % 2 ? '#f8fafc' : '#fff'}">
      <td style="padding:6px 12px;font-weight:600;">${esc(r.name)}</td>
      <td style="padding:6px 12px;text-align:right;tab-size:4;">${r.count}</td>
      <td style="padding:6px 12px;text-align:right;font-weight:600;color:#b91c1c;">AED ${fmt(r.total)}</td>
      <td style="padding:6px 12px;color:#6b7280;">${r.oldestDue ? new Date(r.oldestDue).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
    </tr>`).join('')

  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:680px">
    <h2 style="margin:0 0 4px;font-size:17px">Fleet Finance — Outstanding Balances</h2>
    <p style="margin:0 0 14px;color:#6b7280;font-size:12.5px">Week of ${dateStr} · from QuickBooks, matched per yacht</p>
    <div style="display:flex;gap:24px;margin:0 0 16px">
      <div><div style="font-size:11px;color:#6b7280;text-transform:uppercase">Fleet outstanding</div><div style="font-size:20px;font-weight:700;color:#b91c1c">AED ${fmt(fleetTotal)}</div></div>
      <div><div style="font-size:11px;color:#6b7280;text-transform:uppercase">Unpaid invoices</div><div style="font-size:20px;font-weight:700">${fleetCount}</div></div>
      <div><div style="font-size:11px;color:#6b7280;text-transform:uppercase">Yachts with debt</div><div style="font-size:20px;font-weight:700">${rows.length}</div></div>
    </div>
    <table style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #e5e7eb">
      <tr style="background:#0d1b2a;color:#fff;text-align:left">
        <th style="padding:7px 12px;font-size:11px;text-transform:uppercase">Yacht</th>
        <th style="padding:7px 12px;font-size:11px;text-transform:uppercase;text-align:right">Invoices</th>
        <th style="padding:7px 12px;font-size:11px;text-transform:uppercase;text-align:right">Outstanding</th>
        <th style="padding:7px 12px;font-size:11px;text-transform:uppercase">Oldest due</th>
      </tr>
      ${trs || '<tr><td colspan="4" style="padding:12px;text-align:center;color:#6b7280">No outstanding balances 🎉</td></tr>'}
    </table>
    <p style="margin:14px 0 0;color:#94a3b8;font-size:11.5px">Sent weekly by Polaris · toggle or edit recipients under Developer → Automations.</p>
  </div>`

  await sendEmail({
    to: recipients,
    subject: `Fleet Finance: AED ${fmt(fleetTotal)} outstanding across ${rows.length} yachts`,
    html,
    text: `Fleet outstanding: AED ${fmt(fleetTotal)} across ${rows.length} yachts (${fleetCount} unpaid invoices).\n\n` +
      rows.map((r) => `- ${r.name}: AED ${fmt(r.total)} (${r.count})`).join('\n'),
  })

  return { sent: recipients.length, yachts: rows.length, outstanding: Math.round(fleetTotal) }
}
