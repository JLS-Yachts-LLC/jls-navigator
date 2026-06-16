import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Loader2, UserCircle2, BookUser, Stamp, FileText,
  Plane, ShipWheel, Mail, Phone, ExternalLink, ShieldQuestion,
} from "lucide-react";
import { cn } from "@/lib/utils";

type CrewMember = {
  id: string; yacht_id: string | null;
  first_name: string; middle_name: string | null; last_name: string; full_name: string | null;
  nationality: string | null; gender: string | null; date_of_birth: string | null;
  rank: string | null; department: string | null; status: string;
  email: string | null; phone: string | null; photo_url: string | null;
  passport_number: string | null; passport_expiry_date: string | null;
  seamans_book_number: string | null; seamans_book_expiry: string | null;
};
type Passport = {
  id: string; nationality: string | null; passport_number: string | null;
  issue_date: string | null; expiry_date: string | null; issuing_country: string | null;
  is_primary: boolean | null; document_url: string | null; cover_url: string | null;
  headshot_url: string | null; seamans_book_url: string | null;
};
type Visa = {
  id: string; visa_type: string | null; destination_country: string | null;
  status: string | null; jls_reference: string | null; passport_number: string | null;
  given_name: string | null; surname: string | null; visa_expiry: string | null;
  visa_number: string | null; sign_on_date: string | null; sign_off_date: string | null;
  planned_arrival: string | null; planned_departure: string | null;
  visa_document_url: string | null; created_at: string;
  _match?: "linked" | "passport" | "name";
};
type Doc = {
  id: string; doc_type: string | null; title: string | null; file_url: string | null;
  file_name: string | null; issue_date: string | null; expiry_date: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-400",
  on_leave: "bg-amber-500/15 text-amber-400",
  off_signed: "bg-slate-500/15 text-slate-400",
  inactive: "bg-red-500/15 text-red-400",
};
const VISA_STATUS_COLORS: Record<string, string> = {
  approved: "bg-emerald-500/15 text-emerald-400",
  completed: "bg-emerald-500/15 text-emerald-400",
  submitted: "bg-sky-500/15 text-sky-400",
  in_progress: "bg-sky-500/15 text-sky-400",
  pending: "bg-amber-500/15 text-amber-400",
  rejected: "bg-red-500/15 text-red-400",
  denied: "bg-red-500/15 text-red-400",
  cancelled: "bg-slate-500/15 text-slate-400",
};

const fmt = (d: string | null) =>
  d ? new Date(d + (d.length === 10 ? "T00:00" : "")).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
const titleCase = (s: string | null | undefined) =>
  s ? s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—";
const isSoon = (d: string | null, days = 90) => !!d && new Date(d) < new Date(Date.now() + days * 86400000);

