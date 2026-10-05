/**
 * Client-portal e-signatures — documents JLS has sent this person to sign.
 *
 *   GET /api/portal/esign            → { toSign[], signed[] } for the caller's own email
 *   GET /api/portal/esign?signed=<id> → 302 to the signed copy (short-lived link)
 *
 * E-sign documents (esign_documents) are addressed to a signer's email, not a
 * vessel, so the portal shows the ones addressed to the signed-in person. A
 * document awaiting signature carries its signing link (the same /sign/<token>
 * page the email links to); in staff preview no signing links are returned —
 * staff see what's waiting, but can't sign as the client.
 */
import { createClient } from '@supabase/supabase-js'
import { resolvePortalYacht } from '@/lib/portal/portal-auth.server'
import { parseStorageRefOrPath } from '@/lib/signed-url'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function portalEsignHandler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)
  const auth = await resolvePortalYacht(request)
  if (!auth.ok) return auth.response
  const { yacht } = auth
  if (!yacht.mfaVerified) return json({ error: 'Two-factor verification required' }, 403)
  const sb = admin()

  // Whose documents: the client's own email — in preview, the previewed client's.
  let email = (yacht.email || '').toLowerCase()
  if (yacht.preview) {
    const pid = request.headers.get('X-Portal-Preview') ?? ''
    const { data } = await sb.from('captain_accounts').select('email').eq('id', pid).maybeSingle()
    email = String((data as any)?.email ?? '').toLowerCase()
  }
  if (!email) return json({ toSign: [], signed: [] })

  const url = new URL(request.url)
  const signedId = url.searchParams.get('signed')
  if (signedId) {
    if (!UUID_RE.test(signedId)) return json({ error: 'Not found' }, 404)
    const { data: doc } = await sb.from('esign_documents').select('id, signer_email, status, signed_file_path').eq('id', signedId).maybeSingle()
    if (!doc || String((doc as any).signer_email ?? '').toLowerCase() !== email || (doc as any).status !== 'signed' || !(doc as any).signed_file_path) {
      return json({ error: 'Not found' }, 404)
    }
    const ref = parseStorageRefOrPath(String((doc as any).signed_file_path), 'esign-documents')
    const signed = ref ? await sb.storage.from(ref.bucket).createSignedUrl(ref.path, 5 * 60) : null
    if (!signed?.data?.signedUrl) return json({ error: 'That document could not be opened' }, 502)
    return new Response(null, { status: 302, headers: { Location: signed.data.signedUrl, 'Cache-Control': 'no-store' } })
  }

  const { data, error } = await sb.from('esign_documents')
    .select('id, reference, title, description, message, status, signing_token, token_expires_at, sent_at, signed_at')
    .ilike('signer_email', email)
    .in('status', ['sent', 'viewed', 'signed'])
    .order('sent_at', { ascending: false })
    .limit(100)
  if (error) return json({ error: 'Could not load documents to sign' }, 500)

  const now = Date.now()
  const rows = (data ?? []) as any[]
  const toSign = rows
    .filter((d) => d.status !== 'signed' && (!d.token_expires_at || Date.parse(d.token_expires_at) > now))
    .map((d) => ({
      id: d.id, reference: d.reference, title: d.title, description: d.description, message: d.message,
      sentAt: d.sent_at, expiresAt: d.token_expires_at,
      signUrl: yacht.preview ? null : `/sign/${d.signing_token}`,
    }))
  const signed = rows.filter((d) => d.status === 'signed')
    .map((d) => ({ id: d.id, reference: d.reference, title: d.title, signedAt: d.signed_at }))
  return json({ toSign, signed })
}
