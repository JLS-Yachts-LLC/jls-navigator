/** Browser helper for POST /api/esign-campaigns (staff bearer auth). */
import { supabase } from "@/integrations/supabase/client";

export async function campaignApi<T = any>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch("/api/esign-campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
    body: JSON.stringify({ action, ...payload }),
  });
  let body: any = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body as T;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** All valid addresses in a free-text email field ("a@x.com; b@y.com / c@z"). */
export function parseEmails(raw: string | null | undefined): string[] {
  return String(raw ?? "")
    .split(/[\s;,/]+/)
    .map((e) => e.trim().replace(/^mailto:/i, "").replace(/[<>()]/g, ""))
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}
