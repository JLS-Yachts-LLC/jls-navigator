/**
 * Visa reports — Tickets #180, #181, #192
 *
 *   GET /api/visa/reports/pipeline           — all UAE applications (filterable)
 *   GET /api/visa/reports/pipeline?format=csv — CSV export (#192)
 *   GET /api/visa/reports/expiry?days=N      — UAE visas expiring within N days
 *   GET /api/visa/reports/expiry?format=csv  — CSV export (#192)
 *
 * Reconciliation notes: country_code 'AE'; crew via crew_member_id; vessel via
 * yacht_id -> yachts(vessel_name). requireAccess gates with module view level.
 * PDF export (#191, P1) is not implemented here — CSV is provided.
 */

import { createClient } from '@supabase/supabase-js'
import { requireAccess } from '@/lib/auth/requireAccess.server'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function admin() {
  return createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
    auth: { persistSession: false },
  })
}

function addDays(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function csvResponse(rows: string[][], filename: string): Response {
  const body = rows.map((r) => r.map(csvCell).join(',')).join('\r\n')
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

const SELECT = `
  id, status, country_code, visa_issue_date, visa_expiry_date, visa_renewed,
  expiry_flags_sent, vessel_name, created_at, updated_at,
  crew_members ( id, full_name ),
  yachts ( id, vessel_name ),
  visa_expiry_flags ( flag_type, flagged_at, suppressed )
`

export async function visaReportsHandler(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const access = await requireAccess(request, { module: 'crew_immigration', level: 'view' })
  if (!access.ok) return access.response

  const sb = admin()
  const format = url.searchParams.get('format')

  // ── pipeline ────────────────────────────────────────────────────────────────
  if (url.pathname.endsWith('/pipeline')) {
    const statusFilter = url.searchParams.get('status')
    const vesselFilter = url.searchParams.get('vessel_id') // maps to yacht_id
    const expiryFilter = url.searchParams.get('expiry')    // '30d' | '10wd' | '5wd'

    let q = sb.from('visa_applications').select(SELECT)
      .eq('country_code', 'AE')
      .order('created_at', { ascending: false })
    if (statusFilter) q = q.eq('status', statusFilter)
    if (vesselFilter) q = q.eq('yacht_id', vesselFilter)

    const { data, error } = await q
    if (error) return json({ error: 'Report fetch failed' }, 500)

    let rows = (data ?? []) as any[]
    if (expiryFilter) {
      const wanted = expiryFilter === '5wd' ? '5_working_day'
        : expiryFilter === '10wd' ? '10_working_day'
        : expiryFilter === '30d' ? '30_day' : null
      if (wanted) {
        rows = rows.filter((a) => (a.visa_expiry_flags ?? []).some((f: any) => !f.suppressed && f.flag_type === wanted))
      }
    }

    if (format === 'csv') {
      const out: string[][] = [['Crew member', 'Vessel', 'Status', 'Issue date', 'Expiry date', 'Renewed']]
      for (const a of rows) {
        out.push([
          a.crew_members?.full_name ?? '',
          a.yachts?.vessel_name ?? a.vessel_name ?? '',
          a.status, a.visa_issue_date ?? '', a.visa_expiry_date ?? '',
          a.visa_renewed ? 'yes' : 'no',
        ])
      }
      return csvResponse(out, 'uae-visa-pipeline.csv')
    }

    return json({ applications: rows, total: rows.length })
  }

  // ── expiry ────────────────────────────────────────────────────────────────────
  if (url.pathname.endsWith('/expiry')) {
    const days = Math.max(1, Math.min(365, parseInt(url.searchParams.get('days') ?? '90', 10) || 90))
    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await sb.from('visa_applications').select(SELECT)
      .eq('country_code', 'AE')
      .eq('status', 'approved')
      .eq('visa_renewed', false)
      .gte('visa_expiry_date', today)
      .lte('visa_expiry_date', addDays(days))
      .order('visa_expiry_date', { ascending: true })

    if (error) return json({ error: 'Expiry report failed' }, 500)
    const rows = (data ?? []) as any[]

    if (format === 'csv') {
      const out: string[][] = [['Crew member', 'Vessel', 'Expiry date']]
      for (const a of rows) {
        out.push([a.crew_members?.full_name ?? '', a.yachts?.vessel_name ?? a.vessel_name ?? '', a.visa_expiry_date ?? ''])
      }
      return csvResponse(out, 'uae-visa-expiry.csv')
    }

    return json({ expiring: rows, window_days: days, total: rows.length })
  }

  return json({ error: 'Not found' }, 404)
}
