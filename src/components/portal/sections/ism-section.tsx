/**
 * ISM & safety (On board) — safety certificates and the drill log.
 * Reads `ism_certificates` / `ism_drills` through RLS (vessel-scoped); writes go
 * through /api/portal/onboard. A certificate's status is worked out live from its
 * expiry (lib/portal/onboard), not the stored column.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { portalFetch } from "@/lib/portal/portal-fetch";
import { cn } from "@/lib/utils";
import { FileText, Flame, Pencil, ShieldCheck } from "lucide-react";
import { certStatus } from "@/lib/portal/onboard";
import {
  AddButton, RecordFormModal, SectionCard, SectionEmpty, SectionHeader, SectionLoading, StatusBadge,
  daysUntil, fmtDate, onboardRequest, type FormField,
} from "./section-ui";

const db = supabase as any;

type IsmCertificate = {
  id: string; title: string; certificate_type: string | null; reference: string | null;
  issuing_authority: string | null; issued_date: string | null; expiry_date: string | null;
  status: string; file_path: string | null; notes: string | null;
};
type IsmDrill = {
  id: string; drill_type: string; conducted_at: string | null; conducted_by: string | null;
  participants: string | null; location: string | null; notes: string | null;
};

const CERT_TONE: Record<string, "green" | "amber" | "red" | "sky" | "slate"> = {
  valid: "green", expiring: "amber", expired: "red", pending: "sky",
};

const CERT_FIELDS: FormField[] = [
  { key: "title", label: "Certificate", required: true, wide: true, placeholder: "e.g. Safety Management Certificate" },
  { key: "certificate_type", label: "Type", placeholder: "e.g. ISM, ISPS, MLC, Class" },
  { key: "reference", label: "Certificate number" },
  { key: "issuing_authority", label: "Issued by", placeholder: "e.g. Cayman Islands Shipping Registry" },
  { key: "status", label: "Status", type: "select", required: true,
    options: [{ value: "valid", label: "Issued" }, { value: "pending", label: "Applied for / pending" }] },
  { key: "issued_date", label: "Issued", type: "date" },
  { key: "expiry_date", label: "Expires", type: "date" },
  { key: "notes", label: "Notes", type: "textarea" },
];

const DRILL_TYPES = ["Fire", "Abandon ship", "Man overboard", "Enclosed space", "Security (ISPS)", "Oil spill", "Medical", "Other"];
const DRILL_FIELDS: FormField[] = [
  { key: "drill_type", label: "Drill", type: "select", required: true, options: DRILL_TYPES.map((d) => ({ value: d, label: d })) },
  { key: "conducted_at", label: "Date", type: "date" },
  { key: "conducted_by", label: "Led by", placeholder: "e.g. Chief Officer" },
  { key: "location", label: "Where", placeholder: "e.g. Alongside, Mina Rashid" },
  { key: "participants", label: "Crew who took part", type: "textarea" },
  { key: "notes", label: "Notes & lessons learned", type: "textarea" },
];

export function IsmSection({ yachtId, canEdit }: { yachtId: string; canEdit: boolean }) {
  const [certs, setCerts] = useState<IsmCertificate[]>([]);
  const [drills, setDrills] = useState<IsmDrill[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"certificates" | "drills">("certificates");
  const [editingCert, setEditingCert] = useState<IsmCertificate | "new" | null>(null);
  const [editingDrill, setEditingDrill] = useState<IsmDrill | "new" | null>(null);

  const load = useCallback(async () => {
    const [c, d]: any[] = await Promise.all([
      db.from("ism_certificates")
        .select("id, title, certificate_type, reference, issuing_authority, issued_date, expiry_date, status, file_path, notes")
        .eq("yacht_id", yachtId).order("expiry_date", { ascending: true, nullsFirst: false }),
      db.from("ism_drills")
        .select("id, drill_type, conducted_at, conducted_by, participants, location, notes")
        .eq("yacht_id", yachtId).order("conducted_at", { ascending: false, nullsFirst: false }),
    ]);
    setCerts(c.data ?? []); setDrills(d.data ?? []); setLoading(false);
  }, [yachtId]);
  useEffect(() => { void load(); }, [load]);

  /**
   * Certificates are opened through the portal endpoint, not by signing storage
   * from the browser: it re-checks the certificate belongs to this vessel and
   * records the access. Portal users have no storage read grant of their own.
   */
  async function openDoc(certId: string) {
    try {
      const res = await portalFetch(`/api/portal/documents/open?type=ism_cert&id=${certId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "That certificate could not be opened.");
      }
      window.open(res.url, "_blank", "noreferrer");
    } catch (e) {
      alert(e instanceof Error ? e.message : "That certificate could not be opened.");
    }
  }

  if (loading) return <SectionLoading />;

  const expiring = certs.filter((c) => ["expiring", "expired"].includes(certStatus(c.status, c.expiry_date))).length;
  const lastDrill = drills[0]?.conducted_at ?? null;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="ISM & safety"
        subtitle="Safety certificates and the vessel's drill record."
        action={canEdit && (view === "certificates"
          ? <AddButton onClick={() => setEditingCert("new")}>Add certificate</AddButton>
          : <AddButton onClick={() => setEditingDrill("new")}>Log drill</AddButton>)}
      />

      {(certs.length > 0 || drills.length > 0) && (
        <div className="grid grid-cols-3 gap-3">
          <SectionCard className="p-4"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Certificates</div><div className="mt-1 text-lg font-bold">{certs.length}</div></SectionCard>
          <SectionCard className="p-4"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Expiring / expired</div><div className={cn("mt-1 text-lg font-bold", expiring ? "text-amber-400" : "")}>{expiring}</div></SectionCard>
          <SectionCard className="p-4"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Last drill</div><div className="mt-1 text-sm font-bold">{lastDrill ? fmtDate(lastDrill) : "—"}</div></SectionCard>
        </div>
      )}

      <div className="inline-flex rounded-xl border border-border p-1 text-sm">
        {(["certificates", "drills"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)}
                  className={cn("rounded-lg px-4 py-1.5 font-medium capitalize transition", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
            {v}
          </button>
        ))}
      </div>

      {view === "certificates" && (
        certs.length === 0 ? <SectionEmpty icon={ShieldCheck} message={canEdit ? "No certificates yet — add each one with its expiry and you'll see it here before it lapses." : "No ISM certificates on record yet."} /> : (
          <div className="space-y-2">
            {certs.map((c) => {
              const st = certStatus(c.status, c.expiry_date);
              const d = daysUntil(c.expiry_date);
              return (
                <SectionCard key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.title}</span>
                      <StatusBadge label={st} tone={CERT_TONE[st] ?? "slate"} />
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {[c.certificate_type, c.reference, c.issuing_authority].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <div className={cn(d != null && d < 0 ? "text-red-400" : d != null && d <= 60 ? "text-amber-400" : "text-muted-foreground")}>
                      {c.expiry_date ? `Expires ${fmtDate(c.expiry_date)}` : "No expiry"}
                    </div>
                    {c.file_path && (
                      <button onClick={() => void openDoc(c.id)} className="mt-1 inline-flex items-center gap-1 text-primary hover:underline">
                        <FileText className="h-3 w-3" /> View
                      </button>
                    )}
                  </div>
                  {canEdit && (
                    <button type="button" onClick={() => setEditingCert(c)} aria-label={`Edit ${c.title}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-background/60 hover:text-foreground">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </SectionCard>
              );
            })}
          </div>
        )
      )}

      {view === "drills" && (
        drills.length === 0 ? <SectionEmpty icon={Flame} message={canEdit ? "No drills logged yet — log each one as it's run to keep the record ready for inspection." : "No drills logged yet."} /> : (
          <div className="space-y-2">
            {drills.map((d) => (
              <SectionCard key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{d.drill_type}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {[d.conducted_by, d.location].filter(Boolean).join(" · ") || "—"}
                  </div>
                  {d.participants && <div className="mt-1 line-clamp-1 text-[11px] text-muted-foreground/80">{d.participants}</div>}
                </div>
                <div className="text-right text-xs text-muted-foreground">{fmtDate(d.conducted_at)}</div>
                {canEdit && (
                  <button type="button" onClick={() => setEditingDrill(d)} aria-label={`Edit ${d.drill_type} drill`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-background/60 hover:text-foreground">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </SectionCard>
            ))}
          </div>
        )
      )}

      {editingCert && (
        <RecordFormModal
          title={editingCert === "new" ? "Add certificate" : `Edit ${editingCert.title}`}
          kind="ism_cert" fields={CERT_FIELDS}
          initial={editingCert === "new" ? { status: "valid" } : editingCert}
          onClose={() => setEditingCert(null)}
          onSaved={() => { setEditingCert(null); void load(); }}
          onDelete={editingCert === "new" ? undefined : async () => {
            await onboardRequest("ism_cert", { method: "DELETE", id: (editingCert as IsmCertificate).id });
            setEditingCert(null); void load();
          }}
          deleteLabel="Delete certificate"
        />
      )}
      {editingDrill && (
        <RecordFormModal
          title={editingDrill === "new" ? "Log drill" : `Edit ${editingDrill.drill_type} drill`}
          kind="ism_drill" fields={DRILL_FIELDS}
          initial={editingDrill === "new" ? { drill_type: "Fire", conducted_at: new Date().toISOString().slice(0, 10) } : editingDrill}
          onClose={() => setEditingDrill(null)}
          onSaved={() => { setEditingDrill(null); void load(); }}
          onDelete={editingDrill === "new" ? undefined : async () => {
            await onboardRequest("ism_drill", { method: "DELETE", id: (editingDrill as IsmDrill).id });
            setEditingDrill(null); void load();
          }}
          deleteLabel="Delete drill"
        />
      )}
    </div>
  );
}
