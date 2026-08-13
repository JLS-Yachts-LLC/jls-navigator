/**
 * Duplicate review for a vessel's documents.
 *
 * Exact-name matching leaves the same certificate showing twice — once as a Polaris
 * document, once as a SharePoint file — because it was named differently on each
 * side. This panel pairs them up by similarity, shows the evidence, and leaves the
 * decision to a human.
 *
 * Nothing here deletes anything in SharePoint. The four choices are:
 *   • Same file — record the link so both sides show as "Both". No copying.
 *   • Keep the Polaris copy — push it across, so SharePoint gets the good version.
 *   • Keep the SharePoint copy — import it and drop the Polaris duplicate record.
 *   • Not duplicates — remembered, so it is never suggested again.
 */
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Copy, ExternalLink, Loader2, Link2, ArrowRight, ArrowLeft, X, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { SignedAnchor } from "@/components/ui/signed-file";
import { compareFileNames, DUPLICATE_THRESHOLD } from "@/lib/fuzzy-match";
import { pushYachtDocToSharePoint, pullYachtDocFromSharePoint } from "@/lib/yacht-doc-sharepoint.server";

export type DupPolarisDoc = { docKey: string; id: string; label: string; fileName: string; stored?: string };
export type DupSpFile = { id: string; name: string; webUrl: string | null; size: number | null; lastModified: string | null };

type Pair = {
  doc: DupPolarisDoc;
  sp: DupSpFile;
  score: number;
  reason: string;
};

const fmtSize = (n: number | null) =>
  n == null ? "—" : n > 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

