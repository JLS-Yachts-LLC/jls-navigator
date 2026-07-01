/**
 * Pipeline tab — Kanban board of crew_vacancies by status (FRS §6), with a
 * "Find Matches" action calling get_candidate_match_score (migration 076)
 * against active candidates. Vacancy status values match the expanded enum
 * from migration 070.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus, Sparkles, XCircle } from "lucide-react";
import { PlacementSelect } from "./placement-select";

const db = () => supabase as any;

const STATUS_COLUMNS: { key: string; label: string }[] = [
  { key: "draft", label: "Draft" },
  { key: "open", label: "Open" },
  { key: "shortlisting", label: "Shortlisting" },
  { key: "interviewing", label: "Interviewing" },
  { key: "offer_made", label: "Offer Made" },
  { key: "filled", label: "Filled" },
  { key: "cancelled", label: "Cancelled" },
];

function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[88vh] overflow-auto rounded-xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted/50"><XCircle className="h-5 w-5" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}
function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">{label}</label>{children}</div>;
}

export function PlacementPipelineTab() {
  const [vacancies, setVacancies] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [matches, setMatches] = useState<Record<string, any[]>>({});
  const [matching, setMatching] = useState<string | null>(null);
  const [add, setAdd] = useState(false);

  useEffect(() => { void load(); }, []);
  async function load() {
    const [v, c] = await Promise.all([
      db().from("crew_vacancies").select("*").order("created_at", { ascending: false }),
      db().from("organisations").select("org_id, name").eq("type", "client").order("name"),
    ]);
    setVacancies(v.data ?? []);
    setClients(c.data ?? []);
  }
  const clientName = (id: string | null) => clients.find((c) => c.org_id === id)?.name ?? null;

  async function findMatches(vacancyId: string) {
    setMatching(vacancyId);
    const { data: candidates, error: candErr } = await db()
      .from("placement_candidates").select("id, full_name").eq("is_active", true).limit(30);
    if (candErr) { toast.error(candErr.message); setMatching(null); return; }

    const scored = await Promise.all(
      (candidates ?? []).map(async (cand: any) => {
        const { data, error } = await db().rpc("get_candidate_match_score", {
          p_vacancy_id: vacancyId, p_candidate_id: cand.id,
        });
        if (error) return null;
        return { candidate: cand, ...data };
      }),
    );

    const ranked = scored.filter(Boolean).sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 8);
    setMatches((m) => ({ ...m, [vacancyId]: ranked }));
    setMatching(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-foreground">Pipeline</h3>
        <Button size="sm" onClick={() => setAdd(true)} className="gap-1.5"><Plus className="h-3.5 w-3.5" /> New Vacancy</Button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {STATUS_COLUMNS.map((col) => {
          const items = vacancies.filter((v) => v.status === col.key);
          return (
            <div key={col.key} className="w-72 shrink-0 rounded-lg border border-border bg-card/40">
              <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {col.label} <span className="ml-1 text-muted-foreground/60">({items.length})</span>
              </div>
              <div className="space-y-2 p-2">
                {items.map((v) => (
                  <div key={v.id} className="rounded-md border border-border bg-background p-2.5 text-xs">
                    <div className="font-medium">{v.title}</div>
                    <div className="text-muted-foreground">{clientName(v.client_org_id) ?? "No client"} · {v.vessel_name ?? "—"}</div>
                    {(col.key === "draft" || col.key === "open" || col.key === "shortlisting") && (
                      <Button
                        size="sm" variant="outline" className="mt-2 h-6 gap-1 px-2 text-[10px]"
                        onClick={() => findMatches(v.id)} disabled={matching === v.id}
                      >
                        <Sparkles className="h-3 w-3" /> {matching === v.id ? "Matching…" : "Find Matches"}
                      </Button>
                    )}
                    {matches[v.id] && (
                      <div className="mt-2 space-y-1 border-t border-border/60 pt-2">
                        {matches[v.id].length === 0 ? (
                          <p className="text-muted-foreground">No active candidates to match.</p>
                        ) : matches[v.id].map((m: any) => (
                          <div key={m.candidate.id} className="flex items-center justify-between">
                            <span>{m.candidate.full_name}</span>
                            <span className="font-semibold text-emerald-400">{m.score}% · {m.label}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {add && <AddVacancyModal clients={clients} onClose={() => setAdd(false)} onSaved={() => { setAdd(false); void load(); }} />}
    </div>
  );
}

function AddVacancyModal({ clients, onClose, onSaved }: { clients: any[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  async function save() {
    if (!f.title?.trim()) { toast.error("Title is required"); return; }
    setBusy(true);
    const { error } = await db().from("crew_vacancies").insert({
      title: f.title, department: f.department || null, rank: f.rank || null,
      client_org_id: f.client_org_id || null, vessel_name: f.vessel_name || null,
      employment_type: f.employment_type || null, salary_range: f.salary_range || null,
      location: f.location || null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Vacancy created");
    onSaved();
  }

  return (
    <Modal title="New Vacancy" onClose={onClose} footer={<>
      <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
      <Button onClick={save} disabled={busy}>Create Vacancy</Button>
    </>}>
      <Labeled label="Title"><Input value={f.title ?? ""} onChange={(e) => set("title", e.target.value)} /></Labeled>
      <div className="grid grid-cols-2 gap-3">
        <Labeled label="Rank"><Input value={f.rank ?? ""} onChange={(e) => set("rank", e.target.value)} /></Labeled>
        <Labeled label="Department"><Input value={f.department ?? ""} onChange={(e) => set("department", e.target.value)} /></Labeled>
      </div>
      <Labeled label="Client">
        <PlacementSelect
          value={f.client_org_id ?? ""}
          onChange={(v) => set("client_org_id", v)}
          options={clients.map((c) => ({ value: c.org_id, label: c.name }))}
          placeholder="No client"
        />
      </Labeled>
      <div className="grid grid-cols-2 gap-3">
        <Labeled label="Vessel name"><Input value={f.vessel_name ?? ""} onChange={(e) => set("vessel_name", e.target.value)} /></Labeled>
        <Labeled label="Location"><Input value={f.location ?? ""} onChange={(e) => set("location", e.target.value)} /></Labeled>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Labeled label="Employment type"><Input value={f.employment_type ?? ""} onChange={(e) => set("employment_type", e.target.value)} /></Labeled>
        <Labeled label="Salary range"><Input value={f.salary_range ?? ""} onChange={(e) => set("salary_range", e.target.value)} /></Labeled>
      </div>
    </Modal>
  );
}

export default PlacementPipelineTab;
