/**
 * Client-portal On board — Expenses, petty cash and charter APA.
 *
 *   POST   /api/portal/expenses?kind=entry                → record money spent / in / returned
 *   PATCH  /api/portal/expenses?kind=entry&id=            → correct an entry (own entries, or a money manager)
 *   DELETE /api/portal/expenses?kind=entry&id=            → remove an entry (own entries, or a money manager)
 *   POST   /api/portal/expenses?kind=account              → open a cash account / card / APA   (money managers)
 *   PATCH  /api/portal/expenses?kind=account&id=          → edit / archive one                  (money managers)
 *   DELETE /api/portal/expenses?kind=account&id=          → remove one with no entries          (money managers)
 *   POST   /api/portal/expenses?kind=budget               → set a year's budget for a category  (money managers;
 *                                                           body { year, category, currency, amount|null })
 *   POST   /api/portal/expenses?action=scan               → read a receipt photo/PDF (multipart "file");
 *                                                           returns the fields, saves nothing
 *   GET    /api/portal/expenses?action=apa-statement&id=  → the APA statement PDF for an account
 *
 * The tables are read-only to portal logins at the database (captain_select
 * only), so writes come through here with the service role, hard-filtered to
 * the vessel resolved from the caller's JWT. Refused unless the vessel has the
 * Management module's Expenses feature on and the position can see it.
 */
import { createClient } from '@supabase/supabase-js'
import { resolvePortalYacht, portalModulesFor, type PortalYacht } from '@/lib/portal/portal-auth.server'
import { canManageMoney, hiddenSections } from '@/lib/portal/portal-positions'
import { sectionEnabled } from '@/lib/portal/portal-modules'
import { ACCOUNT_KINDS, ENTRY_KINDS, EXPENSE_CATEGORIES, MONEY_CURRENCIES, accountTotals } from '@/lib/portal/expenses'
import { logAuditEvent } from '@/lib/admin/audit'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}
type Sb = ReturnType<typeof admin>

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DEPARTMENTS = ['galley', 'interior', 'bar', 'deck', 'engine', 'safety', 'other']
const MAX_SCAN_BYTES = 8 * 1024 * 1024

class BadRequest extends Error {}

const text = (v: unknown, max: number, label: string): string | null => {
  if (v == null || v === '') return null
  if (typeof v !== 'string') throw new BadRequest(`${label} must be text`)
  const t = v.trim()
  if (t.length > max) throw new BadRequest(`${label} is too long`)
  return t || null
}
const amount = (v: unknown, label: string, opts: { positive?: boolean; allowNull?: boolean } = {}): number | null => {
  if (v == null || v === '') {
    if (opts.allowNull) return null
    throw new BadRequest(`${label} is required`)
  }
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim())
  if (!Number.isFinite(n) || n < 0 || (opts.positive && n === 0)) throw new BadRequest(`${label} must be ${opts.positive ? 'more than zero' : 'a positive number'}`)
  if (n > 1e9) throw new BadRequest(`${label} is too large`)
  return Math.round(n * 100) / 100
}
const oneOf = (v: unknown, list: readonly string[], label: string): string => {
  if (typeof v !== 'string' || !list.includes(v)) throw new BadRequest(`Unknown ${label}`)
  return v
}

async function callerName(sb: Sb, yacht: PortalYacht): Promise<string> {
  const { data } = await sb.from('captain_accounts').select('display_name')
    .eq('user_id', yacht.userId).eq('yacht_id', yacht.yachtId).eq('active', true).maybeSingle()
  return ((data as any)?.display_name as string | undefined) || yacht.email || 'Crew'
}

async function own(sb: Sb, yacht: PortalYacht, table: string, id: string | null): Promise<any | null> {
  if (!id || !UUID_RE.test(id)) return null
  const { data } = await sb.from(table).select('*').eq('id', id).eq('yacht_id', yacht.yachtId).maybeSingle()
  return data ?? null
}

async function audit(request: Request, yacht: PortalYacht, table: string, verb: string, id: string, label: string) {
  await logAuditEvent({
    event_type: 'DATA', module: 'portal',
    actor_id: yacht.preview ? yacht.userId : null,
    actor_email: yacht.email || '(client portal)',
    actor_role: yacht.position ?? 'captain',
    target_type: table, target_id: id,
    target_label: `${yacht.vesselName} · ${label}`,
    detail: `Client portal (${yacht.vesselName}) — ${verb}: ${label}`,
    ip_address: request.headers.get('cf-connecting-ip'),
    user_agent: request.headers.get('user-agent'),
    result: 'success',
  })
}

