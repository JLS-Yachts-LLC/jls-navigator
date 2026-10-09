/**
 * Is somebody still signed in on this phone, even though the connection is down?
 *
 * The sign-in token lasts an hour and can only be renewed over the network, so with no
 * signal supabase reports "no session" once it has expired — which would send a warehouse
 * worker to the sign-in page, where they can't sign in either. The refresh token stored on
 * the phone shows they ARE signed in; the app can open, and syncs when signal returns.
 */
export function hasStoredSession(storage: Pick<Storage, "length" | "key" | "getItem"> | null = typeof localStorage !== "undefined" ? localStorage : null): boolean {
  if (!storage) return false;
  try {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (!k || !/^sb-.+-auth-token$/.test(k)) continue;
      const v = JSON.parse(storage.getItem(k) ?? "null") as { refresh_token?: string } | null;
      if (v?.refresh_token) return true;
    }
  } catch { /* unreadable storage: treat as signed out */ }
  return false;
}
