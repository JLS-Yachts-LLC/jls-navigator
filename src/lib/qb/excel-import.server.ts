/**
 * QB Excel importers — native ports of the n8n "QB (Quotation/Estimate) Excel
 * Input" and "QB Invoice Excel Output" (a misnomer — it too is an Excel INPUT)
 * workflows. No n8n.
 *
 * A staff member uploads a multi-sheet .xlsx (one document per worksheet). For
 * each sheet we: label-parse the header + line items, auto-create any missing
 * QBO Items (Service, income acct 79, tax code 19), resolve the customer by
 * DisplayName, allocate the next document number (Estimate Q26-#####, Invoice
 * JLS26-#####), and POST the Estimate/Invoice with the JLS custom fields. The
 * branded PDF then follows automatically from the native webhook doc-gen.
 */
import { qboRequest, qboQuery } from './qbo.server'
import { readXlsx } from './xlsx-reader.server'

// ── Label-driven sheet parser (port of n8n "Sheet Content Extract") ────────────
type ParsedItem = { qty: number | ''; category: string; description: string; unitRate: number | ''; amount: number | ''; vatPercent: string }
type ParsedSheet = {
  sheetTab: string
  name: string; address: string; requestedBy: string; emirates: string; trnNo: string
  currency: string; conversion: string; yachtName: string; yachtPO: string; bankDetail: string
  items: ParsedItem[]
}

const norm = (s: string) => (s ?? '').trim()
const lc = (s: string) => norm(s).toLowerCase()

/** Find a header field: locate the label cell, take the next non-empty cell right. */
function findLabel(rows: string[][], labels: string[]): string {
  const set = labels.map(lc)
  for (const row of rows) {
    for (let c = 0; c < row.length; c++) {
      if (set.includes(lc(row[c]))) {
        for (let k = c + 1; k < row.length; k++) if (norm(row[k])) return norm(row[k])
      }
    }
  }
  return ''
}

function parseSheet(sheetTab: string, rows: string[][]): ParsedSheet {
  const header = {
    name: findLabel(rows, ['Name']),
    address: findLabel(rows, ['Address']),
    requestedBy: findLabel(rows, ['Requested by', 'Requested By', 'REQUESTED BY']),
    emirates: findLabel(rows, ['Emirates']),
    trnNo: findLabel(rows, ['TRN No.', 'TRN No', 'TRN']),
    currency: findLabel(rows, ['Currency', 'CURRENCY']),
    conversion: findLabel(rows, ['Conversion', 'Conversion Rate', 'CONVERSION']),
    yachtName: findLabel(rows, ['Yacht Name', 'Yacht', 'YACHT NAME']),
    yachtPO: findLabel(rows, ['Yacht PO', 'PO Number', 'PO#', 'YACHT PO']),
    bankDetail: findLabel(rows, ['Bank Detail', 'Bank Details', 'BANK DETAIL']),
  }

  // Locate the line-item header row (needs QTY + DESCRIPTION at minimum).
  let cols: Record<string, number> | null = null
  const items: ParsedItem[] = []
  for (const row of rows) {
    if (!cols) {
      const map: Record<string, number> = {}
      row.forEach((cell, i) => {
        const u = lc(cell)
        if (u === 'qty' || u === 'quantity') map.qty = i
        else if (u === 'category') map.category = i
        else if (u === 'description') map.description = i
        else if (u === 'unit rate' || u === 'unitrate') map.unitRate = i
        else if (u === 'amount') map.amount = i
        else if (u === 'vat%' || u === 'vat %' || u === 'vat') map.vat = i
      })
      if (map.description != null && map.qty != null) cols = map
      continue
    }
    const desc = norm(row[cols.description])
    if (!desc) continue // blank description ends the item block
    const numOr = (i: number | undefined): number | '' => {
      if (i == null) return ''
      const v = Number(String(row[i]).replace(/,/g, ''))
      return isNaN(v) ? '' : v
    }
    let vatPercent = ''
    if (cols.vat != null) {
      const raw = norm(row[cols.vat])
      const vn = Number(raw.replace('%', ''))
      if (raw !== '') vatPercent = raw.includes('%') ? raw : `${vn <= 1 ? vn * 100 : vn}%`
    }
    items.push({
      qty: numOr(cols.qty),
      category: cols.category != null ? norm(row[cols.category]).replace(/:/g, ' ') : '',
      description: desc,
      unitRate: numOr(cols.unitRate),
      amount: numOr(cols.amount),
      vatPercent,
    })
  }

  return { sheetTab, ...header, items }
}

