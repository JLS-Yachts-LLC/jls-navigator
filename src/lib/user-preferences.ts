/**
 * Per-person interface settings, saved to their account (user_preferences) so
 * they follow them to any browser or device — e.g. which sidebar sections are
 * folded, whether the menu is pinned.
 *
 * The browser keeps a copy per user so the layout is right on the first paint;
 * the account copy then confirms or corrects it. A setting saved only in this
 * browser before accounts stored them (the old un-namespaced key) is carried
 * over to the account the first time.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

const localKey = (uid: string, key: string) => `polaris.pref.${uid}.${key}`;

function readLocal<T>(k: string, parse: (raw: string) => T): T | undefined {
  try {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(k);
    return raw == null ? undefined : parse(raw);
  } catch {
    return undefined;
  }
}
function writeLocal(k: string, v: unknown) {
  try { window.localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ }
}

export function useUserPreference<T>(key: string, fallback: T, legacy?: { key: string; parse: (raw: string) => T }) {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const [value, setValue] = useState<T>(() => readLocal(legacy?.key ?? "", legacy?.parse ?? JSON.parse) ?? fallback);
  const latest = useRef(value);
  latest.current = value;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Signed in: this person's browser copy straight away, then their account copy.
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    const cached = readLocal<T>(localKey(uid, key), JSON.parse);
    if (cached !== undefined) setValue(cached);
    void (supabase as any).from("user_preferences").select("prefs").eq("user_id", uid).maybeSingle()
      .then(({ data, error }: any) => {
        if (cancelled || error) return;
        const saved = data?.prefs?.[key];
        if (saved !== undefined) {
          setValue(saved as T);
          writeLocal(localKey(uid, key), saved);
        } else if (cached === undefined && legacy) {
          // First time on an account: keep what this browser already had.
          const old = readLocal(legacy.key, legacy.parse);
          if (old !== undefined) void (supabase as any).rpc("set_my_preference", { p_key: key, p_value: old });
        }
      });
    return () => { cancelled = true; };
  }, [uid, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback((next: T | ((prev: T) => T)) => {
    const v = typeof next === "function" ? (next as (p: T) => T)(latest.current) : next;
    setValue(v);
    if (!uid) return;
    writeLocal(localKey(uid, key), v);
    // Clicks in quick succession save once.
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void (supabase as any).rpc("set_my_preference", { p_key: key, p_value: v });
    }, 500);
  }, [uid, key]);

  return [value, update] as const;
}
