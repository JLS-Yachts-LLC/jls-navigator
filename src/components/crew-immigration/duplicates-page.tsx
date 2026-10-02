/**
 * Duplicate Crew & Folders — find the same person recorded twice.
 *
 * Two independent checks, because duplicates arise in both places:
 *   • Crew records — fuzzy-matched within the same vessel (accents, reversed
 *     first/last names, an extra middle name, trailing notes).
 *   • SharePoint folders — near-duplicate crew folders under
 *     Yacht/{vessel}/Crew Documents, which split a person's documents in two.
 *
 * Folder merges MOVE the files into the folder being kept, so nothing is copied
 * or lost, and the emptied folder is removed only once its contents are gone.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Users, FolderTree, Loader2, ExternalLink, Merge, RefreshCw, CheckCircle2, AlertTriangle, IdCard, Download } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { nameSimilarity, groupSimilar } from "@/lib/crew-name-match";
import { scanDuplicateCrewFolders, mergeCrewFolders, type DupGroup } from "@/lib/crew-duplicates.server";

type Crew = { id: string; first_name: string | null; middle_name: string | null; last_name: string | null; full_name: string | null; rank: string | null; yacht_id: string | null; status: string | null; passport_number: string | null; date_of_birth: string | null; created_at: string | null };

/** What merging one record into another would move — shown before it happens. */
type MergePreview = { visas: number; passports: number; documents: number; events: number };
type Yacht = { id: string; vessel_name: string };

