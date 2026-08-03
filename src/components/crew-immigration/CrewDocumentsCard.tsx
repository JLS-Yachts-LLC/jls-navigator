/**
 * Documents card on a crew profile.
 *
 * Polaris is the source of truth: every row is a file held in Supabase storage,
 * either a passport image on crew_passports or a crew_documents row. On top of
 * that this card adds
 *   • folders (crew_document_folders) with drag-and-drop filing, so superseded
 *     paperwork can be tucked away the way staff do it in SharePoint,
 *   • automatic archiving — when a newer passport is added, the previous
 *     passport's files are filed into an "Old" folder on their own and the newest
 *     passport becomes the active one,
 *   • a per-file badge saying whether the file is Polaris-only or also in the
 *     crew member's SharePoint folder, with a button to send it there,
 *   • Refresh, for when files have just been uploaded elsewhere.
 *
 * Folder placement is keyed by a synthetic doc_key so passport files (which are
 * columns, not rows) can be filed alongside real document rows — see the
 * crew_document_folders migration.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FileText, FolderPlus, Folder, FolderOpen, ChevronRight, ExternalLink, Cloud, CloudOff,
  Loader2, Trash2, UploadCloud, ShieldQuestion, GripVertical, RefreshCw, Archive,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SignedAnchor } from "@/components/ui/signed-file";
import { useAuth } from "@/lib/auth";
import { listCrewSharePointFolder, createCrewSharePointFolder, pushCrewDocToSharePoint } from "@/lib/crew-doc-sharepoint.server";
import { getCrewSharePointFolderLink } from "@/lib/visa-sharepoint.server";

export type CrewDocRow = {
  id: string; doc_type: string | null; title: string | null; file_url: string | null;
  file_name: string | null; issue_date: string | null; expiry_date: string | null;
};

/** Folder superseded passports are filed into automatically. */
const ARCHIVE_FOLDER = "Old";

type Item = {
  /** Stable key used for folder placement + SharePoint mirror bookkeeping. */
  docKey: string;
  label: string;
  meta: string;
  stored: string;
  /** Name the file should carry in SharePoint (storage names are unreadable). */
  spName: string;
  /** Highlight the meta line — an expiry inside 90 days. */
  warn?: boolean;
  /** Belongs to a passport that has since been replaced. */
  superseded?: boolean;
  /** Name-matching hints for spotting the same file in SharePoint. */
  match?: { anyOf: string[][]; exclude?: string[]; rank: number };
};
type FolderRow = { id: string; name: string };
type SpItem = {
  id: string; name: string; folder: string | null; isFolder: boolean; webUrl: string | null;
  size?: number | null; lastModified?: string | null;
};

const fmt = (d: string | null) =>
  d ? new Date(d + (d.length === 10 ? "T00:00" : "")).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
const titleCase = (s: string | null | undefined) =>
  s ? s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—";
