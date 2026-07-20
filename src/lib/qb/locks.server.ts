/**
 * Per-entity processing locks for the QuickBooks pipeline.
 *
 * When Intuit resumes webhook delivery after a backoff it dumps every queued
 * batch at once — several concurrent Worker invocations all processing the SAME
 * invoice, each making 5-10 QBO API calls → 429 rate-limit storms and racing
 * duplicate-sweeps. A DB-backed lock ensures only ONE invocation processes a
 * given entity at a time. Skipping is safe: processing always fetches the
 * entity's CURRENT state from QBO (not the event payload), so whichever
 * invocation holds the lock does the complete job; anything it might miss is
 * caught by the 5-minute backstop/reconciler.
 */
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { auth: { persistSession: false } })
}

const STALE_MS = 3 * 60_000 // a crashed holder's lock is taken over after 3 min

/** Try to acquire the lock. True = we hold it; false = someone else is processing. */
export async function tryEntityLock(key: string): Promise<boolean> {
  const sb = admin()
  const { error } = await sb.from('qb_entity_locks').insert({ key, locked_at: new Date().toISOString() })
  if (!error) return true
  // Row exists — take over only if the holder looks dead.
  const { data } = await sb.from('qb_entity_locks').select('locked_at').eq('key', key).maybeSingle()
  if (data?.locked_at && Date.now() - new Date(data.locked_at).getTime() > STALE_MS) {
    await sb.from('qb_entity_locks').update({ locked_at: new Date().toISOString() }).eq('key', key)
    return true
  }
  return false
}

export async function releaseEntityLock(key: string): Promise<void> {
  await admin().from('qb_entity_locks').delete().eq('key', key)
}
