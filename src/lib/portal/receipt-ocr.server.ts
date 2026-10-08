/**
 * Receipt reader for the client portal's Expenses — a photo or PDF of a receipt
 * in, the fields for an expense out (supplier, date, total, currency, VAT, a
 * suggested category), for the crew to confirm before anything is saved.
 *
 * One Claude vision call through the Anthropic SDK. The answer comes back as a
 * strict tool call, so it is always the shape below; anything the model can't
 * read confidently is null rather than guessed.
 */
import Anthropic from '@anthropic-ai/sdk'
import { EXPENSE_CATEGORIES } from '@/lib/portal/expenses'

export type ReceiptReading = {
  supplier: string | null
  date: string | null
  total: number | null
  currency: string | null
  vat_amount: number | null
  reference: string | null
  description: string | null
  category: string | null
  is_receipt: boolean
  legible: boolean
}

const MODEL = 'claude-opus-5-5'

const RECORD_RECEIPT: Anthropic.Beta.BetaTool = {
  name: 'record_receipt',
  description: 'Record what the receipt or invoice says. Call this exactly once.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['supplier', 'date', 'total', 'currency', 'vat_amount', 'reference', 'description', 'category', 'is_receipt', 'legible'],
    properties: {
      supplier: { type: ['string', 'null'], description: 'The business that was paid, as printed (trading name, not the legal footer).' },
      date: { type: ['string', 'null'], description: 'Date of purchase as YYYY-MM-DD.' },
      total: { type: ['number', 'null'], description: 'The total actually paid, including tax and tip — a plain number, no currency symbol.' },
      currency: { type: ['string', 'null'], description: 'ISO 4217 code of the total, e.g. EUR, USD, AED, GBP. Infer from the symbol and the country if needed.' },
      vat_amount: { type: ['number', 'null'], description: 'VAT / sales tax included in the total, if shown.' },
      reference: { type: ['string', 'null'], description: 'Receipt, invoice or transaction number.' },
      description: { type: ['string', 'null'], description: 'A few words on what was bought, e.g. "Fresh fish and vegetables" or "Fuel filter x2".' },
      category: { type: ['string', 'null'], enum: [...EXPENSE_CATEGORIES.map((c) => c.key), null], description: 'The cost category that fits best.' },
      is_receipt: { type: 'boolean', description: 'false if this is not a receipt, bill or invoice.' },
      legible: { type: 'boolean', description: 'false if too blurred, dark or cut off to read the total confidently.' },
    },
  },
}

const PROMPT = `This is a receipt, bill or invoice for something bought for a yacht. Read it and call record_receipt.

Categories: ${EXPENSE_CATEGORIES.map((c) => `${c.key} (${c.label}: ${c.hint})`).join('; ')}.

Use null for anything you can't read confidently — never guess a total or a date.`

/** Read one receipt image or PDF. Throws with a plain message when it can't. */
export async function readReceipt(bytes: Uint8Array, mediaType: string): Promise<ReceiptReading> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Receipt scanning is not set up yet')
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 2 })

  let b64 = ''
  for (let i = 0; i < bytes.length; i += 0x8000) b64 += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  b64 = btoa(b64)

  const file: Anthropic.Beta.BetaContentBlockParam = mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data: b64 } }

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    // A receipt is routine extraction: keep thinking light.
    output_config: { effort: 'low' },
    // If a safety classifier declines, Anthropic re-runs it on its recommended fallback model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    tools: [RECORD_RECEIPT],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: [file, { type: 'text', text: PROMPT }] }],
  })

  if (response.stop_reason === 'refusal') throw new Error("That receipt couldn't be read — please enter it by hand")
  const call = response.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use' && b.name === 'record_receipt')
  if (!call) throw new Error("That receipt couldn't be read — please enter it by hand")
  const r = call.input as ReceiptReading

  // Belt and braces on the values that feed straight into the ledger.
  const date = typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null
  const num = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null)
  const currency = typeof r.currency === 'string' && /^[A-Z]{3}$/.test(r.currency.trim().toUpperCase()) ? r.currency.trim().toUpperCase() : null
  return {
    supplier: r.supplier?.trim().slice(0, 160) || null,
    date,
    total: num(r.total),
    currency,
    vat_amount: num(r.vat_amount),
    reference: r.reference?.trim().slice(0, 80) || null,
    description: r.description?.trim().slice(0, 300) || null,
    category: EXPENSE_CATEGORIES.some((c) => c.key === r.category) ? r.category : null,
    is_receipt: r.is_receipt !== false,
    legible: r.legible !== false,
  }
}
