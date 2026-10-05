/**
 * Merge duplicates — the same person imported more than once (as a vessel
 * contact and an agency contact, or twice from a sheet).
 *
 * Contacts sharing a WhatsApp number are grouped, then split by yacht: someone
 * who's the contact for two yachts stays as two records, so expiry reminders for
 * both yachts still reach them (broadcasts already send to a number only once).
 * wa_merge_contacts() moves everything onto the kept record — lists, messages,
 * replies, consent history — and consent follows the person's latest decision.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Merge, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { db, ConsentChip, Chip, fmtDate, type WaContact } from "./wa-common";

export interface DupGroup {
  key: string;
  yachtName: string | null;
  members: WaContact[];
  /** Same number on other yachts — kept as separate records. */
  otherYachts: string[];
}

const STATUS_RANK: Record<string, number> = { opted_in: 3, invited: 2, none: 1, opted_out: 0 };

/** The record to keep by default: client-confirmed number, best consent, most complete, oldest. */
function rank(c: WaContact) {
  return (c.phone_confirmed ? 1000 : 0) + (STATUS_RANK[c.consent_status] ?? 0) * 100
    + (c.email ? 10 : 0) + (c.yacht_id ? 5 : 0) + (c.source === "manual" ? 1 : 0);
}
export const bestFirst = (a: WaContact, b: WaContact) => rank(b) - rank(a) || a.created_at.localeCompare(b.created_at);

export function findDuplicateGroups(rows: WaContact[]): DupGroup[] {
  // Same person = same number; a record without a number joins by email.
  const byKey = new Map<string, WaContact[]>();
  const emailToKey = new Map<string, string>();
  for (const c of rows) {
    if (!c.phone_e164) continue;
    byKey.set(c.phone_e164, [...(byKey.get(c.phone_e164) ?? []), c]);
    if (c.email) emailToKey.set(c.email.toLowerCase(), c.phone_e164);
  }
  for (const c of rows) {
    if (c.phone_e164 || !c.email) continue;
    const k = emailToKey.get(c.email.toLowerCase()) ?? `email:${c.email.toLowerCase()}`;
    byKey.set(k, [...(byKey.get(k) ?? []), c]);
  }

  const groups: DupGroup[] = [];
  for (const [key, members] of byKey) {
    if (members.length < 2) continue;
    // Split by yacht; records with no yacht join the yacht with the most records.
    const byYacht = new Map<string, WaContact[]>();
    const unlinked: WaContact[] = [];
    for (const m of members) {
      if (m.yacht_id) byYacht.set(m.yacht_id, [...(byYacht.get(m.yacht_id) ?? []), m]);
      else unlinked.push(m);
    }
    if (!byYacht.size) { groups.push({ key, yachtName: null, members: [...unlinked].sort(bestFirst), otherYachts: [] }); continue; }
    const largest = [...byYacht.entries()].sort((a, b) => b[1].length - a[1].length)[0][0];
    byYacht.set(largest, [...byYacht.get(largest)!, ...unlinked]);
    const names = new Map([...byYacht.entries()].map(([id, ms]) => [id, ms.find((m) => m.yacht_id === id)?.yacht?.vessel_name ?? "a yacht"]));
    for (const [yachtId, ms] of byYacht) {
      if (ms.length < 2) continue;
      groups.push({
        key: `${key}|${yachtId}`, yachtName: names.get(yachtId) ?? null, members: [...ms].sort(bestFirst),
        otherYachts: [...names.entries()].filter(([id]) => id !== yachtId).map(([, n]) => n),
      });
    }
  }
  return groups.sort((a, b) => (a.members[0].name ?? "").localeCompare(b.members[0].name ?? ""));
}

