/**
 * Automated report: Statement of account.
 *
 * Open items from every company that bills the vessel — JLS (its JLS customer)
 * and any other QuickBooks company it's linked to (yacht_qbo_accounts, e.g.
 * Waypoint) — the same accounts the Client Portal's statement uses. The email
 * gives the open balance and overdue payment (QuickBooks' own figures) and the
 * unpaid invoices; the attachment is one statement PDF per company that's owed
 * money, merged.
 */
import { billingAccounts } from "@/routes/api.portal.finance";
import { qboQuery } from "@/lib/qb/qbo.server";
import { buildStatementPdf } from "@/lib/portal/statement-pdf.server";
import { emailBrandLockup } from "@/lib/email/brand-mark";
import type { BuiltReport } from "./build.server";

const b64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const fileSafe = (s: string) => s.replace(/[^\w .-]+/g, "").trim() || "Vessel";
const ql = (s: string) => s.replace(/'/g, "\\'");
const money = (n: number) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dubaiToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const nice = (iso: string | null | undefined) =>
  iso ? new Date(`${String(iso).slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—";

export async function buildStatement(yachtId: string, vessel: string, qboCustomerId: string | null): Promise<BuiltReport> {
  const accounts = await billingAccounts({ yachtId, qboCustomerId, vesselName: vessel });
  if (!accounts.length) {
    throw new Error(`${vessel} has no QuickBooks account linked — link its JLS customer (or its Waypoint account on the vessel's Finance tab) first.`);
  }
  const today = dubaiToday();

  const per = await Promise.all(accounts.map(async (acct) => {
    const [inv, cust] = await Promise.all([
      qboQuery(`select * from Invoice where CustomerRef = '${ql(acct.customerId)}' and Balance > '0' orderby TxnDate maxresults 500`, acct.realm),
      qboQuery(`select Id, Balance from Customer where Id = '${ql(acct.customerId)}'`, acct.realm).catch(() => null),
    ]);
    const rows: any[] = inv?.QueryResponse?.Invoice ?? [];
    const invoices = rows.map((i) => ({
      docNumber: (i.DocNumber as string) ?? null, date: (i.TxnDate as string) ?? null, dueDate: (i.DueDate as string) ?? null,
      total: Number(i.TotalAmt ?? 0), balance: Number(i.Balance ?? 0), currency: (i.CurrencyRef?.value as string) ?? "AED",
    }));
    // QuickBooks' own open balance (nets off credits), else the unpaid invoices.
    const qbBalance = cust?.QueryResponse?.Customer?.[0]?.Balance;
    const open = qbBalance != null ? Number(qbBalance) : invoices.reduce((t, i) => t + i.balance, 0);
    const overdue = invoices.filter((i) => i.dueDate && i.dueDate < today).reduce((t, i) => t + i.balance, 0);
    return { acct, invoices, open, overdue, billTo: (rows[0]?.CustomerRef?.name as string | undefined) ?? null };
  }));

  const ccy = per.flatMap((p) => p.invoices)[0]?.currency ?? "AED";
  const open = per.reduce((t, p) => t + p.open, 0);
  const overdue = per.reduce((t, p) => t + p.overdue, 0);
  const unpaid = per
    .flatMap((p) => p.invoices.map((i) => ({ ...i, company: p.acct.company })))
    .sort((a, b) => String(a.dueDate ?? "9").localeCompare(String(b.dueDate ?? "9")));
  // Say which company each invoice is from once it isn't simply JLS.
  const several = per.length > 1 || per[0]?.acct.company !== "JLS Yachts";
  const daysLate = (d: string | null) =>
    d && d < today ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 86400000) : 0;

  // PDF: a statement per company owed money (or the first, if nothing is owed anywhere).
  const owing = per.filter((p) => p.invoices.length);
  const pdfs = await Promise.all((owing.length ? owing : per.slice(0, 1)).map((p) =>
    buildStatementPdf({ vesselName: vessel, billTo: p.billTo, invoices: p.invoices, issuer: p.acct.company })));
  let pdf = pdfs[0];
  if (pdfs.length > 1) {
    const { PDFDocument } = await import("pdf-lib");
    const merged = await PDFDocument.create();
    merged.setTitle(`Statement of account — ${vessel}`);
    for (const p of pdfs) {
      const src = await PDFDocument.load(p);
      for (const page of await merged.copyPages(src, src.getPageIndices())) merged.addPage(page);
    }
    pdf = await merged.save();
  }

  const rowsHtml = unpaid.slice(0, 25).map((i) => {
    const late = daysLate(i.dueDate);
    const due = late ? `<span style="color:#b45309">${late} day${late === 1 ? "" : "s"} overdue</span>` : esc(nice(i.dueDate));
    return `<tr style="border-top:1px solid #e5e7eb"><td>${esc(i.docNumber ?? "—")}</td>${several ? `<td>${esc(i.company)}</td>` : ""}`
      + `<td>${esc(nice(i.date))}</td><td>${due}</td><td style="text-align:right">${money(i.balance)}</td></tr>`;
  }).join("");
  const byCompany = several
    ? `<p style="margin:8px 0 0;font-size:13px;color:#4b5563">${per.map((p) => `${esc(p.acct.company)}: ${ccy} ${money(p.open)}`).join(" · ")}</p>`
    : "";
  const figure = (label: string, value: number, warn: boolean, side: "l" | "r") =>
    `<td style="padding:12px;background:${warn ? "#fef3c7" : "#f1f5f9"};border-radius:${side === "l" ? "10px 0 0 10px" : "0 10px 10px 0"}">`
    + `<div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em">${label}</div>`
    + `<div style="font-size:20px;font-weight:700;color:${warn ? "#b45309" : "#1f2937"}">${ccy} ${money(value)}</div></td>`;

  const subject = `${vessel} — Statement of account, ${nice(today)} (${ccy} ${money(open)} open)`;
  const html = `<!doctype html><html><body style="margin:0;background:#f5f8fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:24px">
      ${emailBrandLockup(`<span style="font-size:16px;font-weight:700;color:#07435E">JLS Yachts</span>`)}
      <h2 style="margin:16px 0 4px;font-size:18px;color:#07435E">${esc(vessel)} — Statement of account</h2>
      <p style="margin:0;color:#4b5563">As at ${esc(nice(today))}</p>
      <table cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0 0"><tr>
        ${figure("Open balance", open, false, "l")}${figure("Overdue payment", overdue, overdue > 0, "r")}
      </tr></table>
      ${byCompany}
      ${unpaid.length
        ? `<h3 style="margin:22px 0 6px;font-size:14px;color:#07435E">Unpaid invoices</h3>
      <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px">
        <tr style="background:#f1f5f9;text-align:left"><th>Invoice</th>${several ? "<th>From</th>" : ""}<th>Date</th><th>Due</th><th style="text-align:right">Balance (${ccy})</th></tr>
        ${rowsHtml}
      </table>${unpaid.length > 25 ? `<p style="margin:6px 0 0;font-size:12px;color:#6b7280">…and ${unpaid.length - 25} more — every one is on the attached statement.</p>` : ""}`
        : `<p style="margin:18px 0 0">Nothing outstanding — the account is fully settled. Thank you.</p>`}
      <p style="margin:22px 0 0;font-size:12px;color:#6b7280">The statement is attached as a PDF. Bank details are on each invoice — please quote the invoice number with your payment. To change who receives this report, please contact your JLS agent.</p>
    </div>
    <p style="text-align:center;font-size:12px;color:#94a3b8;margin:14px 0 0">JLS Yachts LLC · Superyacht Middle East</p>
  </div></body></html>`;
  const text = `${vessel} — Statement of account, ${nice(today)}\nOpen balance: ${ccy} ${money(open)}\nOverdue payment: ${ccy} ${money(overdue)}\n\n`
    + (unpaid.map((i) => `- ${i.docNumber ?? "—"}${several ? ` (${i.company})` : ""}: ${money(i.balance)}, due ${nice(i.dueDate)}`).join("\n") || "Nothing outstanding.");

  return {
    subject, html, text,
    attachments: [{ filename: `Statement - ${fileSafe(vessel)} - ${today}.pdf`, contentBase64: b64(pdf), contentType: "application/pdf" }],
    summary: `${ccy} ${money(open)} open · ${ccy} ${money(overdue)} overdue · ${unpaid.length} unpaid invoice${unpaid.length === 1 ? "" : "s"}`,
  };
}
