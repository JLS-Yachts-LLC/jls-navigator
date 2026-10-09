/**
 * True for "the request never made it" — a dropped connection, no signal, a
 * timeout — as opposed to the server answering with an error. The browsers word
 * it differently, so this matches each one's message.
 */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = String((e as { message?: string } | null)?.message ?? e ?? "");
  return /failed to fetch|network ?error|network request failed|network connection (was )?lost|connection (was )?lost|load failed|fetch failed|timed out|timeout|econnreset|socket hang up|other side closed|terminated/i.test(msg);
}