/** The editable fields of an entry, validated. */
async function cleanEntry(sb: Sb, yacht: PortalYacht, body: Record<string, unknown>, isNew: boolean) {
  const out: Record<string, unknown> = {}
  if ('account_id' in body || isNew) {
    const id = body.account_id
    if (typeof id !== 'string' || !UUID_RE.test(id)) throw new BadRequest('Choose the account it was paid from')
    const acct = await own(sb, yacht, 'onboard_cash_accounts', id)
    if (!acct) throw new BadRequest('That account is not on this vessel')
    if (acct.archived && isNew) throw new BadRequest('That account is closed')
    out.account_id = id
  }
  if ('kind' in body || isNew) out.kind = oneOf(body.kind ?? 'expense', ENTRY_KINDS.map((k) => k.key), 'entry type')
  if ('amount' in body || isNew) out.amount = amount(body.amount, 'The amount', { positive: true })
  if ('entry_date' in body || isNew) {
    const d = body.entry_date ?? new Date().toISOString().slice(0, 10)
    if (typeof d !== 'string' || !DATE_RE.test(d)) throw new BadRequest('The date must be a date')
    if (d > new Date(Date.now() + 86400000).toISOString().slice(0, 10)) throw new BadRequest("The date can't be in the future")
    out.entry_date = d
  }
  if ('supplier' in body) out.supplier = text(body.supplier, 160, 'The supplier')
  if ('description' in body) out.description = text(body.description, 500, 'The description')
  if ('reference' in body) out.reference = text(body.reference, 80, 'The reference')
  if ('category' in body) out.category = body.category == null || body.category === '' ? null : oneOf(body.category, EXPENSE_CATEGORIES.map((c) => c.key), 'category')
  if ('department' in body) out.department = body.department == null || body.department === '' ? null : oneOf(body.department, DEPARTMENTS, 'department')
  if ('vat_amount' in body) out.vat_amount = amount(body.vat_amount, 'VAT', { allowNull: true })
  if ('original_amount' in body) out.original_amount = amount(body.original_amount, 'The amount paid', { allowNull: true, positive: true })
  if ('original_currency' in body) {
    const c = text(body.original_currency, 3, 'The currency paid in')
    if (c && !/^[A-Z]{3}$/.test(c.toUpperCase())) throw new BadRequest('The currency paid in must be a 3-letter code, e.g. USD')
    out.original_currency = c ? c.toUpperCase() : null
  }
  if ('receipt_scanned' in body) out.receipt_scanned = body.receipt_scanned === true
  return out
}

async function cleanAccount(sb: Sb, yacht: PortalYacht, body: Record<string, unknown>, isNew: boolean) {
  const out: Record<string, unknown> = {}
  if ('name' in body || isNew) {
    const n = text(body.name, 120, 'The name')
    if (!n) throw new BadRequest('Give the account a name')
    out.name = n
  }
  if ('kind' in body || isNew) out.kind = oneOf(body.kind ?? 'petty_cash', ACCOUNT_KINDS.map((k) => k.key), 'account type')
  if ('currency' in body || isNew) out.currency = oneOf(body.currency ?? 'EUR', MONEY_CURRENCIES, 'currency')
  if ('holder_name' in body) out.holder_name = text(body.holder_name, 120, 'Who holds it')
  if ('notes' in body) out.notes = text(body.notes, 2000, 'Notes')
  if ('opening_balance' in body) out.opening_balance = amount(body.opening_balance ?? 0, 'The opening balance') ?? 0
  if ('low_balance' in body) out.low_balance = amount(body.low_balance, 'The low-balance warning', { allowNull: true })
  if ('archived' in body) out.archived = body.archived === true
  if ('charter_booking_id' in body) {
    const id = body.charter_booking_id
    if (id == null || id === '') out.charter_booking_id = null
    else {
      if (typeof id !== 'string' || !UUID_RE.test(id)) throw new BadRequest('That charter is not valid')
      const { data } = await sb.from('charter_bookings').select('id').eq('id', id).eq('yacht_id', yacht.yachtId).maybeSingle()
      if (!data) throw new BadRequest('That charter is not on this vessel')
      out.charter_booking_id = id
    }
  }
  return out
}

