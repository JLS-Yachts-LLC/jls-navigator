/**
 * JLS Signatories registry — who can sign Anchor documents, their signature image,
 * the approver their documents route to, and WHO MAY USE each signature.
 *
 * A signatory's signature only goes on a document with their permission:
 *   • "Every use needs my approval" — each use waits for the signatory to approve it here.
 *   • "Authorised users may apply it" — the people listed under Authorised users can apply
 *     it without asking; everyone else is refused.
 * Only global admins create / delete signatories; the signatory themself (or a global
 * admin) edits their row, replaces their signature and grants / revokes authorised users.
 * Every request and use is in the usage log. The database and server enforce all of
 * this — the buttons here are just hidden for people who can't use them.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  PenLine, Plus, Loader2, X, Pencil, UploadCloud, Trash2, Lock, ShieldCheck, UserPlus, Check, Ban, ChevronDown, ChevronRight,
} from "lucide-react";
import { confidentialPath } from "@/components/anchor/confidential";
import { anchorSignatoriesApi, requestSignatoryPermission, type SignatoryAccess } from "@/components/anchor/signatory-access";

type Sig = {
  id: string; full_name: string; email: string | null; title: string | null;
  signature_path: string | null; approver_name: string | null; approver_email: string | null; active: boolean;
  user_id: string | null; use_policy: "approval" | "delegates";
};
type Person = { user_id: string; display_name: string | null; email: string | null };
type Delegate = { signatory_id: string; user_id: string; granted_by: string | null; granted_at: string };
type Use = {
  id: string; signatory_id: string; document_title: string | null; status: string; basis: string | null;
  requested_by_email: string | null; decided_by_email: string | null; decided_at: string | null; applied_at: string | null;
  note: string | null; created_at: string; esign_document_id: string | null; form_submission_id: string | null; campaign_id: string | null;
};
type SigEvent = { id: string; signatory_id: string; event: string; actor_email: string | null; target_user: string | null; detail: string | null; created_at: string };

const db = () => supabase as any;
const field = "w-full h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring";
const dt = (d: string | null) => d ? new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const POLICY_LABEL = { approval: "Every use needs my approval", delegates: "Authorised users may apply it" } as const;
const USE_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Waiting for approval", cls: "bg-amber-500/15 text-amber-500" },
  approved: { label: "Approved", cls: "bg-sky-500/15 text-sky-500" },
  applied: { label: "Signed", cls: "bg-emerald-500/15 text-emerald-500" },
  denied: { label: "Declined", cls: "bg-red-500/15 text-red-400" },
  refused: { label: "Blocked", cls: "bg-red-500/15 text-red-400" },
  cancelled: { label: "Cancelled", cls: "bg-muted text-muted-foreground" },
};
const EVENT_LABEL: Record<string, string> = {
  created: "Signatory added", granted: "Authorised user added", revoked: "Authorised user removed",
  signature_changed: "Signature image changed", policy_changed: "Permission setting changed",
  owner_changed: "Linked login changed", access_requested: "Asked for permission",
};

function SigPreview({ path, className }: { path: string | null; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let on = true;
    if (!path) { setUrl(null); return; }
    // Only the signatory and global admins can open the image; everyone else sees a placeholder.
    db().storage.from("signatures").createSignedUrl(path, 3600).then(({ data }: any) => {
      if (!on) return;
      setUrl(data?.signedUrl ?? null); setHidden(!data?.signedUrl);
    });
    return () => { on = false; };
  }, [path]);
  if (hidden) return <span className="flex items-center gap-1 text-[11px] text-muted-foreground/70"><Lock className="h-3 w-3" /> Signature on file</span>;
  if (!url) return null;
  return <img src={url} alt="signature" className={className ?? "h-10 object-contain"} />;
}

/** `confidential` → the Confidential area's signatories (admins + the Anchor — Confidential permission only). */
export function SignatoriesPage({ confidential = false }: { confidential?: boolean } = {}) {
  const { user } = useAuth();
  const me = user?.id ?? null;
  const [rows, setRows] = useState<Sig[]>([]);
  const [access, setAccess] = useState<Map<string, SignatoryAccess>>(new Map());
  const [people, setPeople] = useState<Person[]>([]);
  const [delegates, setDelegates] = useState<Delegate[]>([]);
  const [uses, setUses] = useState<Use[]>([]);
  const [events, setEvents] = useState<SigEvent[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Partial<Sig> | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => { void load(); }, [confidential, me]);
  async function load() {
    setLoading(true);
    const { data, error } = await db().from("jls_signatories").select("*").eq("confidential", confidential).order("full_name");
    if (error) { toast.error(error.message); setLoading(false); return; }
    const sigs = (data ?? []) as Sig[];
    const ids = sigs.map((s) => s.id);
    const [acc, ppl, dels, us, evs, admin] = await Promise.all([
      db().rpc("my_signatory_access"),
      db().from("user_profiles").select("user_id, display_name, email, active").order("display_name"),
      ids.length ? db().from("jls_signatory_delegates").select("*").in("signatory_id", ids) : { data: [] },
      ids.length ? db().from("jls_signatory_uses").select("*").in("signatory_id", ids).order("created_at", { ascending: false }).limit(300) : { data: [] },
      ids.length ? db().from("jls_signatory_events").select("*").in("signatory_id", ids).order("created_at", { ascending: false }).limit(200) : { data: [] },
      me ? db().rpc("is_polaris_global_admin", { p_user_id: me }) : { data: false },
    ]);
    setRows(sigs);
    setAccess(new Map(((acc.data ?? []) as any[]).map((a) => [a.signatory_id, a.access])));
    setPeople(((ppl.data ?? []) as any[]).filter((p) => p.active !== false));
    setDelegates((dels.data ?? []) as Delegate[]);
    setUses((us.data ?? []) as Use[]);
    setEvents((evs.data ?? []) as SigEvent[]);
    setIsAdmin(admin.data === true);
    setLoading(false);
  }

  const personName = (id: string | null) => {
    if (!id) return "—";
    const p = people.find((x) => x.user_id === id);
    return p?.display_name || p?.email || "Unknown user";
  };
  const canManage = (s: Sig) => isAdmin || (!!me && s.user_id === me);
  const mine = rows.filter((s) => s.user_id && s.user_id === me).map((s) => s.id);
  const waitingForMe = uses.filter((u) => u.status === "pending" && mine.includes(u.signatory_id));

  async function remove(id: string) {
    if (!confirm("Remove this signatory?")) return;
    const { error } = await db().from("jls_signatories").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Removed"); await load(); }
  }
  async function decide(u: Use, approve: boolean) {
    const note = approve ? "" : window.prompt("Decline — add a note for the requester (optional):", "");
    if (note === null) return;
    try {
      const res = await anchorSignatoriesApi("decide", { useId: u.id, approve, note });
      toast.success(`${approve ? "Approved" : "Declined"}${res?.followUp ? ` — ${res.followUp}` : ""}`);
      await load();
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">{confidential ? "Confidential" : "Anchor"}</div>
          <h1 className="mt-0.5 flex items-center gap-2 font-display text-[1.25rem] font-semibold tracking-tight">
            {confidential ? <><Lock className="h-4 w-4 text-primary/80" /> Confidential signatories</> : <><PenLine className="h-4 w-4 text-primary/80" /> Signatories</>}
          </h1>
        </div>
        {isAdmin && <Button size="sm" onClick={() => setEdit({ active: true, use_policy: "approval" })} className="h-9 gap-1.5"><Plus className="h-3.5 w-3.5" /> Add Signatory</Button>}
      </header>

      <div className="flex-1 overflow-auto p-6">
        <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
          A signatory's stored signature can only be put on a document with their permission — either they approve each use,
          or they name the people who may apply it. Every request and use is logged below. Only global admins add signatories;
          the signatory (or a global admin) manages their own signature and who may use it.
        </p>

        {waitingForMe.length > 0 && (
          <div className="mb-5 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
            <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-amber-500" /> Waiting for your approval</div>
            <div className="space-y-1.5">
              {waitingForMe.map((u) => (
                <div key={u.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-card px-3 py-2 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-foreground">{u.document_title ?? "Document"}</div>
                    <div className="text-muted-foreground">
                      {u.requested_by_email ?? "Someone"} asked {dt(u.created_at)} · {u.campaign_id && !u.esign_document_id ? "campaign" : u.form_submission_id ? "form" : "document"}
                    </div>
                  </div>
                  <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => void decide(u, true)}><Check className="h-3 w-3" /> Approve</Button>
                  <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => void decide(u, false)}><Ban className="h-3 w-3" /> Decline</Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading ? <div className="py-16 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div> : (
          <div className="space-y-3">
            {rows.length === 0 && <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">No signatories yet.</div>}
            {rows.map((s) => {
              const a = access.get(s.id) ?? "none";
              const expanded = open === s.id;
              return (
                <div key={s.id} className="rounded-xl border border-border bg-card">
                  <div className="flex flex-wrap items-center gap-4 p-4">
                    <button onClick={() => setOpen(expanded ? null : s.id)} className="text-muted-foreground hover:text-foreground">
                      {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <div className="min-w-[180px] flex-1">
                      <div className="font-medium">{s.full_name}{!s.active && <span className="ml-2 text-[10px] text-muted-foreground">(inactive)</span>}</div>
                      <div className="text-[11px] text-muted-foreground">{[s.title, s.email].filter(Boolean).join(" · ") || "—"}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        Login: <span className="text-foreground">{s.user_id ? personName(s.user_id) : "not linked"}</span>
                        {" · "}<span className="text-foreground">{POLICY_LABEL[s.use_policy] ?? s.use_policy}</span>
                      </div>
                    </div>
                    <div className="flex h-12 w-40 items-center justify-center rounded-md border border-border/60 bg-background">
                      {s.signature_path ? <SigPreview path={s.signature_path} /> : <span className="text-[11px] text-muted-foreground/60">No signature uploaded</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      {a === "own" && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">Your signature</span>}
                      {a === "authorised" && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">You may apply it</span>}
                      {a === "approval" && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-500">Needs their approval</span>}
                      {a === "none" && s.active && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void requestSignatoryPermission(s)}>Request permission</Button>
                      )}
                      {canManage(s) && <button onClick={() => setEdit(s)} title="Edit" className="rounded p-1 text-muted-foreground/60 hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>}
                      {isAdmin && <button onClick={() => remove(s.id)} title="Remove" className="rounded p-1 text-muted-foreground/60 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>}
                    </div>
                  </div>
                  {expanded && (
                    <SignatoryDetail
                      sig={s} canManage={canManage(s)} me={me} people={people} personName={personName}
                      delegates={delegates.filter((d) => d.signatory_id === s.id)}
                      uses={uses.filter((u) => u.signatory_id === s.id)}
                      events={events.filter((e) => e.signatory_id === s.id)}
                      onChanged={load}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {edit && <SignatoryDialog init={edit} confidential={confidential} isAdmin={isAdmin} people={people} onClose={() => setEdit(null)} onDone={() => { setEdit(null); void load(); }} />}
    </div>
  );
}

function SignatoryDetail({ sig, canManage, me, people, personName, delegates, uses, events, onChanged }: {
  sig: Sig; canManage: boolean; me: string | null; people: Person[]; personName: (id: string | null) => string;
  delegates: Delegate[]; uses: Use[]; events: SigEvent[]; onChanged: () => void;
}) {
  const [pick, setPick] = useState("");
  const candidates = useMemo(
    () => people.filter((p) => p.user_id !== sig.user_id && !delegates.some((d) => d.user_id === p.user_id)),
    [people, delegates, sig.user_id],
  );

  async function grant() {
    if (!pick || !me) return;
    const { error } = await db().from("jls_signatory_delegates").insert({ signatory_id: sig.id, user_id: pick, granted_by: me });
    if (error) toast.error(error.message); else { toast.success("Authorised user added"); setPick(""); onChanged(); }
  }
  async function revoke(userId: string) {
    if (!confirm(`Remove ${personName(userId)} as an authorised user of ${sig.full_name}'s signature?`)) return;
    const { error } = await db().from("jls_signatory_delegates").delete().eq("signatory_id", sig.id).eq("user_id", userId);
    if (error) toast.error(error.message); else { toast.success("Authorised user removed"); onChanged(); }
  }

  return (
    <div className="grid gap-4 border-t border-border/60 p-4 lg:grid-cols-2">
      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Authorised users</div>
        {sig.use_policy === "approval" && (
          <p className="mb-2 text-[11px] text-muted-foreground">
            Set to “every use needs my approval” — the people below still need {sig.full_name}'s approval each time.
          </p>
        )}
        <div className="space-y-1">
          {delegates.length === 0 && <p className="text-xs text-muted-foreground/70">Nobody yet.</p>}
          {delegates.map((d) => (
            <div key={d.user_id} className="flex items-center gap-2 rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-xs">
              <span className="flex-1"><span className="font-medium">{personName(d.user_id)}</span> <span className="text-muted-foreground">· added by {personName(d.granted_by)} {dt(d.granted_at)}</span></span>
              {canManage && <button onClick={() => void revoke(d.user_id)} className="text-muted-foreground hover:text-red-400" title="Remove"><X className="h-3.5 w-3.5" /></button>}
            </div>
          ))}
        </div>
        {canManage && (
          <div className="mt-2 flex gap-2">
            <select className={field} value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Add an authorised user…</option>
              {candidates.map((p) => <option key={p.user_id} value={p.user_id}>{p.display_name || p.email}</option>)}
            </select>
            <Button size="sm" variant="outline" className="h-9 gap-1" disabled={!pick} onClick={() => void grant()}><UserPlus className="h-3.5 w-3.5" /> Add</Button>
          </div>
        )}

        <div className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Changes</div>
        <div className="max-h-48 space-y-1 overflow-auto">
          {events.length === 0 && <p className="text-xs text-muted-foreground/70">No changes recorded yet.</p>}
          {events.map((e) => (
            <div key={e.id} className="text-[11px] text-muted-foreground">
              <span className="text-foreground">{EVENT_LABEL[e.event] ?? e.event}</span>
              {e.target_user && ["granted", "revoked", "owner_changed", "access_requested"].includes(e.event) && <> — {personName(e.target_user)}</>}
              {e.detail && <> · {e.detail}</>}
              {" · "}{e.actor_email ?? "system"} · {dt(e.created_at)}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Usage log</div>
        <div className="max-h-80 space-y-1 overflow-auto">
          {uses.length === 0 && <p className="text-xs text-muted-foreground/70">This signature hasn't been requested or used yet.</p>}
          {uses.map((u) => {
            const st = USE_STATUS[u.status] ?? { label: u.status, cls: "bg-muted text-muted-foreground" };
            return (
              <div key={u.id} className="rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{u.document_title ?? "Document"}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.cls}`}>{st.label}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {u.requested_by_email ? <>Requested by {u.requested_by_email} · </> : null}{dt(u.created_at)}
                  {u.decided_by_email && <> · {u.status === "denied" ? "declined" : "approved"} by {u.decided_by_email}{u.basis === "authorised" ? " (authorised user)" : u.basis === "own" ? " (own signature)" : u.basis === "campaign" ? " (campaign approval)" : ""}</>}
                  {u.applied_at && <> · signed {dt(u.applied_at)}</>}
                  {u.note && <> · {u.note}</>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SignatoryDialog({ init, confidential, isAdmin, people, onClose, onDone }: {
  init: Partial<Sig>; confidential: boolean; isAdmin: boolean; people: Person[]; onClose: () => void; onDone: () => void;
}) {
  const [f, setF] = useState<Partial<Sig>>(init);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Sig, v: any) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    if (!f.full_name?.trim()) { toast.error("Name is required"); return; }
    setBusy(true);
    try {
      // The row id is fixed up front: signature files must be named after it.
      const id = f.id ?? crypto.randomUUID();
      let signature_path = f.signature_path ?? null;
      if (file) {
        if (file.type !== "image/png") { toast.error("Signature must be a PNG"); setBusy(false); return; }
        if (file.size > 5 * 1024 * 1024) { toast.error("Max 5 MB"); setBusy(false); return; }
        const path = confidentialPath(confidential, `${id}-${Date.now()}.png`);
        const { error: upErr } = await db().storage.from("signatures").upload(path, file, { upsert: true, contentType: "image/png" });
        if (upErr) { toast.error(`Upload failed: ${upErr.message}`); setBusy(false); return; }
        signature_path = path;
      }
      const row: Record<string, unknown> = {
        full_name: f.full_name.trim(), email: f.email || null, title: f.title || null,
        approver_name: f.approver_name || null, approver_email: f.approver_email || null,
        active: f.active ?? true, signature_path, confidential, use_policy: f.use_policy ?? "approval",
        updated_at: new Date().toISOString(),
      };
      if (isAdmin) row.user_id = f.user_id || null;
      const { error } = f.id ? await db().from("jls_signatories").update(row).eq("id", f.id) : await db().from("jls_signatories").insert({ id, ...row });
      if (error) { toast.error(error.message); setBusy(false); return; }
      toast.success("Saved"); onDone();
    } catch (e: any) { toast.error(String(e?.message ?? e)); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-base font-semibold">{f.id ? "Edit Signatory" : "Add Signatory"}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted/50"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <L label="Full name"><input className={field} value={f.full_name ?? ""} onChange={(e) => set("full_name", e.target.value)} /></L>
            <L label="Title"><input className={field} value={f.title ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Operations Director" /></L>
            <L label="Email"><input className={field} value={f.email ?? ""} onChange={(e) => set("email", e.target.value)} /></L>
            <L label="Active"><select className={field} value={String(f.active ?? true)} onChange={(e) => set("active", e.target.value === "true")}><option value="true">Active</option><option value="false">Inactive</option></select></L>
            <L label="Approver name"><input className={field} value={f.approver_name ?? ""} onChange={(e) => set("approver_name", e.target.value)} /></L>
            <L label="Approver email"><input className={field} value={f.approver_email ?? ""} onChange={(e) => set("approver_email", e.target.value)} /></L>
          </div>
          <L label="Their Polaris login (who approves uses of this signature)">
            <select className={field} value={f.user_id ?? ""} disabled={!isAdmin} onChange={(e) => set("user_id", e.target.value || null)}>
              <option value="">— not linked —</option>
              {people.map((p) => <option key={p.user_id} value={p.user_id}>{p.display_name || p.email}{p.email && p.display_name ? ` (${p.email})` : ""}</option>)}
            </select>
          </L>
          <L label="Who may apply this signature">
            <select className={field} value={f.use_policy ?? "approval"} onChange={(e) => set("use_policy", e.target.value)}>
              <option value="approval">{POLICY_LABEL.approval}</option>
              <option value="delegates">{POLICY_LABEL.delegates}</option>
            </select>
          </L>
          <L label="Signature (PNG, transparent)">
            <div className="flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-background px-3 py-2.5 text-xs text-muted-foreground hover:border-primary/40">
                <UploadCloud className="h-4 w-4" />{file ? <span className="text-foreground">{file.name}</span> : <span>Upload PNG · max 5 MB</span>}
                <input type="file" accept="image/png" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
              {!file && f.signature_path && <SigPreview path={f.signature_path} className="h-9 object-contain" />}
            </div>
          </L>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3.5">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={busy} className="gap-1.5">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Save</Button>
        </div>
      </div>
    </div>
  );
}
function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">{label}</label>{children}</div>;
}
