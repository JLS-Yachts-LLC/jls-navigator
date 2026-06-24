/**
 * FX rate lookup — GET /api/fx-rate?from=GBP&to=AED&date=YYYY-MM-DD
 *
 * Returns the exchange rate (1 `from` = rate `to`). Tries a historical rate for
 * the given date first (Frankfurter / ECB — good for major pairs), then falls
 * back to a current rate (open.er-api, which covers AED and most currencies).
 * No API key required. Best-effort: the caller can always override manually.
 */
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

export async function fxRateHandler(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const from = (url.searchParams.get('from') || '').toUpperCase().trim()
  const to = (url.searchParams.get('to') || '').toUpperCase().trim()
  const date = url.searchParams.get('date') || '' // YYYY-MM-DD (optional)
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) {
    return json({ ok: false, error: 'from and to must be 3-letter currency codes' }, 400)
  }
  if (from === to) return json({ ok: true, rate: 1, date: date || null, source: 'identity', historical: !!date })

  // 1. Historical via Frankfurter (ECB reference rates — won't have every currency).
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    try {
      const r = await fetch(`https://api.frankfurter.app/${date}?from=${from}&to=${to}`)
      if (r.ok) {
        const j: any = await r.json()
        const rate = j?.rates?.[to]
        if (typeof rate === 'number') return json({ ok: true, rate, date: j.date ?? date, source: 'frankfurter', historical: true })
      }
    } catch { /* fall through */ }
  }

  // 2. Current rate via open.er-api (free, covers AED + most currencies).
  try {
    const r = await fetch(`https://open.er-api.com/v6/latest/${from}`)
    if (r.ok) {
      const j: any = await r.json()
      const rate = j?.rates?.[to]
      if (typeof rate === 'number') {
        return json({ ok: true, rate, date: j?.time_last_update_utc ?? null, source: 'open.er-api (latest)', historical: false })
      }
    }
  } catch { /* fall through */ }

  return json({ ok: false, error: `Could not find a ${from}→${to} rate. Enter it manually.` }, 502)
}
