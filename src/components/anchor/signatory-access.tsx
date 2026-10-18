/**
 * Which JLS signatories the signed-in user may put on a document, for the signature
 * pickers (e-Sign fields, DMA approval). The server enforces the same rules when it
 * stamps — this only greys out what would be refused.
 *   own        — their own signature
 *   authorised — an authorised user of that signatory
 *   approval   — allowed, but the signatory approves each use first
 *   none       — not allowed; they can ask for permission
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type SignatoryAccess = "own" | "authorised" | "approval" | "none";
export type PickableSignatory = {
  id: string; full_name: string; title: string | null; email: string | null;
  approver_name: string | null; approver_email: string | null;
  signature_path: string | null; active: boolean; access: SignatoryAccess;
};

export function useSignatoryAccess(opts: { activeOnly?: boolean } = {}) {
  const [rows, setRows] = useState<PickableSignatory[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let on = true;
    void (async () => {
      let q = (supabase as any).from("jls_signatories")
        .select("id, full_name, title, email, approver_name, approver_email, signature_path, active").order("full_name");
      if (opts.activeOnly) q = q.eq("active", true);
      const [{ data: sigs }, { data: access }] = await Promise.all([q, (supabase as any).rpc("my_signatory_access")]);
      const byId = new Map<string, SignatoryAccess>(((access ?? []) as { signatory_id: string; access: SignatoryAccess }[]).map((a) => [a.signatory_id, a.access]));
      if (on) { setRows(((sigs ?? []) as any[]).map((s) => ({ ...s, access: byId.get(s.id) ?? "none" }))); setLoading(false); }
    })();
    return () => { on = false; };
  }, [opts.activeOnly]);
  return { signatories: rows, loading };
}

export const ACCESS_HINT: Record<SignatoryAccess, string> = {
  own: "",
  authorised: "",
  approval: " — needs their approval",
  none: " — no permission",
};

export async function anchorSignatoriesApi(action: string, body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch("/api/anchor-signatories", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
    body: JSON.stringify({ action, ...body }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || out?.ok === false) throw new Error(out?.error ?? `Request failed (${res.status})`);
  return out;
}

export async function requestSignatoryPermission(s: { id: string; full_name: string }) {
  const note = window.prompt(`Ask ${s.full_name} to let you use their signature. Add a note (optional):`, "");
  if (note === null) return;
  try {
    await anchorSignatoriesApi("request-access", { signatoryId: s.id, note });
    toast.success(`Request sent to ${s.full_name}`);
  } catch (e: any) { toast.error(e.message ?? "Request failed"); }
}

/** "Request permission" links for the signatories the user can't use. */
export function RequestPermissionLinks({ signatories }: { signatories: PickableSignatory[] }) {
  const blocked = signatories.filter((s) => s.access === "none" && s.active);
  if (!blocked.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
      <span>No permission:</span>
      {blocked.map((s) => (
        <button key={s.id} type="button" onClick={() => void requestSignatoryPermission(s)} className="text-primary hover:underline">
          {s.full_name} · Request permission
        </button>
      ))}
    </div>
  );
}
