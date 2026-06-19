/**
 * GET /api/config/fees
 *
 * Returns fee configuration for the supporting documents page.
 * Defaults are returned when no DB override is configured.
 */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=300' },
  })
}

export async function configFeesHandler(_request: Request): Promise<Response> {
  // These values can be moved to a DB config table in a future migration.
  return json({
    supporting_letter_aed: '50.00',
    supporting_letter_usd: '14.00',
  })
}