const crewName = (c: Crew) =>
  (c.full_name?.trim() || [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(" ").trim() || "Unnamed");

export function CrewDuplicatesPage() {
  const [crew, setCrew] = useState<Crew[]>([]);
  const [yachts, setYachts] = useState<Yacht[]>([]);
  const [loading, setLoading] = useState(true);
  const [vessel, setVessel] = useState("all");
  const [tab, setTab] = useState<"records" | "folders" | "missing">("records");

  const [folderGroups, setFolderGroups] = useState<DupGroup[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [merging, setMerging] = useState<string | null>(null);
  const [confirmMerge, setConfirmMerge] = useState<{ group: DupGroup; keep: DupGroup["folders"][0]; drop: DupGroup["folders"][0] } | null>(null);
  // Merging crew RECORDS: which pair, what it would move, and whether it is running.
  const [confirmCrew, setConfirmCrew] = useState<{ keep: Crew; drop: Crew } | null>(null);
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [crewMerging, setCrewMerging] = useState(false);

  useEffect(() => { void load(); }, []);
  async function load() {
    setLoading(true);
    const [c, y] = await Promise.all([
      fetchAllRows(() => (supabase as any).from("crew_members")
        .select("id, first_name, middle_name, last_name, full_name, rank, yacht_id, status, passport_number, date_of_birth, created_at").order("last_name")),
      fetchAllRows(() => (supabase as any).from("yachts").select("id, vessel_name").order("vessel_name")),
    ]);
    setCrew((c.data ?? []) as Crew[]);
    setYachts((y.data ?? []) as Yacht[]);
    setLoading(false);
  }

  const yachtName = (id: string | null) => yachts.find((y) => y.id === id)?.vessel_name ?? "Unassigned";

  /** Duplicate crew records, grouped WITHIN each vessel — the same name on two
   *  different yachts is usually two different people (or a genuine transfer). */
  const recordGroups = useMemo(() => {
    const byYacht = new Map<string, Crew[]>();
    for (const c of crew) {
      if (vessel !== "all" && c.yacht_id !== vessel) continue;
      const k = c.yacht_id ?? "unassigned";
      (byYacht.get(k) ?? byYacht.set(k, []).get(k)!).push(c);
    }
    const out: { yacht: string; members: Crew[] }[] = [];
    for (const [yid, members] of byYacht) {
      for (const g of groupSimilar(members, crewName)) {
        out.push({ yacht: yid === "unassigned" ? "Unassigned" : yachtName(yid), members: g });
      }
    }
    return out;
  }, [crew, vessel, yachts]);

  async function runFolderScan() {
    setScanning(true);
    try {
      const vesselName = vessel === "all" ? null : yachtName(vessel);
      const res = await (scanDuplicateCrewFolders as any)({ data: { vesselName } });
      if (res.error) { toast.error(res.error); setFolderGroups([]); return; }
      setFolderGroups(res.groups as DupGroup[]);
      toast.success(
        res.groups.length
          ? `${res.groups.length} possible duplicate folder${res.groups.length !== 1 ? "s" : ""} across ${res.vesselsScanned} vessel${res.vesselsScanned !== 1 ? "s" : ""}`
          : `No duplicate folders found across ${res.vesselsScanned} vessel${res.vesselsScanned !== 1 ? "s" : ""}`,
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Scan failed");
    } finally { setScanning(false); }
  }

  /**
   * Crew with no passport number and/or no date of birth.
   *
   * These are what let duplicates happen: without a passport number the only way
   * to recognise someone is their name and date of birth, which a transliteration
   * or a mistyped date defeats. 31 of the 36 duplicate pairs found in September
   * 2026 had no passport number on one side. Active crew first — they are the
   * ones a visa is about to be raised for.
   */
  const missingRows = useMemo(() => {
    const rank = (c: Crew) =>
      (!c.passport_number?.trim() && !c.date_of_birth ? 0 : !c.passport_number?.trim() ? 1 : 2);
    return crew
      .filter((c) => !c.passport_number?.trim() || !c.date_of_birth)
      .filter((c) => vessel === "all" || (c.yacht_id ?? "unassigned") === vessel)
      .sort((a, b) => {
        const act = (c: Crew) => ((c.status ?? "").toLowerCase() === "active" ? 0 : 1);
        return act(a) - act(b) || rank(a) - rank(b)
          || yachtName(a.yacht_id).localeCompare(yachtName(b.yacht_id))
          || crewName(a).localeCompare(crewName(b));
      });
  }, [crew, vessel, yachts]);

  /** The list as a spreadsheet, so the gaps can be worked through offline. */
  function exportMissing() {
    const head = ["Crew member", "Vessel", "Rank", "Status", "Missing"];
    const rows = missingRows.map((c) => [
      crewName(c), yachtName(c.yacht_id), c.rank ?? "", c.status ?? "",
      [!c.passport_number?.trim() ? "Passport number" : null, !c.date_of_birth ? "Date of birth" : null]
        .filter(Boolean).join(" + "),
    ]);
    const csv = [head, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `crew-missing-details-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  /**
   * Count what a merge would move, so the confirmation names real numbers rather
   * than asking someone to agree to something unspecified. Read-only.
   */
  async function openCrewMerge(keep: Crew, drop: Crew) {
    setConfirmCrew({ keep, drop });
    setPreview(null);
    const db = supabase as any;
    const [v, p, d, e] = await Promise.all([
      db.from("visa_applications").select("id", { count: "exact", head: true }).eq("crew_member_id", drop.id),
      db.from("crew_passports").select("id", { count: "exact", head: true }).eq("crew_id", drop.id),
      db.from("crew_documents").select("id", { count: "exact", head: true }).eq("crew_member_id", drop.id),
      db.from("crew_signon_events").select("id", { count: "exact", head: true }).eq("crew_member_id", drop.id),
    ]);
    setPreview({
      visas: v.count ?? 0, passports: p.count ?? 0,
      documents: d.count ?? 0, events: e.count ?? 0,
    });
  }

  /** One RPC, one transaction — everything moves or nothing does. */
  async function doCrewMerge() {
    if (!confirmCrew) return;
    const { keep, drop } = confirmCrew;
    setCrewMerging(true);
    try {
      const { data, error } = await (supabase as any)
        .rpc("merge_crew_members", { p_keep: keep.id, p_drop: drop.id });
      if (error) throw error;
      const m = (data ?? {}) as Record<string, number>;
      const moved = [
        m.visa_applications ? `${m.visa_applications} visa application(s)` : null,
        m.passports ? `${m.passports} passport(s)` : null,
        m.documents ? `${m.documents} document(s)` : null,
        m.sign_on_off_events ? `${m.sign_on_off_events} sign-on/off event(s)` : null,
      ].filter(Boolean);
      toast.success(
        `Merged into ${crewName(keep)}`,
        moved.length ? { description: `Moved ${moved.join(", ")}.` } : undefined,
      );
      setConfirmCrew(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Merge failed");
    } finally {
      setCrewMerging(false);
    }
  }

  async function doMerge() {
    if (!confirmMerge) return;
    const { keep, drop } = confirmMerge;
    setMerging(drop.id);
    try {
      const res = await (mergeCrewFolders as any)({ data: { intoFolderId: keep.id, fromFolderId: drop.id } });
      if (res.error) { toast.error(res.error); return; }
      const parts = [`${res.moved} item${res.moved !== 1 ? "s" : ""} moved into “${keep.name}”`];
      if (res.removedFolder) parts.push("empty folder removed");
      if (res.skipped?.length) parts.push(`${res.skipped.length} could not be moved`);
      toast.success(parts.join(" · "));
      if (res.skipped?.length) toast.error(`Left behind: ${res.skipped.slice(0, 3).join(", ")}`);
      setConfirmMerge(null);
      await runFolderScan();
    } catch (e: any) {
      toast.error(e?.message ?? "Merge failed");
    } finally { setMerging(null); }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">Polaris / Crew &amp; Immigration</div>
        <h1 className="mt-0.5 font-display text-[1.25rem] font-semibold tracking-tight">Duplicate Crew &amp; Folders</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Finds the same person recorded twice — names differing by accent, word order, a middle name or a trailing note — and merges split document folders.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2.5 border-b border-border/40 bg-muted/10 px-6 py-2.5">
        {(["records", "folders", "missing"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
              tab === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent")}>
            {t === "records" ? <Users className="h-3.5 w-3.5" />
              : t === "folders" ? <FolderTree className="h-3.5 w-3.5" />
              : <IdCard className="h-3.5 w-3.5" />}
            {t === "records" ? `Crew records${recordGroups.length ? ` (${recordGroups.length})` : ""}`
              : t === "folders" ? `SharePoint folders${folderGroups?.length ? ` (${folderGroups.length})` : ""}`
              : `Missing details${missingRows.length ? ` (${missingRows.length})` : ""}`}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Select value={vessel} onValueChange={(v) => { setVessel(v); setFolderGroups(null); }}>
            <SelectTrigger className="h-8 w-52 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All vessels</SelectItem>
              {yachts.map((y) => <SelectItem key={y.id} value={y.id}>{y.vessel_name}</SelectItem>)}
            </SelectContent>
          </Select>
          {tab === "folders" && (
            <Button size="sm" onClick={runFolderScan} disabled={scanning} className="h-8 gap-1.5 text-xs">
              {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {folderGroups ? "Re-scan" : "Scan SharePoint"}
            </Button>
          )}
          {tab === "missing" && missingRows.length > 0 && (
            <Button size="sm" variant="outline" onClick={exportMissing} className="h-8 gap-1.5 text-xs">
              <Download className="h-3.5 w-3.5" /> Export list
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : tab === "missing" ? (
          missingRows.length === 0 ? (
            <Empty icon={<CheckCircle2 className="h-9 w-9 text-emerald-500/60" />}
              title="Every crew member has a passport number and a date of birth"
              body="Nothing to chase — this is what keeps the same person from being recorded twice." />
          ) : (
            <div className="space-y-3">
              <p className="text-[12.5px] text-muted-foreground">
                A passport number is the only thing unique to a person. Without one, the same crew member arriving
                from a different source is recognised only by name and date of birth, and a different spelling or a
                mistyped date creates a second profile. Filling these in — in the SharePoint Visa list — is what
                stops that happening.
              </p>
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/30">
                      {["Crew Member", "Vessel", "Rank", "Status", "Missing"].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                      <th className="w-16" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {missingRows.slice(0, 400).map((c) => {
                      const noPp = !c.passport_number?.trim();
                      const noDob = !c.date_of_birth;
                      return (
                        <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-2.5 font-medium">{crewName(c)}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{yachtName(c.yacht_id)}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{c.rank ?? "—"}</td>
                          <td className="px-4 py-2.5">
                            <span className={cn("rounded-full px-2 py-0.5 text-[10.5px]",
                              (c.status ?? "").toLowerCase() === "active"
                                ? "bg-emerald-500/15 text-emerald-400" : "bg-muted/60 text-muted-foreground")}>
                              {c.status ?? "—"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="inline-flex flex-wrap gap-1">
                              {noPp && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10.5px] font-medium text-amber-500">Passport number</span>}
                              {noDob && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10.5px] font-medium text-amber-500">Date of birth</span>}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <a href={`/crew-immigration/crew/${c.id}`} target="_blank" rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                              <ExternalLink className="h-3 w-3" /> Open
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {missingRows.length > 400 && (
                <p className="text-[11px] text-muted-foreground/70">
                  Showing the first 400 of {missingRows.length}. Use Export list for the full set.
                </p>
              )}
            </div>
          )
        ) : tab === "records" ? (
          recordGroups.length === 0 ? (
            <Empty icon={<CheckCircle2 className="h-9 w-9 text-emerald-500/60" />}
              title="No duplicate crew records"
              body="No two crew members on the same vessel have similar enough names to look like duplicates." />
          ) : (
            <div className="space-y-3">
              {recordGroups.map((g, i) => (
                <div key={i} className="rounded-xl border border-border bg-card/60 p-4">
                  <div className="mb-2.5 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    <span className="text-sm font-semibold">{g.yacht}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {g.members.length} similar records ·{" "}
                      {Math.round(nameSimilarity(crewName(g.members[0]), crewName(g.members[1])) * 100)}% match
                    </span>
                  </div>
                  <div className="divide-y divide-border/40">
                    {g.members.map((m) => (
                      <div key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[12.5px]">
                        <span className="font-medium">{crewName(m)}</span>
                        {m.date_of_birth && <span className="text-muted-foreground">{m.date_of_birth}</span>}
                        {m.rank && <span className="text-muted-foreground">{m.rank}</span>}
                        {m.passport_number && <span className="font-mono text-[11px] text-muted-foreground/70">{m.passport_number}</span>}
                        {m.status && <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">{m.status}</span>}
                        <span className="ml-auto flex items-center gap-2">
                          <a href={`/crew-immigration/crew/${m.id}`} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                            <ExternalLink className="h-3 w-3" /> Open
                          </a>
                          {/* "Keep this one" merges every OTHER record in the group
                              into it — one at a time, so each is confirmed. */}
                          {g.members.length === 2 && (
                            <button
                              onClick={() => openCrewMerge(m, g.members.find((x) => x.id !== m.id)!)}
                              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:border-primary/50 hover:text-primary">
                              <Merge className="h-3 w-3" /> Keep this one
                            </button>
                          )}
                          {g.members.length > 2 && (
                            <span className="text-[11px] text-muted-foreground/60">Merge two at a time</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground/70">
                    “Keep this one” moves the other record's visas, passports, documents and history onto it, then removes the empty duplicate.
                    {" "}Check the passport numbers first — if they genuinely differ these are probably two different people, and merging them cannot be undone.
                  </p>
                </div>
              ))}
            </div>
          )
        ) : folderGroups === null ? (
          <Empty icon={<FolderTree className="h-9 w-9 text-muted-foreground/40" />}
            title="Scan SharePoint for duplicate folders"
            body="Checks each vessel's Crew Documents folder for near-duplicate crew folders. Nothing is changed until you choose to merge." />
        ) : folderGroups.length === 0 ? (
          <Empty icon={<CheckCircle2 className="h-9 w-9 text-emerald-500/60" />}
            title="No duplicate folders"
            body="Every crew folder in the scanned vessels looks unique." />
        ) : (
          <div className="space-y-3">
            {folderGroups.map((g, i) => {
              const keep = g.folders[0];
              return (
                <div key={`${g.vessel}-${i}`} className="rounded-xl border border-border bg-card/60 p-4">
                  <div className="mb-2.5 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    <span className="text-sm font-semibold">{g.vessel}</span>
                    <span className="text-[11px] text-muted-foreground">{g.folders.length} similar folders</span>
                  </div>
                  <div className="divide-y divide-border/40">
                    {g.folders.map((f, idx) => (
                      <div key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[12.5px]">
                        <span className="font-medium">{f.name}</span>
                        <span className="text-muted-foreground">{f.childCount} item{f.childCount !== 1 ? "s" : ""}</span>
                        {idx === 0 && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">keep</span>}
                        {f.webUrl && (
                          <a href={f.webUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                            <ExternalLink className="h-3 w-3" /> Open
                          </a>
                        )}
                        {idx > 0 && (
                          <Button size="sm" variant="outline" disabled={merging === f.id}
                            onClick={() => setConfirmMerge({ group: g, keep, drop: f })}
                            className="ml-auto h-7 gap-1.5 text-[11px]">
                            {merging === f.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Merge className="h-3 w-3" />}
                            Merge into “{keep.name}”
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Merging crew RECORDS. Names what will move before asking, and says
          plainly that it cannot be undone — this destroys one profile. */}
      <AlertDialog open={!!confirmCrew} onOpenChange={(o) => { if (!o && !crewMerging) setConfirmCrew(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Merge these two crew records?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2.5">
                <p>
                  Everything attached to <strong>{confirmCrew ? crewName(confirmCrew.drop) : ""}</strong>
                  {confirmCrew?.drop.date_of_birth ? ` (${confirmCrew.drop.date_of_birth})` : ""} will be moved onto{" "}
                  <strong>{confirmCrew ? crewName(confirmCrew.keep) : ""}</strong>
                  {confirmCrew?.keep.date_of_birth ? ` (${confirmCrew.keep.date_of_birth})` : ""}, and the emptied
                  record removed.
                </p>
                {preview === null ? (
                  <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking what would move…</p>
                ) : (
                  <ul className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[12px]">
                    <li>{preview.visas} visa application{preview.visas === 1 ? "" : "s"}</li>
                    <li>{preview.passports} passport{preview.passports === 1 ? "" : "s"}</li>
                    <li>{preview.documents} document{preview.documents === 1 ? "" : "s"}</li>
                    <li>{preview.events} sign-on/off event{preview.events === 1 ? "" : "s"}</li>
                  </ul>
                )}
                <p className="text-amber-500">
                  This cannot be undone. If the two passport numbers genuinely differ, these are probably different
                  people — close this and check before merging.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={crewMerging}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void doCrewMerge(); }}
              disabled={crewMerging || preview === null} className="gap-1.5">
              {crewMerging && <Loader2 className="h-4 w-4 animate-spin" />} Merge records
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmMerge} onOpenChange={(o) => { if (!o) setConfirmMerge(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Merge these folders?</AlertDialogTitle>
            <AlertDialogDescription>
              Every item in <strong>“{confirmMerge?.drop.name}”</strong> ({confirmMerge?.drop.childCount ?? 0}) will be
              moved into <strong>“{confirmMerge?.keep.name}”</strong> ({confirmMerge?.keep.childCount ?? 0}), and the
              emptied folder removed. Files are moved, not copied — nothing is deleted. A name clash is kept as
              “name (merged)” rather than overwriting.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!merging}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void doMerge(); }} disabled={!!merging} className="gap-1.5">
              {merging && <Loader2 className="h-4 w-4 animate-spin" />} Merge folders
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Empty({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border text-center">
      {icon}
      <p className="mt-3 font-display font-semibold">{title}</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

export default CrewDuplicatesPage;
