/**
 * Crew Placement document generation (authenticated, bearer).
 *   POST /api/crew-placement { action: 'contract-pdf', id }  -> fill contract template -> PDF
 *   POST /api/crew-placement { action: 'payslip-pdf',  id }  -> compute payroll + fill payslip -> PDF
 * PDFs are stored in the crew-docs bucket (generated/) and returned as a signed URL.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { buildContractPdf, buildPayslipPdf, fillTemplate } from '@/lib/crew-placement/pdf.server'

const db = () => supabaseAdmin as any
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })
const money = (n: any) => n == null ? '' : Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const sumLines = (arr: any) => Array.isArray(arr) ? arr.reduce((s: number, l: any) => s + (Number(l?.amount) || 0), 0) : 0

const DEFAULT_CONTRACT = `SEAFARER EMPLOYMENT AGREEMENT

Crew: {{crew_name}}    Rank: {{rank}}    Nationality: {{nationality}}
Vessel: {{vessel_name}}    Flag: {{vessel_flag}}
Start: {{start_date}}    End: {{end_date}}    Rotation: {{rotation}}
Salary: {{salary}} {{currency}} per month
Contract type: {{contract_type}}

This agreement is made between the Employer (JLS Yachts LLC) and the Seafarer named
above under the terms of the MLC 2006.`

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
      const pdf = await buildContractPdf(c.template?.name || 'Seafarer Employment Agreement', text, {
        docRef: c.contract_type ? `Ref: ${String(c.contract_type).toUpperCase()}` : undefined,
        date: c.start_date ? `Dated: ${new Date(c.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}` : undefined,
        signature: true,
      })
      const path = `generated/contract-${c.id}.pdf`
      await sb.storage.from('crew-docs').upload(path, pdf, { contentType: 'application/pdf', upsert: true })
      await sb.from('crew_contracts').update({ pdf_path: path }).eq('id', c.id)
      return json({ ok: true, url: await signedUrl(path) })
    }

    if (action === 'payslip-pdf') {
      const { data: p } = await sb.from('crew_payslips')
        .select('*, crew:placed_crew(id, full_name, rank, department, nationality, yacht:yachts(vessel_name))')
        .eq('id', id).maybeSingle()
      if (!p) return json({ ok: false, error: 'Payslip not found' }, 404)
      // Payroll calculation: net = gross + additions − deductions.
      const gross = Number(p.gross) || 0
      const additions = Array.isArray(p.additions) ? p.additions : []
      const deductions = Array.isArray(p.deductions) ? p.deductions : []
      const net = gross + sumLines(additions) - sumLines(deductions)
      const period = p.period_month ? new Date(p.period_month).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : ''
      // Bank details for the payment block (best-effort).
      const { data: bank } = await sb.from('placed_crew_bank')
        .select('account_holder, bank_name, bank_country, iban, bic')
        .eq('placed_crew_id', p.crew?.id).maybeSingle()
      const pdf = await buildPayslipPdf({
        crewName: p.crew?.full_name ?? 'Crew',
        rank: p.crew?.rank ?? undefined,
        department: p.crew?.department ?? undefined,
        nationality: p.crew?.nationality ?? undefined,
        vesselName: p.crew?.yacht?.vessel_name ?? undefined,
        period,
        currency: p.currency ?? 'USD',
        issuedDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        basic: gross,
        additions: additions.map((l: any) => ({ label: String(l?.label ?? 'Addition'), amount: Number(l?.amount) || 0 })),
        deductions: deductions.map((l: any) => ({ label: String(l?.label ?? 'Deduction'), amount: Number(l?.amount) || 0 })),
        bank: bank ? { holder: bank.account_holder, bankName: bank.bank_name, country: bank.bank_country, iban: bank.iban, bic: bank.bic } : undefined,
      })
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
