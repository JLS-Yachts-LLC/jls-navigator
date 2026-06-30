/**
 * GET /api/native-language/resolve-default
 *
 * Called once when the Visa Application form's Native Language field
 * mounts. Returns the resolved default per the priority chain, along
 * with the language list (for the dropdown) and the popular-languages
 * flag set.
 *
 * Query params:
 *   passportCountry    — optional, ISO 3166-1 alpha-2, from OCR'd passport data
 *   nationalityCountry — optional, ISO 3166-1 alpha-2, from the nationality field
 *   applicationId      — optional, visa application UUID (for logging)
 *
 * Auth: reads the Supabase session from the Bearer token if present.
 * Falls back to the X-Guest-Token header if not authenticated.
 *
 * IMPORTANT: if the application already has a SAVED native_language value
 * the form should read that directly — do not call this route. This route
 * is for the FIRST load of a fresh application only.
 */

import { createClient } from '@supabase/supabase-js'
import {
  resolveNativeLanguageDefault,
  logSelectionResolution,
} from '@/lib/native-language/resolveNativeLanguageDefault'

const GUEST_HEADER = 'X-Guest-Token'

function getAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url || !key) throw new Error('Supabase admin credentials missing')
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function nativeLanguageResolveDefaultHandler(request: Request): Promise<Response> {
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }

  const url                = new URL(request.url)
  const passportCountry    = url.searchParams.get('passportCountry')
  const nationalityCountry = url.searchParams.get('nationalityCountry')
  const applicationId      = url.searchParams.get('applicationId')
  const guestToken         = request.headers.get(GUEST_HEADER)

  const supabase = getAdmin()

  // Resolve authenticated session from Bearer token, if present
  let userId: string | null = null
  const authHeader = request.headers.get('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const { data } = await supabase.auth.getUser(token)
    userId = data.user?.id ?? null
  }

  try {
    const resolved = await resolveNativeLanguageDefault({
      passportIssuingCountry: passportCountry,
      nationalityCountry,
      userId,
      guestToken,
      supabase,
    })

    // Fetch the full language list in the same call — avoids a second round trip
    const { data: languages, error: langError } = await supabase
      .from('languages')
      .select('code, name, native_name, is_popular, sort_order')
      .order('is_popular', { ascending: false })
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (langError) {
      return Response.json(
        { error: 'Failed to load language list', detail: langError.message },
        { status: 500 },
      )
    }

    // Log resolution — fire and forget, does not block the response
    logSelectionResolution(
      {
        userId,
        guestToken,
        applicationId,
        resolvedSource:     resolved.source,
        resolvedLanguage:   resolved.languageCode,
        passportCountry:    resolved.detail?.passportCountry ?? null,
        nationalityCountry: resolved.detail?.nationalityCountry ?? null,
      },
      supabase,
    ).catch((e) => console.error('[resolve-default] log failed silently:', e))

    return Response.json({
      defaultLanguageCode: resolved.languageCode,
      defaultSource:       resolved.source,
      languages:           languages ?? [],
    })
  } catch (err: unknown) {
    console.error('[GET /api/native-language/resolve-default] unexpected error:', err)
    return Response.json(
      { error: 'Unexpected error resolving native language default' },
      { status: 500 },
    )
  }
}
