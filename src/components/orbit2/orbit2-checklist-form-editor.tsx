/**
 * Add a checklist form by dropping in its PDF — or correct one already added.
 *
 * Polaris reads the PDF (checklist-detect) and proposes the items, where each
 * item's tick goes, the section headings and the header fields. This screen
 * shows the form's pages with every proposed tick marker and header box drawn
 * on them, next to the list it built. The admin fixes what the reader got
 * wrong — edit the wording, turn a row into a heading, merge a wrapped line,
 * add a row it missed, or select a row and click on the page where its tick
 * belongs — then saves. "Test fill" downloads the form with every box ticked
 * and every header field labelled, so the result can be checked on paper
 * before any boat uses it.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Copy, Crosshair, FileDown, Heading, ListPlus, Loader2, Merge, Minus, Plus, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/error-message";
import { useAuth } from "@/lib/auth";
import { storageRef } from "@/lib/signed-url";
import { detectChecklist, loadPdfjs } from "@/lib/orbit2/checklist-detect";
import { fillChecklistForm, loadFormPdf, HEADER_FIELD_KEYS, type ChecklistFormDef, type FormHeaderField } from "@/lib/orbit2/checklist-form";
import { ORBIT2_BUCKET } from "./orbit2-data";
import { inputCls } from "./orbit2-fields";

const sb = supabase as any;

type Row = {
  uid: string; id?: string; kind: "item" | "section"; text: string; ref: string; page: number | null; x: number | null; y: number | null;
  /** Yes/No forms: the No box on the same line (red marker). */
  noX?: number | null;
};
type HField = FormHeaderField & { uid: string };
type Use = "additional" | "dma" | "fma";
type Selected = { type: "row" | "field"; uid: string } | null;

const uid = () => Math.random().toString(36).slice(2, 10);
const TICK = 10; // marker size in PDF points — the ✓ the form fill draws is about this big

