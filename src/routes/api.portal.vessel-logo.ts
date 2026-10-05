/**
 * Client-portal vessel logo — the vessel's badge, set by its own portal users.
 *
 *   POST   /api/portal/vessel-logo   (multipart/form-data, field `file`) → { logoUrl }
 *   DELETE /api/portal/vessel-logo   → { logoUrl: null }
 *
 * Portal logins cannot write to Storage or to `yachts` themselves (restrictive
 * fences on both), so the upload happens here with the service role, for the one
 * vessel resolved from the caller's JWT. The file lands in the public
 * vessel-images bucket under logos/<yacht_id>/ — a logo is meant to be shown —
 * and the type is checked from the file's own bytes, not the name or the header
 * the browser sent. SVG is refused: it can carry script.
 */
import { createClient } from '@supabase/supabase-js'
import { resolvePortalYacht } from '@/lib/portal/portal-auth.server'
import { canManageVessel } from '@/lib/portal/portal-positions'
import { logAuditEvent } from '@/lib/admin/audit'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}

const BUCKET = 'vessel-images'
const MAX_BYTES = 2 * 1024 * 1024

/** Identify PNG / JPEG / WebP from the first bytes. */
function sniffImage(b: Uint8Array): { ext: string; type: string } | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: 'png', type: 'image/png' }
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' }
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
    return { ext: 'webp', type: 'image/webp' }
  return null
}

/** The storage path behind a logo URL, when it is this vessel's own file. */
function ownLogoPath(url: string | null, yachtId: string): string | null {
  const m = url ? /\/storage\/v1\/object\/public\/vessel-images\/([^?#]+)/.exec(url) : null
  const path = m ? decodeURIComponent(m[1]) : null
  return path?.startsWith(`logos/${yachtId}/`) ? path : null
}

export async function portalVesselLogoHandler(request: Request): Promise<Response> {
  const auth = await resolvePortalYacht(request)
  if (!auth.ok) return auth.response
  const { yacht } = auth
  if (!yacht.mfaVerified) return json({ error: 'Two-factor verification required' }, 403)
  if (yacht.preview) return json({ error: 'Read-only preview — sign in as the client to make changes.' }, 403)
  if (!canManageVessel(yacht.position)) return json({ error: "Your position can't change the vessel's logo." }, 403)
  if (request.method !== 'POST' && request.method !== 'DELETE') return json({ error: 'Method not allowed' }, 405)

  const sb = admin()
  const { data: current } = await sb.from('yachts').select('logo_url').eq('id', yacht.yachtId).maybeSingle()
  const previous = (current as any)?.logo_url as string | null ?? null

  try {
    let logoUrl: string | null = null
    if (request.method === 'POST') {
      const form = await request.formData().catch(() => null)
      const file = form?.get('file')
      if (!file || typeof file === 'string') return json({ error: 'Choose an image to upload' }, 400)
      if (file.size > MAX_BYTES) return json({ error: 'That image is over 2 MB — please use a smaller one.' }, 400)
      const bytes = new Uint8Array(await file.arrayBuffer())
      const kind = sniffImage(bytes)
      if (!kind) return json({ error: 'Use a PNG, JPG or WebP image.' }, 400)

      const path = `logos/${yacht.yachtId}/${Date.now()}.${kind.ext}`
      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: kind.type, upsert: false })
      if (upErr) throw upErr
      logoUrl = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
    }

    const { error } = await sb.from('yachts').update({ logo_url: logoUrl }).eq('id', yacht.yachtId)
    if (error) throw error

    // Only once the row has moved on — never leave it pointing at a deleted file.
    const oldPath = ownLogoPath(previous, yacht.yachtId)
    if (oldPath && previous !== logoUrl) await sb.storage.from(BUCKET).remove([oldPath]).catch(() => {})

    await logAuditEvent({
      event_type: 'DATA',
      module: 'portal',
      actor_id: null,
      actor_email: yacht.email || '(client portal)',
      actor_role: yacht.position ?? 'captain',
      target_type: 'yachts',
      target_id: yacht.yachtId,
      target_label: yacht.vesselName,
      detail: `Client portal (${yacht.vesselName}) — vessel logo ${logoUrl ? (previous ? 'replaced' : 'uploaded') : 'removed'}`,
      ip_address: request.headers.get('cf-connecting-ip'),
      user_agent: request.headers.get('user-agent'),
      result: 'success',
    })
    return json({ ok: true, logoUrl })
  } catch (e: any) {
    console.error('[portal-vessel-logo]', e)
    return json({ error: e?.message ?? 'Could not save the logo' }, 500)
  }
}
