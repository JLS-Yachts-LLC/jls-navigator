import { useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DateInputDMY } from "@/components/ui/date-input-dmy";

/** Today in Dubai as yyyy-mm-dd (the day staff are cancelling on). */
export function todayDubai(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
}

/**
 * Ask for the date a visa was cancelled before marking it Cancelled, so reports
 * can show issue + cancellation dates side by side. Resolves to the yyyy-mm-dd
 * date, or null if the user backs out.
 *
 *   const cancel = useCancelVisaDate();
 *   const date = await cancel.ask(1); if (!date) return;
 *   …update({ status: "cancelled", cancelled_on: date })
 *   {cancel.dialog}
 */
export function useCancelVisaDate(): { ask: (count?: number) => Promise<string | null>; dialog: ReactNode } {
  const [pending, setPending] = useState<{ count: number; resolve: (d: string | null) => void } | null>(null);
  const [date, setDate] = useState("");

  function ask(count = 1) {
    setDate(todayDubai());
    return new Promise<string | null>((resolve) => setPending({ count, resolve }));
  }
  function close(value: string | null) {
    pending?.resolve(value);
    setPending(null);
  }

  const many = (pending?.count ?? 1) > 1;
  const dialog = (
    <Dialog open={!!pending} onOpenChange={(o) => { if (!o) close(null); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{many ? `Cancel ${pending?.count} visas` : "Cancel visa"}</DialogTitle>
          <DialogDescription>
            When {many ? "were these visas" : "was this visa"} cancelled? The date shows on the visa and in every visa report,
            next to the issue date. Nothing is deleted.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 py-1">
          <Label className="text-xs">Cancellation date</Label>
          <DateInputDMY
            value={date}
            onChange={setDate}
            style={{ height: 36, width: "100%", borderRadius: 8, border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", padding: "0 10px", fontSize: 14 }}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => close(null)}>Back</Button>
          <Button disabled={!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayDubai()} onClick={() => close(date)}>
            Mark cancelled
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
  return { ask, dialog };
}
