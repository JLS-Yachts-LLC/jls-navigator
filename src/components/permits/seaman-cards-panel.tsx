/**
 * Seaman's cards on a Navigation Licence (SD-0079).
 *
 * The FMA issues a seaman's card to each crew member on the vessel's navigation
 * licence and cancels it when they leave. This panel keeps those cards against
 * the licence — the issued card and, once cancelled, the cancellation — and
 * sends the client the issued cards, the cancelled cards, or a mix, in one email
 * with a secure link per card (through the same review-before-send dialog as the
 * Gate Pass batch send).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { guardUploadFile, uploadContentType } from "@/lib/upload-guard";
import { storageRef } from "@/lib/signed-url";
import { previewSeamanCardsEmail, sendSeamanCardsEmail } from "@/lib/permits/send-permit-email";
import { PermitBatchEmailDialog } from "@/components/permits/permit-batch-email-dialog";
import { SignedAnchor } from "@/components/ui/signed-file";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { IdCard, Plus, Pencil, Trash2, Mail, Loader2, Paperclip, X, MailCheck } from "lucide-react";
import { toast } from "sonner";

export type SeamanCard = {
  id: string;
  permit_id: string;
  crew_name: string;
  card_number: string | null;
  nationality: string | null;
  position: string | null;
  status: "issued" | "cancelled";
  issued_on: string | null;
  expiry_date: string | null;
  cancelled_on: string | null;
  document_url: string | null;
  cancellation_url: string | null;
  notes: string | null;
  email_sent_at: string | null;
  created_at: string;
};

type Draft = Partial<SeamanCard> & { status: "issued" | "cancelled" };

const EMPTY: Draft = { status: "issued" };

/** dd/mm/yyyy, as the team writes dates. */
const fmt = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");

const db = () => (supabase as any).from("navigation_license_seaman_cards");

