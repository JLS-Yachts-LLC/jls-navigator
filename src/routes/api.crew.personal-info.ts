/**
 * Crew Personal Information API
 *
 * GET   /api/crew/:crewId/personal-info              — current additional personal info
 * PATCH /api/crew/:crewId/personal-info              — save / update personal info
 * GET   /api/crew/:crewId/passports/:passportId/ocr  — OCR extraction for a passport
 *
 * POLARIS-PINFO-003, 004, 005
 */

import { createClient } from '@supabase/supabase-js'
import { formatName } from '@/lib/formatName'
import { COUNTRY_NAMES } from '@/lib/countries'

function getAdmin() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization') ?? ''
  return auth.startsWith('Bearer ') ? auth.slice(7) : null
}

async function authenticate(request: Request) {
  const admin = getAdmin()
  const token = getToken(request)
  if (!token) return null
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

// ── GET /api/crew/:crewId/personal-info ─────────────────────────────────────

async function handleGet(crewId: string, request: Request): Promise<Response> {
  const user = await authenticate(request)
  if (!user) return json({ error: 'Unauthorized' }, 401)

  const admin = getAdmin()
  const { data, error } = await (admin as any)
    .from('crew_members')
    .select([
      'nationality_citizenship',
      'place_of_birth',
      'country_of_birth',
      'gender',
      'marital_status',
      'native_language',
      'occupation',
      'rank',
      'mothers_maiden_name',
      'fathers_full_name',
      'religion',
      'residence_address_line1',
      'residence_address_line2',
      'residence_city',
      'residence_country',
      'residence_phone',
      // Contact number captured when the crew member was created (wizard step 2) —
      // used to pre-fill the Telephone No. field on the additional-info step.
      'phone_full',
      'phone_country_code',
      'phone_number',
      'phone',
      'ocr_populated_fields',
      'ocr_confirmed_fields',
      'personal_info_completed_at',
    ].join(', '))
    .eq('id', crewId)
    .maybeSingle()

  if (error) return json({ error: error.message }, 500)
  if (!data)  return json({ error: 'Crew member not found' }, 404)

  // The passport's issuing country, used to pre-fill Country of birth — they are
  // the same for ~87% of the crew on file (206 of the 238 who have both), and the
  // two columns already share a format, unlike nationality_citizenship which holds
  // a demonym ("Filipino", "British") rather than a country name.
  //
  // crew_passports is the only home for this: the old flat mirror column
  // crew_members.passport_issue_country was empty for all 531 crew and has been
  // dropped, so there is no wrong column left to reach for.
  //
  // Two traps in that data, both hit on the first attempt:
  //   • 167 passport rows carry the placeholder "XX" — and every one of them is
  //     flagged is_primary, so ordering by is_primary picks the junk first. They
  //     are filtered out rather than ordered around.
  //   • Casing is inconsistent ("SOUTH AFRICA" alongside "South Africa"), so the
  //     value is matched back to the canonical country list before being handed
  //     to a <select> that lists those names.
  const { data: passports } = await (admin as any)
    .from('crew_passports')
    .select('issuing_country, expiry_date')
    .eq('crew_id', crewId)
    .not('issuing_country', 'is', null)
    .order('expiry_date', { ascending: false, nullsFirst: false })

  const passportIssuingCountry = (() => {
    for (const p of (passports ?? []) as { issuing_country: string | null }[]) {
      const raw = (p.issuing_country ?? '').trim()
      // "XX" and other 2-character placeholders are not countries.
      if (raw.length <= 2) continue
      const canonical = COUNTRY_NAMES.find(c => c.toLowerCase() === raw.toLowerCase())
      return canonical ?? raw
    }
    return null
  })()

  return json({
    nationalityCitizenship:  data.nationality_citizenship ?? null,
    placeOfBirth:            data.place_of_birth          ?? null,
    countryOfBirth:          data.country_of_birth        ?? null,
    passportIssuingCountry,
    gender:                  data.gender                  ?? null,
    maritalStatus:           data.marital_status          ?? null,
    nativeLanguage:          data.native_language         ?? null,
    occupation:              data.occupation              ?? null,
    rank:                    data.rank                    ?? null,
    mothersMaidenName:       data.mothers_maiden_name     ?? null,
    fathersFullName:         data.fathers_full_name       ?? null,
    religion:                data.religion                ?? null,
    residenceAddressLine1:   data.residence_address_line1 ?? null,
    residenceAddressLine2:   data.residence_address_line2 ?? null,
    residenceCity:           data.residence_city          ?? null,
    residenceCountry:        data.residence_country       ?? null,
    residencePhone:          data.residence_phone         ?? null,
    // The number from crew creation, in E.164 where possible. Read-only here —
    // the additional-info step uses it as the default Telephone No.
    contactPhone:            data.phone_full
                               ?? (data.phone_country_code && data.phone_number
                                    ? `${data.phone_country_code}${String(data.phone_number).replace(/\D/g, '')}`
                                    : null)
                               ?? data.phone ?? null,
    ocrPopulatedFields:      data.ocr_populated_fields    ?? [],
    ocrConfirmedFields:      data.ocr_confirmed_fields    ?? [],
    personalInfoCompletedAt: data.personal_info_completed_at ?? null,
  })
}

// ── PATCH /api/crew/:crewId/personal-info ────────────────────────────────────

const REQUIRED_FIELDS = [
  'maritalStatus',
  'nativeLanguage',
  'mothersMaidenName',
  'fathersFullName',
  'residenceAddressLine1',
  'residenceCity',
  'residenceCountry',
  'residencePhone',
] as const

async function handlePatch(crewId: string, request: Request): Promise<Response> {
  const user = await authenticate(request)
  if (!user) return json({ error: 'Unauthorized' }, 401)

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  // Apply formatName server-side to name-type fields
  const nameCased = (v: unknown) => formatName(v as string | null) || (v as string | null) || null

  /**
   * PARTIAL update: only write columns the caller actually sent.
   *
   * This used to build a full payload with `?? null` for every column, so any
   * caller that omitted a field silently NULLed it. CrewPersonalEditDialog
   * (the ✎ Edit button on the visa Review step) sends only the identity fields,
   * which wiped the residence address + the ocr_* arrays every time it saved —
   * the address "disappearing" after it had been entered. Keying off presence in
   * the body means a partial caller can never destroy data it isn't editing.
   */
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const set = (col: string, key: string, transform?: (v: unknown) => unknown) => {
    if (!(key in body)) return
    payload[col] = transform ? transform(body[key]) : (body[key] ?? null)
  }

  set('nationality_citizenship', 'nationalityCitizenship')
  set('place_of_birth',          'placeOfBirth',      nameCased)
  set('country_of_birth',        'countryOfBirth')
  set('gender',                  'gender')
  set('marital_status',          'maritalStatus')
  set('native_language',         'nativeLanguage',    nameCased)
  set('occupation',              'occupation')
  set('mothers_maiden_name',     'mothersMaidenName', nameCased)
  set('fathers_full_name',       'fathersFullName',   nameCased)
  set('religion',                'religion')
  set('residence_address_line1', 'residenceAddressLine1')
  set('residence_address_line2', 'residenceAddressLine2')
  set('residence_city',          'residenceCity')
  set('residence_country',       'residenceCountry')
  set('residence_phone',         'residencePhone')
  set('ocr_populated_fields',    'ocrPopulatedFields', v => v ?? [])
  set('ocr_confirmed_fields',    'ocrConfirmedFields', v => v ?? [])

  // Mark complete only when this request carries every required field — a
  // partial save must not claim completion on another caller's behalf.
  const requiredFilled = REQUIRED_FIELDS.every(f => !!(body[f] as string)?.trim())
  if (requiredFilled) {
    payload.personal_info_completed_at = new Date().toISOString()
  }

  const admin = getAdmin()
  const { data, error } = await (admin as any)
    .from('crew_members')
    .update(payload)
    .eq('id', crewId)
    .select([
      'nationality_citizenship', 'place_of_birth', 'country_of_birth',
      'gender', 'marital_status', 'native_language', 'occupation',
      'mothers_maiden_name', 'fathers_full_name', 'religion',
      'ocr_populated_fields', 'ocr_confirmed_fields', 'personal_info_completed_at',
    ].join(', '))
    .maybeSingle()

  if (error) return json({ error: error.message }, 500)
  if (!data)  return json({ error: 'Crew member not found' }, 404)

  return json({
    ok: true,
    personalInfoCompletedAt: data.personal_info_completed_at ?? null,
  })
}

// ── GET /api/crew/:crewId/passports/:passportId/ocr ──────────────────────────

async function handleGetOcr(crewId: string, passportId: string, request: Request): Promise<Response> {
  const user = await authenticate(request)
  if (!user) return json({ error: 'Unauthorized' }, 401)

  const admin = getAdmin()
  const { data, error } = await (admin as any)
    .from('crew_passports')
    .select('id, ocr_raw, updated_at')
    .eq('id', passportId)
    .eq('crew_id', crewId)
    .maybeSingle()

  if (error) return json({ error: error.message }, 500)
  if (!data)  return json({ error: 'Passport not found' }, 404)

  const raw = data.ocr_raw ?? {}
  const ocrFields = Object.keys(raw).filter(k => raw[k] != null && raw[k] !== '')

  return json({
    nationality:      raw.nationality      ?? null,
    countryOfBirth:   raw.countryOfBirth   ?? null,
    gender:           raw.gender           ?? null,
    placeOfBirth:     raw.placeOfBirth     ?? null,
    ocrCompletedAt:   raw.ocrCompletedAt   ?? data.updated_at ?? null,
    ocrFields,
  })
}

// ── Router ────────────────────────────────────────────────────────────────────

export async function crewPersonalInfoHandler(request: Request): Promise<Response> {
  const url = new URL(request.url)

  // /api/crew/:crewId/passports/:passportId/ocr
  const ocrMatch = url.pathname.match(/^\/api\/crew\/([^/]+)\/passports\/([^/]+)\/ocr$/)
  if (ocrMatch && request.method === 'GET') {
    return handleGetOcr(ocrMatch[1], ocrMatch[2], request)
  }

  // /api/crew/:crewId/personal-info
  const piMatch = url.pathname.match(/^\/api\/crew\/([^/]+)\/personal-info$/)
  if (!piMatch) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })

  const crewId = piMatch[1]
  if (request.method === 'GET')   return handleGet(crewId, request)
  if (request.method === 'PATCH') return handlePatch(crewId, request)

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
}
