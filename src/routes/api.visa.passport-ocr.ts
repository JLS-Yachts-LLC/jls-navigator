/**
 * Passport OCR — POST /api/visa/passport-ocr  { imageBase64, mediaType }
 * Uses Anthropic vision to read a passport image (MRZ + visual zone) and return
 * structured fields to pre-populate the Add Passport form, plus a quality
 * checklist assessment. ANTHROPIC_API_KEY is a Worker secret (shared with Leo).
 */
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-6'

const PROMPT = `You are a passport data-extraction engine. The image is a passport page (or cover).
Read the Machine Readable Zone (MRZ, the two lines of >>>-style text) when present, and the printed visual zone.
Return ONLY a single JSON object (no prose, no code fences) with EXACTLY these keys:
{
  "nationality": string|null,          // demonym, e.g. "British"
  "passport_number": string|null,
  "issue_date": string|null,           // YYYY-MM-DD
  "expiry_date": string|null,          // YYYY-MM-DD
  "issuing_country": string|null,      // full country name, e.g. "United Kingdom"
  "place_of_issue": string|null,       // the "Authority" / "Issuing Authority" / "Place of issue" field as printed in the visual zone, e.g. "IPS", "HMPO", "Ministry of Foreign Affairs", "DUBLIN". Null if not shown.
  "surname": string|null,
  "given_names": string|null,          // ALL forenames as printed, space-separated — INCLUDING middle name(s), e.g. "Matthew Niels". Cross-check against the MRZ (given names follow the "<<" after the surname, separated by single "<"). Never drop a second/middle name.
  "date_of_birth": string|null,        // YYYY-MM-DD
  "place_of_birth": string|null,       // town/city (and country if shown), from the visual zone, e.g. "London" or "Dublin"
  "gender": string|null,               // EXACTLY "Male", "Female", or "Other". Read the Sex field (visual zone) or MRZ sex char (M/F/<). M=Male, F=Female, <=Other.
  "checklist": {
    "is_passport_data_page": boolean,  // the photo/MRZ bio page
    "is_passport_cover": boolean,      // the external cover only
    "is_colour": boolean,              // colour scan (not greyscale/B&W)
    "has_glare_or_reflections": boolean,
    "full_document_visible": boolean   // page fully in frame, not cropped
  }
}
Read place_of_birth and gender from the printed visual zone; cross-check gender against the MRZ sex character.
DATES: the document may print dates in ANY format or language — e.g. "21 NOV/NOV 1991", "21 NOV 1991", "21/11/1991", "11/21/1991", "1991-11-21", "21.11.1991", or bilingual month names (Dutch/French/Spanish/etc.). Interpret the month from its name or number in any language and ALWAYS output YYYY-MM-DD. Prefer the MRZ dates (format YYMMDD) to disambiguate day-vs-month when the printed date is ambiguous. Use null only if you genuinely cannot read the date.`

const VISA_PROMPT = `You are an entry-visa data-extraction engine. The image is a visa (sticker, label, or e-visa printout).
Return ONLY a single JSON object (no prose, no code fences) with EXACTLY these keys:
{
  "visa_number": string|null,           // the visa / reference number
  "visa_type": string|null,             // e.g. "Crew 180-Day Multiple Entry"
  "destination_country": string|null,   // issuing/destination country, full name
  "issue_date": string|null,            // YYYY-MM-DD — date of issue/issuance
  "expiry_date": string|null,           // YYYY-MM-DD — visa expiry / "valid until"
  "first_entry_expiry": string|null,    // YYYY-MM-DD — the "must enter before" / "enter before" activation deadline, if shown
  "place_of_issue": string|null,
  "holder_name": string|null,           // the full name of the visa holder as printed
  "surname": string|null,               // holder surname / family name
  "given_names": string|null,           // holder given/first names
  "passport_number": string|null,       // the holder's passport number, if shown
  "nationality": string|null,           // holder nationality (demonym)
  "date_of_birth": string|null          // YYYY-MM-DD
}
Use null for anything you cannot read confidently. Dates (any format/language) MUST be output as YYYY-MM-DD.`

export async function visaPassportOcrHandler(request: Request): Promise<Response> {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return json({ ok: false, error: 'ANTHROPIC_API_KEY not configured' }, 500)

  let imageBase64 = '', mediaType = 'image/jpeg', docType = 'passport'
  try {
    const body: any = await request.json()
    imageBase64 = body.imageBase64 ?? ''
    mediaType = body.mediaType ?? 'image/jpeg'
    docType = body.docType === 'visa' ? 'visa' : 'passport'
  } catch { return json({ ok: false, error: 'Invalid request body' }, 400) }

  if (!imageBase64) return json({ ok: false, error: 'Missing imageBase64' }, 400)
  const isPdf = mediaType === 'application/pdf'
  if (!isPdf && !/^image\/(jpeg|png|webp|gif)$/.test(mediaType)) {
    return json({ ok: false, error: 'Unsupported file type for scanning.' }, 415)
  }

  // Images go in as an image block; PDFs as a document block (Claude reads PDFs natively).
  const fileBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: imageBase64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } }

  const payload = JSON.stringify({
    model: MODEL,
    max_tokens: 700,
    messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: docType === 'visa' ? VISA_PROMPT : PROMPT }] }],
  })

  // Anthropic enforces an input-tokens-per-minute org cap; bursts (or concurrent
  // Leo usage on the same key) can return 429 / 529. Retry with backoff, honouring
  // the Retry-After header, so a transient rate-limit recovers instead of failing.
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
        ok: false,
        rateLimited: true,
        error: 'Scanning is busy right now (Anthropic rate limit). Wait a minute and try again — or raise the API rate limit to remove this.',
      }, 429)
    }
    const retryAfter = parseInt(res.headers.get('retry-after') ?? '', 10)
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 20000)
      : Math.min(1500 * 2 ** attempt, 12000) // 1.5s, 3s, 6s, 12s
    await sleep(waitMs)
  }

  if (!res || !res.ok) {
    const err = res ? await res.text().catch(() => '') : ''
    return json({ ok: false, error: `Anthropic error ${res?.status ?? 'unknown'}: ${err.slice(0, 200)}` }, 502)
  }

  const data: any = await res.json()
  const text: string = data?.content?.[0]?.text ?? ''
  // Strip any stray code fences and parse the JSON object.
  const cleaned = text.replace(/```json|```/g, '').trim()
  const start = cleaned.indexOf('{'), end = cleaned.lastIndexOf('}')
  let parsed: any = null
  try { parsed = JSON.parse(cleaned.slice(start, end + 1)) } catch { /* ignore */ }
  if (!parsed) return json({ ok: false, error: 'Could not parse passport data from the image.', raw: text.slice(0, 300) }, 422)

  return json({ ok: true, data: parsed })
}
