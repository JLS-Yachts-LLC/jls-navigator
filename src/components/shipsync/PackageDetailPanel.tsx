/**
 * A package's whole story in a panel that slides in from the right: who and what, where it is, who signed for it, the photos,
 * the files and when each step happened — without leaving the table. Editing, adding files and deleting hand over to the
 * screen's own dialogs, so nothing here changes how a package is saved.
 */
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Camera, FileText, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { SignedAnchor, SignedImage } from "@/components/ui/signed-file";
import { Button } from "@/components/ui/button";
import { StatusBadge, Chip, fmtDate, fmtDateTime } from "@/components/shipsync/shared";
import type { ShipSyncDeliveryNote, ShipSyncDriver, ShipSyncPackage } from "@/lib/shipsync/model";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-[14px]">{children || <span className="text-muted-foreground/50">—</span>}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-4">
      <h3 className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Photo({ stored, label, onFile, busy }: { stored: string | null; label: string; onFile?: (file: File) => void; busy?: boolean }) {
  const picker = onFile && (
    <input type="file" accept="image/*" className="hidden" disabled={busy}
      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
  );
  return (
    <div className="w-28">
      <div className="mb-1 text-[11.5px] text-muted-foreground">{label}</div>
      {stored ? (
        <>
          <SignedAnchor stored={stored} title={`Open ${label.toLowerCase()}`}>
            <SignedImage stored={stored} alt={label} className="h-24 w-28 rounded-lg border border-border object-cover transition hover:ring-2 hover:ring-primary/40" />
          </SignedAnchor>
          {onFile && (
            <label className="mt-1 inline-flex cursor-pointer items-center gap-1 text-[12px] text-primary hover:underline">
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />} Replace {picker}
            </label>
          )}
        </>
      ) : onFile ? (
        <label className="flex h-24 w-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-[12.5px] text-muted-foreground transition-colors duration-150 hover:border-primary hover:text-primary">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} Add photo {picker}
        </label>
      ) : (
        <div className="flex h-24 w-28 items-center justify-center rounded-lg border border-dashed border-border text-[12px] text-muted-foreground/50">None</div>
      )}
    </div>
  );
}

interface Step { at: string | null; label: string; detail?: string | null }

/** The steps a package has been through that the data records, oldest first. */
function stepsOf(p: ShipSyncPackage): Step[] {
  const raw: Step[] = [
    { at: p.received_at, label: "Received in the office", detail: p.received_by },
    { at: p.scan_out_time, label: "Assigned to a driver" },
    { at: p.driver_scan_out_time, label: "Loaded onto the van" },
    { at: p.delivered_at, label: "Delivered", detail: p.receiver_full_name ? `Signed for by ${p.receiver_full_name}` : null },
  ];
  return raw.filter((s) => !!s.at).sort((a, b) => new Date(a.at as string).getTime() - new Date(b.at as string).getTime());
}

