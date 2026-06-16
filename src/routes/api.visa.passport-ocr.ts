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
  "surname": string|null,
  "given_names": string|null,
  "date_of_birth": string|null,        // YYYY-MM-DD
  "checklist": {
    "is_passport_data_page": boolean,  // the photo/MRZ bio page
    "is_passport_cover": boolean,      // the external cover only
    "is_colour": boolean,              // colour scan (not greyscale/B&W)
    "has_glare_or_reflections": boolean,
    "full_document_visible": boolean   // page fully in frame, not cropped
  }
}
Use null for anything you cannot read confidently. Dates MUST be YYYY-MM-DD.`

export async function visaPassportOcrHandler(request: Request): Promise<Response> {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return json({ ok: false, error: 'ANTHROPIC_API_KEY not configured' }, 500)

  let imageBase64 = '', mediaType = 'image/jpeg'
  try {
    const body: any = await request.json()
    imageBase64 = body.imageBase64 ?? ''
    mediaType = body.mediaType ?? 'image/jpeg'
  } catch { return json({ ok: false, error: 'Invalid request body' }, 400) }

  if (!imageBase64) return json({ ok: false, error: 'Missing imageBase64' }, 400)
  if (!/^image\/(jpeg|png|webp|gif)$/.test(mediaType)) {
    return json({ ok: false, error: 'Only image uploads can be scanned (PDF not supported for OCR).' }, 415)
  }

  let res: Response
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: PROMPT },
          ],
        }],
      }),
    })
  } catch (e: any) {
    return json({ ok: false, error: `Failed to reach Anthropic: ${e?.message ?? 'network error'}` }, 502)
  }

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    return json({ ok: false, error: `Anthropic error ${res.status}: ${err.slice(0, 200)}` }, 502)
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