export function YachtDuplicateReview({
  yachtId, vesselName, polarisDocs, sharePointOnly, dismissed, onDone,
}: {
  yachtId: string;
  vesselName: string;
  /** Polaris documents already mirrored or not — all are candidates for a match. */
  polarisDocs: DupPolarisDoc[];
  /** SharePoint files with no Polaris counterpart yet. */
  sharePointOnly: DupSpFile[];
  /** "docKey|spItemId" pairs a human has already judged as different. */
  dismissed: Set<string>;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [resolved, setResolved] = useState<Set<string>>(new Set());

  /** Best candidate per SharePoint file, above the threshold, worst-first so the
   *  clearest matches are decided last — a human warms up on the obvious ones. */
  const pairs = useMemo<Pair[]>(() => {
    const out: Pair[] = [];
    for (const sp of sharePointOnly) {
      let best: Pair | null = null;
      for (const doc of polarisDocs) {
        const key = `${doc.docKey}|${sp.id}`;
        if (dismissed.has(key)) continue;
        const { score, reason } = compareFileNames(sp.name, doc.fileName || doc.label, [vesselName]);
        if (score < DUPLICATE_THRESHOLD) continue;
        if (!best || score > best.score) best = { doc, sp, score, reason };
      }
      if (best) out.push(best);
    }
    return out.sort((a, b) => b.score - a.score);
  }, [polarisDocs, sharePointOnly, dismissed, vesselName]);

  const pending = pairs.filter(p => !resolved.has(`${p.doc.docKey}|${p.sp.id}`));

  async function link(p: Pair) {
    setBusy(p.sp.id);
    try {
      const { error } = await (supabase as any).from("yacht_document_sharepoint_links").upsert({
        yacht_id: yachtId, doc_key: p.doc.docKey,
        sp_item_id: p.sp.id, sp_name: p.sp.name, web_url: p.sp.webUrl,
        uploaded_at: new Date().toISOString(), uploaded_by: user?.id ?? null,
      }, { onConflict: "yacht_id,doc_key" });
      if (error) throw error;
      toast.success("Linked — both sides now show as the same document");
      setResolved(r => new Set(r).add(`${p.doc.docKey}|${p.sp.id}`));
    } catch (e: any) {
      toast.error(e?.message ?? "Could not link them");
    } finally { setBusy(null); }
  }

  async function keepPolaris(p: Pair) {
    if (!p.doc.stored) { toast.error("That Polaris record has no file attached"); return; }
    setBusy(p.sp.id);
    try {
      const res = await (pushYachtDocToSharePoint as any)({
        data: { yachtId, docKey: p.doc.docKey, vesselName, stored: p.doc.stored, fileName: p.doc.fileName || p.doc.label },
      });
      if (!res?.ok) throw new Error(res?.error ?? "Upload failed");
      toast.success("Polaris copy sent to SharePoint");
      setResolved(r => new Set(r).add(`${p.doc.docKey}|${p.sp.id}`));
    } catch (e: any) {
      toast.error(e?.message ?? "Could not send it");
    } finally { setBusy(null); }
  }

  async function keepSharePoint(p: Pair) {
    if (!confirm(`Keep the SharePoint copy “${p.sp.name}”?\n\nIt will be imported into Polaris and the duplicate Polaris record “${p.doc.label}” removed. The stored file itself is not deleted.`)) return;
    setBusy(p.sp.id);
    try {
      const res = await (pullYachtDocFromSharePoint as any)({
        data: { yachtId, itemId: p.sp.id, fileName: p.sp.name },
      });
      if (!res?.ok) throw new Error(res?.error ?? "Import failed");
      const { error } = await (supabase as any).from("yacht_documents").delete().eq("id", p.doc.id);
      if (error) throw error;
      toast.success("SharePoint copy imported; the duplicate record was removed");
      setResolved(r => new Set(r).add(`${p.doc.docKey}|${p.sp.id}`));
    } catch (e: any) {
      toast.error(e?.message ?? "Could not complete that");
    } finally { setBusy(null); }
  }

  async function dismiss(p: Pair) {
    setBusy(p.sp.id);
    try {
      const { error } = await (supabase as any).from("yacht_document_duplicate_dismissals").upsert({
        yacht_id: yachtId, doc_key: p.doc.docKey, sp_item_id: p.sp.id,
        dismissed_by: user?.id ?? null,
      }, { onConflict: "yacht_id,doc_key,sp_item_id" });
      if (error) throw error;
      toast.success("Noted — these two will not be suggested again");
      setResolved(r => new Set(r).add(`${p.doc.docKey}|${p.sp.id}`));
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save that");
    } finally { setBusy(null); }
  }

  if (pairs.length === 0) {
    return (
      <div className="rounded-lg border border-border/60 bg-muted/20 p-6 text-center">
        <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-400" />
        <p className="mt-2 text-[13px] font-medium">No likely duplicates found</p>
        <p className="mt-1 text-[11.5px] text-muted-foreground">
          Every SharePoint file looks distinct from the documents held in Polaris.
        </p>
        <Button size="sm" variant="outline" className="mt-3" onClick={onDone}>Close</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] text-muted-foreground">
          {pending.length === 0
            ? "All decided — close to refresh the list."
            : `${pending.length} possible duplicate${pending.length === 1 ? "" : "s"} to review. Nothing is deleted from SharePoint by any of these choices.`}
        </p>
        <Button size="sm" variant="outline" onClick={onDone}>
          {pending.length === 0 ? "Close and refresh" : "Close"}
        </Button>
      </div>

      {pairs.map((p) => {
        const key = `${p.doc.docKey}|${p.sp.id}`;
        const done = resolved.has(key);
        const working = busy === p.sp.id;
        return (
          <div key={key} className={done ? "rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 opacity-70" : "rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"}>
            <div className="mb-2 flex items-center gap-2">
              <Copy className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-400">
                {Math.round(p.score * 100)}% match
              </span>
              <span className="text-[11.5px] text-muted-foreground">— {p.reason}</span>
              {done && <span className="ml-auto text-[11px] font-semibold text-emerald-400">Decided</span>}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {/* Polaris side */}
              <div className="rounded-md border border-border/60 bg-card p-2.5">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">In Polaris</div>
                <div className="truncate text-[13px] font-medium">{p.doc.label}</div>
                <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{p.doc.fileName}</div>
                {p.doc.stored && (
                  <SignedAnchor stored={p.doc.stored}
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
                    <ExternalLink className="h-3 w-3" /> Inspect
                  </SignedAnchor>
                )}
              </div>
              {/* SharePoint side */}
              <div className="rounded-md border border-border/60 bg-card p-2.5">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">In SharePoint</div>
                <div className="truncate text-[13px] font-medium">{p.sp.name}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {fmtSize(p.sp.size)} · modified {fmtDate(p.sp.lastModified)}
                </div>
                {p.sp.webUrl && (
                  <a href={p.sp.webUrl} target="_blank" rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
                    <ExternalLink className="h-3 w-3" /> Inspect
                  </a>
                )}
              </div>
            </div>

            {!done && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" disabled={working}
                  onClick={() => void link(p)} title="Record that these are the same document — no file is copied">
                  {working ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />} Same file
                </Button>
                <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" disabled={working || !p.doc.stored}
                  onClick={() => void keepPolaris(p)} title="Send the Polaris copy to SharePoint">
                  <ArrowRight className="h-3 w-3" /> Keep Polaris copy
                </Button>
                <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" disabled={working}
                  onClick={() => void keepSharePoint(p)} title="Import the SharePoint copy and drop the Polaris duplicate">
                  <ArrowLeft className="h-3 w-3" /> Keep SharePoint copy
                </Button>
                <Button size="sm" variant="ghost" className="ml-auto h-7 gap-1 text-[11px] text-muted-foreground" disabled={working}
                  onClick={() => void dismiss(p)} title="These are different documents">
                  <X className="h-3 w-3" /> Not duplicates
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
