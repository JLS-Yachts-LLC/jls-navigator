import { useEffect, useState } from "react";
import { Route } from "@/routes/_app.crm-lookup";
import { supabase } from "@/integrations/supabase/client";
import { Phone, PhoneIncoming, Loader2, User, MessageCircle } from "lucide-react";
import { telHref, whatsappHref } from "@/lib/directory/contact-actions";

type Match = { type: string; name: string; subtitle: string | null; phone: string | null; id: string };

const TYPE_COLOR: Record<string, string> = {
  Crew: "bg-blue-500/15 text-blue-400",
  Staff: "bg-violet-500/15 text-violet-400",
  Supplier: "bg-amber-500/15 text-amber-500",
  Vendor: "bg-amber-500/15 text-amber-500",
  Agency: "bg-teal-500/15 text-teal-400",
  Emergency: "bg-red-500/15 text-red-400",
  Directory: "bg-emerald-500/15 text-emerald-400",
  "Placed crew": "bg-blue-500/15 text-blue-400",
  Candidate: "bg-slate-500/15 text-slate-300",
};

export function CrmLookupPage() {
  const { phoneNumber, displayName } = Route.useSearch();
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<Match[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      if (!phoneNumber?.trim()) { setMatches([]); setLoading(false); return; }
      const { data, error } = await (supabase as any).rpc("crm_phone_lookup", { p_digits: phoneNumber });
      if (!error && Array.isArray(data)) setMatches(data as Match[]);
      setLoading(false);
    })();
  }, [phoneNumber]);

  const tel = telHref(phoneNumber);
  const wa = whatsappHref(phoneNumber);

  return (
    <div className="flex h-full flex-col items-center justify-start bg-background px-4 py-8">
      <div className="w-full max-w-md space-y-4">
        {/* Incoming call banner */}
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
            <PhoneIncoming className="h-6 w-6 text-primary" />
          </div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Incoming call</div>
          <div className="mt-1 font-display text-2xl font-bold tabular-nums">{phoneNumber || "Unknown number"}</div>
          {displayName && <div className="mt-0.5 text-sm text-muted-foreground">{displayName}</div>}
          <div className="mt-3 flex items-center justify-center gap-2">
            {tel && (
              <a href={tel} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90">
                <Phone className="h-3.5 w-3.5" /> Call back
              </a>
            )}
            {wa && (
              <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
              </a>
            )}
          </div>
        </div>

        {/* Matches */}
        {loading ? (
          <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : matches.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center">
            <User className="mx-auto mb-2 h-6 w-6 text-muted-foreground/40" />
            <p className="text-sm font-medium">No match in Polaris</p>
            <p className="mt-1 text-xs text-muted-foreground">This number isn't linked to any crew, staff, supplier or contact record yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
              {matches.length} match{matches.length !== 1 ? "es" : ""} in Polaris
            </div>
            {matches.map((m, i) => (
              <div key={`${m.type}-${m.id}-${i}`} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/60 text-xs font-bold">
                    {m.name?.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold">{m.name || "—"}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${TYPE_COLOR[m.type] ?? "bg-muted/60 text-muted-foreground"}`}>{m.type}</span>
                    </div>
                    {m.subtitle && <div className="mt-0.5 text-xs text-muted-foreground">{m.subtitle}</div>}
                    {m.phone && <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">{m.phone}</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
