/**
 * On board Expenses — cost categories, account kinds and the balance maths,
 * shared by the portal screen, /api/portal/expenses and the receipt reader so
 * all three agree.
 */

export const EXPENSE_CATEGORIES = [
  { key: "provisions", label: "Provisions", hint: "food, drink, galley and bar supplies" },
  { key: "fuel", label: "Fuel & lubricants", hint: "diesel, petrol for tenders, oils" },
  { key: "marina", label: "Marina & dockage", hint: "berthing, mooring, water, shore power" },
  { key: "port", label: "Port & agency fees", hint: "port dues, permits, clearance, agency" },
  { key: "maintenance", label: "Maintenance & repairs", hint: "contractors, service visits, repairs" },
  { key: "spares", label: "Spares & chandlery", hint: "parts, consumables, chandlery, tools" },
  { key: "crew", label: "Crew", hint: "crew travel, training, uniform, crew food" },
  { key: "guests", label: "Guest services", hint: "guest activities, excursions, flowers, gifts" },
  { key: "comms", label: "Communications & IT", hint: "internet, SIMs, satellite airtime, IT" },
  { key: "transport", label: "Transport", hint: "taxis, car hire, deliveries, couriers" },
  { key: "admin", label: "Admin & insurance", hint: "insurance, bank charges, fees, stationery" },
  { key: "other", label: "Other", hint: "anything else" },
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["key"];
export const categoryLabel = (k: string | null | undefined) =>
  EXPENSE_CATEGORIES.find((c) => c.key === k)?.label ?? (k ? k : "Uncategorised");

export const ACCOUNT_KINDS = [
  { key: "petty_cash", label: "Petty cash" },
  { key: "card", label: "Crew card" },
  { key: "bank", label: "Bank account" },
  { key: "apa", label: "Charter APA" },
] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number]["key"];
export const accountKindLabel = (k: string) => ACCOUNT_KINDS.find((a) => a.key === k)?.label ?? k;

export const MONEY_CURRENCIES = ["EUR", "USD", "AED", "GBP"] as const;

export const ENTRY_KINDS = [
  { key: "expense", label: "Spent", sign: -1 },
  { key: "funds_in", label: "Money in", sign: 1 },
  { key: "return", label: "Returned", sign: -1 },
] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number]["key"];

export type CashAccount = {
  id: string; name: string; kind: AccountKind; currency: string; holder_name: string | null;
  charter_booking_id: string | null; opening_balance: number; low_balance: number | null; archived: boolean; notes: string | null;
};
export type ExpenseEntry = {
  id: string; account_id: string; kind: EntryKind; amount: number; entry_date: string;
  supplier: string | null; description: string | null; category: string | null; department: string | null;
  vat_amount: number | null; original_amount: number | null; original_currency: string | null;
  reference: string | null; receipt_scanned: boolean; created_by: string | null; created_by_name: string | null; created_at: string;
};

/** Where an account stands: opening balance + money in − spent − returned. */
export function accountTotals(account: Pick<CashAccount, "id" | "opening_balance">, entries: Pick<ExpenseEntry, "account_id" | "kind" | "amount">[]) {
  let moneyIn = 0, spent = 0, returned = 0;
  for (const e of entries) {
    if (e.account_id !== account.id) continue;
    const n = Number(e.amount) || 0;
    if (e.kind === "funds_in") moneyIn += n;
    else if (e.kind === "return") returned += n;
    else spent += n;
  }
  const opening = Number(account.opening_balance) || 0;
  return { opening, moneyIn, spent, returned, balance: round2(opening + moneyIn - spent - returned) };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

export const money = (n: number, ccy: string) =>
  `${ccy} ${Number(n || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
