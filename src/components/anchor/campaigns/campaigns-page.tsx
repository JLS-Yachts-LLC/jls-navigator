/**
 * Anchor → Campaigns. Send one document (e.g. the Standard Tariff Sheet or the
 * Agency Appointment Letter) to many yachts/people — each gets their own email
 * and signing link — and track who has signed. Also manages saved Groups.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Megaphone, Plus, Loader2, FolderHeart, Trash2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CampaignEditor } from "./campaign-editor";
import { CampaignDetail } from "./campaign-detail";
import { ContactGroups } from "./contact-groups";

const db = () => supabase as any;

type Campaign = {
  id: string; reference: string | null; name: string; doc_title: string; status: string;
  created_at: string; sent_at: string | null; created_by_name: string | null;
  recipients: { status: string; doc: { status: string } | null }[];
};

const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

const STATUS_CLS: Record<string, string> = {
  draft: "bg-slate-500/15 text-slate-600",
  sending: "bg-sky-500/15 text-sky-600",
  sent: "bg-emerald-500/15 text-emerald-600",
  cancelled: "bg-slate-500/15 text-slate-500",
};

type View = { kind: "list" } | { kind: "edit"; id: string | null } | { kind: "detail"; id: string };

export function CampaignsPage({ onOpenDocument, resumeCampaignId, onDetailChange }: {
  onOpenDocument?: (id: string) => void;
  /** Re-open this campaign's tracking view (e.g. coming back from a document). */
  resumeCampaignId?: string | null;
  onDetailChange?: (id: string | null) => void;
} = {}) {
  const [view, setViewState] = useState<View>(resumeCampaignId ? { kind: "detail", id: resumeCampaignId } : { kind: "list" });
  const setView = (v: View) => { setViewState(v); onDetailChange?.(v.kind === "detail" ? v.id : null); };
  const [sub, setSub] = useState<"campaigns" | "groups">("campaigns");
  const [rows, setRows] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (view.kind === "list") void load(); }, [view.kind]);

  async function load() {
    setLoading(true);
    const { data, error } = await db().from("esign_campaigns")
      .select("id, reference, name, doc_title, status, created_at, sent_at, created_by_name, recipients:esign_campaign_recipients(status, doc:esign_document_id(status))")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data ?? []) as Campaign[]);
    setLoading(false);
  }

  async function deleteDraft(c: Campaign) {
    if (!confirm(`Delete the draft "${c.name}"?`)) return;
    const { error } = await db().from("esign_campaigns").delete().eq("id", c.id).eq("status", "draft");
    if (error) toast.error(error.message); else await load();
  }

  if (view.kind === "edit") {
    return <CampaignEditor campaignId={view.id} onClose={() => setView({ kind: "list" })} onSent={(id) => setView({ kind: "detail", id })} />;
  }
  if (view.kind === "detail") {
    return <CampaignDetail campaignId={view.id} onBack={() => setView({ kind: "list" })} onOpenDocument={onOpenDocument} />;
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">Anchor</div>
          <h1 className="mt-0.5 flex items-center gap-2 font-display text-[1.25rem] font-semibold tracking-tight"><Megaphone className="h-4 w-4 text-primary/80" /> Signature Campaigns</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border/70 p-0.5 text-sm">
            {(["campaigns", "groups"] as const).map((k) => (
              <button key={k} onClick={() => setSub(k)} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 capitalize", sub === k ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {k === "groups" ? <FolderHeart className="h-3.5 w-3.5" /> : <Megaphone className="h-3.5 w-3.5" />} {k}
              </button>
            ))}
          </div>
          {sub === "campaigns" && <Button size="sm" className="h-9 gap-1.5" onClick={() => setView({ kind: "edit", id: null })}><Plus className="h-3.5 w-3.5" /> New campaign</Button>}
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {sub === "groups" ? <ContactGroups /> : loading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <div className="mx-auto max-w-lg rounded-xl border border-dashed border-border/70 p-10 text-center">
            <Megaphone className="mx-auto mb-3 h-7 w-7 text-primary/60" />
            <h2 className="font-semibold">Send a document to many clients at once</h2>
            <p className="mt-1 text-sm text-muted-foreground">Pick a document (like the Standard Tariff Sheet), choose yachts, contacts or a saved group, write a short note, and send. Every recipient gets their own email and signing link — with the PDF attached if they'd rather sign on paper.</p>
            <Button className="mt-4 gap-1.5" onClick={() => setView({ kind: "edit", id: null })}><Plus className="h-4 w-4" /> New campaign</Button>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((c) => {
              const total = c.recipients.length;
              const signed = c.recipients.filter((r) => r.doc?.status === "signed").length;
              const notSent = c.recipients.filter((r) => ["held", "failed"].includes(r.status)).length;
              return (
                <div key={c.id} className="group flex items-center gap-4 rounded-xl border border-border/60 bg-card/40 px-4 py-3 transition hover:bg-muted/30">
                  <button className="flex min-w-0 flex-1 items-center gap-4 text-left" onClick={() => setView(c.status === "draft" ? { kind: "edit", id: c.id } : { kind: "detail", id: c.id })}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{c.name}</span>
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", STATUS_CLS[c.status] ?? "bg-muted")}>{c.status}</span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">{c.reference} · {c.doc_title} · {c.created_by_name ?? "—"} · {c.sent_at ? `sent ${fmt(c.sent_at)}` : `created ${fmt(c.created_at)}`}</div>
                    </div>
                    <div className="hidden w-48 shrink-0 sm:block">
                      {c.status === "draft" ? <div className="text-right text-xs text-muted-foreground">{total} recipient{total === 1 ? "" : "s"} · not sent</div> : (
                        <>
                          <div className="mb-1 flex justify-between text-xs"><span className="text-muted-foreground">{signed}/{total} signed</span>{notSent > 0 && <span className="text-amber-600">{notSent} not sent</span>}</div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${total ? (signed / total) * 100 : 0}%` }} /></div>
                        </>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                  {c.status === "draft" && (
                    <button onClick={() => deleteDraft(c)} className="rounded p-1.5 text-muted-foreground opacity-0 transition hover:bg-red-500/10 hover:text-red-600 group-hover:opacity-100" title="Delete draft"><Trash2 className="h-4 w-4" /></button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default CampaignsPage;
