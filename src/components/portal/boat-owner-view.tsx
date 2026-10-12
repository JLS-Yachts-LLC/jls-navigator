/**
 * Client portal — Orbit 2, the boat owner's view-only dashboard (client design,
 * 12 Oct 2026). Shown in the yacht portal's "Orbit 2" section for a login that
 * also owns managed boats, and as the small-boat portal's Boat dashboard.
 *
 *   left   the boat's photo, its details, and its papers (Builder's certificate …
 *          DMA checklist), each opening through /api/portal/boats/open
 *   right  Jobs · Inventory List · Expenses · Maintenance Schedule (History and
 *          Service Calendar) — read only: the owner can see everything and change
 *          nothing
 *   Request Job   a short form; on Submit the request lands on the boat's Jobs
 *                 board as a Pending job and the Orbit 2 admins are alerted
 *   Download Report   a printable report of all of the above (Save as PDF)
 *
 * All data comes from /api/portal/boats/detail, scoped server-side to the boats
 * on the login and stripped of the office's internal notes.
 */
import { useContext, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Loader2, Paperclip, Search, Ship, Wrench } from "lucide-react";
import { portalFetch } from "@/lib/portal/portal-fetch";
import { cn } from "@/lib/utils";
import { PreviewContext } from "@/components/portal/captain-portal";
import type { PortalBoat } from "@/components/portal/boat-portal";

type Job = {
  id: string; jobNo: string | null; kind: string; kindLabel: string; title: string; status: string;
  scheduledDate: string | null; updatedAt: string; assignedCrew: string[]; technician: string | null; requestedByOwner: boolean;
};
type FileRef = { id: string; fileName: string };
type OwnerDetail = {
  hidden: string[];
  compliance: Array<{ regime: "dma" | "fma" | "rya"; label: string; hasReport: boolean; lastInspection: string | null }>;
  documents: Array<{ id: string; category: string; categoryLabel: string; fileName: string }>;
  jobs: Job[];
  inventory: Array<{ id: string; item: string; qty: number | null; unit: string | null; condition: string | null; expiryDate: string | null; onBoard: boolean }>;
  expenses: Array<{ id: string; category: string; partType: string | null; date: string; cost: number; currency: string; details: string | null; jobRef: string | null; files: FileRef[] }>;
  services: Array<{ id: string; service: string; lastServiceDate: string | null; nextServiceDate: string | null; currentRunHours: number | null; nextServiceRunHours: number | null; files: FileRef[] }>;
};

type Panel = "jobs" | "inventory" | "expenses" | "maintenance";
const PANELS: { key: Panel; label: string }[] = [
  { key: "jobs", label: "Jobs" },
  { key: "inventory", label: "Inventory List" },
  { key: "expenses", label: "Expenses" },
  { key: "maintenance", label: "Maintenance Schedule" },
];

/** The boat's papers in the order of the client's design; the DMA checklist row is added after. */
const PAPERS: { label: string; categories: string[] }[] = [
  { label: "Builder's Certificate", categories: ["builders_certificate"] },
  { label: "Customs Clearance Certificate", categories: ["customs_clearance"] },
  { label: "Marine Insurance Policy", categories: ["marine_insurance"] },
  { label: "VHF Radio Licensing", categories: ["vhf_radio_licensing"] },
  { label: "Marine Vessel License", categories: ["marine_vessel_license"] },
  { label: "Berth Agreement", categories: ["berth_agreement"] },
  { label: "Liferaft Certificates", categories: ["liferaft_certificate"] },
  { label: "Fire Extinguishers", categories: ["fire_extinguisher_certificate"] },
  { label: "Other Documents", categories: ["other", "vessel_invoice"] },
];

const OWNER_JOB_CATEGORIES = ["Maintenance", "Repair", "Inventory", "Booked"] as const;

