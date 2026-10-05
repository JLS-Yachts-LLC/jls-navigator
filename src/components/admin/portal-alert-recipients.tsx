/**
 * Who hears about Client Portal activity. Everyone listed here gets an in-app
 * alert straight away and an email within a few minutes whenever a client
 * raises a request (incl. requisitions, quotation decisions, pre-arrival forms
 * and seaport requests), replies on one, or sends a chat message. A vessel's
 * responsible agent is alerted about that vessel as well.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { BellRing, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

const db = supabase as any;

type Staff = { user_id: string; display_name: string | null; email: string | null };

export function PortalAlertRecipients() {
  const { session } = useAuth();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: s }, { data: r }] = await Promise.all([
      db.from("user_profiles").select("user_id, display_name, email, active").neq("active", false).order("display_name"),
      db.from("portal_alert_recipients").select("user_id"),
    ]);
    setStaff((s ?? []).filter((x: any) => x.email));
    setRecipients((r ?? []).map((x: any) => x.user_id));
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const byId = useMemo(() => new Map(staff.map((s) => [s.user_id, s])), [staff]);
  const nameOf = (id: string) => byId.get(id)?.display_name || byId.get(id)?.email || "Unknown user";
  const available = staff.filter((s) => !recipients.includes(s.user_id));

  const add = async () => {
    if (!adding) return;
    setBusy(true);
    const { error } = await db.from("portal_alert_recipients").insert({ user_id: adding, added_by: (session as any)?.user?.id ?? null });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setRecipients((r) => [...r, adding]);
    setAdding("");
    toast.success(`${nameOf(adding)} will now get Client Portal alerts`);
  };
  const remove = async (id: string) => {
    const { error } = await db.from("portal_alert_recipients").delete().eq("user_id", id);
    if (error) { toast.error(error.message); return; }
    setRecipients((r) => r.filter((x) => x !== id));
  };

  return (
    <div className="mb-4 rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <BellRing className="h-4 w-4 text-primary/80" />
        <span className="text-sm font-semibold">Client alerts</span>
        <span className="text-xs text-muted-foreground">
          — who's told when a client raises a request, replies, or chats. In-app straight away, by email within a few minutes.
          Each vessel's responsible agent is told too.
        </span>
      </div>
      {loading ? (
        <Loader2 className="mt-3 h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {recipients.length === 0 && (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
              Nobody yet — client activity only shows as unread badges
            </span>
          )}
          {recipients.map((id) => (
            <span key={id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/40 py-1 pl-3 pr-1 text-xs">
              {nameOf(id)}
              <button type="button" onClick={() => void remove(id)} aria-label={`Stop alerting ${nameOf(id)}`}
                      className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-red-500/15 hover:text-red-300">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <div className="flex items-center gap-1.5">
            <select aria-label="Add someone to client alerts" value={adding} onChange={(e) => setAdding(e.target.value)}
                    className="h-8 rounded-lg border border-border bg-background/40 px-2 text-xs outline-none focus:border-primary/50">
              <option value="">Add a person…</option>
              {available.map((s) => <option key={s.user_id} value={s.user_id}>{s.display_name || s.email}</option>)}
            </select>
            <button type="button" onClick={() => void add()} disabled={!adding || busy}
                    className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