export async function portalExpensesHandler(request: Request): Promise<Response> {
  const auth = await resolvePortalYacht(request)
  if (!auth.ok) return auth.response
  const { yacht } = auth
  if (!yacht.mfaVerified) return json({ error: 'Two-factor verification required' }, 403)

  const modules = await portalModulesFor(yacht.yachtId)
  if (!sectionEnabled('expenses', modules)) return json({ error: "Expenses aren't switched on for your vessel." }, 403)
  if (hiddenSections(yacht.position).has('expenses')) return json({ error: "Your position doesn't include Expenses." }, 403)

  const url = new URL(request.url)
  const kind = url.searchParams.get('kind')
  const action = url.searchParams.get('action')
  const id = url.searchParams.get('id')
  const sb = admin()
  const manager = canManageMoney(yacht.position)

  try {
    // ── APA / account statement (read-only: allowed in staff preview too) ──
    if (request.method === 'GET' && action === 'apa-statement') {
      const acct = await own(sb, yacht, 'onboard_cash_accounts', id)
      if (!acct) return json({ error: 'Not found' }, 404)
      const [{ data: entries }, charter] = await Promise.all([
        sb.from('onboard_expenses').select('kind, amount, entry_date, supplier, description, category, reference')
          .eq('yacht_id', yacht.yachtId).eq('account_id', acct.id).order('entry_date'),
        acct.charter_booking_id
          ? sb.from('charter_bookings').select('charterer_name, start_date, end_date, charter_ref').eq('id', acct.charter_booking_id).eq('yacht_id', yacht.yachtId).maybeSingle()
          : Promise.resolve({ data: null }),
      ])
      const c = (charter as any).data
      const { buildApaStatementPdf } = await import('@/lib/portal/apa-statement-pdf.server')
      const bytes = await buildApaStatementPdf({
        vesselName: yacht.vesselName, accountName: acct.name, currency: acct.currency,
        charter: c ? { charterer: c.charterer_name, start: c.start_date, end: c.end_date, reference: c.charter_ref } : null,
        opening: Number(acct.opening_balance) || 0, entries: (entries ?? []) as any[],
        preparedBy: yacht.preview ? null : await callerName(sb, yacht),
      })
      const name = `${acct.kind === 'apa' ? 'APA statement' : 'Account statement'} - ${String(acct.name).replace(/[^\w .-]+/g, '')} - ${new Date().toISOString().slice(0, 10)}.pdf`
      return new Response(bytes as unknown as BodyInit, {
        headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${name}"`, 'Cache-Control': 'no-store' },
      })
    }

    if (yacht.preview) return json({ error: 'Read-only preview — sign in as the client to make changes.' }, 403)

    // ── Receipt scan: read it, save nothing ──
    if (request.method === 'POST' && action === 'scan') {
      const form = await request.formData().catch(() => null)
      const file = form?.get('file')
      if (!(file instanceof File)) return json({ error: 'Choose a photo of the receipt' }, 400)
      if (file.size === 0) return json({ error: 'That file is empty' }, 400)
      if (file.size > MAX_SCAN_BYTES) return json({ error: 'That photo is too large to scan (8 MB at most)' }, 400)
      const type = file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : '')
      if (!/^image\/(jpeg|png|webp|gif)$/.test(type) && type !== 'application/pdf') {
        return json({ error: 'Scan a JPG, PNG or WEBP photo, or a PDF (HEIC photos: choose "Most compatible" in the camera settings)' }, 400)
      }
      const { readReceipt } = await import('@/lib/portal/receipt-ocr.server')
      const reading = await readReceipt(new Uint8Array(await file.arrayBuffer()), type)
      return json({ ok: true, reading })
    }

    // ── Entries ──
    if (kind === 'entry') {
      const who = await callerName(sb, yacht)
      if (request.method === 'POST') {
        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
        if (!body) return json({ error: 'Expected a JSON body' }, 400)
        const fields = await cleanEntry(sb, yacht, body, true)
        const { data, error } = await sb.from('onboard_expenses')
          .insert({ ...fields, yacht_id: yacht.yachtId, created_by: yacht.userId, created_by_name: who }).select('id').single()
        if (error || !data) throw error ?? new Error('Could not save')
        await audit(request, yacht, 'onboard_expenses', 'recorded', (data as any).id, `${fields.kind} ${fields.amount}`)
        return json({ ok: true, id: (data as any).id }, 201)
      }
      const entry = await own(sb, yacht, 'onboard_expenses', id)
      if (!entry) return json({ error: 'Not found' }, 404)
      if (!manager && entry.created_by !== yacht.userId) return json({ error: 'Only the person who recorded it, or the Captain, can change this entry.' }, 403)
      if (request.method === 'DELETE') {
        const { error } = await sb.from('onboard_expenses').delete().eq('id', entry.id).eq('yacht_id', yacht.yachtId)
        if (error) throw error
        await audit(request, yacht, 'onboard_expenses', 'removed', entry.id, `${entry.kind} ${entry.amount} ${entry.supplier ?? ''}`)
        return json({ ok: true })
      }
      if (request.method === 'PATCH') {
        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
        if (!body) return json({ error: 'Expected a JSON body' }, 400)
        const fields = await cleanEntry(sb, yacht, body, false)
        if (Object.keys(fields).length) {
          const { error } = await sb.from('onboard_expenses').update(fields).eq('id', entry.id).eq('yacht_id', yacht.yachtId)
          if (error) throw error
          await audit(request, yacht, 'onboard_expenses', 'edited', entry.id, `${entry.kind} ${fields.amount ?? entry.amount}`)
        }
        return json({ ok: true })
      }
      return json({ error: 'Method not allowed' }, 405)
    }

    // ── Accounts and budgets: money managers only ──
    if (kind === 'account' || kind === 'budget') {
      if (!manager) return json({ error: 'Only the Captain, officers, purser or owner can change accounts and budgets.' }, 403)
    }

    if (kind === 'account') {
      if (request.method === 'POST') {
        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
        if (!body) return json({ error: 'Expected a JSON body' }, 400)
        const fields = await cleanAccount(sb, yacht, body, true)
        const { data, error } = await sb.from('onboard_cash_accounts').insert({ ...fields, yacht_id: yacht.yachtId }).select('id').single()
        if (error || !data) throw error ?? new Error('Could not save')
        await audit(request, yacht, 'onboard_cash_accounts', 'opened account', (data as any).id, String(fields.name))
        return json({ ok: true, id: (data as any).id }, 201)
      }
      const acct = await own(sb, yacht, 'onboard_cash_accounts', id)
      if (!acct) return json({ error: 'Not found' }, 404)
      const { data: entries } = await sb.from('onboard_expenses').select('account_id, kind, amount').eq('yacht_id', yacht.yachtId).eq('account_id', acct.id)
      if (request.method === 'DELETE') {
        if ((entries ?? []).length) return json({ error: 'This account has entries — close it instead (its history is kept).' }, 400)
        const { error } = await sb.from('onboard_cash_accounts').delete().eq('id', acct.id).eq('yacht_id', yacht.yachtId)
        if (error) throw error
        await audit(request, yacht, 'onboard_cash_accounts', 'removed account', acct.id, acct.name)
        return json({ ok: true })
      }
      if (request.method === 'PATCH') {
        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
        if (!body) return json({ error: 'Expected a JSON body' }, 400)
        const fields = await cleanAccount(sb, yacht, body, false)
        // Every entry is in the account's currency, so it can't change underneath them.
        if (fields.currency && fields.currency !== acct.currency && (entries ?? []).length) {
          return json({ error: "The currency can't change once money has been recorded — open a new account instead." }, 400)
        }
        if (Object.keys(fields).length) {
          const { error } = await sb.from('onboard_cash_accounts').update(fields).eq('id', acct.id).eq('yacht_id', yacht.yachtId)
          if (error) throw error
          await audit(request, yacht, 'onboard_cash_accounts', fields.archived === true ? 'closed account' : 'edited account', acct.id, String(fields.name ?? acct.name))
        }
        return json({ ok: true, balance: accountTotals({ ...acct, ...fields }, (entries ?? []) as any).balance })
      }
      return json({ error: 'Method not allowed' }, 405)
    }

    if (kind === 'budget' && request.method === 'POST') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
      if (!body) return json({ error: 'Expected a JSON body' }, 400)
      const year = Number(body.year)
      if (!Number.isInteger(year) || year < 2000 || year > 2100) return json({ error: 'Choose a year' }, 400)
      const category = oneOf(body.category, EXPENSE_CATEGORIES.map((c) => c.key), 'category')
      const currency = oneOf(body.currency ?? 'EUR', MONEY_CURRENCIES, 'currency')
      const value = amount(body.amount, 'The budget', { allowNull: true })
      if (value == null) {
        const { error } = await sb.from('onboard_budgets').delete().eq('yacht_id', yacht.yachtId).eq('year', year).eq('category', category).eq('currency', currency)
        if (error) throw error
        return json({ ok: true })
      }
      const { error } = await sb.from('onboard_budgets').upsert(
        { yacht_id: yacht.yachtId, year, category, currency, amount: value, updated_by_name: await callerName(sb, yacht) },
        { onConflict: 'yacht_id,year,category,currency' },
      )
      if (error) throw error
      return json({ ok: true })
    }

    return json({ error: 'Unknown request' }, 400)
  } catch (e: any) {
    if (e instanceof BadRequest) return json({ error: e.message }, 400)
    console.error('[portal-expenses]', e)
    return json({ error: e?.message ?? 'Could not save' }, 500)
  }
}