const ukDate = (d: string | null | undefined) =>
  d ? new Date(d.length === 10 ? `${d}T00:00:00Z` : d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—";
const money = (n: number, c: string) => `${c} ${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hrs = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-GB", { maximumFractionDigits: 1 }));
const daysTo = (d: string) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) / 86_400_000);
type Due = "overdue" | "soon" | "ok";
const dateDue = (d: string | null): Due => (!d ? "ok" : daysTo(d) < 0 ? "overdue" : daysTo(d) <= 30 ? "soon" : "ok");
const hoursDue = (cur: number | null, next: number | null): Due =>
  cur == null || next == null ? "ok" : cur >= next ? "overdue" : next - cur <= 25 ? "soon" : "ok";
const dueCls = (d: Due) => (d === "overdue" ? "font-semibold text-red-400" : d === "soon" ? "font-semibold text-amber-400" : "text-muted-foreground");

function jobStatus(j: Job): { label: string; cls: string } {
  if (j.status === "Complete") return { label: "Complete", cls: "bg-emerald-500/15 text-emerald-300" };
  if (j.status === "Ongoing") return { label: "Ongoing", cls: "bg-amber-500/15 text-amber-300" };
  if (j.requestedByOwner && j.assignedCrew.length === 0) return { label: "Requested", cls: "bg-violet-500/15 text-violet-300" };
  return { label: "Pending", cls: "bg-sky-500/15 text-sky-300" };
}
const totals = (rows: OwnerDetail["expenses"]) => {
  const by = new Map<string, number>();
  for (const r of rows) by.set(r.currency, (by.get(r.currency) ?? 0) + r.cost);
  return [...by].map(([c, n]) => money(n, c)).join(" · ") || "—";
};

/** Open a boat file through the portal's checked, logged, short-lived link. */
async function openBoatFile(boatId: string, params: Record<string, string>) {
  try {
    const res = await portalFetch(`/api/portal/boats/open?${new URLSearchParams({ boat: boatId, ...params })}`, { redirect: "follow" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error ?? "That document could not be opened.");
    }
    window.open(res.url, "_blank", "noreferrer");
  } catch (e) {
    alert(e instanceof Error ? e.message : "That document could not be opened.");
  }
}

function FileLink({ boatId, params, children }: { boatId: string; params: Record<string, string>; children: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" disabled={busy}
            onClick={async () => { setBusy(true); await openBoatFile(boatId, params); setBusy(false); }}
            className="inline-flex max-w-full items-center gap-1 truncate text-left text-sm text-primary hover:underline disabled:opacity-50">
      {busy ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <Paperclip className="h-3.5 w-3.5 shrink-0" />}
      <span className="truncate">{children}</span>
    </button>
  );
}

export function OwnerBoatView({ boats, displayName, position }: {
  boats: PortalBoat[];
  displayName: string;
  /** The person's role on the login, offered as the request's Position. */
  position?: string | null;
}) {
  const preview = useContext(PreviewContext);
  const [boatId, setBoatId] = useState<string | null>(boats[0]?.id ?? null);
  const boat = boats.find((b) => b.id === boatId) ?? boats[0] ?? null;
  const [detail, setDetail] = useState<OwnerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>("jobs");
  const [maint, setMaint] = useState<"history" | "calendar">("history");
  const [requesting, setRequesting] = useState(false);
  const [query, setQuery] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!boat) return;
    let alive = true;
    setDetail(null); setError(null);
    void (async () => {
      try {
        const res = await portalFetch(`/api/portal/boats/detail?boat=${encodeURIComponent(boat.id)}`);
        const body = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) setError(body?.error ?? "Could not load your boat.");
        else setDetail(body as OwnerDetail);
      } catch {
        if (alive) setError("Could not reach JLS Yachts — check your connection and try again.");
      }
    })();
    return () => { alive = false; };
  }, [boat?.id, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const hidden = useMemo(() => new Set(detail?.hidden ?? []), [detail]);
  const panels = PANELS.filter((p) => !hidden.has(p.key));
  useEffect(() => { if (panels.length && !panels.some((p) => p.key === panel)) setPanel(panels[0].key); }, [panels, panel]);

  if (!boat) return null;
  const s = boat.spec;

  return (
    <div className="space-y-4">
      {/* Title row — the boat, and a welcome for the owner. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Orbit 2 · Managed by JLS Yachts</div>
          <h1 className="truncate text-2xl font-bold text-primary">{boat.name}</h1>
        </div>
        <div className="text-base font-medium text-primary">Welcome {displayName}</div>
      </div>
      {boats.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {boats.map((b) => (
            <button key={b.id} onClick={() => { setBoatId(b.id); setRequesting(false); setQuery(""); }}
                    className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition",
                      b.id === boat.id ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
              <Ship className="h-3.5 w-3.5" /> {b.name}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
        {/* ── Left: photo, details, papers ── */}
        <aside className="space-y-4 self-start rounded-2xl border border-border bg-card/80 p-3">
          <div className="aspect-[4/3] overflow-hidden rounded-xl bg-background/60">
            {boat.photoUrl
              ? <img src={boat.photoUrl} alt={boat.name} className="h-full w-full object-cover" />
              : <div className="flex h-full items-center justify-center text-muted-foreground/40"><Ship className="h-12 w-12" /></div>}
          </div>
          <dl className="space-y-1.5 px-1 text-sm">
            {([
              ["Vessel Type", boat.boatType],
              ["Year of Build", s.yearOfBuild != null ? String(s.yearOfBuild) : null],
              ["Max Beam (m)", s.beamM != null ? String(s.beamM) : null],
              ["Max Length (m)", s.lengthM != null ? String(s.lengthM) : null],
            ] as const).map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-right font-medium">{value || "—"}</dd>
              </div>
            ))}
          </dl>
          {!hidden.has("documents") && (
            <div className="space-y-2 border-t border-border/60 px-1 pt-3">
              {PAPERS.map((p) => {
                const docs = (detail?.documents ?? []).filter((d) => p.categories.includes(d.category));
                return (
                  <div key={p.label}>
                    <div className="text-sm font-medium">{p.label}</div>
                    {docs.length === 0
                      ? <div className="text-sm text-muted-foreground/70">{detail ? "Not on file" : "…"}</div>
                      : docs.map((d) => <FileLink key={d.id} boatId={boat.id} params={{ type: "document", id: d.id }}>{d.fileName}</FileLink>)}
                  </div>
                );
              })}
              <div>
                <div className="text-sm font-medium">DMA Checklist</div>
                {(() => {
                  const dma = detail?.compliance.find((c) => c.regime === "dma");
                  const sheets = (detail?.documents ?? []).filter((d) => d.category === "dma_checklist");
                  if (!detail) return <div className="text-sm text-muted-foreground/70">…</div>;
                  if (!dma?.hasReport && sheets.length === 0) return <div className="text-sm text-muted-foreground/70">Not on file</div>;
                  return (
                    <>
                      {dma?.hasReport && (
                        <FileLink boatId={boat.id} params={{ type: "inspection", regime: "dma" }}>
                          Inspection report{dma.lastInspection ? ` · ${ukDate(dma.lastInspection)}` : ""}
                        </FileLink>
                      )}
                      {sheets.map((d) => <FileLink key={d.id} boatId={boat.id} params={{ type: "document", id: d.id }}>{d.fileName}</FileLink>)}
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </aside>

        {/* ── Right: the boat's records, view only ── */}
        <section className="min-w-0 rounded-2xl border border-border bg-card/80">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5">
            <div className="flex flex-wrap gap-1">
              {panels.map((p) => (
                <button key={p.key} onClick={() => { setPanel(p.key); setRequesting(false); setQuery(""); }}
                        className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold transition",
                          panel === p.key && !requesting ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {!preview && (
                <button onClick={() => setRequesting(true)}
                        className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold transition",
                          requesting ? "bg-primary text-primary-foreground" : "bg-primary/90 text-primary-foreground hover:bg-primary")}>
                  Request Job
                </button>
              )}
              <button onClick={() => detail && downloadReport(boat, detail, displayName)} disabled={!detail}
                      className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition hover:border-primary/50 disabled:opacity-50">
                <Download className="h-4 w-4" /> Download Report
              </button>
            </div>
          </div>

          {error ? (
            <div className="m-3 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-red-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </div>
          ) : requesting ? (
            <RequestJobForm boatId={boat.id} displayName={displayName} position={position ?? ""}
                            onCancel={() => setRequesting(false)}
                            onSent={() => { setRequesting(false); setPanel("jobs"); setReloadKey((k) => k + 1); }} />
          ) : !detail ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                {panel === "maintenance" ? (
                  <div className="flex gap-1">
                    {(["history", "calendar"] as const).map((m) => (
                      <button key={m} onClick={() => setMaint(m)}
                              className={cn("rounded-lg px-2.5 py-1 text-sm font-medium transition",
                                maint === m ? "text-primary underline underline-offset-4" : "text-muted-foreground hover:text-foreground")}>
                        {m === "history" ? "History" : "Service Calendar"}
                      </button>
                    ))}
                  </div>
                ) : panel === "expenses" ? (
                  <span className="text-sm text-muted-foreground">Total: <span className="font-semibold text-foreground">{totals(detail.expenses)}</span></span>
                ) : <span />}
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search"
                         className="h-9 w-44 rounded-lg border border-border bg-background/60 pl-8 pr-2 text-sm outline-none focus:border-primary/50" />
                </div>
              </div>
              <PanelTable boatId={boat.id} detail={detail} panel={panel} maint={maint} query={query.trim().toLowerCase()} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}

// ── The four record views ────────────────────────────────────────────────────

function Table({ head, children, empty }: { head: string[]; children: React.ReactNode[]; empty: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-y border-border/60 bg-background/30">
            {head.map((h) => <th key={h} className="whitespace-nowrap px-3 py-2 text-left font-semibold text-muted-foreground">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {children.length ? children : (
            <tr><td colSpan={head.length} className="px-4 py-10 text-center text-muted-foreground">{empty}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const match = (q: string, ...vals: (string | number | null | undefined)[]) =>
  !q || vals.some((v) => String(v ?? "").toLowerCase().includes(q));

function PanelTable({ boatId, detail, panel, maint, query: q }: {
  boatId: string; detail: OwnerDetail; panel: Panel; maint: "history" | "calendar"; query: string;
}) {
  const td = "px-3 py-2 align-top";
  const muted = cn(td, "text-muted-foreground");

  if (panel === "jobs" || (panel === "maintenance" && maint === "history")) {
    const rows = detail.jobs
      .filter((j) => panel === "jobs" || j.status === "Complete")
      .filter((j) => match(q, j.jobNo, j.kindLabel, j.title, j.technician, ...j.assignedCrew))
      .sort((a, b) => panel === "jobs" ? 0 : (b.scheduledDate ?? b.updatedAt).localeCompare(a.scheduledDate ?? a.updatedAt));
    return (
      <Table head={["Job No.", "Category", "Description", "Date", "Assigned Crew", "Technician", "Status"]}
             empty={panel === "jobs" ? "No jobs on the boat yet." : "No finished jobs yet — they appear here as soon as they're complete."}>
        {rows.map((j) => {
          const st = jobStatus(j);
          return (
            <tr key={j.id}>
              <td className={cn(td, "whitespace-nowrap font-semibold text-primary")}>{j.jobNo ?? "—"}</td>
              <td className={cn(td, "whitespace-nowrap")}>{j.kindLabel}</td>
              <td className={cn(td, "min-w-[12rem]")}>{j.title}</td>
              <td className={cn(muted, "whitespace-nowrap")}>{ukDate(j.scheduledDate ?? (j.status === "Complete" ? j.updatedAt : null))}</td>
              <td className={muted}>{j.assignedCrew.join(", ") || "—"}</td>
              <td className={muted}>{j.technician ?? "—"}</td>
              <td className={td}><span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-sm font-medium", st.cls)}>{st.label}</span></td>
            </tr>
          );
        })}
      </Table>
    );
  }

  if (panel === "inventory") {
    const rows = detail.inventory.filter((i) => match(q, i.item, i.condition, i.unit));
    return (
      <Table head={["Item", "Qty", "Unit", "Condition", "Expiry Date", "On Board"]} empty="Nothing on the inventory list yet.">
        {rows.map((i) => (
          <tr key={i.id}>
            <td className={cn(td, "font-medium")}>{i.item}</td>
            <td className={cn(muted, "tabular-nums")}>{i.qty ?? "—"}</td>
            <td className={muted}>{i.unit ?? "—"}</td>
            <td className={muted}>{i.condition ?? "—"}</td>
            <td className={cn(td, "whitespace-nowrap", dueCls(dateDue(i.expiryDate)))}>{i.expiryDate ? ukDate(i.expiryDate) : "N/A"}</td>
            <td className={muted}>{i.onBoard ? "Yes" : "No"}</td>
          </tr>
        ))}
      </Table>
    );
  }

  if (panel === "expenses") {
    const rows = detail.expenses.filter((e) => match(q, e.category, e.partType, e.details, e.jobRef, e.cost));
    return (
      <Table head={["Category", "Part Type", "Date", "Cost", "Details", "Document", "Job Ref"]} empty="No expenses logged on the boat yet.">
        {rows.map((e) => (
          <tr key={e.id}>
            <td className={cn(td, "whitespace-nowrap font-medium")}>{e.category}</td>
            <td className={muted}>{e.partType ?? "—"}</td>
            <td className={cn(muted, "whitespace-nowrap")}>{ukDate(e.date)}</td>
            <td className={cn(td, "whitespace-nowrap font-medium tabular-nums")}>{money(e.cost, e.currency)}</td>
            <td className={cn(muted, "min-w-[10rem]")}>{e.details ?? "—"}</td>
            <td className={td}>
              {e.files.length === 0 ? <span className="text-muted-foreground">—</span>
                : e.files.map((f) => <div key={f.id}><FileLink boatId={boatId} params={{ type: "expense_file", id: f.id }}>{f.fileName}</FileLink></div>)}
            </td>
            <td className={cn(muted, "whitespace-nowrap")}>{e.jobRef ?? "—"}</td>
          </tr>
        ))}
      </Table>
    );
  }

  // Service Calendar — services, plus inventory items with an expiry date. Most urgent first.
  type Row = { key: string; name: string; last: string | null; next: string | null; cur: number | null; nextH: number | null; files: FileRef[]; inv: boolean };
  const rank = (d: Due) => (d === "overdue" ? 0 : d === "soon" ? 1 : 2);
  const rows: Row[] = [
    ...detail.services.map((s) => ({ key: s.id, name: s.service, last: s.lastServiceDate, next: s.nextServiceDate, cur: s.currentRunHours, nextH: s.nextServiceRunHours, files: s.files, inv: false })),
    ...detail.inventory.filter((i) => i.expiryDate).map((i) => ({ key: `inv-${i.id}`, name: i.item, last: null, next: i.expiryDate, cur: null, nextH: null, files: [], inv: true })),
  ]
    .filter((r) => match(q, r.name))
    .sort((a, b) => Math.min(rank(dateDue(a.next)), rank(hoursDue(a.cur, a.nextH))) - Math.min(rank(dateDue(b.next)), rank(hoursDue(b.cur, b.nextH)))
      || (a.next ?? "9999").localeCompare(b.next ?? "9999"));
  return (
    <Table head={["Services", "Date of Service", "Next Service Date", "Current Run Hrs", "Next Serv Run Hrs", "Documents"]} empty="No services scheduled yet.">
      {rows.map((r) => (
        <tr key={r.key}>
          <td className={cn(td, "font-medium")}>
            {r.name}{r.inv && <span className="ml-1.5 rounded bg-background/60 px-1.5 py-0.5 text-sm font-normal text-muted-foreground">Inventory</span>}
          </td>
          <td className={cn(muted, "whitespace-nowrap")}>{ukDate(r.last)}</td>
          <td className={cn(td, "whitespace-nowrap", dueCls(dateDue(r.next)))}>{ukDate(r.next)}</td>
          <td className={cn(muted, "tabular-nums")}>{hrs(r.cur)}</td>
          <td className={cn(td, "tabular-nums", dueCls(hoursDue(r.cur, r.nextH)))}>{hrs(r.nextH)}</td>
          <td className={td}>
            {r.files.length === 0 ? <span className="text-muted-foreground">—</span>
              : r.files.map((f) => <div key={f.id}><FileLink boatId={boatId} params={{ type: "service_file", id: f.id }}>{f.fileName}</FileLink></div>)}
          </td>
        </tr>
      ))}
    </Table>
  );
}

// ── Request Job ──────────────────────────────────────────────────────────────

function RequestJobForm({ boatId, displayName, position, onCancel, onSent }: {
  boatId: string; displayName: string; position: string; onCancel: () => void; onSent: () => void;
}) {
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [remarks, setRemarks] = useState("");
  const [requestedBy, setRequestedBy] = useState(displayName);
  const [pos, setPos] = useState(position);
  const [image, setImage] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!category) { setError("Choose a category."); return; }
    if (!description.trim()) { setError("Describe what you need done."); return; }
    if (!requestedBy.trim()) { setError("Enter who is asking."); return; }
    if (image && (!image.type.startsWith("image/") || image.size > 10 * 1024 * 1024)) { setError("Attach a photo (JPG or PNG) under 10 MB."); return; }
    setBusy(true);
    try {
      const form = new FormData();
      form.set("boat", boatId);
      form.set("category", category);
      form.set("description", description.trim());
      form.set("remarks", remarks.trim());
      form.set("requestedBy", requestedBy.trim());
      form.set("position", pos.trim());
      if (image) form.set("image", image);
      const res = await portalFetch("/api/portal/boats/request-job", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Your request could not be sent — please try again.");
      setSent(body.jobNo ?? "your request");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your request could not be sent — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center px-6 py-12 text-center">
        <CheckCircle2 className="mb-3 h-8 w-8 text-emerald-400" />
        <p className="text-base font-semibold">Request sent</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Our team has it as {sent} and will schedule it shortly. You can follow it under Jobs.
        </p>
        <button onClick={onSent} className="mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Back to Jobs</button>
      </div>
    );
  }

  const input = "w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-base outline-none focus:border-primary/50";
  const row = "grid gap-1 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-start sm:gap-3";
  const label = "pt-2 text-sm font-medium text-muted-foreground";
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-2 text-base font-semibold"><Wrench className="h-4 w-4 text-primary" /> New Job Request</div>
      <div className={row}>
        <label className={label} htmlFor="rj-cat">Category</label>
        <select id="rj-cat" value={category} onChange={(e) => setCategory(e.target.value)} className={input}>
          <option value="">Choose…</option>
          {OWNER_JOB_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className={row}>
        <label className={label} htmlFor="rj-desc">Description</label>
        <input id="rj-desc" value={description} onChange={(e) => setDescription(e.target.value)} className={input} placeholder="What needs doing?" />
      </div>
      <div className={row}>
        <label className={label} htmlFor="rj-rem">Remarks</label>
        <textarea id="rj-rem" value={remarks} onChange={(e) => setRemarks(e.target.value)} className={cn(input, "min-h-[88px] resize-y")} />
      </div>
      <div className={row}>
        <label className={label} htmlFor="rj-by">Requested By</label>
        <input id="rj-by" value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} className={input} />
      </div>
      <div className={row}>
        <label className={label} htmlFor="rj-pos">Position</label>
        <input id="rj-pos" value={pos} onChange={(e) => setPos(e.target.value)} className={input} placeholder="e.g. Owner, Captain" />
      </div>
      <div className={row}>
        <label className={label} htmlFor="rj-img">Attach Image</label>
        <div>
          <input id="rj-img" type="file" accept="image/*" onChange={(e) => setImage(e.target.files?.[0] ?? null)}
                 className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary/15 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary" />
          {image && <div className="mt-1 text-sm text-muted-foreground">{image.name}</div>}
        </div>
      </div>
      {error && <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-sm text-red-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      <div className="flex gap-2 pt-2">
        <button onClick={onCancel} disabled={busy} className="rounded-lg bg-[#E05252] px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">Cancel</button>
        <button onClick={() => void submit()} disabled={busy}
                className="flex items-center gap-1.5 rounded-lg bg-[#3FA76A] px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Submit
        </button>
      </div>
    </div>
  );
}

// ── Download Report ──────────────────────────────────────────────────────────

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** A printable report of the boat — opens in a new tab with the print dialog (Save as PDF). */
function downloadReport(boat: PortalBoat, d: OwnerDetail, displayName: string) {
  const w = window.open("", "_blank");
  if (!w) { alert("Allow pop-ups for this site to download the report."); return; }
  const table = (title: string, head: string[], rows: string[][], foot = "") => `
    <h2>${esc(title)}</h2>
    ${rows.length ? `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>${foot}`
    : `<p class="none">Nothing recorded.</p>`}`;
  const s = boat.spec;
  const hidden = new Set(d.hidden);
  const jobRow = (j: Job) => [j.jobNo ?? "—", j.kindLabel, j.title, ukDate(j.scheduledDate ?? (j.status === "Complete" ? j.updatedAt : null)), j.assignedCrew.join(", ") || "—", j.technician ?? "—", jobStatus(j).label];
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${esc(boat.name)} — report</title>
<style>
  body{font-family:Inter,Arial,sans-serif;color:#0f172a;margin:32px;font-size:14px}
  h1{font-size:26px;margin:0} h2{font-size:18px;margin:26px 0 8px;border-bottom:2px solid #1B2A4A;padding-bottom:4px}
  .sub{color:#475569;margin:4px 0 16px} table{width:100%;border-collapse:collapse}
  th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top} th{background:#f1f5f9;font-size:14px}
  .spec td{border:0;padding:3px 12px 3px 0} .none{color:#64748b} .total{text-align:right;font-weight:700;margin-top:6px}
  @media print{body{margin:12mm} h2{break-after:avoid} tr{break-inside:avoid}}
</style></head><body>
  <h1>${esc(boat.name)}</h1>
  <div class="sub">Boat report · prepared for ${esc(displayName)} · ${esc(ukDate(new Date().toISOString().slice(0, 10)))} · Managed by JLS Yachts</div>
  <table class="spec"><tbody>
    <tr><td>Vessel type</td><td><b>${esc(boat.boatType ?? "—")}</b></td><td>Year of build</td><td><b>${esc(s.yearOfBuild ?? "—")}</b></td></tr>
    <tr><td>Max beam (m)</td><td><b>${esc(s.beamM ?? "—")}</b></td><td>Max length (m)</td><td><b>${esc(s.lengthM ?? "—")}</b></td></tr>
  </tbody></table>
  ${hidden.has("jobs") ? "" : table("Open jobs", ["Job No.", "Category", "Description", "Date", "Assigned Crew", "Technician", "Status"], d.jobs.filter((j) => j.status !== "Complete").map(jobRow))}
  ${hidden.has("maintenance") ? "" : table("Maintenance history", ["Job No.", "Category", "Description", "Date", "Assigned Crew", "Technician", "Status"], d.jobs.filter((j) => j.status === "Complete").map(jobRow))}
  ${hidden.has("maintenance") ? "" : table("Service calendar", ["Service", "Date of service", "Next service date", "Current run hrs", "Next serv run hrs"],
    [...d.services.map((x) => [x.service, ukDate(x.lastServiceDate), ukDate(x.nextServiceDate), hrs(x.currentRunHours), hrs(x.nextServiceRunHours)]),
     ...d.inventory.filter((i) => i.expiryDate).map((i) => [`${i.item} (inventory)`, "—", ukDate(i.expiryDate), "—", "—"])])}
  ${hidden.has("expenses") ? "" : table("Expenses", ["Category", "Part type", "Date", "Cost", "Details", "Job ref"],
    d.expenses.map((e) => [e.category, e.partType ?? "—", ukDate(e.date), money(e.cost, e.currency), e.details ?? "—", e.jobRef ?? "—"]),
    `<div class="total">Total: ${esc(totals(d.expenses))}</div>`)}
  ${hidden.has("inventory") ? "" : table("Inventory list", ["Item", "Qty", "Unit", "Condition", "Expiry date", "On board"],
    d.inventory.map((i) => [i.item, String(i.qty ?? "—"), i.unit ?? "—", i.condition ?? "—", i.expiryDate ? ukDate(i.expiryDate) : "N/A", i.onBoard ? "Yes" : "No"]))}
  <script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
</body></html>`;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

