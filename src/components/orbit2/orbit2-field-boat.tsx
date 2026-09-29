/**
 * Orbit field app — a Managed Boats job on the phone.
 *
 * Boat jobs (Maintenance / Repair / Inventory) follow the same shape as project
 * jobs: Attend, log comments and photos, Done. Their statuses are the boat
 * register's own — Pending → Ongoing → Complete.
 *
 * An Inventory job (client request, 29 Sep 2026) is the crew member physically
 * checking the boat's Inventory List. Once attended, the list opens here so they
 * can confirm each item, correct quantity and condition, mark what is missing,
 * add anything not listed, photograph items and leave notes — every change is
 * written straight to the same rows the office sees under the boat's profile.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/error-message";
import { ArrowLeft, Camera, Check, ChevronDown, ChevronUp, Loader2, Plus, Send, Ship, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { compressImageToMaxKB } from "@/lib/image-compress";
import { guardUploadFile, uploadContentType } from "@/lib/upload-guard";
import { storageRef } from "@/lib/signed-url";
import { SignedImage } from "@/components/ui/signed-file";
import { BOAT_INVENTORY_CONDITIONS, boatInventoryConditionColor, kindToBoatJobCategory } from "./orbit2-constants";
import {
  ORBIT2_BUCKET, INVENTORY_UNITS, fmtSchedule, minutesToHhmm,
  type Orbit2Boat, type Orbit2BoatTask, type Orbit2BoatInventoryItem, type Orbit2Note, type Orbit2File,
} from "./orbit2-data";
import { stamp } from "./orbit2-fields";
import { useAttendance, CrewAttendance } from "./orbit2-attendance";

const sb = supabase as any;

/** Upload a phone photo, small enough for mobile data, and hand back its storage reference. */
async function uploadPhoto(file: File, folder: string): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("That isn't a photo.");
  const { file: small } = await compressImageToMaxKB(file, 1500);
  if (!guardUploadFile(small)) throw new Error("That photo can't be uploaded.");
  const path = `orbit2/${folder}/${crypto.randomUUID()}-${small.name.replace(/[^\w.-]+/g, "_")}`;
  const { error } = await supabase.storage.from(ORBIT2_BUCKET).upload(path, small, { contentType: uploadContentType(small), upsert: false });
  if (error) throw new Error(error.message);
  return storageRef(ORBIT2_BUCKET, path);
}