const isSoon = (d: string | null, days = 90) => !!d && new Date(d) < new Date(Date.now() + days * 86400000);
const nameKey = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const extOf = (url: string, fallback = "pdf") => {
  const clean = url.split("?")[0];
  const dot = clean.lastIndexOf(".");
  const ext = dot > 0 ? clean.slice(dot + 1) : "";
  return /^[a-z0-9]{2,5}$/i.test(ext) ? ext.toLowerCase() : fallback;
};
/** Storage names look like "data_1782975609871.jpg" — give SharePoint something readable. */
const spFileName = (crewName: string, label: string, stored: string) =>
  `${crewName} - ${label}`.replace(/[\\/:*?"<>|]/g, "-").trim() + "." + extOf(stored);

/**
 * SharePoint copies of these files were named by hand over the years
 * ("Jovan Cavor Passport.jpg", "… SDB.jpg", "… Photo.jpg"), so an exact filename
 * comparison would report everything as Polaris-only. Each passport slot instead
 * carries the words its SharePoint counterpart is likely to contain. Higher rank
 * wins first so "… Passport External Cover.jpg" is claimed by the cover slot
 * before the inside-pages slot can take it.
 */
const PASSPORT_SLOTS: { col: string; label: string; match: Item["match"] }[] = [
  { col: "cover_url", label: "Passport — front cover", match: { anyOf: [["cover"]], rank: 3 } },
  { col: "headshot_url", label: "Headshot photo", match: { anyOf: [["photo"], ["headshot"], ["picture"]], rank: 3 } },
  { col: "seamans_book_url", label: "Seaman's book", match: { anyOf: [["sdb"], ["srb"], ["seaman"]], rank: 3 } },
  { col: "crew_verification_letter_url", label: "Crew verification letter", match: { anyOf: [["verification"]], rank: 3 } },
  { col: "document_url", label: "Passport — inside pages", match: { anyOf: [["passport"]], exclude: ["cover"], rank: 1 } },
];

export function CrewDocumentsCard({
  crewId, crewName, vesselName, passports, docs, onReload,
}: {
  crewId: string;
  crewName: string;
  vesselName: string | null;
  passports: any[];
  docs: CrewDocRow[];
  /** Re-reads passports/documents from the parent profile page. */
  onReload?: () => Promise<void> | void;
}) {
  const { user } = useAuth();
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [placement, setPlacement] = useState<Record<string, string | null>>({});
  const [links, setLinks] = useState<Record<string, { webUrl: string | null }>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | "root" | null>(null);
  const [pushing, setPushing] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [sp, setSp] = useState<{ loading: boolean; exists: boolean; webUrl: string | null; items: SpItem[]; error?: string }>(
    { loading: true, exists: false, webUrl: null, items: [] },
  );
  const [openingFolder, setOpeningFolder] = useState(false);
  const newFolderRef = useRef<HTMLInputElement>(null);
  const archiveRan = useRef(false);

  // ── The unified file list ───────────────────────────────────────────────────
  // Passports are pre-sorted newest/primary first by the profile page, so the
  // first one is active and any others have been superseded.
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    passports.forEach((pp: any, pi: number) => {
      const superseded = pi > 0;
      const suffix = superseded ? ` (${pp.passport_number || "previous passport"})` : "";
      for (const slot of PASSPORT_SLOTS) {
        const stored = pp[slot.col];
        if (!stored) continue;
        // The verification letter replaces the seaman's book slot when present.
        if (slot.col === "seamans_book_url" && pp.crew_verification_letter_url) continue;
        out.push({
          docKey: `passport:${pp.id}:${slot.col}`,
          label: slot.label + suffix,
          meta: superseded
            ? `Previous passport${pp.expiry_date ? ` · Expired ${fmt(pp.expiry_date)}` : ""}`
            : "Passport file",
          stored,
          spName: spFileName(crewName, slot.label, stored),
          superseded,
          // Only the active passport competes for the hand-named SharePoint files.
          match: superseded ? undefined : slot.match,
        });
      }
    });
    for (const d of docs) {
      if (!d.file_url) continue;
      const label = d.title || d.file_name || titleCase(d.doc_type);
      out.push({
        docKey: `doc:${d.id}`,
        label,
        meta: `${titleCase(d.doc_type)}${d.expiry_date ? ` · Expires ${fmt(d.expiry_date)}` : ""}`,
        stored: d.file_url,
        spName: d.file_name || spFileName(crewName, label, d.file_url),
        warn: isSoon(d.expiry_date),
      });
    }
    return out;
  }, [passports, docs, crewName]);

  // ── Folders / placements / recorded SharePoint mirrors ──────────────────────
  const loadFiling = useCallback(async () => {
    const db = supabase as any;
    const [{ data: f }, { data: p }, { data: l }] = await Promise.all([
      db.from("crew_document_folders").select("id, name").eq("crew_member_id", crewId).order("name"),
      db.from("crew_document_placements").select("doc_key, folder_id").eq("crew_member_id", crewId),
      db.from("crew_document_sharepoint_links").select("doc_key, web_url").eq("crew_member_id", crewId),
    ]);
    const folderRows = (f ?? []) as FolderRow[];
    setFolders(folderRows);
    setPlacement(Object.fromEntries(((p ?? []) as any[]).map((r) => [r.doc_key, r.folder_id ?? null])));
    setLinks(Object.fromEntries(((l ?? []) as any[]).map((r) => [r.doc_key, { webUrl: r.web_url ?? null }])));
    return folderRows;
  }, [crewId]);

  useEffect(() => { void loadFiling(); }, [loadFiling]);

  // ── What SharePoint actually holds (read-only; failure is not fatal) ────────
  const loadSharePoint = useCallback(async () => {
    setSp((s) => ({ ...s, loading: true }));
    try {
      const res = await (listCrewSharePointFolder as any)({ data: { vesselName, crewName } });
      setSp({ loading: false, exists: !!res?.exists, webUrl: res?.webUrl ?? null, items: res?.items ?? [], error: res?.error });
    } catch (e: any) {
      setSp({ loading: false, exists: false, webUrl: null, items: [], error: e?.message ?? String(e) });
    }
  }, [vesselName, crewName]);

  useEffect(() => { void loadSharePoint(); }, [loadSharePoint]);

  /**
   * Which files exist in SharePoint. A recorded push is proof; otherwise fall
   * back to filename matching so files put there before Polaris (or by hand)
   * still register. Each SharePoint file is claimed by at most one document,
   * most specific slot first.
   */
  const { byDoc: mirrors, unclaimed: spOnly } = useMemo(() => {
    const out: Record<string, { inSp: boolean; webUrl: string | null }> = {};
    const files = sp.items.filter((i) => !i.isFolder);
    const claimed = new Set<string>();

    for (const it of items) {
      const recorded = links[it.docKey];
      if (recorded) out[it.docKey] = { inSp: true, webUrl: recorded.webUrl };
    }
    // Exact names first (crew_documents rows carry their real filename).
    const storedName = (it: Item) => decodeURIComponent(it.stored.split("?")[0].split("/").pop() ?? "");
    for (const it of items) {
      if (out[it.docKey]) continue;
      const wanted = [nameKey(it.spName), nameKey(storedName(it))];
      const hit = files.find((f) => !claimed.has(f.id) && wanted.includes(nameKey(f.name)));
      if (hit) { claimed.add(hit.id); out[it.docKey] = { inSp: true, webUrl: hit.webUrl }; }
    }
    // Then the hand-named passport files, most specific slot first.
    for (const it of [...items].filter((i) => i.match && !out[i.docKey]).sort((a, b) => (b.match!.rank - a.match!.rank))) {
      const m = it.match!;
      const hit = files.find((f) => {
        if (claimed.has(f.id)) return false;
        const k = nameKey(f.name);
        if (m.exclude?.some((x) => k.includes(x))) return false;
        return m.anyOf.some((tokens) => tokens.every((t) => k.includes(t)));
      });
      if (hit) { claimed.add(hit.id); out[it.docKey] = { inSp: true, webUrl: hit.webUrl }; }
    }
    for (const it of items) if (!out[it.docKey]) out[it.docKey] = { inSp: false, webUrl: null };
    // Anything left over lives only in SharePoint (filed by hand, or from before
    // Polaris) — surfaced below so the card shows the whole folder, not just the
    // documents Polaris happens to hold.
    const recordedUrls = new Set(Object.values(links).map((l) => l?.webUrl).filter(Boolean) as string[]);
    const unclaimed = files.filter((f) => !claimed.has(f.id) && !(f.webUrl && recordedUrls.has(f.webUrl)));
    return { byDoc: out, unclaimed };
  }, [items, links, sp.items]);

  // ── Auto-archive superseded passports into "Old" ────────────────────────────
  // A file with no placement row has never been filed by hand, so moving it is
  // safe; once someone drags it back out we store folder_id = null and leave it
  // alone from then on.
  const ensureFolder = useCallback(async (name: string, existing: FolderRow[]): Promise<FolderRow | null> => {
    const found = existing.find((f) => nameKey(f.name) === nameKey(name));
    if (found) return found;
    const db = supabase as any;
    const { data, error } = await db.from("crew_document_folders")
      .insert([{ crew_member_id: crewId, name, created_by: user?.id ?? null }])
      .select("id, name").single();
    if (error) {
      // Lost a race with another tab — re-read and use whatever is there.
      const { data: again } = await db.from("crew_document_folders").select("id, name").eq("crew_member_id", crewId);
      return ((again ?? []) as FolderRow[]).find((f) => nameKey(f.name) === nameKey(name)) ?? null;
    }
    setFolders((prev) => [...prev, data as FolderRow].sort((a, b) => a.name.localeCompare(b.name)));
    void (createCrewSharePointFolder as any)({ data: { vesselName, crewName, folderName: name } }).catch(() => {});
    return data as FolderRow;
  }, [crewId, user?.id, vesselName, crewName]);

  useEffect(() => {
    if (archiveRan.current || sp.loading) return;
    const stale = items.filter((i) => i.superseded && placement[i.docKey] === undefined);
    if (!stale.length) return;
    archiveRan.current = true;
    void (async () => {
      const folder = await ensureFolder(ARCHIVE_FOLDER, folders);
      if (!folder) { archiveRan.current = false; return; }
      const db = supabase as any;
      const rows = stale.map((i) => ({
        crew_member_id: crewId, doc_key: i.docKey, folder_id: folder.id, updated_at: new Date().toISOString(),
      }));
      const { error } = await db.from("crew_document_placements").upsert(rows, { onConflict: "crew_member_id,doc_key" });
      if (error) { archiveRan.current = false; return; }
      setPlacement((p) => ({ ...p, ...Object.fromEntries(stale.map((i) => [i.docKey, folder.id])) }));
      toast.info(`A newer passport is on file — ${stale.length} superseded file(s) moved into "${ARCHIVE_FOLDER}".`);
    })();
  }, [items, placement, folders, sp.loading, ensureFolder, crewId]);

  // ── Actions ────────────────────────────────────────────────────────────────
  async function refresh() {
    setRefreshing(true);
    try {
      await Promise.all([onReload?.(), loadFiling(), loadSharePoint()]);
      // Let the archive sweep run again against whatever has just arrived.
      archiveRan.current = false;
      toast.success("Documents refreshed");
    } finally {
      setRefreshing(false);
    }
  }

  async function createFolder() {
    const name = newName.trim();
    if (!name) return;
    const db = supabase as any;
    const { data, error } = await db.from("crew_document_folders")
      .insert([{ crew_member_id: crewId, name, created_by: user?.id ?? null }])
      .select("id, name").single();
    if (error) {
      toast.error(/duplicate|unique/i.test(error.message) ? `There is already a folder called "${name}".` : error.message);
      return;
    }
    setFolders((f) => [...f, data as FolderRow].sort((a, b) => a.name.localeCompare(b.name)));
    setOpen((o) => ({ ...o, [data.id]: true }));
    setNewName("");
    setCreating(false);
    toast.success(`Folder "${name}" created`);
    // Mirror the folder into SharePoint so the two trees stay aligned. Best-effort.
    const res = await (createCrewSharePointFolder as any)({ data: { vesselName, crewName, folderName: name } })
      .catch((e: any) => ({ ok: false, error: e?.message }));
    if (res?.ok) void loadSharePoint();
    else toast.warning(`Folder created in Polaris, but not in SharePoint: ${res?.error ?? "unknown error"}`);
  }

  async function deleteFolder(f: FolderRow) {
    const inside = items.filter((i) => placement[i.docKey] === f.id).length;
    if (!confirm(`Delete the folder "${f.name}"?${inside ? ` The ${inside} file(s) inside move back to the main list.` : ""}\n\nThe SharePoint folder is left untouched.`)) return;
    const db = supabase as any;
    const { error } = await db.from("crew_document_folders").delete().eq("id", f.id);
    if (error) { toast.error(error.message); return; }
    setFolders((prev) => prev.filter((x) => x.id !== f.id));
    setPlacement((prev) => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, v === f.id ? null : v])));
    toast.success(`Folder "${f.name}" deleted`);
  }

  async function moveTo(docKey: string, folderId: string | null) {
    if ((placement[docKey] ?? null) === folderId) return;
    const previous = placement[docKey] ?? null;
    setPlacement((p) => ({ ...p, [docKey]: folderId }));
    const db = supabase as any;
    const { error } = await db.from("crew_document_placements").upsert(
      { crew_member_id: crewId, doc_key: docKey, folder_id: folderId, updated_at: new Date().toISOString() },
      { onConflict: "crew_member_id,doc_key" },
    );
    if (error) {
      setPlacement((p) => ({ ...p, [docKey]: previous }));
      toast.error(error.message);
      return;
    }
    const name = folderId ? folders.find((f) => f.id === folderId)?.name : null;
    toast.success(name ? `Moved into "${name}"` : "Moved back to the main list");
  }

  async function sendToSharePoint(it: Item) {
    setPushing((p) => ({ ...p, [it.docKey]: true }));
    try {
      const folderId = placement[it.docKey] ?? null;
      const subfolder = folderId ? folders.find((f) => f.id === folderId)?.name ?? null : null;
      const res = await (pushCrewDocToSharePoint as any)({
        data: { crewId, docKey: it.docKey, vesselName, crewName, stored: it.stored, fileName: it.spName, subfolder },
      });
      if (!res?.ok) { toast.error(res?.error ?? "Upload to SharePoint failed"); return; }
      setLinks((l) => ({ ...l, [it.docKey]: { webUrl: res.webUrl ?? null } }));
      toast.success(`"${it.label}" uploaded to SharePoint`);
      void loadSharePoint();
    } catch (e: any) {
      toast.error(e?.message ?? "Upload to SharePoint failed");
    } finally {
      setPushing((p) => ({ ...p, [it.docKey]: false }));
    }
  }

  /** Open (creating if absent) the crew member's SharePoint folder in a new tab. */
  async function openSharePointFolder() {
    if (sp.webUrl) { window.open(sp.webUrl, "_blank", "noreferrer"); return; }
    setOpeningFolder(true);
    try {
      const res = await (getCrewSharePointFolderLink as any)({ data: { vesselName, crewName } });
      if (res?.webUrl) { setSp((s) => ({ ...s, webUrl: res.webUrl, exists: true })); window.open(res.webUrl, "_blank", "noreferrer"); }
      else toast.error("Could not resolve this crew member's SharePoint folder.");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not open the SharePoint folder");
    } finally {
      setOpeningFolder(false);
    }
  }

  // ── Rendering ──────────────────────────────────────────────────────────────
  const rootItems = items.filter((i) => !placement[i.docKey]);
  const inFolder = (fid: string) => items.filter((i) => placement[i.docKey] === fid);

  const dropProps = (target: string | "root") => ({
    onDragOver: (e: React.DragEvent) => { if (dragKey) { e.preventDefault(); setDropTarget(target); } },
    onDragLeave: () => setDropTarget((t) => (t === target ? null : t)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const key = e.dataTransfer.getData("text/polaris-doc") || dragKey;
      setDropTarget(null); setDragKey(null);
      if (key) void moveTo(key, target === "root" ? null : target);
    },
  });

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.4)]">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <FileText className="h-4 w-4 text-primary" />
        <h3 className="font-display text-sm font-semibold">Documents</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{items.length}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-7 gap-1.5 px-2 text-[11px]" onClick={() => void refresh()} disabled={refreshing}
            title="Re-read the files in Polaris and re-scan SharePoint">
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} /> Refresh
          </Button>
          <Button size="sm" variant="outline" className="h-7 gap-1.5 px-2 text-[11px]" onClick={() => { setCreating(true); setTimeout(() => newFolderRef.current?.focus(), 0); }}>
            <FolderPlus className="h-3.5 w-3.5" /> New folder
          </Button>
          <Button size="sm" variant="outline" className="h-7 gap-1.5 px-2 text-[11px]" onClick={() => void openSharePointFolder()} disabled={openingFolder}
            title="Open this crew member's folder in SharePoint">
            {openingFolder ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderOpen className="h-3.5 w-3.5" />} SharePoint folder
          </Button>
        </div>
      </div>

      {sp.error && (
        <p className="mb-2 flex items-center gap-1.5 text-[11px] text-amber-400/90">
          <ShieldQuestion className="h-3 w-3" /> SharePoint could not be reached — badges show Polaris only. {sp.error}
        </p>
      )}

      {creating && (
        <div className="mt-2 flex items-center gap-2">
          <Input ref={newFolderRef} value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder='Folder name (e.g. "Old")' className="h-8 text-[13px]"
            onKeyDown={(e) => { if (e.key === "Enter") void createFolder(); if (e.key === "Escape") { setCreating(false); setNewName(""); } }} />
          <Button size="sm" className="h-8" onClick={() => void createFolder()} disabled={!newName.trim()}>Create</Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => { setCreating(false); setNewName(""); }}>Cancel</Button>
        </div>
      )}

      <div className="mt-2 space-y-1">
        {/* Folders first, each a drop target */}
        {folders.map((f) => {
          const inside = inFolder(f.id);
          const isOpen = open[f.id];
          const isArchive = nameKey(f.name) === nameKey(ARCHIVE_FOLDER);
          return (
            <div key={f.id} className={cn("rounded-lg border transition", dropTarget === f.id ? "border-primary bg-primary/10" : "border-border/60 bg-muted/20")} {...dropProps(f.id)}>
              <div className="flex items-center gap-2 px-2.5 py-2">
                <button type="button" onClick={() => setOpen((o) => ({ ...o, [f.id]: !isOpen }))} className="flex flex-1 items-center gap-2 text-left">
                  <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition", isOpen && "rotate-90")} />
                  {isArchive ? <Archive className="h-4 w-4 text-muted-foreground" />
                    : isOpen ? <FolderOpen className="h-4 w-4 text-primary/80" /> : <Folder className="h-4 w-4 text-primary/80" />}
                  <span className="text-[13px] font-medium">{f.name}</span>
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9.5px] font-semibold text-muted-foreground">{inside.length}</span>
                  {isArchive && <span className="text-[10px] text-muted-foreground/70">superseded files</span>}
                </button>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400" title="Delete folder" onClick={() => void deleteFolder(f)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              {isOpen && (
                <div className="border-t border-border/50 px-2.5">
                  {inside.length === 0
                    ? <p className="py-2.5 text-[11.5px] text-muted-foreground">Empty — drag a document here to file it.</p>
                    : <div className="divide-y divide-border/40">
                        {inside.map((it) => <DocRow key={it.docKey} it={it} mirror={mirrors[it.docKey]} busy={!!pushing[it.docKey]}
                          onDragStart={setDragKey} onDragEnd={() => setDragKey(null)} onPush={() => void sendToSharePoint(it)} />)}
                      </div>}
                </div>
              )}
            </div>
          );
        })}

        {/* Unfiled documents — dropping here moves a file back out of a folder */}
        <div className={cn("rounded-lg border border-transparent transition", dropTarget === "root" && "border-primary bg-primary/10")} {...dropProps("root")}>
          {items.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">No documents uploaded.</p>
          ) : rootItems.length === 0 ? (
            <p className="py-3 text-[11.5px] text-muted-foreground">Every document is filed in a folder — drop one here to move it back out.</p>
          ) : (
            <div className="divide-y divide-border/50">
              {rootItems.map((it) => <DocRow key={it.docKey} it={it} mirror={mirrors[it.docKey]} busy={!!pushing[it.docKey]}
                onDragStart={setDragKey} onDragEnd={() => setDragKey(null)} onPush={() => void sendToSharePoint(it)} />)}
            </div>
          )}
        </div>
      </div>

      {/* Everything else that lives in the SharePoint folder — files staff filed by
          hand or that predate Polaris. Read-only: open them, or pull a copy into
          Polaris so it is held here too. */}
      {spOnly.length > 0 && (
        <div className="mt-3 rounded-lg border border-border/60 bg-muted/10">
          <div className="flex items-center gap-2 border-b border-border/50 px-2.5 py-2">
            <Cloud className="h-3.5 w-3.5 text-sky-400/80" />
            <span className="text-[12px] font-medium">Also in SharePoint</span>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9.5px] font-semibold text-muted-foreground">{spOnly.length}</span>
            <span className="text-[10.5px] text-muted-foreground/70">not held in Polaris</span>
          </div>
          <div className="divide-y divide-border/40">
            {spOnly.map((f) => (
              <div key={f.id} className="flex items-center gap-2.5 px-2.5 py-2">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px]">{f.name}</div>
                  <div className="text-[10.5px] text-muted-foreground/70">
                    {f.folder ? `${f.folder} · ` : ""}
                    {f.size != null ? `${Math.max(1, Math.round(f.size / 1024))} KB` : ""}
                    {f.lastModified ? ` · ${new Date(f.lastModified).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-400/90">SharePoint only</span>
                {f.webUrl && (
                  <a href={f.webUrl} target="_blank" rel="noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:border-primary/50">
                    <ExternalLink className="h-3 w-3" /> Open
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {sp.loading && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Checking SharePoint…
        </p>
      )}
    </section>
  );
}

function DocRow({
  it, mirror, busy, onDragStart, onDragEnd, onPush,
}: {
  it: Item;
  mirror?: { inSp: boolean; webUrl: string | null };
  busy: boolean;
  onDragStart: (key: string) => void;
  onDragEnd: () => void;
  onPush: () => void;
}) {
  const inSp = !!mirror?.inSp;
  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/polaris-doc", it.docKey); e.dataTransfer.effectAllowed = "move"; onDragStart(it.docKey); }}
      onDragEnd={onDragEnd}
      className="group flex cursor-grab items-center gap-3 py-3 active:cursor-grabbing"
    >
      <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30 group-hover:text-muted-foreground/70" />
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-sm font-medium", it.superseded && "text-muted-foreground")}>{it.label}</div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className={cn(it.warn && "text-amber-400")}>{it.meta}</span>
        </div>
      </div>

      {inSp ? (
        mirror?.webUrl ? (
          <a href={mirror.webUrl} target="_blank" rel="noreferrer" title="Also in SharePoint — open it there"
            className="inline-flex shrink-0 items-center gap-1 rounded bg-sky-500/15 px-1.5 py-0.5 text-[9.5px] font-semibold text-sky-400 transition hover:bg-sky-500/25">
            <Cloud className="h-3 w-3" /> SharePoint
          </a>
        ) : (
          <span title="Also in SharePoint" className="inline-flex shrink-0 items-center gap-1 rounded bg-sky-500/15 px-1.5 py-0.5 text-[9.5px] font-semibold text-sky-400">
            <Cloud className="h-3 w-3" /> SharePoint
          </span>
        )
      ) : (
        <span title="Held in Polaris only — not yet in SharePoint"
          className="inline-flex shrink-0 items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[9.5px] font-semibold text-muted-foreground">
          <CloudOff className="h-3 w-3" /> Polaris only
        </span>
      )}

      {!inSp && (
        <Button size="sm" variant="outline" className="h-6 shrink-0 gap-1 px-1.5 text-[10.5px]" onClick={onPush} disabled={busy}
          title="Upload this file to the crew member's SharePoint folder">
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <UploadCloud className="h-3 w-3" />} Send
        </Button>
      )}

      <DocLink stored={it.stored} />
    </div>
  );
}

function DocLink({ stored }: { stored: string | null | undefined }) {
  return (
    <SignedAnchor stored={stored}
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-muted/30 px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:text-foreground aria-disabled:opacity-50">
      <ExternalLink className="h-3 w-3" /> Open
    </SignedAnchor>
  );
}
