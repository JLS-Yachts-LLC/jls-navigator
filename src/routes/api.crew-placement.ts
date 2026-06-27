/**
 * Crew Placement document generation (authenticated, bearer).
 *   POST /api/crew-placement { action: 'contract-pdf', id }  -> fill contract template -> PDF
 *   POST /api/crew-placement { action: 'payslip-pdf',  id }  -> compute payroll + fill payslip -> PDF
 * PDFs are stored in the crew-docs bucket (generated/) and returned as a signed URL.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { buildTextPdf, fillTemplate } from '@/lib/crew-placement/pdf.server'

const db = () => supabaseAdmin as any
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })
const money = (n: any) => n == null ? '' : Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const sumLines = (arr: any) => Array.isArray(arr) ? arr.reduce((s: number, l: any) => s + (Number(l?.amount) || 0), 0) : 0
const listLines = (arr: any) => Array.isArray(arr) && arr.length ? arr.map((l: any) => `  - ${l.label ?? 'Item'}: ${money(l.amount)}`).join('\n') : '  - none'

const DEFAULT_CONTRACT = `SEAFARER EMPLOYMENT AGREEMENT

Crew: {{crew_name}}    Rank: {{rank}}    Nationality: {{nationality}}
Vessel: {{vessel_name}}    Flag: {{vessel_flag}}
Start: {{start_date}}    End: {{end_date}}    Rotation: {{rotation}}
Salary: {{salary}} {{currency}} per month
Contract type: {{contract_type}}

This agreement is made between the Employer (JLS Yachts LLC) and the Seafarer named
above under the terms of the MLC 2006.`

const DEFAULT_PAYSLIP = `PAYSLIP — {{period}}

Crew: {{crew_name}}    Rank: {{rank}}
Vessel: {{vessel_name}}

Gross: {{gross}} {{currency}}
Additions:
{{additions}}
Deductions:
{{deductions}}

NET PAY: {{net}} {{currency}}`

async function signedUrl(path: string): Promise<string> {
  const { data } = await db().storage.from('crew-docs').createSignedUrl(path, 60 * 60)
  return data?.signedUrl ?? ''
}

export async function crewPlacementHandler(request: Request): Promise<Response> {
  const auth = request.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return json({ ok: false, error: 'Unauthorized' }, 401)
  const { data: { user }, error: authErr } = await db().auth.getUser(auth.slice(7))
  if (authErr || !user) return json({ ok: false, error: 'Unauthorized' }, 401)

  let body: any = {}
  try { body = await request.json() } catch { /* empty */ }
  const { action, id } = body
  const sb = db()

  try {
    if (action === 'contract-pdf') {
      const { data: c } = await sb.from('crew_contracts')
        .select('*, crew:placed_crew(full_name, rank, nationality), yacht:yachts(vessel_name, flag), template:crew_placement_templates(name, body)')
        .eq('id', id).maybeSingle()
      if (!c) return json({ ok: false, error: 'Contract not found' }, 404)
      const values = {
        crew_name: c.crew?.full_name, rank: c.crew?.rank, nationality: c.crew?.nationality,
        vessel_name: c.yacht?.vessel_name, vessel_flag: c.yacht?.flag,
        start_date: c.start_date ?? '', end_date: c.end_date ?? '', rotation: c.rotation ?? '',
        salary: money(c.salary), currency: c.currency ?? '', contract_type: c.contract_type ?? '',
      }
      const text = fillTemplate(c.template?.body || DEFAULT_CONTRACT, values)
      const pdf = await buildTextPdf(c.template?.name || 'Crew Contract', text)
      const path = `generated/contract-${c.id}.pdf`
      await sb.storage.from('crew-docs').upload(path, pdf, { contentType: 'application/pdf', upsert: true })
      await sb.from('crew_contracts').update({ pdf_path: path }).eq('id', c.id)
      return json({ ok: true, url: await signedUrl(path) })
    }

    if (action === 'payslip-pdf') {
      const { data: p } = await sb.from('crew_payslips')
        .select('*, crew:placed_crew(full_name, rank, yacht:yachts(vessel_name)), template:crew_placement_templates(name, body)')
        .eq('id', id).maybeSingle()
      if (!p) return json({ ok: false, error: 'Payslip not found' }, 404)
      // Payroll calculation: net = gross + additions − deductions.
      const gross = Number(p.gross) || 0
      const net = gross + sumLines(p.additions) - sumLines(p.deductions)
      const period = p.period_month ? new Date(p.period_month).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : ''
      const values = {
        crew_name: p.crew?.full_name, rank: p.crew?.rank, vessel_name: p.crew?.yacht?.vessel_name,
        period, gross: money(gross), net: money(net), currency: p.currency ?? '',
        additions: listLines(p.additions), deductions: listLines(p.deductions),
      }
      const text = fillTemplate(p.template?.body || DEFAULT_PAYSLIP, values)
      const pdf = await buildTextPdf(p.template?.name || 'Payslip', text)
      const path = `generated/payslip-${p.id}.pdf`
      await sb.storage.from('crew-docs').upload(path, pdf, { contentType: 'application/pdf', upsert: true })
      await sb.from('crew_payslips').update({ pdf_path: path, net, status: p.status === 'draft' ? 'issued' : p.status }).eq('id', p.id)
      return json({ ok: true, url: await signedUrl(path), net })
    }

    return json({ ok: false, error: 'Unknown action' }, 400)
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e) }, 500)
  }
}
