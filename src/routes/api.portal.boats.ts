/**
 * Client portal — the small boats a boat owner owns (Orbit 2 Managed Boats).
 *
 *   GET /api/portal/boats   → { boats: PortalBoat[] }
 *
 * Served with the service role and hard-filtered to the boats resolved from the
 * caller's JWT (resolvePortalBoats). Only owner-safe fields leave this route:
 * the boat's identity, spec and photo. Orbit 2's internal fields — notes, the
 * client_name the office typed, job prefixes, team comments and technician
 * names — are never selected, so they cannot be returned by mistake.
 */
import { createClient } from '@supabase/supabase-js'
import { resolvePortalBoats } from '@/lib/portal/portal-boats-auth.server'
import { parseStorageRefOrPath } from '@/lib/signed-url'

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}

/** Long enough for a portal session to show the photo; useless once copied out. */
const PHOTO_TTL = 60 * 60
/** Boat photos live in orbit-documents unless the reference names another bucket. */
const PHOTO_BUCKET = 'orbit-documents'
/** Inherited from Vessel Overview — a deliberately public bucket. */
const PUBLIC_BUCKETS = new Set(['vessel-images'])

const BOAT_COLUMNS = [
  'id', 'name', 'boat_type', 'image_ref',
  'hull_number', 'hull_material', 'year_of_build',
  'max_length_m', 'max_beam_m', 'max_passengers', 'mmsi', 'imo_no',
].join(', ')

export type PortalBoat = {
  id: string
  name: string
  boatType: string | null
  photoUrl: string | null
  spec: {
    hullNumber: string | null
    hullMaterial: string | null
    yearOfBuild: number | null
    lengthM: number | null
    beamM: number | null
    maxPassengers: number | null
    mmsi: string | null
    imo: string | null
  }
}

export async function portalBoatsHandler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)
  const auth = await resolvePortalBoats(request)
  if (!auth.ok) return auth.response
  const { owner } = auth
  const sb = admin()

  const { data, error } = await sb
    .from('orbit2_boats')
    .select(BOAT_COLUMNS)
    .in('id', owner.boatIds)
    .eq('active', true)
    .order('name', { ascending: true })
  if (error) return json({ error: 'Could not load your boats' }, 500)

  const boats: PortalBoat[] = await Promise.all((data ?? []).map(async (b: any) => ({
    id: b.id,
    name: b.name,
    boatType: b.boat_type ?? null,
    photoUrl: await photoUrl(sb, b.image_ref),
    spec: {
      hullNumber: b.hull_number ?? null,
      hullMaterial: b.hull_material ?? null,
      yearOfBuild: b.year_of_build ?? null,
      lengthM: b.max_length_m ?? null,
      beamM: b.max_beam_m ?? null,
      maxPassengers: b.max_passengers ?? null,
      mmsi: b.mmsi ?? null,
      imo: b.imo_no ?? null,
    },
  })))

  return json({ boats, preview: owner.preview })
}

async function photoUrl(sb: ReturnType<typeof admin>, stored: string | null): Promise<string | null> {
  if (!stored) return null
  // A full URL is a Vessel Overview photo carried over as-is (public bucket).
  if (/^https?:\/\//i.test(stored)) return stored
  const ref = parseStorageRefOrPath(stored, PHOTO_BUCKET)
  if (!ref) return null
  if (PUBLIC_BUCKETS.has(ref.bucket)) return sb.storage.from(ref.bucket).getPublicUrl(ref.path).data.publicUrl
  const { data } = await sb.storage.from(ref.bucket).createSignedUrl(ref.path, PHOTO_TTL)
  return data?.signedUrl ?? null
}