export function PackageDetailPanel({ pkg, note, driver, onClose, onEdit, onAddFiles, onRemoveFile, onDelete, onUploadPhoto, photoBusy }: {
  pkg: ShipSyncPackage | null;
  note?: ShipSyncDeliveryNote;
  driver?: ShipSyncDriver;
  onClose: () => void;
  onEdit: (p: ShipSyncPackage) => void;
  onAddFiles: (p: ShipSyncPackage) => void;
  onRemoveFile: (p: ShipSyncPackage, index: number) => void;
  onDelete: (p: ShipSyncPackage) => void;
  /** Add or replace the received or delivery photo. */
  onUploadPhoto?: (p: ShipSyncPackage, file: File, kind: "item" | "delivery") => void;
  /** Which photo is being uploaded right now, if any. */
  photoBusy?: "item" | "delivery" | null;
}) {
  const docs = pkg?.documents ?? [];
  const notePdf = note?.delivery_pdf_url || note?.predelivery_pdf_url;
  return (
    <DialogPrimitive.Root open={!!pkg} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="dark pds-theme fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-[30rem] flex-col border-l border-border bg-background text-foreground shadow-2xl duration-200 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right"
        >
          {pkg && (
            <>
              <header className="flex items-start justify-between gap-3 border-b border-border px-6 py-4">
                <div className="min-w-0">
                  <DialogPrimitive.Title className="truncate font-mono text-[17px] font-semibold">{pkg.barcode ?? "No barcode"}</DialogPrimitive.Title>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusBadge status={pkg.status} />
                    {pkg.boat_name && <Chip className="font-semibold uppercase tracking-wide">{pkg.boat_name}</Chip>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button type="button" size="sm" className="gap-1.5" onClick={() => onEdit(pkg)}><Pencil className="h-3.5 w-3.5" /> Edit details</Button>
                  <DialogPrimitive.Close className="rounded-md p-1.5 text-muted-foreground transition-colors duration-150 hover:bg-white/10 hover:text-foreground" aria-label="Close">
                    <X className="h-4 w-4" />
                  </DialogPrimitive.Close>
                </div>
              </header>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                  <Field label="Consignee">{pkg.package_owner}</Field>
                  <Field label="Courier">{pkg.courier}</Field>
                  <Field label="Pieces">{String(pkg.num_packages ?? 1)}</Field>
                  <Field label="Shipment type">{pkg.local_import}</Field>
                  <Field label="Received">{fmtDate(pkg.received_at)}</Field>
                  <Field label="Invoice no.">{pkg.invoice_no}</Field>
                  {pkg.supplier && <Field label="Supplier">{pkg.supplier}</Field>}
                  {pkg.origin && <Field label="Origin">{pkg.origin}</Field>}
                  {pkg.warehouse_zone && <Field label="Warehouse zone">{pkg.warehouse_zone}</Field>}
                  <div className="col-span-2"><Field label="Remarks">{pkg.description}</Field></div>
                </dl>

                <Section title="Delivery">
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                    <Field label="Delivery note">{(pkg.delivery_note_no ?? note?.number) ? <Chip className="tabular-nums">{pkg.delivery_note_no ?? note?.number}</Chip> : null}</Field>
                    <Field label="Driver">{driver?.name}</Field>
                    <Field label="Delivered">{pkg.delivered_at ? fmtDate(pkg.delivered_at) : null}</Field>
                    <Field label="Received by">{pkg.receiver_full_name ? `${pkg.receiver_full_name}${pkg.receiver_designation ? ` · ${pkg.receiver_designation}` : ""}` : null}</Field>
                    {pkg.receiver_email && <div className="col-span-2"><Field label="Receiver email">{pkg.receiver_email}</Field></div>}
                  </dl>
                  {notePdf && (
                    <SignedAnchor stored={notePdf} className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline">
                      <FileText className="h-3.5 w-3.5" /> {note?.delivery_pdf_url ? "Open the delivery note" : "Open the pre-delivery note"}
                    </SignedAnchor>
                  )}
                </Section>

                <Section title="Photos">
                  <div className="flex flex-wrap gap-4">
                    <Photo stored={pkg.item_photo_url} label="Received" busy={photoBusy === "item"} onFile={onUploadPhoto ? (f) => onUploadPhoto(pkg, f, "item") : undefined} />
                    <Photo stored={pkg.delivery_photo_url} label="Delivery" busy={photoBusy === "delivery"} onFile={onUploadPhoto ? (f) => onUploadPhoto(pkg, f, "delivery") : undefined} />
                    <Photo stored={pkg.signature_url} label="Signature" />
                  </div>
                </Section>

                <Section title={`Files${docs.length ? ` (${docs.length})` : ""}`}>
                  {docs.length === 0 ? <p className="mb-3 text-[13px] text-muted-foreground">No files attached.</p> : (
                    <ul className="mb-3 space-y-1">
                      {docs.map((d, i) => (
                        <li key={`${d.url}-${i}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/5">
                          <SignedAnchor stored={d.url} title={d.name} className="flex min-w-0 flex-1 items-center gap-2 truncate text-[13px] text-primary">
                            <FileText className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{d.name}</span>
                          </SignedAnchor>
                          <button type="button" onClick={() => onRemoveFile(pkg, i)} title="Remove file"
                            className="shrink-0 rounded p-1 text-muted-foreground transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => onAddFiles(pkg)}><Plus className="h-3.5 w-3.5" /> Add files</Button>
                </Section>

                <Section title="History">
                  {stepsOf(pkg).length === 0 ? <p className="text-[13px] text-muted-foreground">No steps recorded yet.</p> : (
                    <ol className="space-y-3">
                      {stepsOf(pkg).map((s, i) => (
                        <li key={`${s.label}-${i}`} className="flex gap-3">
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                          <div className="min-w-0">
                            <div className="text-[14px]">{s.label}</div>
                            <div className="text-[12.5px] text-muted-foreground">{fmtDateTime(s.at)}{s.detail ? ` · ${s.detail}` : ""}</div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </Section>
              </div>

              {/* Delete sits bottom-left: the floating Leo button lives bottom-right, so nothing important goes there. */}
              <footer className="flex items-center justify-start gap-2 border-t border-border px-6 py-3">
                <Button type="button" variant="outline" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => onDelete(pkg)}>
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              </footer>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