export function CrewProfilePage() {
  const { id } = useParams({ from: "/_app/crew-immigration/crew/$id" });
  const [crew, setCrew] = useState<CrewMember | null>(null);
  const [passports, setPassports] = useState<Passport[]>([]);
  const [visas, setVisas] = useState<Visa[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [signon, setSignon] = useState<{ id: string; event_type: string; event_date: string | null; port: string | null; yacht_id: string | null }[]>([]);
  const [yachtName, setYachtName] = useState<string>("");
  const [yachtMap, setYachtMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => { void load(); }, [id]);

  async function load() {
    setLoading(true);
    const db = supabase as any;
    const { data: m } = await db.from("crew_members").select("*").eq("id", id).single();
    setCrew(m ?? null);

    const [{ data: yl }, { data: pp }, { data: linkedVisas }, { data: dd }, { data: so }] = await Promise.all([
      fetchAllRows(() => supabase.from("yachts").select("id, vessel_name")),
      fetchAllRows(() => db.from("crew_passports").select("*").eq("crew_id", id).order("is_primary", { ascending: false })),
      fetchAllRows(() => db.from("visa_applications").select("*").eq("crew_member_id", id)),
      fetchAllRows(() => db.from("crew_documents").select("*").eq("crew_member_id", id).order("created_at", { ascending: false })),
      fetchAllRows(() => db.from("crew_signon_events").select("*").eq("crew_member_id", id).order("event_date", { ascending: false })),
    ]);

    const ymap = new Map<string, string>((yl ?? []).map((y: any) => [y.id, y.vessel_name]));
    setYachtMap(ymap);
    if (m?.yacht_id) setYachtName(ymap.get(m.yacht_id) ?? "");
    setPassports((pp ?? []) as Passport[]);
    setDocs((dd ?? []) as Doc[]);
    setSignon((so ?? []) as any[]);

    // Visa applications: directly linked + best-effort matches (passport number / name)
    // surfaced so staff can verify — the visa tracker is largely un-linked to crew.
    const linked = ((linkedVisas ?? []) as Visa[]).map((v) => ({ ...v, _match: "linked" as const }));
    const pNums = new Set<string>([
      ...(m?.passport_number ? [String(m.passport_number).trim()] : []),
      ...((pp ?? []).map((p: any) => (p.passport_number ? String(p.passport_number).trim() : "")).filter(Boolean)),
    ]);
    const fn = (m?.first_name ?? "").trim().toLowerCase();
    const ln = (m?.last_name ?? "").trim().toLowerCase();
    const seen = new Set(linked.map((v) => v.id));
    const candidates: Visa[] = [];
    if (pNums.size || (fn && ln)) {
      const { data: allVisas } = await fetchAllRows(() => db.from("visa_applications").select("*"));
      for (const v of (allVisas ?? []) as Visa[]) {
        if (seen.has(v.id)) continue;
        const vpn = (v.passport_number ?? "").trim();
        if (vpn && pNums.has(vpn)) { candidates.push({ ...v, _match: "passport" }); seen.add(v.id); continue; }
        if (fn && ln && (v.given_name ?? "").trim().toLowerCase() === fn && (v.surname ?? "").trim().toLowerCase() === ln) {
          candidates.push({ ...v, _match: "name" }); seen.add(v.id);
        }
      }
    }
    setVisas([...linked, ...candidates]);
    setLoading(false);
  }

  // Sign-on/off timeline: real events table first; otherwise derive a read-only
  // view from any matched visa applications that carry sign-on/off dates.
  const movements = useMemo(() => {
    if (signon.length) {
      return signon.map((e) => ({
        type: e.event_type, date: e.event_date,
        place: e.port, vessel: e.yacht_id ? yachtMap.get(e.yacht_id) ?? "" : "", derived: false,
      }));
    }
    const out: { type: string; date: string | null; place: string | null; vessel: string; derived: boolean }[] = [];
    for (const v of visas) {
      if (v.sign_on_date) out.push({ type: "sign_on", date: v.sign_on_date, place: v.destination_country, vessel: "", derived: true });
      if (v.sign_off_date) out.push({ type: "sign_off", date: v.sign_off_date, place: v.destination_country, vessel: "", derived: true });
    }
    return out.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  }, [signon, visas, yachtMap]);

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (!crew) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <UserCircle2 className="h-10 w-10 text-muted-foreground/40" />
        <p className="font-display text-base font-semibold">Crew member not found</p>
        <Button variant="outline" asChild><Link to={"/crew-immigration/crew" as any}><ArrowLeft className="mr-1.5 h-4 w-4" /> Back to crew list</Link></Button>
      </div>
    );
  }

  const headshot = crew.photo_url || passports.find((p) => p.headshot_url)?.headshot_url || "";
  const matchBadge = (m?: Visa["_match"]) =>
    m === "linked" ? null
      : m === "passport" ? <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9.5px] font-semibold text-amber-400" title="Matched to this crew member by passport number — please verify">≈ passport match</span>
      : <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9.5px] font-semibold text-amber-400" title="Matched to this crew member by name — please verify">≈ name match</span>;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
            <Link to={"/crew-immigration/crew" as any}><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">Polaris / Crew & Immigration / Profile</div>
            <h1 className="mt-0.5 font-display text-[1.25rem] font-semibold tracking-tight">{crew.full_name || `${crew.first_name} ${crew.last_name}`}</h1>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto px-6 py-5">
        <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[320px_1fr]">
          {/* Identity card */}
          <aside className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.4)]">
              <div className="flex flex-col items-center text-center">
                {headshot
                  ? <img src={headshot} alt="" className="h-24 w-24 rounded-full object-cover ring-2 ring-border" />
                  : <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/15 text-2xl font-bold text-primary">{crew.first_name[0]}{crew.last_name[0]}</div>}
                <h2 className="mt-3 font-display text-lg font-semibold">{crew.first_name} {crew.middle_name ? crew.middle_name + " " : ""}{crew.last_name}</h2>
                <div className="mt-1 text-sm text-muted-foreground">{crew.rank ?? "—"}{crew.department ? ` · ${crew.department}` : ""}</div>
                <span className={cn("mt-2.5 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold", STATUS_COLORS[crew.status] ?? "bg-muted text-muted-foreground")}>
                  {titleCase(crew.status)}
                </span>
              </div>
              <dl className="mt-5 space-y-2.5 text-sm">
                <Row label="Vessel" value={yachtName || "—"} />
                <Row label="Nationality" value={crew.nationality ?? "—"} />
                <Row label="Date of birth" value={fmt(crew.date_of_birth)} />
                <Row label="Gender" value={titleCase(crew.gender)} />
              </dl>
              <div className="mt-4 space-y-2 border-t border-border/60 pt-4">
                {crew.email && <a href={`mailto:${crew.email}`} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><Mail className="h-3.5 w-3.5" /> {crew.email}</a>}
                {crew.phone && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Phone className="h-3.5 w-3.5" /> {crew.phone}</div>}
              </div>
            </div>

            {/* Travel-doc summary */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.4)]">
              <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold"><BookUser className="h-4 w-4 text-primary" /> Travel Documents</h3>
              <dl className="space-y-2.5 text-sm">
                <Row label="Passport no." value={crew.passport_number ?? passports[0]?.passport_number ?? "—"} mono />
                <Row label="Passport expiry" value={fmt(crew.passport_expiry_date ?? passports[0]?.expiry_date)} warn={isSoon(crew.passport_expiry_date ?? passports[0]?.expiry_date ?? null)} />
                <Row label="Seaman's book" value={crew.seamans_book_number ?? "—"} mono />
                <Row label="Book expiry" value={fmt(crew.seamans_book_expiry)} warn={isSoon(crew.seamans_book_expiry)} />
              </dl>
            </div>
          </aside>

          {/* Detail sections */}
          <main className="space-y-5">
            {/* Passports */}
            <Section icon={Stamp} title="Passports" count={passports.length}>
              {passports.length === 0 ? <Empty>No passport records on file.</Empty> : (
                <div className="divide-y divide-border/50">
                  {passports.map((p) => (
                    <div key={p.id} className="flex items-center gap-4 py-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium">{p.passport_number ?? "—"}</span>
                          {p.is_primary && <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9.5px] font-semibold text-primary">Primary</span>}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {p.issuing_country ?? p.nationality ?? "—"} · Issued {fmt(p.issue_date)} · <span className={cn(isSoon(p.expiry_date) && "text-amber-400")}>Expires {fmt(p.expiry_date)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {p.document_url && <DocLink href={p.document_url} label="Scan" />}
                        {p.seamans_book_url && <DocLink href={p.seamans_book_url} label="Seaman's bk" />}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Visas */}
            <Section icon={Plane} title="Visa Applications" count={visas.length}>
              {visas.length === 0 ? <Empty>No visa applications matched to this crew member.</Empty> : (
                <div className="divide-y divide-border/50">
                  {visas.map((v) => (
                    <Link key={v.id} to={"/crew-immigration/visas/$id" as any} params={{ id: v.id } as any}
                      className="flex items-center gap-4 py-3 transition-colors hover:bg-accent/20 -mx-2 px-2 rounded-md">
                      <div className="flex-1">
                        <div className="flex items-center text-sm font-medium">
                          {v.destination_country ?? "—"}{v.visa_type ? ` · ${v.visa_type}` : ""}
                          {matchBadge(v._match)}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {v.jls_reference ? `${v.jls_reference} · ` : ""}{v.visa_number ? `No. ${v.visa_number} · ` : ""}
                          {v.visa_expiry ? <>Expires <span className={cn(isSoon(v.visa_expiry) && "text-amber-400")}>{fmt(v.visa_expiry)}</span></> : "No expiry recorded"}
                        </div>
                      </div>
                      <span className={cn("rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold", VISA_STATUS_COLORS[(v.status ?? "").toLowerCase()] ?? "bg-muted text-muted-foreground")}>
                        {titleCase(v.status)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </Section>

            {/* Sign-on / Sign-off */}
            <Section icon={ShipWheel} title="Sign-On / Sign-Off History" count={movements.length}
              note={movements.some((m) => m.derived) ? "Derived from matched visa applications — not confirmed movements." : undefined}>
              {movements.length === 0 ? <Empty>No sign-on / sign-off events recorded.</Empty> : (
                <div className="divide-y divide-border/50">
                  {movements.map((mv, i) => (
                    <div key={i} className="flex items-center gap-3 py-2.5">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", mv.type === "sign_on" ? "bg-emerald-400" : "bg-slate-400")} />
                      <span className="w-20 text-sm font-medium">{mv.type === "sign_on" ? "Sign-on" : "Sign-off"}</span>
                      <span className="text-sm">{fmt(mv.date)}</span>
                      <span className="ml-auto text-[11px] text-muted-foreground">{[mv.vessel, mv.place].filter(Boolean).join(" · ") || "—"}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Documents */}
            <Section icon={FileText} title="Documents" count={docs.length}>
              {docs.length === 0 ? <Empty>No documents uploaded.</Empty> : (
                <div className="divide-y divide-border/50">
                  {docs.map((d) => (
                    <div key={d.id} className="flex items-center gap-4 py-3">
                      <div className="flex-1">
                        <div className="text-sm font-medium">{d.title || d.file_name || titleCase(d.doc_type)}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {titleCase(d.doc_type)}{d.expiry_date ? <> · Expires <span className={cn(isSoon(d.expiry_date) && "text-amber-400")}>{fmt(d.expiry_date)}</span></> : ""}
                        </div>
                      </div>
                      {d.file_url && <DocLink href={d.file_url} label="Open" />}
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </main>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono, warn }: { label: string; value: string; mono?: boolean; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground/70">{label}</dt>
      <dd className={cn("text-right text-sm", mono && "font-mono", warn && "text-amber-400")}>{value}</dd>
    </div>
  );
}

function Section({ icon: Icon, title, count, note, children }: { icon: any; title: string; count?: number; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.4)]">
      <div className="mb-1 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="font-display text-sm font-semibold">{title}</h3>
        {count != null && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{count}</span>}
      </div>
      {note && <p className="mb-2 flex items-center gap-1.5 text-[11px] text-amber-400/90"><ShieldQuestion className="h-3 w-3" /> {note}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-3 text-sm text-muted-foreground">{children}</p>;
}

function DocLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer"
      className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/30 px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:text-foreground">
      <ExternalLink className="h-3 w-3" /> {label}
    </a>
  );
}
