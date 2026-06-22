/**
 * GET /api/config/fees
 *
 * Returns fee configuration for the supporting documents page.
 * Reads from platform_config (migration 042); falls back to hard defaults so the
 * UI never errors if the config table or a key is missing (RULES §2).
 */

import { createClient } from '@supabase/supabase-js'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=300' },
  })
}

const DEFAULTS = { supporting_letter_aed: '50.00', supporting_letter_usd: '14.00' }

export async function configFeesHandler(_request: Request): Promise<Response> {
  try {
    const sb = createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
      auth: { persistSession: false },
    })
    const { data } = await sb
      .from('platform_config')
      .select('key, value')
      .in('key', ['uae_visa_supporting_letter_aed', 'uae_visa_supporting_letter_usd'])

    const cfg = Object.fromEntries(((data ?? []) as any[]).map((r) => [r.key, r.value]))
    return json({
      supporting_letter_aed: cfg['uae_visa_supporting_letter_aed'] ?? DEFAULTS.supporting_letter_aed,
      supporting_letter_usd: cfg['uae_visa_supporting_letter_usd'] ?? DEFAULTS.supporting_letter_usd,
    })
  } catch {
    return json(DEFAULTS)
  }
}
