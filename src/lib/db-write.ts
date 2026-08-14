/**
 * Guard against the silent no-op write.
 *
 * A Supabase UPDATE that row-level security refuses matches ZERO rows and returns
 * NO error. Callers that only checked `error` therefore reported success while
 * nothing changed — the "I edited the vessel, saved, and it reverted" class of bug
 * (reported by Port Operations, Aug 2026: yachts are only editable by their
 * creator or an admin, and synced vessels have no creator).
 *
 * Pair every update with `.select(...)` and route it through updateOrThrow, so a
 * refused write surfaces as a real error instead of a green success toast.
 */

type WriteResponse = { data: unknown; error: { message: string } | null }

/** Throws on a database error, and on an update that matched no rows. */
export async function updateOrThrow(
  query: PromiseLike<WriteResponse>,
  /** What the user was editing, e.g. "vessel" or "permit" — used in the message. */
  entity: string,
): Promise<void> {
  const { data, error } = await query
  if (error) throw new Error(error.message)
  const rows = Array.isArray(data) ? data : data == null ? [] : [data]
  if (rows.length === 0) {
    throw new Error(
      `Nothing was saved — you may not have permission to change this ${entity}. ` +
      `Ask an administrator to check your access.`,
    )
  }
}