export function BoatJobDetail({
  task, boat, authorName, person, userId, onBack, onChanged, onClosed,
}: {
  task: Orbit2BoatTask;
  boat: Orbit2Boat;
  authorName: string;
  /** Roster name — the one in assigned_team — for per-crew attendance. */
  person: string;
  userId: string | null;
  onBack: () => void;
  onChanged: () => Promise<void> | void;
  onClosed: () => void;
}) {
  const working = task.status === "Ongoing";
  const isInventory = task.kind === "inventory";
  const att = useAttendance({ boat_task_id: task.id }, task.assigned_team ?? [], person);
  const waitingCompanion = working && !!att.mine?.done_at;
  const needsMyAttend = working && att.loaded && !att.mine;
  const [notes, setNotes] = useState<Orbit2Note[]>([]);
  const [images, setImages] = useState<Orbit2File[]>([]);
  const [busy, setBusy] = useState<null | "attend" | "done" | "comment" | "photo">(null);
  const [draft, setDraft] = useState("");
  const [confirmDone, setConfirmDone] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);

  const loadActivity = useCallback(async () => {
    const [n, f] = await Promise.all([
      sb.from("orbit2_notes").select("*").eq("boat_task_id", task.id).eq("kind", "team_comment").order("created_at"),
      sb.from("orbit2_files").select("*").eq("boat_task_id", task.id).eq("slot", "image").order("created_at"),
    ]);
    setNotes((n.data ?? []) as Orbit2Note[]);
    setImages((f.data ?? []) as Orbit2File[]);
  }, [task.id]);
  useEffect(() => { void loadActivity(); }, [loadActivity]);

  async function logComment(body: string) {
    const { error } = await sb.from("orbit2_notes").insert({
      boat_task_id: task.id, kind: "team_comment", author: authorName, body, created_by: userId,
    });
    if (error) throw new Error(error.message);
  }

  async function setStatus(from: string, to: string): Promise<boolean> {
    const { data, error } = await sb.from("orbit2_boat_tasks").update({ status: to }).eq("id", task.id).eq("status", from).select("id");
    if (error) throw new Error(error.message);
    return (data?.length ?? 0) > 0;
  }

  async function attend() {
    setBusy("attend");
    try {
      // Pending, or already Ongoing because a companion attended first.
      const { data, error } = await sb.from("orbit2_boat_tasks").update({ status: "Ongoing" }).eq("id", task.id).in("status", ["Pending", "Ongoing"]).select("id");
      if (error) throw new Error(error.message);
      if (!data?.length) { toast.error("The office has changed this job — refreshed."); onClosed(); return; }
      await att.markAttended(userId);
      await logComment("Attended").catch(() => {});
      toast.success("Attended — the office can see you're on site.");
      await Promise.all([onChanged(), loadActivity()]);
    } catch (e) { toast.error(errorMessage(e, "Could not mark as attended")); }
    finally { setBusy(null); }
  }

  async function addComment() {
    const body = draft.trim();
    if (!body) return;
    setBusy("comment");
    try { await logComment(body); setDraft(""); await loadActivity(); }
    catch (e) { toast.error(errorMessage(e, "Could not save the comment")); }
    finally { setBusy(null); }
  }

  async function capture(file: File | undefined) {
    if (!file) return;
    setBusy("photo");
    try {
      const ref = await uploadPhoto(file, "field/boats");
      const { error } = await sb.from("orbit2_files").insert({ boat_task_id: task.id, slot: "image", file_name: file.name, storage_ref: ref, uploaded_by: userId });
      if (error) throw new Error(error.message);
      toast.success("Photo added to the job");
      await loadActivity();
    } catch (e) { toast.error(errorMessage(e, "Could not upload the photo")); }
    finally { setBusy(null); if (cameraRef.current) cameraRef.current.value = ""; }
  }

  async function done() {
    setConfirmDone(false);
    setBusy("done");
    try {
      if (draft.trim()) { await logComment(draft.trim()); setDraft(""); }
      const list = await att.markDone(userId);
      await logComment("Done").catch(() => {});
      if (!att.allDone(list)) {
        const waiting = att.crew.filter((p) => !list.some((r) => r.person === p && r.done_at));
        toast.success(`Your part is done — waiting for ${waiting.join(", ")}.`);
        await Promise.all([onChanged(), loadActivity()]);
        return;
      }
      if (!(await setStatus("Ongoing", "Complete"))) { toast.error("The office changed this job's status — refreshed."); await onChanged(); return; }
      toast.success(`${task.job_no ?? "Job"} complete`);
      onClosed();
    } catch (e) { toast.error(errorMessage(e, "Could not mark as done")); }
    finally { setBusy(null); }
  }

  return (
    <main className="flex flex-1 flex-col">
      <div className="flex-1 space-y-4 px-4 py-4 pb-28">
        <button onClick={onBack} className="-ml-1 flex items-center gap-1.5 rounded-md px-1 py-1 text-[15px] font-medium text-primary">
          <ArrowLeft className="h-5 w-5" /> My jobs
        </button>

        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[14px] text-muted-foreground">Job No.</div>
              <div className="font-display text-[22px] font-bold leading-tight">{task.job_no ?? "—"}</div>
            </div>
            <span className="shrink-0 rounded-full border px-2.5 py-0.5 text-[14px] font-semibold"
              style={{ borderColor: `${statusTone(task.status)}66`, background: `${statusTone(task.status)}1A`, color: statusTone(task.status) }}>
              {task.status}
            </span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
            <Item label="Boat" value={boat.name} />
            <Item label="Category" value={kindToBoatJobCategory(task.kind)} />
            <Item label="Scheduled" value={fmtSchedule(task.schedule_date, task.schedule_time)} className="col-span-2" />
            <Item label="Est. time" value={task.est_minutes ? minutesToHhmm(task.est_minutes) : null} />
            <Item label="Technician" value={task.technician} />
          </dl>
          <div className="mt-3">
            <div className="mb-1 text-[14px] text-muted-foreground">Description</div>
            <div className="whitespace-pre-wrap rounded-lg border border-border bg-background px-3 py-2.5 text-[16px] leading-relaxed">
              {task.title}{task.description ? `\n${task.description}` : ""}
            </div>
          </div>
        </section>

        <CrewAttendance crew={att.crew} rows={att.rows} me={person} />

        {/* The inventory check — the point of an Inventory job. */}
        {isInventory && (
          <InventoryCheck boat={boat} editable={working} authorName={authorName} userId={userId} />
        )}

        {working && (
          <section className="space-y-4 rounded-xl border border-border bg-card p-4">
            <div>
              <label htmlFor="boat-team-comment" className="mb-1.5 block text-[15px] font-semibold">Team comment</label>
              <textarea id="boat-team-comment" value={draft} onChange={(e) => setDraft(e.target.value)} rows={3}
                placeholder={isInventory ? "Anything the office should know about the count…" : "What you found, what you did…"}
                className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-[16px] outline-none focus:border-primary" />
              <button onClick={() => void addComment()} disabled={!draft.trim() || busy !== null}
                className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-primary/50 bg-primary/10 text-[16px] font-semibold text-primary disabled:opacity-40">
                {busy === "comment" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />} Add comment
              </button>
            </div>
            <div>
              <div className="mb-1.5 text-[15px] font-semibold">Job photos</div>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void capture(e.target.files?.[0])} />
              <button onClick={() => cameraRef.current?.click()} disabled={busy !== null}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-border bg-background text-[16px] font-semibold disabled:opacity-40">
                {busy === "photo" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                {busy === "photo" ? "Uploading…" : "Capture image"}
              </button>
              {images.length > 0 && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {images.map((img) => (
                    <div key={img.id} className="aspect-square overflow-hidden rounded-md border border-border bg-muted/20">
                      <SignedImage stored={img.storage_ref} alt={img.file_name} className="h-full w-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {notes.length > 0 && (
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 text-[15px] font-semibold">Team comments</div>
            <ul className="space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="text-[15px] leading-relaxed">
                  <span className="font-semibold">{n.author}</span>
                  <span className="text-muted-foreground"> [{stamp(n.created_at)}]: </span>
                  <span className="whitespace-pre-wrap">{n.body}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border/70 bg-card/95 px-4 py-3 backdrop-blur"
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto max-w-md">
          {confirmDone ? (
            <div className="space-y-2">
              <p className="text-center text-[15px]">
                {att.crew.length > 1 && att.waitingOn.filter((p) => p !== person).length > 0
                  ? <>Mark your part of <span className="font-semibold">{task.job_no}</span> done? The job completes once everyone assigned has pressed Done.</>
                  : <>Mark <span className="font-semibold">{task.job_no}</span> complete? The office sees it immediately.</>}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setConfirmDone(false)} className="h-12 rounded-lg border border-border text-[16px] font-semibold">Not yet</button>
                <button onClick={() => void done()} className="h-12 rounded-lg bg-destructive text-[16px] font-bold text-destructive-foreground">Yes, done</button>
              </div>
            </div>
          ) : waitingCompanion ? (
            <div className="space-y-1">
              <button disabled
                className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-muted text-[18px] font-bold text-muted-foreground shadow-lg">
                Waiting Companion
              </button>
              <p className="text-center text-[14px] text-muted-foreground">
                Your part is done — waiting for {att.waitingOn.join(", ")} to press Done.
              </p>
            </div>
          ) : working && !needsMyAttend ? (
            <button onClick={() => setConfirmDone(true)} disabled={busy !== null}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-destructive text-[18px] font-bold text-destructive-foreground shadow-lg disabled:opacity-50">
              {busy === "done" && <Loader2 className="h-5 w-5 animate-spin" />} Done
            </button>
          ) : (
            <button onClick={() => void attend()} disabled={busy !== null}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-emerald-500 text-[18px] font-bold text-white shadow-lg disabled:opacity-50">
              {busy === "attend" && <Loader2 className="h-5 w-5 animate-spin" />} Attend
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

const statusTone = (s: string) => s === "Complete" ? "#4C7DF0" : s === "Ongoing" ? "#00C4CC" : "#7C8FE8";

// ── Inventory check ─────────────────────────────────────────────────────────

function InventoryCheck({
  boat, editable, authorName, userId,
}: { boat: Orbit2Boat; editable: boolean; authorName: string; userId: string | null }) {
  const [items, setItems] = useState<Orbit2BoatInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await sb.from("orbit2_boat_inventory").select("*").eq("boat_id", boat.id).order("item");
    if (error) toast.error(errorMessage(error, "Could not load the inventory"));
    setItems((data ?? []) as Orbit2BoatInventoryItem[]);
    setLoading(false);
  }, [boat.id]);
  useEffect(() => { void load(); }, [load]);

  const checked = items.filter((i) => i.checked_at).length;

  async function patch(row: Orbit2BoatInventoryItem, values: Record<string, unknown>) {
    const { error } = await sb.from("orbit2_boat_inventory").update(values).eq("id", row.id);
    if (error) { toast.error(errorMessage(error, "Could not save")); return false; }
    await load();
    return true;
  }

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-[15px] font-semibold"><Ship className="h-4 w-4 text-muted-foreground" /> Inventory — {boat.name}</div>
          <div className="text-[14px] text-muted-foreground">
            {loading ? "Loading…" : `${checked} of ${items.length} checked`}
            {!editable && !loading && " · press Attend to start checking"}
          </div>
        </div>
        {editable && (
          <button onClick={() => setAdding((v) => !v)}
            className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-border px-2.5 py-1.5 text-[14px] font-semibold hover:bg-accent">
            <Plus className="h-4 w-4" /> Add item
          </button>
        )}
      </div>

      {adding && editable && <AddItemForm boatId={boat.id} userId={userId} authorName={authorName} onAdded={load} onDone={() => setAdding(false)} />}

      {loading ? (
        <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <p className="px-4 py-6 text-center text-[15px] text-muted-foreground">Nothing on this boat's inventory list yet.</p>
      ) : (
        <ul className="divide-y divide-border/40">
          {items.map((row) => (
            <InventoryRow key={row.id} row={row} editable={editable} authorName={authorName}
              onPatch={(v) => patch(row, v)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function InventoryRow({
  row, editable, authorName, onPatch,
}: { row: Orbit2BoatInventoryItem; editable: boolean; authorName: string; onPatch: (v: Record<string, unknown>) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    qty: row.qty != null ? String(row.qty) : "", unit: row.unit ?? "Pcs",
    condition: row.condition ?? BOAT_INVENTORY_CONDITIONS[0], on_board: row.on_board, remarks: row.remarks ?? "",
  });
  const photoRef = useRef<HTMLInputElement>(null);
  const isChecked = !!row.checked_at;

  /** "Correct" — the item is as listed. Records who confirmed it and when. */
  async function confirm() {
    setBusy(true);
    await onPatch(isChecked ? { checked_at: null, checked_by: null } : { checked_at: new Date().toISOString(), checked_by: authorName });
    setBusy(false);
  }

  async function save() {
    setBusy(true);
    const ok = await onPatch({
      qty: form.qty === "" ? null : Number(form.qty), unit: form.unit, condition: form.condition,
      on_board: form.on_board, remarks: form.remarks.trim() || null,
      // Correcting a line is also confirming it.
      checked_at: new Date().toISOString(), checked_by: authorName,
    });
    setBusy(false);
    if (ok) { setOpen(false); toast.success(`${row.item} updated`); }
  }

  async function photo(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try { await onPatch({ image_ref: await uploadPhoto(file, "boats/inventory") }); toast.success(`Photo added to ${row.item}`); }
    catch (e) { toast.error(errorMessage(e, "Could not upload the photo")); }
    finally { setBusy(false); if (photoRef.current) photoRef.current.value = ""; }
  }

  return (
    <li className={cn("px-4 py-3", isChecked && "bg-emerald-500/[0.06]")}>
      <div className="flex items-start gap-3">
        {editable ? (
          <button onClick={() => void confirm()} disabled={busy} aria-label={isChecked ? "Unmark as checked" : "Mark as correct"}
            className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition",
              isChecked ? "border-emerald-500 bg-emerald-500 text-white" : "border-border text-transparent hover:border-emerald-500")}>
            <Check className="h-5 w-5" />
          </button>
        ) : (
          <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2",
            isChecked ? "border-emerald-500 bg-emerald-500 text-white" : "border-border text-transparent")}>
            <Check className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="text-[16px] font-semibold">{row.item}</span>
            {editable && (
              <button onClick={() => setOpen((v) => !v)} className="flex shrink-0 items-center gap-0.5 text-[14px] font-medium text-primary">
                Edit {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[14px] text-muted-foreground">
            <span>{row.qty ?? "—"} {row.unit ?? ""}</span>
            <span style={{ color: boatInventoryConditionColor(row.condition) }}>{row.condition ?? "—"}</span>
            <span>{row.on_board ? "On board" : "Not on board"}</span>
          </div>
          {row.remarks && <div className="mt-0.5 text-[14px] text-muted-foreground">{row.remarks}</div>}
          {isChecked && (
            <div className="mt-0.5 text-[14px] text-emerald-600">Checked by {row.checked_by} · {stamp(row.checked_at!)}</div>
          )}
          {row.image_ref && (
            <div className="mt-2 h-20 w-20 overflow-hidden rounded-md border border-border">
              <SignedImage stored={row.image_ref} alt={row.item} className="h-full w-full object-cover" />
            </div>
          )}

          {open && editable && (
            <div className="mt-3 space-y-2 rounded-lg border border-border bg-background p-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-[14px] text-muted-foreground">Qty
                  <input type="number" inputMode="decimal" value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-[16px] text-foreground outline-none focus:border-primary" />
                </label>
                <label className="block text-[14px] text-muted-foreground">Unit
                  <select value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value as typeof f.unit }))}
                    className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-[16px] text-foreground outline-none">
                    {INVENTORY_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </label>
              </div>
              <label className="block text-[14px] text-muted-foreground">Condition
                <select value={form.condition} onChange={(e) => setForm((f) => ({ ...f, condition: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-[16px] text-foreground outline-none">
                  {BOAT_INVENTORY_CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <div className="flex gap-2">
                {[true, false].map((v) => (
                  <button key={String(v)} onClick={() => setForm((f) => ({ ...f, on_board: v }))}
                    className={cn("flex-1 rounded-md border px-3 py-2 text-[15px] font-medium",
                      form.on_board === v ? "border-primary bg-primary/15 text-primary" : "border-border")}>
                    {v ? "On board" : "Not on board"}
                  </button>
                ))}
              </div>
              <label className="block text-[14px] text-muted-foreground">Remarks
                <input value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-[16px] text-foreground outline-none focus:border-primary" />
              </label>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void photo(e.target.files?.[0])} />
                <button onClick={() => photoRef.current?.click()} disabled={busy}
                  className="flex h-11 items-center justify-center gap-2 rounded-lg border border-border text-[15px] font-semibold disabled:opacity-50">
                  <Camera className="h-5 w-5" /> {row.image_ref ? "Replace photo" : "Photo"}
                </button>
                <button onClick={() => void save()} disabled={busy}
                  className="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-50">
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * An item that is on the boat but not on the list. Added as checked — the crew
 * member is looking at it. The form stays open after each add so a locker full
 * of unlisted items can be entered one after another; Done closes it.
 */
function AddItemForm({ boatId, userId, authorName, onAdded, onDone }: {
  boatId: string; userId: string | null; authorName: string; onAdded: () => Promise<void>; onDone: () => void;
}) {
  const [form, setForm] = useState({ item: "", qty: "", unit: "Pcs", condition: BOAT_INVENTORY_CONDITIONS[0] as string, remarks: "" });
  // A photo taken or chosen for this item — uploaded when the item is saved.
  const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(0);
  const itemRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.preview); }, [photo]);

  function pick(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("That isn't a photo."); return; }
    setPhoto({ file, preview: URL.createObjectURL(file) });
  }

  /** Save the item. `andAnother` keeps the form open, cleared for the next one. */
  async function save(andAnother: boolean) {
    if (!form.item.trim()) { toast.error("Give the item a name."); itemRef.current?.focus(); return; }
    setBusy(true);
    try {
      const image_ref = photo ? await uploadPhoto(photo.file, "boats/inventory") : null;
      const { error } = await sb.from("orbit2_boat_inventory").insert({
        boat_id: boatId, item: form.item.trim(), qty: form.qty === "" ? null : Number(form.qty), unit: form.unit,
        condition: form.condition, remarks: form.remarks.trim() || null, on_board: true, image_ref,
        checked_at: new Date().toISOString(), checked_by: authorName, created_by: userId,
      });
      if (error) throw new Error(error.message);
      toast.success(`${form.item.trim()} added to the inventory`);
      await onAdded();
      if (!andAnother) { onDone(); return; }
      // Keep unit and condition — the next item on the shelf usually matches.
      setForm((f) => ({ ...f, item: "", qty: "", remarks: "" }));
      setPhoto(null);
      setAdded((n) => n + 1);
      itemRef.current?.focus();
    } catch (e) {
      toast.error(errorMessage(e, "Could not add the item"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 border-b border-border/60 bg-muted/10 p-4">
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-semibold">Add a missing item</span>
        {added > 0 && <span className="text-[14px] text-muted-foreground">{added} added</span>}
      </div>
      <input ref={itemRef} autoFocus value={form.item} placeholder="Item name" onChange={(e) => setForm((f) => ({ ...f, item: e.target.value }))}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-[16px] outline-none focus:border-primary" />
      <div className="grid grid-cols-2 gap-2">
        <input type="number" inputMode="decimal" value={form.qty} placeholder="Qty" onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
          className="rounded-md border border-border bg-background px-3 py-2 text-[16px] outline-none focus:border-primary" />
        <select value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
          className="rounded-md border border-border bg-background px-3 py-2 text-[16px] outline-none">
          {INVENTORY_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
      <select value={form.condition} onChange={(e) => setForm((f) => ({ ...f, condition: e.target.value }))}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-[16px] outline-none">
        {BOAT_INVENTORY_CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <input value={form.remarks} placeholder="Remarks (optional)" onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-[16px] outline-none focus:border-primary" />

      {/* Photo — take one now or pick one from the phone. */}
      <div className="flex items-center gap-2">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-background">
          {photo ? <img src={photo.preview} alt="" className="h-full w-full object-cover" /> : <Camera className="h-5 w-5 text-muted-foreground/50" />}
        </div>
        <button type="button" onClick={() => cameraRef.current?.click()} disabled={busy}
          className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border text-[15px] font-semibold disabled:opacity-50">
          <Camera className="h-4 w-4" /> Take photo
        </button>
        <button type="button" onClick={() => uploadRef.current?.click()} disabled={busy}
          className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border text-[15px] font-semibold disabled:opacity-50">
          <Upload className="h-4 w-4" /> Upload
        </button>
        {photo && (
          <button type="button" onClick={() => setPhoto(null)} aria-label="Remove photo" className="rounded-md p-2 text-destructive">
            <X className="h-5 w-5" />
          </button>
        )}
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      </div>

      <div className="grid grid-cols-2 gap-2 pt-1">
        <button onClick={onDone} disabled={busy}
          className="h-11 rounded-lg border border-border text-[15px] font-semibold disabled:opacity-50">{added > 0 ? "Done" : "Cancel"}</button>
        <button onClick={() => void save(false)} disabled={busy}
          className="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
        </button>
        <button onClick={() => void save(true)} disabled={busy}
          className="col-span-2 flex h-11 items-center justify-center gap-2 rounded-lg border border-primary/60 bg-primary/10 text-[15px] font-semibold text-primary disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save &amp; Add Another
        </button>
      </div>
    </div>
  );
}

function Item({ label, value, className }: { label: string; value: string | null | undefined; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[14px] text-muted-foreground">{label}</dt>
      <dd className="truncate text-[16px] font-medium">{value || "—"}</dd>
    </div>
  );
}
