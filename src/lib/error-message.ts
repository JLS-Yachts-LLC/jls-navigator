/**
 * The message to show for a caught error — whatever threw it.
 *
 * `e instanceof Error ? e.message : "Could not save"` looks complete but is not:
 * Supabase returns its errors (PostgrestError, StorageError, AuthError) as plain
 * objects with a `message`, not as Error instances. Rethrown with `throw error`,
 * they fell through to the generic fallback — so a save the database refused for
 * a specific, readable reason showed the user only "Could not save".
 */
export function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message;
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  if (typeof e === "string" && e.trim()) return e;
  return fallback;
}
