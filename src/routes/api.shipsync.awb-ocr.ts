/**
 * Air waybill OCR — POST /api/shipsync/awb-ocr  { imageBase64, mediaType }
 *
 * Reads a photographed or PDF air waybill (or courier label / commercial
 * invoice) and returns the fields needed to raise an Import shipment, so a
 * clerk confirms what was read instead of typing it off the page.
 *
 * Same engine and the same rate-limit handling as the passport reader
 * (api.visa.passport-ocr.ts) — one Anthropic vision call, a strict JSON schema,
 * and a quality checklist so an unreadable photo is called out rather than
 * silently returning half a shipment.
 */
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-6'

const AWB_PROMPT = `You are an air waybill data-extraction engine. The document is an air waybill (AWB),
courier consignment note, or the shipping paperwork that travels with a freight consignment.
Return ONLY a single JSON object (no prose, no code fences) with EXACTLY these keys:
{
  "awb_number": string|null,        // The AIR WAYBILL number. On an IATA AWB this is the 3-digit airline
                                    // prefix + 8 digits, often printed as "020-12345675" or "02012345675".
                                    // On a courier label it is the tracking/consignment number.
                                    // Return it EXACTLY as printed, keeping any hyphens.
  "house_awb": string|null,         // House AWB (HAWB) if the document shows one separately from the master.
  "courier": string|null,           // Carrier / airline / courier, e.g. "Emirates SkyCargo", "DHL", "FedEx".
  "shipper": string|null,           // Shipper / consignor / sender — the company name only.
  "consignee": string|null,         // Consignee — who it is addressed to. Often the yacht or the agent.
  "vessel_name": string|null,       // A yacht/vessel name if one appears anywhere (consignee line,
                                    // marks & numbers, or the goods description), else null.
  "origin": string|null,            // Airport/city of departure, as printed, e.g. "LHR" or "London Heathrow".
  "destination": string|null,       // Airport/city of arrival, e.g. "DXB" or "Dubai".
  "pieces": number|null,            // Number of pieces / packages ("No. of Pieces RCP").
  "weight_kg": number|null,         // Gross weight in KILOGRAMS. If printed in lb, convert (1 lb = 0.45359237 kg)
                                    // and round to 2 decimals. Read the unit — do not assume kg.
  "description": string|null,       // "Nature and Quantity of Goods" / goods description, trimmed to one line.
  "commodity": string|null,         // A short commodity label if separately stated, e.g. "Yacht spares".
  "flight_date": string|null,       // YYYY-MM-DD — the flight/despatch date if shown.
  "declared_value": string|null,    // Declared value for customs, as printed including currency.
  "checklist": {
    "is_air_waybill": boolean,      // true for an AWB / consignment note / courier label
    "full_document_visible": boolean,
    "has_glare_or_reflections": boolean,
    "is_legible": boolean           // false when it is too blurred/dark to read confidently
  }
}

Rules:
- Use null for anything you cannot read confidently. NEVER invent a value, and never
  return a placeholder like "N/A" or "-" — use null instead.
- pieces and weight_kg must be NUMBERS (not strings) or null.
- Dates in any format or language MUST be output as YYYY-MM-DD.
- If the document is clearly not shipping paperwork, set checklist.is_air_waybill to false
  and return null for every other field.`

export async function shipsyncAwbOcrHandler(request: Request): Promise<Response> {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return json({ ok: false, error: 'ANTHROPIC_API_KEY not configured' }, 500)

  let imageBase64 = '', mediaType = 'image/jpeg'
  try {
    const body: any = await request.json()
    imageBase64 = body.imageBase64 ?? ''
    mediaType = body.mediaType ?? 'image/jpeg'
  } catch { return json({ ok: false, error: 'Invalid request body' }, 400) }

  if (!imageBase64) return json({ ok: false, error: 'Missing imageBase64' }, 400)
  const isPdf = mediaType === 'application/pdf'
  if (!isPdf && !/^image\/(jpeg|png|webp|gif)$/.test(mediaType)) {
    return json({ ok: false, error: 'Unsupported file type for scanning.' }, 415)
  }

  const fileBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: imageBase64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } }

  const payload = JSON.stringify({
    model: MODEL,
    max_tokens: 700,
    messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: AWB_PROMPT }] }],
  })

  // The org's input-tokens-per-minute cap is shared with the passport reader and
  // Leo, so a burst can come back 429/529 — back off and retry rather than fail.
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const MAX_RETRIES = 4
  let res: Response | null = null
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: payload,
      })
    } catch (e: any) {
      return json({ ok: false, error: `Failed to reach Anthropic: ${e?.message ?? 'network error'}` }, 502)
    }
    if (res.status !== 429 && res.status !== 529) break
    if (attempt === MAX_RETRIES) {
      return json({
        ok: false, rateLimited: true,
        error: 'Scanning is busy right now (rate limit). Wait a minute and try again.',
      }, 429)
    }
    const retryAfter = parseInt(res.headers.get('retry-after') ?? '', 10)
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 20000)
      : Math.min(1500 * 2 ** attempt, 12000)
    await sleep(waitMs)
  }

  if (!res || !res.ok) {
    const err = res ? await res.text().catch(() => '') : ''
    return json({ ok: false, error: `Anthropic error ${res?.status ?? 'unknown'}: ${err.slice(0, 200)}` }, 502)
  }

  const data: any = await res.json()
  const text: string = data?.content?.[0]?.text ?? ''
  const cleaned = text.replace(/```json|```/g, '').trim()
  const start = cleaned.indexOf('{'), end = cleaned.lastIndexOf('}')
  let parsed: any = null
  try { parsed = JSON.parse(cleaned.slice(start, end + 1)) } catch { /* ignore */ }
  if (!parsed) {
    return json({ ok: false, error: 'Could not read shipping details from that file.', raw: text.slice(0, 300) }, 422)
  }

  // A model can still echo a placeholder; normalise those to null so the review
  // form shows an empty field rather than the literal text "N/A".
  const clean = (v: unknown) => {
    if (typeof v !== 'string') return v ?? null
    const s = v.trim()
    return !s || /^(n\/?a|none|null|-|--)$/i.test(s) ? null : s
  }
  const num = (v: unknown) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^\d.]/g, ''))
    return Number.isFinite(n) && n > 0 ? n : null
  }

  return json({
    ok: true,
    data: {
      awb_number: clean(parsed.awb_number),
      house_awb: clean(parsed.house_awb),
      courier: clean(parsed.courier),
      shipper: clean(parsed.shipper),
      consignee: clean(parsed.consignee),
      vessel_name: clean(parsed.vessel_name),
      origin: clean(parsed.origin),
      destination: clean(parsed.destination),
      pieces: num(parsed.pieces),
      weight_kg: num(parsed.weight_kg),
      description: clean(parsed.description),
      commodity: clean(parsed.commodity),
      flight_date: clean(parsed.flight_date),
      declared_value: clean(parsed.declared_value),
      checklist: parsed.checklist ?? null,
    },
  })
}
