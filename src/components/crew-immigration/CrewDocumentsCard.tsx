/**
 * Documents card on a crew profile.
 *
 * Polaris is the source of truth: every row is a file held in Supabase storage,
 * either a passport image on crew_passports or a crew_documents row. On top of
 * that this card adds
 *   • folders (crew_document_folders) with drag-and-drop filing, so superseded
 *     paperwork can be tucked away the way staff do it in SharePoint ("_old"),
 *   • a per-file badge saying whether the file is Polaris-only or also mirrored
 *     into the crew member's SharePoint folder,
 *   • a per-file "Send to SharePoint" button, and a link straight to the crew
 *     member's SharePoint folder.
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
  Loader2, Trash2, UploadCloud, ShieldQuestion, GripVertical,
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
};
type FolderRow = { id: string; name: string };
type SpItem = { id: string; name: string; folder: string | null; isFolder: boolean; webUrl: string | null };

const fmt = (d: string | null) =>
  d ? new Date(d + (d.length === 10 ? "T00:00" : "")).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
const titleCase = (s: string | null | undefined) =>
  s ? s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—";
const isSoon = (d: string | null, days = 90) => !!d && new Date(d) < new Date(Date.now() + days * 86400000);

const extOf = (url: string, fallback = "pdf") => {
  const clean = url.split("?")[0];
  const dot = clean.lastIndexOf(".");
  const ext = dot > 0 ? clean.slice(dot + 1) : "";
  return /^[a-z0-9]{2,5}$/i.test(ext) ? ext.toLowerCase() : fallback;
};
/** Storage names look like "data_1782975609871.jpg" — give SharePoint something readable. */
const spFileName = (crewName: string, label: string, stored: string) =>
  `${crewName} - ${label}`.replace(/[\\/:*?"<>|]/g, "-").trim() + "." + extOf(stored);

export function CrewDocumentsCard({
  crewId, crewName, vesselName, passports, docs,
}: {
  crewId: string;
  crewName: string;
  vesselName: string | null;
  passports: any[];
  docs: CrewDocRow[];
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
  const [sp, setSp] = useState<{ loading: boolean; exists: boolean; webUrl: string | null; items: SpItem[]; error?: string }>(
    { loading: true, exists: false, webUrl: null, items: [] },
  );
  const [openingFolder, setOpeningFolder] = useState(false);
  const newFolderRef = useRef<HTMLInputElement>(null);

  // ── The unified file list ───────────────────────────────────────────────────
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const pp: any = passports[0] ?? {};
    const passportFiles: { col: string; label: string }[] = [
      { col: "document_url", label: "Passport — inside pages" },
      { col: "cover_url", label: "Passport — front cover" },
      { col: "headshot_url", label: "Headshot photo" },
      ...(pp.crew_verification_letter_url
        ? [{ col: "crew_verification_letter_url", label: "Crew verification letter" }]
        : [{ col: "seamans_book_url", label: "Seaman's book" }]),
    ];
    for (const f of passportFiles) {
      const stored = pp[f.col];
      if (!stored) continue;
      out.push({
        docKey: `passport:${pp.id}:${f.col}`,
        label: f.label,
        meta: "Passport file",
        stored,
        spName: spFileName(crewName, f.label, stored),
      });
    }
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
    setFolders((f ?? []) as FolderRow[]);
    setPlacement(Object.fromEntries(((p ?? []) as any[]).map((r) => [r.doc_key, r.folder_id ?? null])));
    setLinks(Object.fromEntries(((l ?? []) as any[]).map((r) => [r.doc_key, { webUrl: r.web_url ?? null }])));
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

  /** A file counts as mirrored when we recorded the push, or a listed SharePoint
   *  name matches (covers files put there before Polaris, or by hand). */
  const spByName = useMemo(() => {
    const m = new Map<string, SpItem>();
    for (const i of sp.items) if (!i.isFolder) m.set(i.name.toLowerCase(), i);
    return m;
  }, [sp.items]);

  const mirrorOf = (it: Item): { inSp: boolean; webUrl: string | null } => {
    const recorded = links[it.docKey];
    if (recorded) return { inSp: true, webUrl: recorded.webUrl };
    const hit = spByName.get(it.spName.toLowerCase())
      ?? spByName.get(decodeURIComponent(it.stored.split("?")[0].split("/").pop() ?? "").toLowerCase());
    if (hit) return { inSp: true, webUrl: hit.webUrl };
    return { inSp: false, webUrl: null };
  };

  // ── Actions ────────────────────────────────────────────────────────────────
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
            placeholder='Folder name (e.g. "_old")' className="h-8 text-[13px]"
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
          return (
            <div key={f.id} className={cn("rounded-lg border transition", dropTarget === f.id ? "border-primary bg-primary/10" : "border-border/60 bg-muted/20")} {...dropProps(f.id)}>
              <div className="flex items-center gap-2 px-2.5 py-2">
                <button type="button" onClick={() => setOpen((o) => ({ ...o, [f.id]: !isOpen }))} className="flex flex-1 items-center gap-2 text-left">
                  <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition", isOpen && "rotate-90")} />
                  {isOpen ? <FolderOpen className="h-4 w-4 text-primary/80" /> : <Folder className="h-4 w-4 text-primary/80" />}
                  <span className="text-[13px] font-medium">{f.name}</span>
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9.5px] font-semibold text-muted-foreground">{inside.length}</span>
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
                        {inside.map((it) => <DocRow key={it.docKey} it={it} mirror={mirrorOf(it)} busy={!!pushing[it.docKey]}
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
              {rootItems.map((it) => <DocRow key={it.docKey} it={it} mirror={mirrorOf(it)} busy={!!pushing[it.docKey]}
                onDragStart={setDragKey} onDragEnd={() => setDragKey(null)} onPush={() => void sendToSharePoint(it)} />)}
            </div>
          )}
        </div>
      </div>

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
  mirror: { inSp: boolean; webUrl: string | null };
  busy: boolean;
  onDragStart: (key: string) => void;
  onDragEnd: () => void;
  onPush: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/polaris-doc", it.docKey); e.dataTransfer.effectAllowed = "move"; onDragStart(it.docKey); }}
      onDragEnd={onDragEnd}
      className="group flex cursor-grab items-center gap-3 py-3 active:cursor-grabbing"
    >
      <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30 group-hover:text-muted-foreground/70" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{it.label}</div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className={cn(it.warn && "text-amber-400")}>{it.meta}</span>
        </div>
      </div>

      {mirror.inSp ? (
        mirror.webUrl ? (
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

      {!mirror.inSp && (
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
