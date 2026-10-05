/**
 * Handover log (On board) — notes the crew leave for each other: the relief,
 * the next watch, the next rotation. By department, newest first, with the
 * important ones pinned to the top. Reads go through RLS; writes go through
 * /api/portal/onboard (kind=handover).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { NotebookPen, Pencil, Pin } from "lucide-react";
import { STOCK_DEPARTMENTS } from "@/lib/portal/onboard";
import {
  AddButton, RecordFormModal, SectionCard, SectionEmpty, SectionHeader, SectionLoading, onboardRequest, type FormField,
} from "./section-ui";

const db = supabase as any;

type Note = {
  id: string; department: string; title: string; body: string | null; pinned: boolean;
  author_name: string | null; created_at: string; updated_at: string;
};

const deptLabel = (d: string) => STOCK_DEPARTMENTS.find((x) => x.value === d)?.label ?? d;
const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const FIELDS: FormField[] = [
  { key: "title", label: "Subject", required: true, wide: true, placeholder: "e.g. Guests arriving Saturday — cabin 4 notes" },
  { key: "department", label: "Department", type: "select", required: true, options: STOCK_DEPARTMENTS.map((d) => ({ value: d.value, label: d.label })) },
  { key: "pinned", label: "Pin to the top", type: "select", required: true, options: [{ value: "false", label: "No" }, { value: "true", label: "Yes — keep it at the top" }] },
  { key: "body", label: "Note", type: "textarea", placeholder: "What the next person needs to know" },
];

export function HandoverSection({ yachtId, canEdit }: { yachtId: string; canEdit: boolean }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [dept, setDept] = useState("all");
  const [editing, setEditing] = useState<Note | "new" | null>(null);

  const load = useCallback(async () => {
    const { data } = await db.from("onboard_handover_notes").select("*").eq("yacht_id", yachtId)
      .order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(300);
    setNotes(data ?? []); setLoading(false);
  }, [yachtId]);
  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of notes) m.set(n.department, (m.get(n.department) ?? 0) + 1);
    return m;
  }, [notes]);

  if (loading) return <SectionLoading />;
  const shown = notes.filter((n) => dept === "all" || n.department === dept);

  return (
    <div className="space-y-4">
      <SectionHeader title="Handover log" subtitle="Notes for the relief, the next watch and the next rotation."
                     action={canEdit && <AddButton onClick={() => setEditing("new")}>New note</AddButton>} />

      {notes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setDept("all")}
                  className={cn("rounded-full border px-3 py-1 text-xs font-medium transition", dept === "all" ? "border-primary/50 bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
            All · {notes.length}
          </button>
          {STOCK_DEPARTMENTS.filter((d) => counts.has(d.value)).map((d) => (
            <button key={d.value} type="button" onClick={() => setDept(d.value)}
                    className={cn("rounded-full border px-3 py-1 text-xs font-medium transition", dept === d.value ? "border-primary/50 bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
              {d.label} · {counts.get(d.value)}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <SectionEmpty icon={NotebookPen} message={canEdit ? "No handover notes yet. Leave one for whoever takes over from you." : "No handover notes yet."} />
      ) : (
        <div className="space-y-2">
          {shown.map((n) => (
            <SectionCard key={n.id} className={cn("p-4", n.pinned && "border-primary/40")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {n.pinned && <Pin className="h-3.5 w-3.5 text-primary" />}
                    <span className="font-semibold">{n.title}</span>
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{deptLabel(n.department)}</span>
                  </div>
                  {n.body && <p className="mt-1.5 whitespace-pre-line text-sm text-foreground/85">{n.body}</p>}
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    {n.author_name ?? "Crew"} · {fmtWhen(n.created_at)}
                    {n.updated_at && new Date(n.updated_at).getTime() - new Date(n.created_at).getTime() > 60000 && ` · edited ${fmtWhen(n.updated_at)}`}
                  </div>
                </div>
                {canEdit && (
                  <button type="button" onClick={() => setEditing(n)} aria-label={`Edit ${n.title}`}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-background/60 hover:text-foreground">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </SectionCard>
          ))}
        </div>
      )}

      {editing && (
        <RecordFormModal
          title={editing === "new" ? "New handover note" : "Edit note"}
          kind="handover" fields={FIELDS}
          initial={editing === "new"
            ? { department: dept === "all" ? "deck" : dept, pinned: "false" }
            : { ...editing, pinned: editing.pinned ? "true" : "false" }}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
          onDelete={editing === "new" ? undefined : async () => {
            await onboardRequest("handover", { method: "DELETE", id: (editing as Note).id });
            setEditing(null); void load();
          }}
          deleteLabel="Delete note"
        />
      )}
    </div>
  );
}
