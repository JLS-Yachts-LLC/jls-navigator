/**
 * Client-portal Owner's brief — one month of the vessel at a glance.
 *
 *   GET /api/portal/brief?month=YYYY-MM → { month, note, spend, compliance, timeline[], ahead }
 *
 * Everything but the note is worked out live from the vessel's own records:
 * spend from QuickBooks (only for positions that see the accounts, and only
 * when the vessel has Invoices & balances on), compliance from permits, visas
 * and passports, "what happened" from requests, orders, crew changes,
 * deliveries and — with On board — jobs, drills and charters. The note (the
 * agent's headline and summary) comes from portal_owner_briefs; clients only
 * see it once published, staff preview sees drafts too.
 *
 * Served with the service role, hard-filtered to the vessel resolved from the
 * caller's JWT.
 */
import { createClient } from '@supabase/supabase-js'
import { resolvePortalYacht, portalModulesFor } from '@/lib/portal/portal-auth.server'
import { canSeeFinance, hiddenSections } from '@/lib/portal/portal-positions'
import { sectionEnabled } from '@/lib/portal/portal-modules'
import { resolveCustomerId } from './api.portal.finance'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}

const ql = (s: string) => s.replace(/'/g, "\\'")
const iso = (d: Date) => d.toISOString().slice(0, 10)
const nice = (s: string | null | undefined) => (s ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
const DONE = ['completed', 'resolved', 'closed']

type TimelineEntry = { date: string; title: string; detail: string | null; kind: string }
type Expiring = { date: string; title: string; kind: string }

/** The vessel's dated papers — the cruising permit, other permits, crew visas and passports. */
async function complianceItems(sb: any, yachtId: string): Promise<Expiring[]> {
  const since = iso(new Date(Date.now() - 60 * 86400000)) // lapsed in the last 60 days still counts
  const [y, permits, visas, crew]: any[] = await Promise.all([
    sb.from('yachts').select('cruising_permit_expiry').eq('id', yachtId).maybeSingle(),
    sb.from('permits').select('permit_type, expiry_date, status').eq('yacht_id', yachtId).gte('expiry_date', since).neq('status', 'cancelled'),
    sb.from('visa_applications').select('given_name, surname, visa_expiry').eq('yacht_id', yachtId).gte('visa_expiry', since),
    sb.from('crew_members').select('full_name, first_name, last_name, passport_expiry_date, status').eq('yacht_id', yachtId).not('passport_expiry_date', 'is', null),
  ])
  const out: Expiring[] = []
  const cp = y?.data?.cruising_permit_expiry
  if (cp && cp >= since) out.push({ date: cp, title: 'Cruising permit', kind: 'cruising' })
  for (const p of permits.data ?? []) {
    if (p.permit_type === 'gate_pass') continue // the SharePoint gate-pass rows aren't reliable — see gatepasses
    out.push({ date: p.expiry_date, title: nice(p.permit_type) || 'Permit', kind: 'permit' })
  }
  for (const v of visas.data ?? []) out.push({ date: v.visa_expiry, title: `${[v.given_name, v.surname].filter(Boolean).join(' ') || 'Crew'} · visa`, kind: 'visa' })
  for (const c of crew.data ?? []) {
    if (c.status && !['active', 'on_leave'].includes(c.status)) continue
    out.push({ date: c.passport_expiry_date, title: `${c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Crew'} · passport`, kind: 'passport' })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/** The month's and year-to-date spend from QuickBooks invoices, by category. */
async function spendFor(yacht: { qboCustomerId: string | null; vesselName: string }, start: Date, end: Date) {
  const customerId = await resolveCustomerId(yacht)
  if (!customerId) return { linked: false as const }
  const prevStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1))
  const yearStart = new Date(Date.UTC(start.getUTCFullYear(), 0, 1))
  const from = prevStart < yearStart ? prevStart : yearStart
  const { qboQuery } = await import('@/lib/qb/qbo.server')
  const res = await qboQuery(
    `select * from Invoice where CustomerRef = '${ql(customerId)}' and TxnDate >= '${iso(from)}' and TxnDate < '${iso(end)}' maxresults 1000`,
  )
  const invoices: any[] = res?.QueryResponse?.Invoice ?? []
  const inRange = (i: any, a: Date, b: Date) => i.TxnDate >= iso(a) && i.TxnDate < iso(b)
  const month = invoices.filter((i) => inRange(i, start, end))
  const sum = (list: any[]) => list.reduce((s, i) => s + Number(i.TotalAmt ?? 0), 0)

  // Category = the item's parent in QuickBooks ("Marina:Berthing" → Marina), else the item.
  const byCat = new Map<string, number>()
  for (const inv of month) {
    for (const line of inv.Line ?? []) {
      if (line.DetailType !== 'SalesItemLineDetail') continue
      const name = String(line.SalesItemLineDetail?.ItemRef?.name ?? 'Other')
      const cat = name.split(':')[0].trim() || 'Other'
      byCat.set(cat, (byCat.get(cat) ?? 0) + Number(line.Amount ?? 0))
    }
  }
  const sorted = [...byCat.entries()].map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount)
  const categories = sorted.length > 6
    ? [...sorted.slice(0, 5), { label: 'Other', amount: sorted.slice(5).reduce((s, c) => s + c.amount, 0) }]
    : sorted

  return {
    linked: true as const,
    currency: month[0]?.CurrencyRef?.value ?? invoices[0]?.CurrencyRef?.value ?? 'AED',
    month: sum(month),
    invoiceCount: month.length,
    previousMonth: sum(invoices.filter((i) => inRange(i, prevStart, start))),
    yearToDate: sum(invoices.filter((i) => inRange(i, yearStart, end))),
    categories,
    customerId,
  }
}

export async function portalBriefHandler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)
  const auth = await resolvePortalYacht(request)
  if (!auth.ok) return auth.response
  const { yacht } = auth
  if (!yacht.mfaVerified) return json({ error: 'Two-factor verification required' }, 403)
  const modules = await portalModulesFor(yacht.yachtId)
  const hidden = hiddenSections(yacht.position)
  if (hidden.has('brief') || !sectionEnabled('brief', modules)) return json({ error: "Today's brief isn't available to you." }, 403)
  const sees = (section: string) => !hidden.has(section) && sectionEnabled(section, modules)

  // Which month — default the last one (a brief is about a month that's over).
  const now = new Date()
  const param = new URL(request.url).searchParams.get('month') ?? ''
  const m = /^(\d{4})-(\d{2})$/.exec(param)
  const start = m
    ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1))
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  if (start > thisMonth || start < new Date(Date.UTC(now.getUTCFullYear() - 2, now.getUTCMonth(), 1))) {
    return json({ error: 'Pick a month from the last two years.' }, 400)
  }
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))
  const startIso = iso(start)
  const endIso = iso(end)
  const today = iso(now)
  const soon = iso(new Date(now.getTime() + 30 * 86400000))
  const sb: any = admin()
  const nameUpper = yacht.vesselName.toUpperCase()

  try {
    const [noteR, published, items, reqs, orders, quoteDecisions, signons, seaport, deliveries, pms, drills, charters, openReqs] = await Promise.all([
      sb.from('portal_owner_briefs').select('headline, summary, author_name, author_title, published_at, updated_at')
        .eq('yacht_id', yacht.yachtId).eq('month', startIso).maybeSingle(),
      sb.from('portal_owner_briefs').select('month').eq('yacht_id', yacht.yachtId).not('published_at', 'is', null),
      complianceItems(sb, yacht.yachtId),
      sb.from('captain_requests').select('reference, title, category, status, updated_at')
        .eq('yacht_id', yacht.yachtId).in('status', DONE).gte('updated_at', startIso).lt('updated_at', endIso).limit(100),
      sb.from('portal_orders').select('reference, title, category, lines, ordered_by_name, created_at')
        .eq('yacht_id', yacht.yachtId).gte('created_at', startIso).lt('created_at', endIso).limit(100),
      sb.from('portal_quote_decisions').select('doc_number, decision, total, currency, decided_by_name, created_at')
        .eq('yacht_id', yacht.yachtId).gte('created_at', startIso).lt('created_at', endIso).limit(100),
      sb.from('crew_signon_events').select('event_type, event_date, port, crew_members(full_name, first_name, last_name, rank)')
        .eq('yacht_id', yacht.yachtId).gte('event_date', startIso).lt('event_date', endIso).limit(100),
      sb.from('seaport_requests').select('request_date, status, completed_at')
        .eq('vessel_id', yacht.yachtId).gte('completed_at', startIso).lt('completed_at', endIso).limit(50),
      sb.from('shipsync_delivery_notes').select('number, delivered_at, status')
        .or(`yacht_id.eq.${yacht.yachtId},boat_name.eq.${nameUpper}`).gte('delivered_at', startIso).lt('delivered_at', endIso).limit(100),
      sees('pms')
        ? sb.from('pms_tasks').select('title, last_done_date').eq('yacht_id', yacht.yachtId).gte('last_done_date', startIso).lt('last_done_date', endIso).limit(100)
        : Promise.resolve({ data: [] }),
      sees('ism')
        ? sb.from('ism_drills').select('drill_type, conducted_at').eq('yacht_id', yacht.yachtId).gte('conducted_at', startIso).lt('conducted_at', endIso).limit(50)
        : Promise.resolve({ data: [] }),
      sees('charter')
        ? sb.from('charter_bookings').select('charter_ref, charterer_name, status, start_date, end_date, embark_port, disembark_port, guest_count')
            .eq('yacht_id', yacht.yachtId).neq('status', 'cancelled').lte('start_date', soon).gte('end_date', startIso).order('start_date')
        : Promise.resolve({ data: [] }),
      sb.from('captain_requests').select('reference, title, status, created_at')
        .eq('yacht_id', yacht.yachtId).not('status', 'in', `(${[...DONE, 'cancelled'].join(',')})`).order('created_at', { ascending: false }).limit(20),
    ]) as any[]

    // The note — clients see it once published; staff preview sees the draft.
    const n = noteR.data
    const note = n && (n.published_at || yacht.preview)
      ? { headline: n.headline, summary: n.summary, authorName: n.author_name, authorTitle: n.author_title, publishedAt: n.published_at, updatedAt: n.updated_at }
      : null

    // ── What happened ──
    const timeline: TimelineEntry[] = []
    for (const r of reqs.data ?? []) timeline.push({ date: r.updated_at.slice(0, 10), title: r.title || 'Request completed', detail: `${nice(r.category)} · ${r.reference ?? ''} completed`.replace(/ · $/, ''), kind: 'request' })
    for (const o of orders.data ?? []) {
      const lines = Array.isArray(o.lines) ? o.lines.length : 0
      timeline.push({ date: o.created_at.slice(0, 10), title: `Order placed · ${o.title}`, detail: [o.reference, lines ? `${lines} item${lines === 1 ? '' : 's'}` : null, o.ordered_by_name ? `by ${o.ordered_by_name}` : null].filter(Boolean).join(' · '), kind: 'order' })
    }
    if (canSeeFinance(yacht.position)) {
      for (const q of quoteDecisions.data ?? []) {
        const verb = q.decision === 'approved' ? 'approved' : q.decision === 'declined' ? 'declined' : 'queried'
        timeline.push({ date: q.created_at.slice(0, 10), title: `Quotation ${q.doc_number ?? ''} ${verb}`.replace('  ', ' '), detail: [q.total != null ? `${q.currency ?? 'AED'} ${Number(q.total).toLocaleString('en-GB', { maximumFractionDigits: 0 })}` : null, q.decided_by_name ? `by ${q.decided_by_name}` : null].filter(Boolean).join(' · ') || null, kind: 'quote' })
      }
    }
    for (const s of signons.data ?? []) {
      const c = s.crew_members ?? {}
      const who = c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Crew member'
      timeline.push({ date: s.event_date, title: `${who} ${s.event_type === 'sign_on' ? 'signed on' : 'signed off'}`, detail: [c.rank, s.port].filter(Boolean).join(' · ') || null, kind: 'crew' })
    }
    for (const s of seaport.data ?? []) timeline.push({ date: s.completed_at.slice(0, 10), title: 'Seaport crew request completed', detail: null, kind: 'crew' })
    const delivered = (deliveries.data ?? []).filter((d: any) => d.delivered_at)
    if (delivered.length) {
      // One line per day — a busy day of deliveries reads better folded.
      const byDay = new Map<string, number>()
      for (const d of delivered) { const k = d.delivered_at.slice(0, 10); byDay.set(k, (byDay.get(k) ?? 0) + 1) }
      for (const [date, count] of byDay) timeline.push({ date, title: count === 1 ? 'Delivery to the vessel' : `${count} deliveries to the vessel`, detail: 'Signed for on board', kind: 'delivery' })
    }
    for (const t of pms.data ?? []) timeline.push({ date: t.last_done_date, title: t.title, detail: 'Maintenance job done', kind: 'job' })
    for (const d of drills.data ?? []) timeline.push({ date: d.conducted_at, title: `${nice(d.drill_type)} drill`, detail: 'Safety drill recorded', kind: 'drill' })
    for (const c of charters.data ?? []) {
      if (c.start_date >= startIso && c.start_date < endIso) {
        timeline.push({ date: c.start_date, title: `Charter began${c.charterer_name ? ` · ${c.charterer_name}` : ''}`, detail: [c.embark_port, c.guest_count ? `${c.guest_count} guests` : null].filter(Boolean).join(' · ') || null, kind: 'charter' })
      }
    }
    timeline.sort((a, b) => a.date.localeCompare(b.date))

    // ── Compliance, as it stands today ──
    const tracked = items.filter((i: Expiring) => i.date >= iso(new Date(now.getTime() - 60 * 86400000)))
    const expired = tracked.filter((i: Expiring) => i.date < today)
    const compliance = {
      total: tracked.length,
      inDate: tracked.length - expired.length,
      expired: expired.map((i: Expiring) => ({ date: i.date, title: i.title })),
      permits: tracked.filter((i: Expiring) => i.kind === 'permit' || i.kind === 'cruising').length,
      visas: tracked.filter((i: Expiring) => i.kind === 'visa').length,
      passports: tracked.filter((i: Expiring) => i.kind === 'passport').length,
      cruisingPermit: items.find((i: Expiring) => i.kind === 'cruising')?.date ?? null,
    }

    // ── Spend (accounts only) ──
    const financeOk = canSeeFinance(yacht.position) && sectionEnabled('finances', modules)
    let spend: any = null
    let awaiting: Array<{ docNumber: string | null; date: string | null; total: number; currency: string }> = []
    if (financeOk) {
      const s = await spendFor(yacht, start, end).catch(() => null)
      if (s && s.linked) {
        const { customerId, ...rest } = s
        spend = rest
        // Quotations still waiting on the vessel (no decision yet).
        const { qboQuery } = await import('@/lib/qb/qbo.server')
        const est = await qboQuery(`select * from Estimate where CustomerRef = '${ql(customerId)}' and TxnStatus = 'Pending' maxresults 50`).catch(() => null)
        const decided = new Set(((await sb.from('portal_quote_decisions').select('qbo_estimate_id, decision').eq('yacht_id', yacht.yachtId)).data ?? [])
          .filter((d: any) => d.decision !== 'query').map((d: any) => d.qbo_estimate_id))
        awaiting = (est?.QueryResponse?.Estimate ?? [])
          .filter((e: any) => !decided.has(e.Id) && (!e.ExpirationDate || e.ExpirationDate >= today))
          .map((e: any) => ({ docNumber: e.DocNumber ?? null, date: e.TxnDate ?? null, total: Number(e.TotalAmt ?? 0), currency: e.CurrencyRef?.value ?? 'AED' }))
      } else if (s) {
        spend = { linked: false }
      }
    }

    // ── The next 30 days ──
    const ahead = {
      expiring: items.filter((i: Expiring) => i.date >= today && i.date <= soon).map((i: Expiring) => ({ date: i.date, title: i.title, kind: i.kind })),
      charters: (charters.data ?? []).filter((c: any) => c.start_date >= today && c.start_date <= soon)
        .map((c: any) => ({ start: c.start_date, end: c.end_date, title: c.charterer_name || c.charter_ref || 'Charter', from: c.embark_port, to: c.disembark_port, guests: c.guest_count })),
      awaitingDecision: awaiting,
      openRequests: (openReqs.data ?? []).map((r: any) => ({ reference: r.reference, title: r.title, status: r.status, createdAt: r.created_at })),
    }

    // Months to pick from: the last 12, newest first, flagging those with a published note.
    const publishedMonths = new Set((published.data ?? []).map((r: any) => String(r.month).slice(0, 7)))
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
      const key = iso(d).slice(0, 7)
      return { key, current: i === 0, hasNote: publishedMonths.has(key) }
    })

    return json({
      vessel: yacht.vesselName,
      month: startIso.slice(0, 7),
      monthToDate: start.getTime() === thisMonth.getTime(),
      months,
      note,
      spend,
      compliance,
      timeline: timeline.slice(-60),
      ahead,
    })
  } catch (e: any) {
    return json({ error: e?.message ?? 'Could not prepare the brief' }, 500)
  }
}