export function SeamanCardsPanel({ permitId, userId }: { permitId: string | null; userId: string | undefined }) {
  const [cards, setCards] = useState<SeamanCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"document_url" | "cancellation_url" | null>(null);
  const [emailIds, setEmailIds] = useState<string[] | null>(null);
  const cardFile = useRef<HTMLInputElement>(null);
  const cancelFile = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!permitId) return;
    setLoading(true);
    const { data, error } = await db().select("*").eq("permit_id", permitId).order("crew_name");
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setCards((data ?? []) as SeamanCard[]);
  }, [permitId]);

  useEffect(() => { setSelected(new Set()); setDraft(null); void load(); }, [load]);

  if (!permitId) {
    return (
      <section className="mt-6 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        <div className="mb-1 flex items-center gap-2 font-medium text-foreground">
          <IdCard className="h-4 w-4" /> Seaman's Cards
        </div>
        Save the licence first, then open it again to add its seaman's cards.
      </section>
    );
  }

  const issued = cards.filter((c) => c.status === "issued");
  const cancelled = cards.filter((c) => c.status === "cancelled");

  function selectOnly(list: SeamanCard[]) {
    setSelected(new Set(list.map((c) => c.id)));
  }
  function toggle(id: string, on: boolean) {
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id); else n.delete(id);
      return n;
    });
  }
  const setD = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...(d ?? EMPTY), [k]: v }));

  async function upload(file: File, col: "document_url" | "cancellation_url") {
    if (!guardUploadFile(file)) return;
    setUploading(col);
    try {
      const path = `navigation-license/seaman-cards/${permitId}/${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
      const { error } = await supabase.storage
        .from("permit-documents")
        .upload(path, file, { upsert: true, contentType: uploadContentType(file) });
      if (error) throw error;
      setD(col, storageRef("permit-documents", path));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  async function save() {
    if (!draft) return;
    const name = String(draft.crew_name ?? "").trim();
    if (!name) { toast.error("Add the crew member's name"); return; }
    if (draft.status === "cancelled" && !draft.cancelled_on) {
      toast.error("Add the date the card was cancelled"); return;
    }
    const payload = {
      permit_id: permitId,
      crew_name: name,
      card_number: draft.card_number?.trim() || null,
      nationality: draft.nationality?.trim() || null,
      position: draft.position?.trim() || null,
      status: draft.status,
      issued_on: draft.issued_on || null,
      expiry_date: draft.expiry_date || null,
      cancelled_on: draft.status === "cancelled" ? draft.cancelled_on || null : null,
      document_url: draft.document_url || null,
      cancellation_url: draft.cancellation_url || null,
      notes: draft.notes?.trim() || null,
    };
    setSaving(true);
    const { error } = draft.id
      ? await db().update(payload).eq("id", draft.id)
      : await db().insert([{ ...payload, created_by: userId ?? null }]);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(draft.id ? "Card updated" : "Card added");
    setDraft(null);
    void load();
  }

  async function remove(card: SeamanCard) {
    if (!confirm(`Remove ${card.crew_name}'s seaman's card from this licence?`)) return;
    const { error } = await db().delete().eq("id", card.id);
    if (error) { toast.error(error.message); return; }
    setSelected((s) => { const n = new Set(s); n.delete(card.id); return n; });
    void load();
  }

  const busy = saving || !!uploading;
  // Keep the email in the order shown: issued, then cancelled.
  const picked = [...issued, ...cancelled].filter((c) => selected.has(c.id));
  const pickedNoFile = picked.filter((c) => !(c.status === "cancelled" ? c.cancellation_url || c.document_url : c.document_url));

  return (
    <section className="mt-6 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <IdCard className="h-4 w-4" /> Seaman's Cards
          </h3>
          <p className="text-sm text-muted-foreground">
            {issued.length} issued · {cancelled.length} cancelled
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" className="gap-1.5"
            onClick={() => setDraft({ ...EMPTY })} disabled={!!draft}>
            <Plus className="h-4 w-4" /> Add card
          </Button>
          <Button type="button" size="sm" className="gap-1.5"
            disabled={!picked.length || !!draft}
            onClick={() => setEmailIds(picked.map((c) => c.id))}>
            <Mail className="h-4 w-4" /> Email {picked.length ? picked.length : ""} to client
          </Button>
        </div>
      </div>

      {cards.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Select:</span>
          <Button type="button" size="sm" variant="ghost" onClick={() => selectOnly(issued)} disabled={!issued.length}>
            All issued
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => selectOnly(cancelled)} disabled={!cancelled.length}>
            All cancelled
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => selectOnly(cards)}>
            Both
          </Button>
          {selected.size > 0 && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          )}
        </div>
      )}
      {pickedNoFile.length > 0 && (
        <p className="mt-2 text-sm text-amber-500">
          {pickedNoFile.length} selected card{pickedNoFile.length === 1 ? " has" : "s have"} no file attached — the email will list {pickedNoFile.length === 1 ? "it" : "them"} without a link.
        </p>
      )}

      {draft && (
        <div className="mt-4 rounded-md border border-primary/40 bg-primary/5 p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Crew member *</Label>
              <Input value={draft.crew_name ?? ""} onChange={(e) => setD("crew_name", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Card no.</Label>
              <Input value={draft.card_number ?? ""} onChange={(e) => setD("card_number", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={draft.status} onValueChange={(v) => setD("status", v as Draft["status"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="issued">Issued</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nationality</Label>
              <Input value={draft.nationality ?? ""} onChange={(e) => setD("nationality", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Position</Label>
              <Input value={draft.position ?? ""} onChange={(e) => setD("position", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Issued on</Label>
              <Input type="date" value={draft.issued_on ?? ""} onChange={(e) => setD("issued_on", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Card expiry</Label>
              <Input type="date" value={draft.expiry_date ?? ""} onChange={(e) => setD("expiry_date", e.target.value)} />
            </div>
            {draft.status === "cancelled" && (
              <div className="space-y-1.5">
                <Label>Cancelled on *</Label>
                <Input type="date" value={draft.cancelled_on ?? ""} onChange={(e) => setD("cancelled_on", e.target.value)} />
              </div>
            )}
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FileSlot
              label="Issued card"
              stored={draft.document_url ?? null}
              busy={uploading === "document_url"}
              onPick={() => cardFile.current?.click()}
              onClear={() => setD("document_url", null)}
            />
            {draft.status === "cancelled" && (
              <FileSlot
                label="Cancellation"
                stored={draft.cancellation_url ?? null}
                busy={uploading === "cancellation_url"}
                onPick={() => cancelFile.current?.click()}
                onClear={() => setD("cancellation_url", null)}
              />
            )}
            <input ref={cardFile} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f, "document_url"); e.target.value = ""; }} />
            <input ref={cancelFile} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f, "cancellation_url"); e.target.value = ""; }} />
          </div>

          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setDraft(null)} disabled={busy}>Cancel</Button>
            <Button type="button" size="sm" onClick={save} disabled={busy} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {draft.id ? "Save card" : "Add card"}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading cards…
        </div>
      ) : cards.length === 0 ? (
        !draft && <p className="mt-3 text-sm text-muted-foreground">No seaman's cards on this licence yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="w-8 py-2" />
                <th className="py-2 pr-3 font-medium">Crew member</th>
                <th className="py-2 pr-3 font-medium">Card no.</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 pr-3 font-medium">Files</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {[...issued, ...cancelled].map((c) => (
                <tr key={c.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2">
                    <Checkbox
                      checked={selected.has(c.id)}
                      onCheckedChange={(v) => toggle(c.id, v === true)}
                      aria-label={`Select ${c.crew_name}`}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <div className="font-medium">{c.crew_name}</div>
                    {(c.position || c.nationality) && (
                      <div className="text-sm text-muted-foreground">
                        {[c.position, c.nationality].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-3">{c.card_number || "—"}</td>
                  <td className="py-2 pr-3">
                    <span className={c.status === "cancelled" ? "pill pill-danger" : "pill pill-success"}>
                      {c.status === "cancelled" ? "Cancelled" : "Issued"}
                    </span>
                    {c.email_sent_at && (
                      <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground" title={new Date(c.email_sent_at).toLocaleString("en-GB")}>
                        <MailCheck className="h-3.5 w-3.5" /> Sent {fmt(c.email_sent_at.slice(0, 10))}
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {c.status === "cancelled" ? `Cancelled ${fmt(c.cancelled_on)}` : `Issued ${fmt(c.issued_on)}`}
                    {c.status === "issued" && c.expiry_date && (
                      <div className="text-sm text-muted-foreground">Expires {fmt(c.expiry_date)}</div>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex flex-col gap-0.5">
                      {c.document_url
                        ? <SignedAnchor stored={c.document_url} className="underline hover:text-primary">Card</SignedAnchor>
                        : <span className="text-muted-foreground">No card file</span>}
                      {c.cancellation_url && (
                        <SignedAnchor stored={c.cancellation_url} className="underline hover:text-primary">Cancellation</SignedAnchor>
                      )}
                    </div>
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">
                    <Button type="button" size="icon" variant="ghost" aria-label={`Edit ${c.crew_name}`}
                      onClick={() => setDraft({ ...c })} disabled={!!draft}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${c.crew_name}`}
                      onClick={() => void remove(c)} disabled={!!draft}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PermitBatchEmailDialog
        permitIds={emailIds}
        noun="seaman's card"
        nounPlural="seaman's cards"
        api={{
          preview: (ids) => previewSeamanCardsEmail(permitId, ids),
          send: (ids, to, files) => sendSeamanCardsEmail(permitId, ids, to, files),
        }}
        onClose={() => setEmailIds(null)}
        onSent={() => { setEmailIds(null); setSelected(new Set()); void load(); }}
      />
    </section>
  );
}

function FileSlot({ label, stored, busy, onPick, onClear }: {
  label: string;
  stored: string | null;
  busy: boolean;
  onPick: () => void;
  onClear: () => void;
}) {
  const name = stored ? decodeURIComponent(stored.split("/").pop() ?? "").replace(/^\d+-/, "") : null;
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
      <span className="shrink-0 font-medium">{label}:</span>
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : stored ? (
        <>
          <SignedAnchor stored={stored} className="min-w-0 flex-1 truncate underline hover:text-primary">{name}</SignedAnchor>
          <button type="button" onClick={onClear} aria-label={`Remove ${label}`}
            className="rounded p-1 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </>
      ) : (
        <button type="button" onClick={onPick} className="flex items-center gap-1.5 text-primary hover:underline">
          <Paperclip className="h-4 w-4" /> Attach file
        </button>
      )}
    </div>
  );
}
