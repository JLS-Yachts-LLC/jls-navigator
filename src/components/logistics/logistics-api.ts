/** Logistics mobile app — calls to the ShipSync server endpoints (delivery-note PDF, proof-of-delivery email). */
import { supabase } from "@/integrations/supabase/client";
import { resolveSignedUrl } from "@/lib/signed-url";

export async function shipsyncApi<T = Record<string, any>>(path: string, payload: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
    body: JSON.stringify(payload),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.error ?? `Failed (${r.status})`);
  return j as T;
}

/** Build (or rebuild) a delivery note's PDF and return a short-lived link that opens it. */
export async function generateNotePdf(noteId: string, kind: "predelivery" | "delivery" = "predelivery"): Promise<string> {
  const j = await shipsyncApi<{ pdfUrl: string }>("/api/shipsync/note-pdf", { noteId, kind });
  return resolveSignedUrl(j.pdfUrl, "shipsync");
}
