/**
 * Compliance calendar (Agency with JLS) — every date JLS tracks for the vessel
 * in one timeline: the cruising permit, other permits, crew visas and
 * passports, gate passes, and (with On board) ISM certificates. Overdue first,
 * then month by month for the year ahead. Reads through RLS, each query scoped
 * to the vessel explicitly so staff preview shows the right one.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { portalFetch } from "@/lib/portal/portal-fetch";
import { cn } from "@/lib/utils";
import { CalendarDays, IdCard, LifeBuoy, Plane, Shield, ShieldCheck, Users } from "lucide-react";
import { SectionCard, SectionEmpty, SectionHeader, SectionLoading } from "./section-ui";

const db = supabase as any;

type Entry = { key: string; date: string; title: string; detail: string | null; kind: "permit" | "visa" | "passport" | "gatepass" | "ism" | "cruising" };

const ICON = { permit: Shield, visa: Plane, passport: Users, gatepass: IdCard, ism: ShieldCheck, cruising: Shield } as const;
const KIND_LABEL = { permit: "Permit", visa: "Visa", passport: "Passport", gatepass: "Gate pass", ism: "Certificate", cruising: "Cruising permit" } as const;

const today = () => new Date().toISOString().slice(0, 10);
const daysTo = (d: string) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 86400000);
const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const monthKey = (d: string) => d.slice(0, 7);
const monthLabel = (k: string) => new Date(`${k}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const nice = (s: string | null) => (s ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function CalendarSection({ yachtId, includeIsm, includeGatePasses, onRenew }: {
  yachtId: string; includeIsm: boolean; includeGatePasses: boolean; onRenew: (category: string) => void;
}) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [horizon, setHorizon] = useState<90 | 365>(365);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const until = new Date(Date.now() + 366 * 86400000).toISOString().slice(0, 10);
      const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
      const [y, permits, visas, crew, ism, passes]: any[] = await Promise.all([
        db.from("yachts").select("cruising_permit_expiry").eq("id", yachtId).maybeSingle(),
        db.from("permits").select("id, permit_type, permit_number, expiry_date, status").eq("yacht_id", yachtId)
          .gte("expiry_date", since).lte("expiry_date", until).neq("status", "cancelled"),
        db.from("visa_applications").select("id, given_name, surname, visa_type, visa_expiry").eq("yacht_id", yachtId)
          .gte("visa_expiry", since).lte("visa_expiry", until),
        db.from("crew_members").select("id, full_name, first_name, last_name, passport_expiry_date, status").eq("yacht_id", yachtId)
          .gte("passport_expiry_date", since).lte("passport_expiry_date", until),
        includeIsm
          ? db.from("ism_certificates").select("id, title, expiry_date").eq("yacht_id", yachtId).gte("expiry_date", since).lte("expiry_date", until)
          : Promise.resolve({ data: [] }),
        includeGatePasses ? portalFetch("/api/portal/gatepasses").then((r) => r.json()).catch(() => null) : Promise.resolve(null),
      ]);
      const out: Entry[] = [];
      const cp = y?.data?.cruising_permit_expiry;
      if (cp && cp >= since && cp <= until) out.push({ key: "cruising", date: cp, title: "Cruising permit", detail: null, kind: "cruising" });
      for (const p of permits.data ?? []) {
        if (p.permit_type === "gate_pass") continue; // gate passes come from the portal's own requests
        out.push({ key: `p-${p.id}`, date: p.expiry_date, title: nice(p.permit_type) || "Permit", detail: p.permit_number && p.permit_number !== "NA" ? p.permit_number : null, kind: "permit" });
      }
      for (const v of visas.data ?? []) out.push({ key: `v-${v.id}`, date: v.visa_expiry, title: [v.given_name, v.surname].filter(Boolean).join(" ") || "Crew visa", detail: nice(v.visa_type) || null, kind: "visa" });
      for (const c of crew.data ?? []) {
        if (c.status && !["active", "on_leave"].includes(c.status)) continue;
        out.push({ key: `c-${c.id}`, date: c.passport_expiry_date, title: c.full_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "Crew", detail: "Passport", kind: "passport" });
      }
      for (const i of ism.data ?? []) out.push({ key: `i-${i.id}`, date: i.expiry_date, title: i.title, detail: null, kind: "ism" });
      for (const g of passes?.requests ?? []) {
        if (g.captain_requests?.status !== "completed" || g.valid_to < since || g.valid_to > until) continue;
        out.push({ key: `g-${g.id}`, date: g.valid_to, title: `Gate pass${g.company ? ` · ${g.company}` : ""}`, detail: (g.people ?? []).map((p: any) => p.name).join(", ") || g.vehicle_plate || null, kind: "gatepass" });
      }
      out.sort((a, b) => a.date.localeCompare(b.date));
      if (alive) setEntries(out);
    })();
    return () => { alive = false; };
  }, [yachtId, includeIsm, includeGatePasses]);

  const groups = useMemo(() => {
    if (!entries) return null;
    const limit = new Date(Date.now() + horizon * 86400000).toISOString().slice(0, 10);
    const overdue = entries.filter((e) => e.date < today());
    const ahead = entries.filter((e) => e.date >= today() && e.date <= limit);
    const byMonth = new Map<string, Entry[]>();
    for (const e of ahead) { const k = monthKey(e.date); if (!byMonth.has(k)) byMonth.set(k, []); byMonth.get(k)!.push(e); }
    return { overdue, byMonth };
  }, [entries, horizon]);

  if (!entries || !groups) return <SectionLoading />;

  const Row = ({ e }: { e: Entry }) => {
    const n = daysTo(e.date);
    const Icon = ICON[e.kind];
    const renewCat = e.kind === "visa" || e.kind === "passport" ? "visa_immigration" : e.kind === "ism" ? "general" : "permits";
    return (
      <div className="flex items-center gap-3 border-b border-border/50 py-2.5 last:border-0">
        <div className={cn("w-16 shrink-0 text-right text-sm tabular-nums", n < 0 ? "text-red-300" : n <= 30 ? "text-amber-300" : "text-muted-foreground")}>{fmt(e.date)}</div>
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{e.title}</div>
          <div className="truncate text-xs text-muted-foreground">{KIND_LABEL[e.kind]}{e.detail ? ` · ${e.detail}` : ""}</div>
        </div>
        <div className={cn("hidden text-xs sm:block", n < 0 ? "text-red-300" : n <= 30 ? "text-amber-300" : "text-muted-foreground")}>
          {n < 0 ? `${Math.abs(n)} days ago` : n === 0 ? "today" : `in ${n} days`}
        </div>
        {(n <= 60 && e.kind !== "gatepass") && (
          <button type="button" onClick={() => onRenew(renewCat)}
                  className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-[11px] font-medium text-muted-foreground transition hover:text-foreground">
            <LifeBuoy className="h-3.5 w-3.5" /> Renew
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <SectionHeader title="Compliance calendar"
                     subtitle="Every date JLS tracks for your vessel, in one place — renew anything coming up with a tap."
                     action={(
                       <div className="inline-flex rounded-xl border border-border p-1 text-xs">
                         {([90, 365] as const).map((h) => (
                           <button key={h} type="button" onClick={() => setHorizon(h)}
                                   className={cn("rounded-lg px-3 py-1 font-medium transition", horizon === h ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                             {h === 90 ? "Next 90 days" : "Next 12 months"}
                           </button>
                         ))}
                       </div>
                     )} />
      {groups.overdue.length === 0 && groups.byMonth.size === 0 ? (
        <SectionEmpty icon={CalendarDays} message="Nothing expires in this period." />
      ) : (
        <>
          {groups.overdue.length > 0 && (
            <SectionCard className="border-red-500/30 p-4">
              <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-red-300">Expired</h2>
              {groups.overdue.map((e) => <Row key={e.key} e={e} />)}
            </SectionCard>
          )}
          {[...groups.byMonth.entries()].map(([k, list]) => (
            <SectionCard key={k} className="p-4">
              <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{monthLabel(k)}</h2>
              {list.map((e) => <Row key={e.key} e={e} />)}
            </SectionCard>
          ))}
        </>
      )}
    </div>
  );
}
