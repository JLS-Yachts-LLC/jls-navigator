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
 *
 * Acquisition goes through the `qb_try_entity_lock` RPC rather than a plain
 * INSERT, for two reasons:
 *
 *   1. Contention used to be signalled by letting the INSERT fail on the primary
 *      key. That works, but every single collision writes a Postgres ERROR —
 *      590 of them in one 24h window, enough to trip the infrastructure monitor
 *      and to bury genuine errors in the log. Normal contention is not an error
 *      and should not be recorded as one.
 *   2. Taking over a dead holder's lock used to be SELECT-then-UPDATE, so two
 *      invocations could both read the same stale row and both conclude they had
 *      won it — the exact race the lock exists to prevent. The RPC does it as a
 *      single conditional upsert, so exactly one caller can win.
 */
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { auth: { persistSession: false } })
}

/** How long before a crashed holder's lock can be taken over. */
const STALE_SECONDS = 180

/** Try to acquire the lock. True = we hold it; false = someone else is processing. */
export async function tryEntityLock(key: string): Promise<boolean> {
  const { data, error } = await admin()
    .rpc('qb_try_entity_lock', { p_key: key, p_stale_seconds: STALE_SECONDS })
  // Fail closed: if the lock cannot be evaluated, don't process. The 5-minute
  // backstop picks the entity up, which is far cheaper than two invocations
  // hammering the QBO API for the same document.
  if (error) return false
  return data === true
}

export async function releaseEntityLock(key: string): Promise<void> {
  await admin().from('qb_entity_locks').delete().eq('key', key)
}
