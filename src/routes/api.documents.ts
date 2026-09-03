/**
 * Public endpoints behind the secure document link. Both are unauthenticated —
 * the token is the credential — and both refuse to explain themselves beyond
 * "this link is not usable", so a guessed token reveals nothing.
 *
 *   GET /api/documents/meta?token=…  → what the landing page shows
 *   GET /api/documents/open?token=…  → 302 to a short-lived signed URL
 */
import { viewDocumentShare, openDocumentShare } from '@/lib/document-share.server'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })

export async function documentShareMetaHandler(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get('token') ?? ''
  const view = await viewDocumentShare(token)
  // Always 200: the landing page renders the "expired / not available" state
  // itself, and a status code should not be a probe for valid tokens.
  return json(view)
}

export async function documentShareOpenHandler(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get('token') ?? ''
  const opened = await openDocumentShare(token)
  if (!opened) return json({ error: 'This link is no longer available.' }, 410)

  return new Response(null, {
    status: 302,
    headers: { Location: opened.url, 'Cache-Control': 'no-store' },
  })
}