export function MergeDuplicatesDialog({ rows, onClose, onDone }: { rows: WaContact[]; onClose: () => void; onDone: () => void }) {
  const groups = useMemo(() => findDuplicateGroups(rows), [rows]);
  // Per group: which record to keep, and which to fold into it (all, by default).
  const [keep, setKeep] = useState<Record<string, string>>(() => Object.fromEntries(groups.map((g) => [g.key, g.members[0].id])));
  const [drop, setDrop] = useState<Record<string, Set<string>>>(() =>
    Object.fromEntries(groups.map((g) => [g.key, new Set(g.members.slice(1).map((m) => m.id))])));
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [merged, setMerged] = useState<Set<string>>(new Set());

  function chooseKeep(g: DupGroup, id: string) {
    setKeep((k) => ({ ...k, [g.key]: id }));
    setDrop((d) => ({ ...d, [g.key]: new Set(g.members.filter((m) => m.id !== id).map((m) => m.id)) }));
  }
  const toggleDrop = (g: DupGroup, id: string) =>
    setDrop((d) => { const n = new Set(d[g.key]); n.has(id) ? n.delete(id) : n.add(id); return { ...d, [g.key]: n }; });

  async function mergeGroups(list: DupGroup[]) {
    const todo = list.filter((g) => !merged.has(g.key) && drop[g.key]?.size);
    if (!todo.length) return;
    setBusy({ done: 0, total: todo.length });
    const failed: string[] = [];
    const ok = new Set(merged);
    for (let i = 0; i < todo.length; i++) {
      const g = todo[i];
      const { error } = await db().rpc("wa_merge_contacts", { p_keep: keep[g.key], p_merge: [...drop[g.key]] });
      if (error) failed.push(`${g.members[0].name}: ${error.message}`); else ok.add(g.key);
      setBusy({ done: i + 1, total: todo.length });
    }
    setMerged(ok);
    setBusy(null);
    const n = todo.length - failed.length;
    (failed.length ? toast.warning : toast.success)(`Merged ${n} group${n === 1 ? "" : "s"}`, {
      description: failed.length ? failed.slice(0, 3).join(" · ") : "Their messages, lists and consent history are on the kept record.",
      duration: failed.length ? 12000 : 5000,
    });
    onDone();
  }

  const remaining = groups.filter((g) => !merged.has(g.key));

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Merge duplicate contacts</DialogTitle>
          <DialogDescription>
            Records with the same WhatsApp number on the same yacht. Merging keeps one record and moves the others' lists,
            messages, replies and consent history onto it — consent follows the person's latest decision. It can't be undone.
          </DialogDescription>
        </DialogHeader>

        {groups.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No duplicates found.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <p className="flex-1">{remaining.length} group{remaining.length === 1 ? "" : "s"} to review{merged.size ? ` · ${merged.size} merged` : ""}</p>
              <Button size="sm" disabled={!!busy || !remaining.length} className="gap-1.5"
                onClick={() => { if (confirm(`Merge all ${remaining.length} groups as shown?`)) void mergeGroups(remaining); }}>
                <Merge className="h-4 w-4" /> Merge all as shown
              </Button>
            </div>
            {busy && <Progress value={(busy.done / busy.total) * 100} />}

            {groups.map((g) => {
              const done = merged.has(g.key);
              return (
                <div key={g.key} className={`rounded-lg border p-3 ${done ? "border-emerald-500/40 bg-emerald-500/5 opacity-70" : "border-border"}`}>
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono">{g.members[0].phone_e164 ?? g.members[0].email}</span>
                    {g.yachtName && <Chip t="blue">{g.yachtName}</Chip>}
                    {g.otherYachts.length > 0 && (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <AlertTriangle className="h-3 w-3" />
                        Also the contact for {g.otherYachts.join(", ")} — kept as a separate record so reminders for that yacht still reach them
                      </span>
                    )}
                    <span className="ml-auto">
                      {done ? <Chip t="green">Merged</Chip> : (
                        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={!!busy || !drop[g.key]?.size}
                          onClick={() => void mergeGroups([g])}>
                          <Merge className="h-3.5 w-3.5" /> Merge {drop[g.key]?.size ?? 0} into kept
                        </Button>
                      )}
                    </span>
                  </div>
                  <table className="w-full text-xs">
                    <thead className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                      <tr><th className="w-14 py-1">Keep</th><th className="w-14 py-1">Merge</th><th className="py-1">Name</th><th className="py-1">Email</th><th className="py-1">Consent</th><th className="py-1">From</th><th className="py-1">Added</th></tr>
                    </thead>
                    <tbody>
                      {g.members.map((m) => {
                        const isKeep = keep[g.key] === m.id;
                        return (
                          <tr key={m.id} className="border-t border-border/60">
                            <td className="py-1.5"><input type="radio" disabled={done} checked={isKeep} onChange={() => chooseKeep(g, m.id)} /></td>
                            <td className="py-1.5">{!isKeep && <Checkbox disabled={done} checked={drop[g.key]?.has(m.id)} onCheckedChange={() => toggleDrop(g, m.id)} />}</td>
                            <td className="py-1.5 font-medium">{m.name}{m.phone_confirmed && <span className="ml-1 text-[10px] text-emerald-600">confirmed</span>}</td>
                            <td className="py-1.5 text-muted-foreground">{m.email ?? "—"}</td>
                            <td className="py-1.5"><ConsentChip c={m} /></td>
                            <td className="py-1.5 text-muted-foreground">{{ manual: "added / CSV", vessel: "vessel record", agency_contact: "agency contact" }[m.source] ?? m.source}</td>
                            <td className="py-1.5 text-muted-foreground">{fmtDate(m.created_at)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose} disabled={!!busy}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
