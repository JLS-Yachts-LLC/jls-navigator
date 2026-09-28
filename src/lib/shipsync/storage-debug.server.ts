/**
 * Read-only diagnostic: lists the real Supabase Storage buckets, so we can
 * confirm whether a bucket literally named `shipsync` still exists.
 *
 * Context: every ShipSync/Warehouse upload hardcodes `.storage.from('shipsync')`.
 * A client hit `{"statusCode":"404","error":"Bucket not found"}` uploading a
 * Payment Copy. The migration that made this bucket private
 * (20260904120000_shipsync_private_bucket.sql) left a comment saying the
 * migration tooling couldn't write to storage.buckets, so the actual flip to
 * private was "applied separately" by hand — outside the normal migration
 * pipeline. This checks whether that manual step left the bucket under its
 * expected id, or recreated it under a different one. Writes nothing.
 */
import { supabaseAdmin } from '@/integrations/supabase/client.server'

export async function debugStorageBuckets(): Promise<Record<string, unknown>> {
  const { data, error } = await supabaseAdmin.storage.listBuckets()
  if (error) return { ok: false, error: error.message }
  const buckets = (data ?? []).map((b) => ({ id: b.id, name: b.name, public: b.public }))
  const shipsync = buckets.find((b) => b.id === 'shipsync')
  return { ok: true, buckets, hasExactShipsyncBucket: !!shipsync, shipsync: shipsync ?? null }
}
