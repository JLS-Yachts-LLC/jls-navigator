/**
 * ISM section for the "My Yacht" portal — safety certificates + drill log.
 * Reads `ism_certificates` / `ism_drills` (yacht-scoped). BUILT BUT NOT YET WIRED.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { ShieldCheck, Flame, FileText } from "lucide-react";
import { SectionCard, SectionHeader, SectionLoading, SectionEmpty, StatusBadge, fmtDate, daysUntil } from "./section-ui";

const db = supabase as any;

type IsmCertificate = {
  id: string; title: string; certificate_type: string | null; reference: string | null;
  issuing_authority: string | null; issued_date: string | null; expiry_date: string | null;
  status: string; file_path: string | null;
};
type IsmDrill = {
  id: string; drill_type: string; conducted_at: string | null; conducted_by: string | null;
  participants: string | null; location: string | null;
};

const CERT_TONE: Record<string, "green" | "amber" | "red" | "sky" | "slate"> = {
  valid: "green", expiring: "amber", expired: "red", pending: "sky",
};

/** Derive live status from expiry when the stored status is just "valid". */
function effectiveStatus(c: IsmCertificate): string {
  const d = daysUntil(c.expiry_date);
  if (c.status === "pending") return "pending";
  if (d != null && d < 0) return "expired";
  if (d != null && d <= 60) return "expiring";
  return c.status || "valid";
}

export function IsmSection({ yachtId }: { yachtId: string }) {
  const [certs, setCerts] = useState<IsmCertificate[]>([]);
  const [drills, setDrills] = useState<IsmDrill[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"certificates" | "drills">("certificates");

  useEffect(() => {
    Promise.all([
      db.from("ism_certificates")
        .select("id, title, certificate_type, reference, issuing_authority, issued_date, expiry_date, status, file_path")
        .eq("yacht_id", yachtId).order("expiry_date", { ascending: true, nullsFirst: false }),
      db.from("ism_drills")
        .select("id, drill_type, conducted_at, conducted_by, participants, location")
        .eq("yacht_id", yachtId).order("conducted_at", { ascending: false, nullsFirst: false }),
    ]).then(([c, d]: any[]) => { setCerts(c.data ?? []); setDrills(d.data ?? []); setLoading(false); });
  }, [yachtId]);

  function openDoc(path: string | null) {
    if (!path) return;
    const { data } = db.storage.from("esign-documents").getPublicUrl(path);
    if (data?.publicUrl) window.open(data.publicUrl, "_blank");
  }

  if (loading) return <SectionLoading />;

  return (
    <div className="space-y-4">
      <SectionHeader title="ISM & Safety" subtitle="Safety certificates and the vessel's drill record." />

      <div className="inline-flex rounded-xl border border-border p-1 text-sm">
        {(["certificates", "drills"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)}
                  className={cn("rounded-lg px-4 py-1.5 font-medium capitalize transition", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
            {v}
          </button>
        ))}
      </div>

      {view === "certificates" && (
        certs.length === 0 ? <SectionEmpty icon={ShieldCheck} message="No ISM certificates on record yet." /> : (
          <div className="space-y-2">
            {certs.map((c) => {
              const st = effectiveStatus(c);
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
                      <button onClick={() => openDoc(c.file_path)} className="mt-1 inline-flex items-center gap-1 text-primary hover:underline">
                        <FileText className="h-3 w-3" /> View
                      </button>
                    )}
                  </div>
                </SectionCard>
              );
            })}
          </div>
        )
      )}

      {view === "drills" && (
        drills.length === 0 ? <SectionEmpty icon={Flame} message="No drills logged yet." /> : (
          <div className="space-y-2">
            {drills.map((d) => (
              <SectionCard key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{d.drill_type}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {[d.conducted_by, d.location, d.participants].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground">{fmtDate(d.conducted_at)}</div>
              </SectionCard>
            ))}
          </div>
        )
      )}
    </div>
  );
}
