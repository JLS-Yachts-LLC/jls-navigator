/**
 * Visa report export from the browser — /api/visa/export needs the signed-in
 * user's token, so a plain link or window.open can't fetch it. These fetch with
 * the token and hand the file to the browser.
 */
import { supabase } from '@/integrations/supabase/client'
import { triggerBlobDownload } from '@/lib/visa/documentExport'

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** Download a /api/visa/export?… file (PDF or CSV). Throws with the server's reason. */
export async function downloadVisaExport(url: string): Promise<void> {
  const res = await fetch(url, { headers: await authHeaders() })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    let reason = body
    try { reason = JSON.parse(body).error ?? body } catch { /* plain text */ }
    throw new Error(reason || `Export failed (${res.status})`)
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1]
    ?? (url.includes('format=pdf') ? 'Visa-Report.pdf' : 'Visa-Report.csv')
  triggerBlobDownload(await res.blob(), name)
}

/** Email the vessel's visa report to the signed-in user (the server sends it to them only). */
export async function emailVisaExport(yachtId: string, query = ''): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/visa/export/email${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ yacht_id: yachtId }),
  })
  return res.json().catch(() => ({ ok: false, error: `Email failed (${res.status})` }))
}