export function ChecklistFormEditor({ input, onClose, onSaved }: {
  input: { file: File } | { form: ChecklistFormDef };
  onClose: () => void;
  onSaved: (formId: string) => void;
}) {
  const { user } = useAuth();
  const existing = "form" in input ? input.form : null;
  const [loading, setLoading] = useState(true);
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [doc, setDoc] = useState<any>(null);
  const [sizes, setSizes] = useState<{ width: number; height: number }[]>([]);
  const [pageIdx, setPageIdx] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [name, setName] = useState(existing?.name ?? "");
  const [code, setCode] = useState(existing?.code ?? "");
  const [use, setUse] = useState<Use>(existing?.regime === "dma" ? "dma" : existing?.regime === "fma" ? "fma" : "additional");
  const [rows, setRows] = useState<Row[]>([]);
  const [fields, setFields] = useState<HField[]>([]);
  const [tab, setTab] = useState<"items" | "fields">("items");
  const [selected, setSelected] = useState<Selected>(null);
  const [placing, setPlacing] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** The item ids an existing form had when opened — any not kept on save are retired. */
  const loadedIds = useRef<Set<string>>(new Set());
  const isRya = existing?.regime === "rya";

  // ── Load: read a dropped file, or an existing form and its items ──
  useEffect(() => {
    let on = true;
    void (async () => {
      try {
        let buf: ArrayBuffer;
        if ("file" in input) {
          buf = await input.file.arrayBuffer();
          const d = await detectChecklist(buf);
          if (!on) return;
          setRows(d.rows.map((r) => ({ uid: uid(), ...r })));
          setFields(d.headerFields.map((f) => ({ uid: uid(), ...f })));
          setWarnings(d.warnings);
          setName(d.title || input.file.name.replace(/\.pdf$/i, ""));
        } else {
          buf = await loadFormPdf(input.form.pdf_ref!);
          const { data } = await sb.from("orbit2_checklist_templates").select("*").eq("form_id", input.form.id).eq("active", true).order("sort_order");
          if (!on) return;
          const out: Row[] = [];
          let section: string | null = null;
          for (const t of (data ?? []) as any[]) {
            if ((t.section ?? null) !== section) {
              section = t.section ?? null;
              if (section) out.push({ uid: uid(), kind: "section", text: section, ref: "", page: null, x: null, y: null });
            }
            out.push({ uid: uid(), id: t.id, kind: "item", text: t.item, ref: t.ref ?? "", page: t.pdf_page, x: t.pdf_x != null ? Number(t.pdf_x) : null, y: t.pdf_y != null ? Number(t.pdf_y) : null, noX: t.pdf_no_x != null ? Number(t.pdf_no_x) : null });
          }
          setRows(out);
          loadedIds.current = new Set(out.filter((r) => r.id).map((r) => r.id!));
          setFields((input.form.header_fields ?? []).map((f) => ({ uid: uid(), ...f })));
        }
        const pdfjs = await loadPdfjs();
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
        const s: { width: number; height: number }[] = [];
        for (let i = 1; i <= pdf.numPages; i++) { const vp = (await pdf.getPage(i)).getViewport({ scale: 1 }); s.push({ width: vp.width, height: vp.height }); }
        if (!on) return;
        setBytes(buf); setDoc(pdf); setSizes(s);
      } catch (e) {
        toast.error(errorMessage(e, "Could not read the PDF"));
        onClose();
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => { on = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Draw the current page ──
  const size = sizes[pageIdx];
  const scale = size ? (720 / size.width) * zoom : 1;
  useEffect(() => {
    if (!doc || !size || !canvasRef.current) return;
    let task: any;
    void (async () => {
      const page = await doc.getPage(pageIdx + 1);
      const vp = page.getViewport({ scale: scale * (window.devicePixelRatio || 1) });
      const c = canvasRef.current!;
      c.width = vp.width; c.height = vp.height;
      c.style.width = `${size.width * scale}px`; c.style.height = `${size.height * scale}px`;
      task = page.render({ canvas: c, viewport: vp } as any);
      await task.promise.catch(() => {});
    })();
    return () => { task?.cancel?.(); };
  }, [doc, pageIdx, scale, size]);

  // ── Editing helpers ──
  const items = rows.filter((r) => r.kind === "item");
  const placed = items.filter((r) => r.page != null).length;
  const itemNo = useMemo(() => { const m = new Map<string, number>(); let n = 0; for (const r of rows) if (r.kind === "item") m.set(r.uid, ++n); return m; }, [rows]);
  const patchRow = (u: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.uid === u ? { ...r, ...p } : r)));
  const patchField = (u: string, p: Partial<HField>) => setFields((fs) => fs.map((f) => (f.uid === u ? { ...f, ...p } : f)));
  const selectRow = (r: Row) => { setSelected({ type: "row", uid: r.uid }); setTab("items"); if (r.page) setPageIdx(r.page - 1); };
  const indexOf = (u: string) => rows.findIndex((r) => r.uid === u);

  function insertAfterSelected(row: Row) {
    setRows((rs) => {
      const i = selected?.type === "row" ? rs.findIndex((r) => r.uid === selected.uid) : -1;
      const next = [...rs];
      next.splice(i >= 0 ? i + 1 : next.length, 0, row);
      return next;
    });
    setSelected({ type: "row", uid: row.uid });
  }
  const addItem = () => { insertAfterSelected({ uid: uid(), kind: "item", text: "New item", ref: "", page: null, x: null, y: null }); setPlacing(true); };
  const addSection = () => insertAfterSelected({ uid: uid(), kind: "section", text: "NEW SECTION", ref: "", page: null, x: null, y: null });
  /** Same wording, a second tick position — e.g. an item with Main and Kedge columns. */
  const duplicate = (r: Row) => { insertAfterSelected({ ...r, uid: uid(), id: undefined, page: null, x: null, y: null }); setPlacing(true); };
  const move = (u: string, dir: -1 | 1) => setRows((rs) => {
    const i = rs.findIndex((r) => r.uid === u), j = i + dir;
    if (i < 0 || j < 0 || j >= rs.length) return rs;
    const next = [...rs]; [next[i], next[j]] = [next[j], next[i]]; return next;
  });
  /** Join a row onto the item above — for a wrapped line the reader took as a new item. */
  const mergeUp = (u: string) => setRows((rs) => {
    const i = rs.findIndex((r) => r.uid === u);
    const prev = [...rs.slice(0, i)].reverse().find((r) => r.kind === "item");
    if (i < 0 || !prev) return rs;
    return rs.filter((r) => r.uid !== u).map((r) => (r.uid === prev.uid ? { ...r, text: `${r.text} ${rs[i].text}`.trim(), ref: r.ref || rs[i].ref } : r));
  });
  const remove = (u: string) => { setRows((rs) => rs.filter((r) => r.uid !== u)); if (selected?.uid === u) setSelected(null); };
  const addField = () => {
    const f: HField = { uid: uid(), key: "custom", label: "Other", page: pageIdx + 1, x: 100, y: (size?.height ?? 800) - 100, maxWidth: 200 };
    setFields((fs) => [...fs, f]); setSelected({ type: "field", uid: f.uid }); setTab("fields"); setPlacing(true);
  };

  /** Click on the page: put the selected row's tick, or the selected field, where it was clicked. */
  function onPageClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!placing || !selected || !size) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / scale;
    const py = size.height - (e.clientY - rect.top) / scale;
    if (selected.type === "row") {
      const r = rows.find((x) => x.uid === selected.uid);
      const nx = Math.round(px - TICK / 2);
      const noX = r?.noX != null && r.x != null ? r.noX + (nx - r.x) : r?.noX ?? null;
      patchRow(selected.uid, { page: pageIdx + 1, x: nx, y: Math.round(py - TICK / 2 + 1), noX });
    }
    else patchField(selected.uid, { page: pageIdx + 1, x: Math.round(px), y: Math.round(py - 3) });
    setPlacing(false);
  }

  // Keep the selected row in view in the list when it is picked on the page.
  useEffect(() => {
    if (!selected) return;
    listRef.current?.querySelector(`[data-uid="${selected.uid}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  async function testFill() {
    if (!bytes) return;
    setTesting(true);
    try {
      const values: Record<string, string> = {};
      for (const f of fields) values[f.key === "custom" ? `custom:${f.label}` : f.key] = `[${f.label}]`;
      const out = await fillChecklistForm({ pdf_ref: null, header_fields: fields, name: name || "Checklist" }, values,
        items.map((r) => ({ pdf_page: r.page, pdf_x: r.x, pdf_y: r.y, pdf_no_x: r.noX ?? null, checked: true })), { pdfBytes: bytes });
      const url = URL.createObjectURL(new Blob([out as BlobPart], { type: "application/pdf" }));
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast.error(errorMessage(e, "Could not build the test form"));
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    if (!name.trim()) { toast.error("Give the checklist a name."); return; }
    if (!items.length) { toast.error("The checklist has no items."); return; }
    setSaving(true);
    try {
      const regime = isRya ? "rya" : use === "additional" ? null : use;
      const header_fields = fields.map(({ uid: _u, ...f }) => f);
      let formId = existing?.id ?? null;
      if (!existing) {
        const file = (input as { file: File }).file;
        const path = `orbit2/checklist-forms/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
        const up = await supabase.storage.from(ORBIT2_BUCKET).upload(path, file, { contentType: "application/pdf", upsert: false });
        if (up.error) throw new Error(up.error.message);
        const { data, error } = await sb.from("orbit2_checklist_forms").insert({
          name: name.trim(), code: code.trim() || null, regime, category: null,
          pdf_ref: storageRef(ORBIT2_BUCKET, path), page_count: sizes.length, header_fields, created_by: user?.id ?? null,
        }).select("id").single();
        if (error) throw new Error(error.message);
        formId = data.id;
      } else {
        const { error } = await sb.from("orbit2_checklist_forms").update({
          name: name.trim(), code: code.trim() || null, header_fields, updated_at: new Date().toISOString(), ...(isRya ? {} : { regime }),
        }).eq("id", existing.id);
        if (error) throw new Error(error.message);
      }

      // Rows → template items, each carrying the heading above it.
      let section: string | null = null;
      const keepIds = new Set<string>();
      const inserts: Record<string, unknown>[] = [];
      let order = 0;
      for (const r of rows) {
        if (r.kind === "section") { section = r.text.trim() || null; continue; }
        order += 1;
        const values = {
          form_id: formId, regime, category: existing?.category ?? null, section, item: r.text.trim() || "(untitled)", ref: r.ref.trim() || null,
          pdf_page: r.page, pdf_x: r.x, pdf_y: r.y, pdf_no_x: r.noX ?? null, sort_order: order, active: true,
        };
        if (r.id) {
          keepIds.add(r.id);
          const { error } = await sb.from("orbit2_checklist_templates").update(values).eq("id", r.id);
          if (error) throw new Error(error.message);
        } else inserts.push(values);
      }
      for (let i = 0; i < inserts.length; i += 100) {
        const { error } = await sb.from("orbit2_checklist_templates").insert(inserts.slice(i, i + 100));
        if (error) throw new Error(error.message);
      }
      // Items removed here (or turned into headings) are retired, not deleted: past ticks still point at them.
      const retire = [...loadedIds.current].filter((id) => !keepIds.has(id));
      if (retire.length) {
        const { error } = await sb.from("orbit2_checklist_templates").update({ active: false }).in("id", retire);
        if (error) throw new Error(error.message);
      }
      // A form standing in for the DMA or FMA checklist replaces whatever was there.
      if (regime === "dma" || regime === "fma") {
        await sb.from("orbit2_checklist_forms").update({ active: false }).eq("regime", regime).neq("id", formId);
        await sb.from("orbit2_checklist_templates").update({ active: false }).eq("regime", regime).eq("active", true).neq("form_id", formId);
        await sb.from("orbit2_checklist_templates").update({ active: false }).eq("regime", regime).eq("active", true).is("form_id", null);
      }
      toast.success(`${name.trim()} saved — ${items.length} items, ${placed} placed on the form`);
      onSaved(formId!);
    } catch (e) {
      toast.error(errorMessage(e, "Could not save the checklist"));
    } finally {
      setSaving(false);
    }
  }

  const sel = selected?.type === "row" ? rows.find((r) => r.uid === selected.uid) : null;
  const selField = selected?.type === "field" ? fields.find((f) => f.uid === selected.uid) : null;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-background">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-2.5">
        <button onClick={onClose} className="rounded p-1.5 text-muted-foreground hover:bg-accent" aria-label="Close"><X className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] uppercase tracking-wide text-muted-foreground">{existing ? "Edit checklist layout" : "Add checklist from PDF"}</div>
          <div className="truncate font-display text-[18px] font-bold">{name || "Untitled checklist"}</div>
        </div>
        <div className="text-[14px] text-muted-foreground">
          <span className="font-semibold text-foreground">{items.length}</span> items · <span className={cn("font-semibold", placed === items.length ? "text-emerald-500" : "text-warning")}>{placed}</span> placed · {fields.length} header fields
        </div>
        <button onClick={() => void testFill()} disabled={!bytes || testing}
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[14px] font-medium hover:bg-accent disabled:opacity-50"
          title="Download the form with every box ticked and every header field labelled, to check the positions">
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} Test fill
        </button>
        <button onClick={() => void save()} disabled={loading || saving}
          className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-[14px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save checklist
        </button>
      </div>

      {loading ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" /> Reading the checklist…
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* ── The page ── */}
          <div className="flex min-w-0 flex-1 flex-col bg-muted/30">
            <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-card/60 px-3 py-1.5 text-[14px]">
              <div className="flex items-center gap-1">
                <button onClick={() => setPageIdx((p) => Math.max(0, p - 1))} disabled={pageIdx === 0} className="rounded p-1 hover:bg-accent disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
                <span>Page {pageIdx + 1} of {sizes.length}</span>
                <button onClick={() => setPageIdx((p) => Math.min(sizes.length - 1, p + 1))} disabled={pageIdx >= sizes.length - 1} className="rounded p-1 hover:bg-accent disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
              </div>
              {placing ? (
                <span className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-0.5 font-semibold text-primary-foreground">
                  <Crosshair className="h-4 w-4" /> Click on the page where {selected?.type === "field" ? "this value is written" : "this item's tick goes"}
                  <button onClick={() => setPlacing(false)} className="ml-1 rounded-full bg-primary-foreground/20 px-1.5">Cancel</button>
                </span>
              ) : (
                <span className="text-muted-foreground">Green ✓ = item ticks{rows.some((r) => r.noX != null) ? " · red = No box" : ""} · blue = header fields. Select a row, then <b>Place</b> to move it.</span>
              )}
              <div className="flex items-center gap-1">
                <button onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))} className="rounded p-1 hover:bg-accent"><Minus className="h-4 w-4" /></button>
                <span className="w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom((z) => Math.min(2.4, z + 0.2))} className="rounded p-1 hover:bg-accent"><Plus className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {size && (
                <div className="relative mx-auto shadow-lg" style={{ width: size.width * scale, height: size.height * scale }}>
                  <canvas ref={canvasRef} className="absolute inset-0 bg-white" />
                  <div className={cn("absolute inset-0", placing && "cursor-crosshair")} onClick={onPageClick}>
                    {rows.filter((r) => r.kind === "item" && r.page === pageIdx + 1 && r.x != null && r.y != null).map((r) => (
                      <button key={r.uid} type="button" title={r.text}
                        onClick={(e) => { if (placing) return; e.stopPropagation(); selectRow(r); }}
                        className={cn("absolute flex items-center justify-center rounded-sm border text-[9px] font-bold leading-none",
                          selected?.uid === r.uid ? "z-10 border-primary bg-primary text-primary-foreground ring-2 ring-primary/50" : "border-emerald-600 bg-emerald-500/80 text-white")}
                        style={{ left: r.x! * scale, top: (size.height - r.y! - TICK + 1) * scale, width: TICK * scale, height: TICK * scale }}>
                        {selected?.uid === r.uid ? "✓" : itemNo.get(r.uid)}
                      </button>
                    ))}
                    {rows.filter((r) => r.kind === "item" && r.page === pageIdx + 1 && r.noX != null && r.y != null).map((r) => (
                      <span key={`${r.uid}-no`} title={`No box — ${r.text}`}
                        className="pointer-events-none absolute rounded-sm border border-red-500 bg-red-500/25"
                        style={{ left: r.noX! * scale, top: (size.height - r.y! - TICK + 1) * scale, width: TICK * scale, height: TICK * scale }} />
                    ))}
                    {fields.filter((f) => f.page === pageIdx + 1).map((f) => (
                      <button key={f.uid} type="button"
                        onClick={(e) => { if (placing) return; e.stopPropagation(); setSelected({ type: "field", uid: f.uid }); setTab("fields"); }}
                        className={cn("absolute truncate rounded-sm border px-1 text-left text-[10px] leading-none",
                          selected?.uid === f.uid ? "z-10 border-primary bg-primary/30 text-primary" : "border-sky-500 bg-sky-500/20 text-sky-700")}
                        style={{ left: f.x * scale, top: (size.height - f.y - 9) * scale, width: (f.maxWidth ?? 200) * scale, height: 12 * scale }}>
                        {f.prefix ?? ""}{f.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── The list ── */}
          <div className="flex w-[30rem] shrink-0 flex-col border-l border-border bg-card">
            <div className="space-y-2 border-b border-border/60 p-3">
              <div className="grid grid-cols-[1fr_7rem] gap-2">
                <input className={cn(inputCls, "h-9 py-1 text-[14px]")} value={name} placeholder="Checklist name" onChange={(e) => setName(e.target.value)} />
                <input className={cn(inputCls, "h-9 py-1 text-[14px]")} value={code} placeholder="Code" onChange={(e) => setCode(e.target.value)} />
              </div>
              {!isRya && (
                <div className="flex items-center gap-2 text-[14px]">
                  <span className="text-muted-foreground">Use as</span>
                  {([["additional", "Additional checklist"], ["dma", "DMA checklist"], ["fma", "FMA checklist"]] as const).map(([k, label]) => (
                    <button key={k} onClick={() => setUse(k)}
                      className={cn("rounded-full border px-2.5 py-0.5 text-[13px] font-medium", use === k ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground")}>{label}</button>
                  ))}
                </div>
              )}
              {warnings.map((w) => <p key={w} className="rounded-md bg-warning/10 px-2 py-1 text-[13px] text-warning">{w}</p>)}
            </div>

            <div className="flex border-b border-border/60 text-[14px]">
              {([["items", `Items · ${items.length}`], ["fields", `Header fields · ${fields.length}`]] as const).map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)} className={cn("flex-1 py-2 font-semibold", tab === k ? "border-b-2 border-primary text-primary" : "text-muted-foreground")}>{label}</button>
              ))}
            </div>

            {tab === "items" ? (
              <>
                <div className="flex flex-wrap gap-1.5 border-b border-border/60 px-3 py-2">
                  <button onClick={addItem} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[13px] hover:bg-accent"><ListPlus className="h-3.5 w-3.5" /> Add item</button>
                  <button onClick={addSection} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[13px] hover:bg-accent"><Heading className="h-3.5 w-3.5" /> Add heading</button>
                  {sel && sel.kind === "item" && (
                    <>
                      <button onClick={() => setPlacing(true)} className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[13px] font-semibold text-primary-foreground"><Crosshair className="h-3.5 w-3.5" /> Place</button>
                      <button onClick={() => duplicate(sel)} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[13px] hover:bg-accent" title="Same item, a second tick position"><Copy className="h-3.5 w-3.5" /> Duplicate</button>
                    </>
                  )}
                </div>
                <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
                  {rows.map((r) => {
                    const on = selected?.uid === r.uid;
                    return (
                      <div key={r.uid} data-uid={r.uid} onClick={() => selectRow(r)}
                        className={cn("group flex items-start gap-1.5 border-b border-border/40 px-2 py-1.5", on && "bg-primary/10", r.kind === "section" && "bg-muted/40")}>
                        <span className="w-7 shrink-0 pt-1.5 text-right text-[12px] tabular-nums text-muted-foreground">{r.kind === "item" ? itemNo.get(r.uid) : ""}</span>
                        <div className="min-w-0 flex-1 space-y-1">
                          <textarea value={r.text} rows={r.text.length > 55 ? 2 : 1} onChange={(e) => patchRow(r.uid, { text: e.target.value })}
                            className={cn("w-full resize-none rounded border border-transparent bg-transparent px-1 py-0.5 text-[13px] outline-none hover:border-border focus:border-primary focus:bg-background",
                              r.kind === "section" && "font-semibold uppercase tracking-wide")} />
                          {r.kind === "item" && (
                            <div className="flex items-center gap-1.5 text-[12px]">
                              <input value={r.ref} placeholder="Ref" onChange={(e) => patchRow(r.uid, { ref: e.target.value })}
                                className="w-16 rounded border border-border bg-background px-1 py-0.5 outline-none focus:border-primary" />
                              {r.page != null ? (
                                <span className="text-muted-foreground">p{r.page} · {r.x},{r.y}</span>
                              ) : (
                                <span className="font-medium text-warning">not placed</span>
                              )}
                              <button onClick={(e) => { e.stopPropagation(); selectRow(r); setPlacing(true); }} className="flex items-center gap-0.5 text-primary hover:underline"><Crosshair className="h-3 w-3" /> Place</button>
                            </div>
                          )}
                        </div>
                        <div className={cn("flex shrink-0 flex-col gap-0.5 opacity-0 group-hover:opacity-100", on && "opacity-100")}>
                          <div className="flex gap-0.5">
                            <IconBtn title="Move up" onClick={() => move(r.uid, -1)}><ArrowUp className="h-3 w-3" /></IconBtn>
                            <IconBtn title="Move down" onClick={() => move(r.uid, 1)}><ArrowDown className="h-3 w-3" /></IconBtn>
                          </div>
                          <div className="flex gap-0.5">
                            <IconBtn title={r.kind === "item" ? "Make it a heading" : "Make it an item"} onClick={() => patchRow(r.uid, { kind: r.kind === "item" ? "section" : "item" })}><Heading className="h-3 w-3" /></IconBtn>
                            {r.kind === "item" && indexOf(r.uid) > 0 && <IconBtn title="Join onto the item above (a wrapped line)" onClick={() => mergeUp(r.uid)}><Merge className="h-3 w-3" /></IconBtn>}
                            <IconBtn title="Remove" danger onClick={() => remove(r.uid)}><Trash2 className="h-3 w-3" /></IconBtn>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="border-b border-border/60 px-3 py-2">
                  <button onClick={addField} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[13px] hover:bg-accent"><Plus className="h-3.5 w-3.5" /> Add header field</button>
                  <p className="mt-1.5 text-[12px] text-muted-foreground">Where the boat name, inspection date, inspector and so on are written. Values are filled in when the form is generated.</p>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {fields.map((f) => (
                    <div key={f.uid} data-uid={f.uid} onClick={() => { setSelected({ type: "field", uid: f.uid }); setPageIdx(f.page - 1); }}
                      className={cn("space-y-1 border-b border-border/40 px-3 py-2", selField?.uid === f.uid && "bg-primary/10")}>
                      <div className="flex gap-1.5">
                        <select value={f.key} onChange={(e) => patchField(f.uid, { key: e.target.value, label: HEADER_FIELD_KEYS.find((k) => k.key === e.target.value)?.label ?? f.label })}
                          className="rounded border border-border bg-background px-1.5 py-1 text-[13px]">
                          {HEADER_FIELD_KEYS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                        </select>
                        <input value={f.label} onChange={(e) => patchField(f.uid, { label: e.target.value })} className="min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-1 text-[13px]" />
                        <IconBtn title="Remove" danger onClick={() => setFields((fs) => fs.filter((x) => x.uid !== f.uid))}><Trash2 className="h-3 w-3" /></IconBtn>
                      </div>
                      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                        <span>p{f.page} · {f.x},{f.y}</span>
                        <label className="flex items-center gap-1">width
                          <input type="number" value={f.maxWidth ?? 200} onChange={(e) => patchField(f.uid, { maxWidth: Number(e.target.value) || 200 })}
                            className="w-14 rounded border border-border bg-background px-1 py-0.5 text-[12px]" />
                        </label>
                        <button onClick={(e) => { e.stopPropagation(); setSelected({ type: "field", uid: f.uid }); setPlacing(true); }} className="flex items-center gap-0.5 text-primary hover:underline"><Crosshair className="h-3 w-3" /> Place</button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function IconBtn({ title, onClick, danger, children }: { title: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" title={title} onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn("rounded p-1 text-muted-foreground hover:bg-accent", danger ? "hover:text-destructive" : "hover:text-foreground")}>{children}</button>
  );
}
