/**
 * Staff profile pictures from Microsoft Entra.
 *
 * Copies each staff member's Microsoft 365 photo into their Polaris avatar
 * (`user_profiles.avatar_url`), so the top bar, Manage Users and the pickers
 * show a face instead of initials without anyone uploading anything.
 *
 * Rules:
 *  - A picture someone chose themselves (profile menu → Your profile) is never
 *    replaced. Only an empty avatar, or one this sync set earlier, is touched —
 *    the sync's files are named `staff-avatars/entra-…` so they can be told apart.
 *  - The file name carries a hash of Graph's photo ETag, so an unchanged photo
 *    costs one small metadata call and no download or upload.
 *  - If the photo is removed in Entra, the avatar this sync set is cleared too.
 *
 * Uses the Polaris mail Graph app, which has User.Read.All (enough to read
 * other people's photos). Logins outside the JLS tenant (e.g. New Horizon
 * addresses) simply come back 404 and are left alone.
 */
import { createClient } from '@supabase/supabase-js'
import { getGraphToken } from '@/lib/sharepoint-sync.server'

const MAIL_TENANT_ID = process.env.MAIL_GRAPH_TENANT_ID ?? '428f2dd0-7a0b-431d-9470-7162111882dd'
const MAIL_CLIENT_ID = process.env.MAIL_GRAPH_CLIENT_ID ?? '4f37ca1a-ddbe-4c80-b409-d8e42ac986fa'

const BUCKET = 'permit-documents'
const ENTRA_PREFIX = 'staff-avatars/entra-'
/** Graph's ready-made square sizes; 240 is sharp at the 64px profile dialog. */
const PHOTO_SIZE = '240x240'

export type EntraPhotoResult = {
  checked: number
  updated: number
  unchanged: number
  noPhoto: number
  cleared: number
  keptOwn: number
  errors: string[]
}

function getAdmin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

async function shortHash(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].slice(0, 6).map((b) => b.toString(16).padStart(2, '0')).join('')
}

const isEntraRef = (ref: string | null) => !!ref && ref.startsWith(`${BUCKET}/${ENTRA_PREFIX}`)

export async function syncEntraPhotos(): Promise<EntraPhotoResult> {
  const secret = process.env.MAIL_GRAPH_CLIENT_SECRET ?? process.env.MAIL_GRAPH_CLIENT_SECRE
  if (!secret) throw new Error('MAIL_GRAPH_CLIENT_SECRET is not set')
  const token = await getGraphToken(MAIL_TENANT_ID, MAIL_CLIENT_ID, secret)
  const H = { Authorization: `Bearer ${token}` }

  const sb = getAdmin()
  const { data: profiles, error } = await sb
    .from('user_profiles').select('user_id, email, avatar_url').not('email', 'is', null)
  if (error) throw new Error(error.message)

  const out: EntraPhotoResult = { checked: 0, updated: 0, unchanged: 0, noPhoto: 0, cleared: 0, keptOwn: 0, errors: [] }

  for (const p of (profiles ?? []) as { user_id: string; email: string; avatar_url: string | null }[]) {
    if (p.avatar_url && !isEntraRef(p.avatar_url)) { out.keptOwn++; continue }
    out.checked++
    const who = encodeURIComponent(p.email.trim())
    try {
      const meta = await fetch(`https://graph.microsoft.com/v1.0/users/${who}/photos/${PHOTO_SIZE}`, { headers: H })
      if (meta.status === 404) {
        // No photo in Entra (or not a user in this tenant). Drop a picture we set
        // earlier so a removed photo does not linger here.
        if (isEntraRef(p.avatar_url)) {
          await sb.from('user_profiles').update({ avatar_url: null, updated_at: new Date().toISOString() }).eq('user_id', p.user_id)
          out.cleared++
        } else out.noPhoto++
        continue
      }
      if (!meta.ok) throw new Error(`photo metadata ${meta.status}`)
      const etag = String((await meta.json())['@odata.mediaEtag'] ?? '')
      const path = `${ENTRA_PREFIX}${p.user_id}-${await shortHash(etag || p.email)}.jpg`
      const ref = `${BUCKET}/${path}`
      if (p.avatar_url === ref) { out.unchanged++; continue }

      const img = await fetch(`https://graph.microsoft.com/v1.0/users/${who}/photos/${PHOTO_SIZE}/$value`, { headers: H })
      if (!img.ok) throw new Error(`photo download ${img.status}`)
      const bytes = new Uint8Array(await img.arrayBuffer())
      const contentType = img.headers.get('content-type') ?? 'image/jpeg'

      const up = await sb.storage.from(BUCKET).upload(path, bytes, { upsert: true, contentType })
      if (up.error) throw new Error(up.error.message)

      // Only replace when the avatar is still empty or ours — the person may have
      // chosen their own picture while this was running.
      let q = sb.from('user_profiles').update({ avatar_url: ref, updated_at: new Date().toISOString() }).eq('user_id', p.user_id)
      q = p.avatar_url ? q.eq('avatar_url', p.avatar_url) : q.is('avatar_url', null)
      const { error: upErr } = await q
      if (upErr) throw new Error(upErr.message)

      if (isEntraRef(p.avatar_url)) {
        await sb.storage.from(BUCKET).remove([p.avatar_url!.slice(BUCKET.length + 1)])
      }
      out.updated++
    } catch (e) {
      out.errors.push(`${p.email}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return out
}
