/**
 * Saved quick replies for the Inbox (wa_quick_replies).
 *
 *   QuickReplyMenu      — the reply box's ⚡ menu, also opened by typing "/":
 *                         search, pick, and the text drops into the box with the
 *                         contact's details filled in ({{first_name}}, {{vessel}}…)
 *                         — still editable before it's sent.
 *   QuickRepliesManager — add, change and remove them (Communications edit).
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { db } from "./wa-common";

export type QuickReply = { id: string; title: string; body: string; use_count: number };

let cache: QuickReply[] | null = null;
const listeners = new Set<(l: QuickReply[]) => void>();

async function fetchQuickReplies(): Promise<QuickReply[]> {
  const { data } = await db().from("wa_quick_replies").select("id, title, body, use_count").order("use_count", { ascending: false }).order("title");
  cache = (data ?? []) as QuickReply[];
  listeners.forEach((l) => l(cache!));
  return cache;
}

export function useQuickReplies(): QuickReply[] | null {
  const [list, setList] = useState<QuickReply[] | null>(cache);
  useEffect(() => {
    listeners.add(setList);
    if (!cache) void fetchQuickReplies();
    return () => { listeners.delete(setList); };
  }, []);
  return list;
}

/** Bump a reply's use count so the most used rise to the top (best-effort). */
export function noteQuickReplyUsed(r: QuickReply) {
  void db().from("wa_quick_replies").update({ use_count: r.use_count + 1 }).eq("id", r.id).then(() => fetchQuickReplies(), () => {});
}

export function QuickReplyMenu({ open, query, onClose, onPick, onManage }: {
  open: boolean; query: string; onClose: () => void; onPick: (r: QuickReply) => void; onManage?: () => void;
}) {
  const list = useQuickReplies();
  const [q, setQ] = useState(query);
  const [active, setActive] = useState(0);
  useEffect(() => { setQ(query); setActive(0); }, [query, open]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (list ?? []).filter((r) => !s || r.title.toLowerCase().includes(s) || r.body.toLowerCase().includes(s)).slice(0, 8);
  }, [list, q]);
  if (!open) return null;
  return (
    <div className="absolute bottom-full left-0 z-20 mb-2 w-full max-w-md rounded-xl border border-border bg-popover p-2 shadow-lg"
         onKeyDown={(e) => {
           if (e.key === "Escape") { e.preventDefault(); onClose(); }
           if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, shown.length - 1)); }
           if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
           if (e.key === "Enter" && shown[active]) { e.preventDefault(); onPick(shown[active]); }
         }}>
      <div className="mb-1.5 flex items-center gap-2">
        <Zap className="h-3.5 w-3.5 text-amber-400" />
        <Input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} placeholder="Search quick replies…" className="h-8 text-sm" />
      </div>
      {!list ? <Loader2 className="m-2 h-4 w-4 animate-spin text-muted-foreground" />
        : shown.length === 0 ? <p className="px-2 py-2 text-xs text-muted-foreground">{list.length ? "No match." : "No quick replies saved yet."}</p>
        : (
          <ul className="max-h-64 overflow-auto">
            {shown.map((r, i) => (
              <li key={r.id}>
                <button type="button" onMouseEnter={() => setActive(i)} onClick={() => onPick(r)}
                        className={cn("w-full rounded-lg px-2 py-1.5 text-left", i === active ? "bg-accent" : "hover:bg-accent/50")}>
                  <div className="text-sm font-medium">{r.title}</div>
                  <div className="line-clamp-2 text-xs text-muted-foreground">{r.body}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      <div className="mt-1 flex items-center justify-between border-t border-border pt-1.5 text-[11px] text-muted-foreground">
        <span>↑↓ to choose · Enter to insert · Esc to close</span>
        {onManage && <button type="button" onClick={onManage} className="font-medium text-primary hover:underline">Manage…</button>}
      </div>
    </div>
  );
}

export function QuickRepliesManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const list = useQuickReplies();
  const [editing, setEditing] = useState<Partial<QuickReply> | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!editing?.title?.trim() || !editing.body?.trim()) { toast.error("Give it a title and the message."); return; }
    setBusy(true);
    const row = { title: editing.title.trim().slice(0, 60), body: editing.body.trim().slice(0, 4096) };
    const { error } = editing.id
      ? await db().from("wa_quick_replies").update(row).eq("id", editing.id)
      : await db().from("wa_quick_replies").insert(row);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setEditing(null);
    await fetchQuickReplies();
    toast.success("Saved");
  }
  async function remove(r: QuickReply) {
    if (!confirm(`Delete the quick reply "${r.title}"?`)) return;
    const { error } = await db().from("wa_quick_replies").delete().eq("id", r.id);
    if (error) toast.error(error.message); else await fetchQuickReplies();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setEditing(null); onClose(); } }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Quick replies</DialogTitle>
          <DialogDescription>
            Saved answers for the Inbox. Type <b>/</b> in the reply box, or use the ⚡ button, to drop one in. Personal fields
            such as {"{{first_name}}"}, {"{{name}}"} and {"{{vessel}}"} are filled in for each contact.
          </DialogDescription>
        </DialogHeader>

        {editing ? (
          <div className="space-y-2">
            <Input value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Title, e.g. Need passport copy" maxLength={60} />
            <Textarea value={editing.body ?? ""} onChange={(e) => setEditing({ ...editing, body: e.target.value })} rows={5}
                      placeholder="Hi {{first_name}}, …" maxLength={4096} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={() => void save()} disabled={busy}>{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="max-h-[50vh] space-y-1.5 overflow-auto">
              {!list ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                : list.length === 0 ? <p className="text-sm text-muted-foreground">None yet.</p>
                : list.map((r) => (
                  <div key={r.id} className="flex items-start gap-2 rounded-lg border border-border px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{r.title} <span className="text-[10px] font-normal text-muted-foreground">· used {r.use_count}×</span></div>
                      <div className="whitespace-pre-wrap text-xs text-muted-foreground">{r.body}</div>
                    </div>
                    <button type="button" onClick={() => setEditing(r)} className="p-1 text-muted-foreground hover:text-foreground" aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => void remove(r)} className="p-1 text-muted-foreground hover:text-red-400" aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
            </div>
            <DialogFooter>
              <Button onClick={() => setEditing({ title: "", body: "" })} className="gap-1.5"><Plus className="h-4 w-4" /> New quick reply</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
