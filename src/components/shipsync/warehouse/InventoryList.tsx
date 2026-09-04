import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Users, Building2, Boxes } from "lucide-react";
import {
  SAMPLE_CLIENT_ITEMS, SAMPLE_INTERNAL_ITEMS, SAMPLE_PACKAGE_CONTENTS,
  CLIENT_STATUS_STYLE, PACKAGE_CONTENT_STATUS_STYLE, locationCode,
  type SampleClientItem, type SampleInternalItem,
} from "@/components/shipsync/warehouse/warehouse-constants";

type Category = "client" | "internal" | "contents";
const CATEGORIES: { key: Category; label: string; icon: typeof Users }[] = [
  { key: "client", label: "Client Inventory List", icon: Users },
  { key: "internal", label: "Internal Inventory List", icon: Building2 },
  { key: "contents", label: "Package Content", icon: Boxes },
];

function StatusPill({ label, style }: { label: string; style: string }) {
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", style)}>{label}</span>;
}

export function InventoryList() {
  const [category, setCategory] = useState<Category>("client");
  const [selectedRef, setSelectedRef] = useState<string | null>(null);

  const packingList = useMemo(
    () => (selectedRef ? SAMPLE_PACKAGE_CONTENTS.filter((c) => c.refNo === selectedRef) : []),
    [selectedRef],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="rounded-lg border border-dashed border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
        UI preview — the rows below are illustrative sample data, not the real warehouse inventory.
      </div>

      <div className="flex gap-1 rounded-lg border border-border bg-card/50 p-1 w-fit">
        {CATEGORIES.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => { setCategory(key); setSelectedRef(null); }}
            className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-all",
              category === key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {category === "contents" ? (
        <PackageContentTable />
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_360px]">
          <div className="min-h-0 overflow-auto rounded-xl border border-border bg-card">
            {category === "client"
              ? <ClientTable rows={SAMPLE_CLIENT_ITEMS} selectedRef={selectedRef} onSelect={setSelectedRef} />
              : <InternalTable rows={SAMPLE_INTERNAL_ITEMS} selectedRef={selectedRef} onSelect={setSelectedRef} />}
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 font-display text-sm font-semibold">Packing List</div>
            {!selectedRef ? (
              <p className="text-sm text-muted-foreground">Select a reference number on the left to view its package contents, if a packing list is available.</p>
            ) : packingList.length === 0 ? (
              <p className="text-sm text-muted-foreground">No packing list available for <span className="font-mono">{selectedRef}</span>.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {packingList.map((c) => (
                  <div key={c.itemId} className="rounded-lg border border-border/60 p-2.5 text-[12.5px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{c.itemName}</span>
                      <StatusPill label={c.status} style={PACKAGE_CONTENT_STATUS_STYLE[c.status]} />
                    </div>
                    <div className="mt-1 text-muted-foreground">{c.quantity} {c.unit}{c.remarks ? ` · ${c.remarks}` : ""}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return <th className="px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">{children}</th>;
}

function ClientTable({ rows, selectedRef, onSelect }: { rows: SampleClientItem[]; selectedRef: string | null; onSelect: (ref: string) => void }) {
  return (
    <table className="w-full text-[12.5px]">
      <thead className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_0_var(--border)]">
        <tr>
          <Th>Ref No.</Th><Th>Client Name</Th><Th>Description</Th><Th>Quotation No.</Th>
          <Th>L×W×H (cm)</Th><Th>Weight</Th><Th>CBM</Th><Th>Date Stored</Th><Th>Due Date</Th>
          <Th>Location</Th><Th>Invoice No.</Th><Th>Status</Th><Th>Remarks</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/40">
        {rows.map((r) => {
          const cbm = ((r.lengthCm * r.widthCm * r.heightCm) / 1_000_000).toFixed(2);
          return (
            <tr key={r.refNo} onClick={() => onSelect(r.refNo)}
              className={cn("cursor-pointer transition hover:bg-accent/20", selectedRef === r.refNo && "bg-primary/5")}>
              <td className="px-3 py-2 font-mono font-medium">{r.refNo}</td>
              <td className="px-3 py-2">{r.clientName}</td>
              <td className="px-3 py-2 max-w-[220px] truncate">{r.description}</td>
              <td className="px-3 py-2 font-mono text-muted-foreground">{r.quotationNo}</td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground whitespace-nowrap">{r.lengthCm}×{r.widthCm}×{r.heightCm}</td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground">{r.weightKg} kg</td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground">{cbm} m³</td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground whitespace-nowrap">{r.dateStored}</td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground whitespace-nowrap">{r.dueDate}</td>
              <td className="px-3 py-2 font-mono">{locationCode(r)}</td>
              <td className="px-3 py-2 font-mono text-muted-foreground">{r.invoiceNo}</td>
              <td className="px-3 py-2"><StatusPill label={r.status} style={CLIENT_STATUS_STYLE[r.status]} /></td>
              <td className="px-3 py-2 max-w-[160px] truncate text-muted-foreground">{r.remarks || "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function InternalTable({ rows, selectedRef, onSelect }: { rows: SampleInternalItem[]; selectedRef: string | null; onSelect: (ref: string) => void }) {
  return (
    <table className="w-full text-[12.5px]">
      <thead className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_0_var(--border)]">
        <tr>
          <Th>Ref No.</Th><Th>Department</Th><Th>Description</Th>
          <Th>L×W×H (cm)</Th><Th>Weight</Th><Th>CBM</Th><Th>Date Stored</Th>
          <Th>Location</Th><Th>Status</Th><Th>Remarks</Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/40">
        {rows.map((r) => {
          const cbm = ((r.lengthCm * r.widthCm * r.heightCm) / 1_000_000).toFixed(2);
          return (
            <tr key={r.refNo} onClick={() => onSelect(r.refNo)}
              className={cn("cursor-pointer transition hover:bg-accent/20", selectedRef === r.refNo && "bg-primary/5")}>
              <td className="px-3 py-2 font-mono font-medium">{r.refNo}</td>
              <td className="px-3 py-2">{r.department}</td>
              <td className="px-3 py-2 max-w-[240px] truncate">{r.description}</td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground whitespace-nowrap">{r.lengthCm}×{r.widthCm}×{r.heightCm}</td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground">{r.weightKg} kg</td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground">{cbm} m³</td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground whitespace-nowrap">{r.dateStored}</td>
              <td className="px-3 py-2 font-mono">{locationCode(r)}</td>
              <td className="px-3 py-2"><StatusPill label={r.status} style={CLIENT_STATUS_STYLE[r.status]} /></td>
              <td className="px-3 py-2 max-w-[160px] truncate text-muted-foreground">{r.remarks || "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PackageContentTable() {
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card">
      <table className="w-full text-[12.5px]">
        <thead className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_0_var(--border)]">
          <tr>
            <Th>Ref No.</Th><Th>Item ID</Th><Th>Client / Department</Th><Th>Item Name</Th>
            <Th>Quantity</Th><Th>Unit</Th><Th>Status</Th><Th>Remarks</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {SAMPLE_PACKAGE_CONTENTS.map((c) => (
            <tr key={c.itemId} className="hover:bg-accent/10">
              <td className="px-3 py-2 font-mono font-medium">{c.refNo}</td>
              <td className="px-3 py-2 font-mono text-muted-foreground">{c.itemId}</td>
              <td className="px-3 py-2">{c.clientOrDept}</td>
              <td className="px-3 py-2">{c.itemName}</td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground">{c.quantity}</td>
              <td className="px-3 py-2 text-muted-foreground">{c.unit}</td>
              <td className="px-3 py-2"><StatusPill label={c.status} style={PACKAGE_CONTENT_STATUS_STYLE[c.status]} /></td>
              <td className="px-3 py-2 max-w-[220px] truncate text-muted-foreground">{c.remarks || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
