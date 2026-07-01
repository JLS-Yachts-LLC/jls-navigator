/**
 * Candidates tab — pre-placement pipeline candidates (FRS §4), built on the
 * real public.placement_candidates table (extended in migration 069),
 * reading through v_candidate_profiles_masked so salary fields are
 * automatically hidden for users without approve-level crew_placement
 * access (migration 074) — this component never queries
 * placement_candidates directly for display.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowLeft, Plus, XCircle } from "lucide-react";
import { PlacementSelect } from "./placement-select";

const db = () => supabase as any;

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

const REFERENCE_STATUS_COLOR: Record<string, string> = {
  not_requested: "bg-slate-500/15 text-slate-400",
  requested: "bg-amber-500/15 text-amber-400",
  received: "bg-blue-500/15 text-blue-400",
  verified: "bg-emerald-500/15 text-emerald-400",
  flagged: "bg-red-500/15 text-red-400",
};

export function PlacementCandidatesTab() {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [add, setAdd] = useState(false);

  useEffect(() => { void load(); }, []);
  async function load() {
    setLoading(true);
    const { data, error } = await db().from("v_candidate_profiles_masked").select("*").order("full_name");
    if (error) toast.error(error.message);
    setCandidates(data ?? []);
    setLoading(false);
  }

  if (openId) {
    return <CandidateProfile candidateId={openId} onBack={() => { setOpenId(null); void load(); }} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-foreground">Candidates ({candidates.length})</h3>
        <Button size="sm" onClick={() => setAdd(true)} className="gap-1.5"><Plus className="h-3.5 w-3.5" /> Add Candidate</Button>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
      ) : candidates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          No candidates yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-muted/30 text-[10.5px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Rank</th>
              <th className="px-3 py-2 text-left">Department</th>
              <th className="px-3 py-2 text-left">Nationality</th>
              <th className="px-3 py-2 text-left">Experience</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 w-16"></th>
            </tr></thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.id} className="border-b border-border/40 hover:bg-accent/20">
                  <td className="px-3 py-2 font-medium">{c.preferred_name || c.full_name}</td>
                  <td className="px-3 py-2">{c.rank ?? "—"}</td>
                  <td className="px-3 py-2">{c.department ?? "—"}</td>
                  <td className="px-3 py-2">{c.nationality ?? "—"}</td>
                  <td className="px-3 py-2">{c.experience_years ?? "—"} yrs</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${c.is_active ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-500/15 text-slate-400"}`}>
                      {c.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-3 py-2"><Button size="sm" variant="ghost" onClick={() => setOpenId(c.id)}>View</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {add && <AddCandidateModal onClose={() => setAdd(false)} onSaved={() => { setAdd(false); void load(); }} />}
    </div>
  );
}

function AddCandidateModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const [f, setF] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  async function save() {
    if (!f.full_name?.trim()) { toast.error("Full name is required"); return; }
    setBusy(true);
    const { error } = await db().from("placement_candidates").insert({
      full_name: f.full_name, rank: f.rank || null, department: f.department || null,
      nationality: f.nationality || null, email: f.email || null, phone: f.phone || null,
      desired_position: f.desired_position || null, created_by: user?.id ?? null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Candidate added");
    onSaved();
  }

  return (
    <Modal title="Add Candidate" onClose={onClose} footer={<>
      <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
      <Button onClick={save} disabled={busy}>Add Candidate</Button>
    </>}>
      <Labeled label="Full name"><Input value={f.full_name ?? ""} onChange={(e) => set("full_name", e.target.value)} /></Labeled>
      <div className="grid grid-cols-2 gap-3">
        <Labeled label="Rank"><Input value={f.rank ?? ""} onChange={(e) => set("rank", e.target.value)} /></Labeled>
        <Labeled label="Department"><Input value={f.department ?? ""} onChange={(e) => set("department", e.target.value)} /></Labeled>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Labeled label="Nationality"><Input value={f.nationality ?? ""} onChange={(e) => set("nationality", e.target.value)} /></Labeled>
        <Labeled label="Desired position"><Input value={f.desired_position ?? ""} onChange={(e) => set("desired_position", e.target.value)} /></Labeled>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Labeled label="Email"><Input type="email" value={f.email ?? ""} onChange={(e) => set("email", e.target.value)} /></Labeled>
        <Labeled label="Phone"><Input value={f.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></Labeled>
      </div>
    </Modal>
  );
}

function CandidateProfile({ candidateId, onBack }: { candidateId: string; onBack: () => void }) {
  const { user } = useAuth();
  const [candidate, setCandidate] = useState<any>(null);
  const [experience, setExperience] = useState<any[]>([]);
  const [certifications, setCertifications] = useState<any[]>([]);
  const [references, setReferences] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [interactions, setInteractions] = useState<any[]>([]);
  const [note, setNote] = useState("");
  const [refModal, setRefModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { void load(); }, [candidateId]);
  async function load() {
    setLoading(true);
    const [c, exp, certs, refs, docs, crm] = await Promise.all([
      db().from("v_candidate_profiles_masked").select("*").eq("id", candidateId).maybeSingle(),
      db().from("placement_candidate_experience").select("*").eq("candidate_id", candidateId).order("start_date", { ascending: false }),
      db().from("placement_candidate_certifications").select("*").eq("candidate_id", candidateId).order("expiry_date", { ascending: true }),
      db().from("placement_candidate_references").select("*").eq("candidate_id", candidateId),
      db().from("placement_candidate_documents").select("*").eq("candidate_id", candidateId),
      db().from("placement_crm_interactions").select("*").eq("entity_type", "candidate").eq("entity_id", candidateId).order("occurred_at", { ascending: false }),
    ]);
    setCandidate(c.data ?? null);
    setExperience(exp.data ?? []);
    setCertifications(certs.data ?? []);
    setReferences(refs.data ?? []);
    setDocuments(docs.data ?? []);
    setInteractions(crm.data ?? []);
    setLoading(false);
  }

  async function logNote() {
    if (!note.trim()) return;
    const { error } = await db().rpc("log_placement_crm_interaction", {
      p_entity_type: "candidate", p_entity_id: candidateId,
      p_channel: "internal_note", p_direction: "internal", p_summary: note.trim(),
    });
    if (error) { toast.error(error.message); return; }
    setNote("");
    void load();
  }

  if (loading || !candidate) return <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5"><ArrowLeft className="h-3.5 w-3.5" /> Candidates</Button>

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="font-display text-lg font-semibold">{candidate.preferred_name || candidate.full_name}</h2>
        <p className="text-sm text-muted-foreground">{candidate.rank ?? "—"} · {candidate.nationality ?? "—"} · {candidate.current_location ?? "—"}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-4">
        {[
          ["Notice Period", candidate.notice_period ?? "—"],
          ["Desired Position", candidate.desired_position ?? "—"],
          ["Languages", (candidate.languages ?? []).join(", ") || "—"],
          ["Reference Status", candidate.reference_status],
          ["Salary Min", candidate.salary_expectation_min_visible != null ? `${candidate.salary_currency ?? ""} ${candidate.salary_expectation_min_visible}` : "—"],
          ["Salary Max", candidate.salary_expectation_max_visible != null ? `${candidate.salary_currency ?? ""} ${candidate.salary_expectation_max_visible}` : "—"],
          ["Commercial Experience", candidate.commercial_experience ? "Yes" : "No"],
          ["Private Yacht Experience", candidate.private_yacht_experience ? "Yes" : "No"],
        ].map(([label, value]) => (
          <div key={label as string}>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="text-sm">{value as string}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-2 text-sm font-semibold">Employment History</h3>
        {experience.length === 0 ? <p className="text-xs text-muted-foreground">No history recorded.</p> : (
          <div className="space-y-2">
            {experience.map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded border border-border/60 px-3 py-2 text-xs">
                <div>
                  <div className="font-medium">{e.vessel_name ?? "—"} — {e.rank_held ?? "—"}</div>
                  <div className="text-muted-foreground">Captain: {e.captain_name ?? "—"} · {e.management_company ?? "—"}</div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${REFERENCE_STATUS_COLOR[e.reference_status] ?? ""}`}>{e.reference_status}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-2 text-sm font-semibold">Certifications</h3>
        {certifications.length === 0 ? <p className="text-xs text-muted-foreground">No certifications on file.</p> : (
          <div className="space-y-1">
            {certifications.map((c) => {
              const days = c.expiry_date ? Math.ceil((new Date(c.expiry_date).getTime() - Date.now()) / 86400000) : null;
              const color = days == null ? "text-muted-foreground" : days < 0 ? "text-red-400" : days <= 60 ? "text-amber-400" : "text-emerald-400";
              return (
                <div key={c.id} className="flex items-center justify-between text-xs">
                  <span>{c.certification_type}</span>
                  <span className={color}>{c.expiry_date ?? "No expiry"}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">References</h3>
          <Button size="sm" variant="outline" onClick={() => setRefModal(true)}>Request Reference</Button>
        </div>
        {references.length === 0 ? <p className="text-xs text-muted-foreground">No references requested yet.</p> : (
          <div className="space-y-1">
            {references.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-xs">
                <span>{r.referee_name} ({r.reference_type})</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${REFERENCE_STATUS_COLOR[r.request_status] ?? ""}`}>{r.request_status}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-2 text-sm font-semibold">Documents</h3>
        {documents.length === 0 ? <p className="text-xs text-muted-foreground">No documents uploaded.</p> : (
          <div className="space-y-1">
            {documents.map((d) => (
              <div key={d.id} className="flex items-center justify-between text-xs">
                <span>{d.title}</span>
                <span className="text-muted-foreground">{d.document_type} · v{d.current_version}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-2 text-sm font-semibold">CRM Timeline</h3>
        <div className="mb-3 flex gap-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Log a note…" className="h-8 text-xs" />
          <Button size="sm" onClick={logNote}>Log</Button>
        </div>
        <div className="max-h-48 space-y-2 overflow-auto">
          {interactions.length === 0 ? <p className="text-xs text-muted-foreground">No interactions logged.</p> : interactions.map((i) => (
            <div key={i.id} className="text-xs">
              <span className="text-muted-foreground">{new Date(i.occurred_at).toLocaleString()} · {i.channel}</span>
              <p>{i.summary}</p>
            </div>
          ))}
        </div>
      </div>

      {refModal && (
        <RequestReferenceModal
          candidateId={candidateId}
          experienceOptions={experience}
          onClose={() => setRefModal(false)}
          onSaved={() => { setRefModal(false); void load(); }}
        />
      )}
    </div>
  );
}

function RequestReferenceModal({ candidateId, experienceOptions, onClose, onSaved }: {
  candidateId: string; experienceOptions: any[]; onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState<Record<string, string>>({ reference_type: "captain" });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  async function save() {
    if (!f.referee_name?.trim()) { toast.error("Referee name is required"); return; }
    setBusy(true);
    const { error } = await db().rpc("request_placement_reference", {
      p_candidate_id: candidateId,
      p_experience_id: f.experience_id || null,
      p_reference_type: f.reference_type,
      p_referee_name: f.referee_name,
      p_referee_email: f.referee_email || null,
      p_referee_phone: f.referee_phone || null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Reference requested");
    onSaved();
  }

  return (
    <Modal title="Request Reference" onClose={onClose} footer={<>
      <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
      <Button onClick={save} disabled={busy}>Request</Button>
    </>}>
      <Labeled label="Reference type">
        <PlacementSelect
          value={f.reference_type}
          onChange={(v) => set("reference_type", v)}
          options={[
            { value: "professional", label: "Professional" },
            { value: "character", label: "Character" },
            { value: "captain", label: "Captain" },
            { value: "agency", label: "Agency" },
          ]}
        />
      </Labeled>
      {experienceOptions.length > 0 && (
        <Labeled label="Related role (optional)">
          <PlacementSelect
            value={f.experience_id ?? ""}
            onChange={(v) => set("experience_id", v)}
            options={experienceOptions.map((e) => ({ value: e.id, label: `${e.vessel_name ?? "—"} — ${e.rank_held ?? "—"}` }))}
            placeholder="None"
          />
        </Labeled>
      )}
      <Labeled label="Referee name"><Input value={f.referee_name ?? ""} onChange={(e) => set("referee_name", e.target.value)} /></Labeled>
      <div className="grid grid-cols-2 gap-3">
        <Labeled label="Email"><Input type="email" value={f.referee_email ?? ""} onChange={(e) => set("referee_email", e.target.value)} /></Labeled>
        <Labeled label="Phone"><Input value={f.referee_phone ?? ""} onChange={(e) => set("referee_phone", e.target.value)} /></Labeled>
      </div>
    </Modal>
  );
}

export default PlacementCandidatesTab;