// ── Maps (verbatim) ────────────────────────────────────────────────────────────
const CURRENCY_CODE: Record<string, string> = {
  aed: '1', usd: '2', eur: '3', euro: '3',
  'aed to usd': '4', aedtousd: '4', 'aed-usd': '4', aed_usd: '4',
  'aed to eur': '5', aedtoeur: '5', 'aed-eur': '5', aed_eur: '5',
}
const BANK_CODE: Record<string, string> = { aed: '1', usd: '2', eur: '3', euro: '3' }
/** VAT% → QBO TaxCodeRef value. */
function vatToTaxCode(vat: string): string {
  const v = lc(vat)
  if (v === '' ) return '18'          // non-taxable
  if (v.includes('0') && !v.includes('5')) return '17' // 0%
  if (v.includes('5')) return '19'    // 5%
  return '18'
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

// ── Item / customer resolution against QBO ─────────────────────────────────────
async function loadItems(): Promise<Map<string, { id: string; name: string }>> {
  const res = await qboQuery('select * from Item MAXRESULTS 1000')
  const m = new Map<string, { id: string; name: string }>()
  for (const it of res?.QueryResponse?.Item ?? []) m.set(lc(it.Name), { id: it.Id, name: it.Name })
  return m
}

async function ensureItems(categories: string[]): Promise<Map<string, { id: string; name: string }>> {
  let items = await loadItems()
  const missing = [...new Set(categories.map(norm).filter(Boolean))].filter((c) => !items.has(lc(c)))
  if (!missing.length) return items
  for (const cat of missing) {
    const name = cat.replace(/:/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
    await qboRequest('POST', '/item?minorversion=73', {
      Name: name, Type: 'Service', IncomeAccountRef: { value: '79' }, SalesTaxCodeRef: { value: '19' },
    }).catch(() => null)
  }
  items = await loadItems() // re-fetch so new items have ids
  return items
}

async function resolveCustomer(name: string): Promise<{ id: string; name: string } | null> {
  const res = await qboQuery(`select Id, DisplayName from Customer where DisplayName = '${name.replace(/'/g, "\\'")}'`).catch(() => null)
  const rows = res?.QueryResponse?.Customer ?? []
  if (rows[0]) return { id: rows[0].Id, name: rows[0].DisplayName }
  // fallback: case-insensitive scan
  const all = await qboQuery('select Id, DisplayName from Customer MAXRESULTS 1000').catch(() => null)
  const hit = (all?.QueryResponse?.Customer ?? []).find((c: any) => lc(c.DisplayName) === lc(name))
  return hit ? { id: hit.Id, name: hit.DisplayName } : null
}

// ── DocNumber allocation ───────────────────────────────────────────────────────
async function nextNumber(kind: 'estimate' | 'invoice'): Promise<string> {
  if (kind === 'estimate') {
    const res = await qboQuery("select * from Estimate where TxnDate > '2024-01-01' MAXRESULTS 1000").catch(() => null)
    let max = 0
    for (const e of res?.QueryResponse?.Estimate ?? []) {
      const m = /^Q26-(\d+)$/i.exec(String(e.DocNumber ?? '')); if (m) max = Math.max(max, parseInt(m[1], 10))
    }
    return `Q26-${String(max + 1).padStart(5, '0')}`
  }
  const res = await qboQuery('select * from Invoice MAXRESULTS 1000').catch(() => null)
  let bestPrefix = 26, bestNum = 0, width = 5
  for (const inv of res?.QueryResponse?.Invoice ?? []) {
    const m = /^JLS(\d+)-(\d+)$/i.exec(String(inv.DocNumber ?? ''))
    if (!m) continue
    const pfx = parseInt(m[1], 10), num = parseInt(m[2], 10)
    if (pfx > bestPrefix || (pfx === bestPrefix && num > bestNum)) { bestPrefix = pfx; bestNum = num; width = m[2].length }
  }
  return `JLS${bestPrefix}-${String(bestNum + 1).padStart(width, '0')}`
}

// ── Build + create the QBO document ────────────────────────────────────────────
function buildCustomFields(s: ParsedSheet) {
  const currencyCode = CURRENCY_CODE[lc(s.currency)] ?? ''
  const bankCode = BANK_CODE[lc(s.bankDetail)] ?? ''
  const cf = [
    { DefinitionId: '1000000004', Name: 'Requested By', Type: 'StringType', StringValue: s.requestedBy },
    { DefinitionId: '1000000021', Name: 'Yacht.Name', Type: 'StringType', StringValue: s.yachtName },
    { DefinitionId: '1000000022', Name: 'Yacht.PO', Type: 'StringType', StringValue: s.yachtPO },
    { DefinitionId: '1000000023', Name: 'Currency', Type: 'StringType', StringValue: currencyCode },
    { DefinitionId: '1000000024', Name: 'Conversion Rate', Type: 'StringType', StringValue: s.conversion },
    { DefinitionId: '1000000025', Name: 'Bank Detail', Type: 'StringType', StringValue: bankCode },
  ]
  return cf.filter((f) => f.StringValue !== '' && f.StringValue != null)
}

function buildLines(s: ParsedSheet, items: Map<string, { id: string; name: string }>) {
  return s.items.map((it) => {
    const qty = it.qty === '' ? 0 : Number(it.qty)
    const unitPrice = it.unitRate === '' ? 0 : round2(Number(it.unitRate))
    const amount = it.amount === '' ? round2(qty * unitPrice) : round2(Number(it.amount))
    const resolved = it.category ? items.get(lc(it.category)) : undefined
    const taxCode = vatToTaxCode(it.vatPercent)
    const line: any = {
      DetailType: 'SalesItemLineDetail',
      Amount: amount,
      SalesItemLineDetail: {
        ItemRef: { value: resolved?.id ?? '', name: resolved?.name ?? it.category ?? 'Item' },
        Qty: qty, UnitPrice: unitPrice,
        TaxCodeRef: { value: taxCode },
      },
    }
    if (it.description) line.Description = it.description
    return line
  })
}

export type ImportResult = { sheet: string; ok: boolean; docNumber?: string; id?: string; error?: string }

async function importSheet(kind: 'estimate' | 'invoice', s: ParsedSheet): Promise<ImportResult> {
  try {
    const tab = s.sheetTab || s.name
    if (!s.items.length) return { sheet: tab, ok: false, error: 'No line items found on this sheet' }
    if (!s.name) return { sheet: tab, ok: false, error: 'No customer "Name" cell found on this sheet' }
    const customer = await resolveCustomer(s.name)
    if (!customer) return { sheet: tab, ok: false, error: `No QuickBooks customer named "${s.name}"` }

    const items = await ensureItems(s.items.map((i) => i.category))
    const docNumber = await nextNumber(kind)
    const payload: any = {
      DocNumber: docNumber,
      CustomerRef: { value: customer.id },
      TxnDate: new Date().toISOString().slice(0, 10),
      CustomField: buildCustomFields(s),
      Line: buildLines(s, items),
    }
    if (!payload.CustomField.length) delete payload.CustomField

    const path = kind === 'estimate' ? '/estimate?include=enhancedAllCustomFields&minorversion=73' : '/invoice?include=enhancedAllCustomFields&minorversion=73'
    const res = await qboRequest('POST', path, payload)
    const created = kind === 'estimate' ? res?.Estimate : res?.Invoice
    if (!created?.Id) return { sheet: tab, ok: false, error: 'QuickBooks did not return a created document' }
    return { sheet: tab, ok: true, docNumber: created.DocNumber ?? docNumber, id: created.Id }
  } catch (e: any) {
    return { sheet: s.sheetTab || s.name, ok: false, error: String(e?.message ?? e).slice(0, 300) }
  }
}

/** Parse every worksheet and create one Estimate/Invoice per sheet. */
export async function importFromXlsx(kind: 'estimate' | 'invoice', bytes: Uint8Array): Promise<ImportResult[]> {
  const sheets = await readXlsx(bytes)
  const results: ImportResult[] = []
  for (const sh of sheets) {
    const parsed = parseSheet(sh.name, sh.rows)
    // Skip sheets that clearly aren't document sheets (no customer name + no items).
    if (!parsed.name && !parsed.items.length) continue
    results.push(await importSheet(kind, parsed))
  }
  return results
}

// Exposed for offline testing.
export const __test = { parseSheet, vatToTaxCode, buildCustomFields }
